// ============================================================================
// POST /api/gateway/<slug>   (Vercel serverless function, dynamic route)
// The heart of the marketplace. Checks the marketplace key, deducts credits,
// forwards to the correct upstream API using OUR server-side credentials,
// logs usage, refunds on upstream failure.
//
// Header: x-api-key: <marketplace key>
// Body:   whatever the upstream API expects
// ============================================================================

const { db, admin, sendJson, applyCors } = require("../_lib/firebase");
const { resolveApiKey } = require("../_lib/auth");
const { deductCredits } = require("../_lib/credits");

// Per-API upstream credentials, injected as Vercel env vars.
const UPSTREAM_KEYS = {
  email: process.env.UPSTREAM_EMAIL_KEY,
  gdocs: process.env.UPSTREAM_GDOCS_KEY,
  pscb: process.env.UPSTREAM_PSCB_KEY,
  sheets: process.env.UPSTREAM_SHEETS_KEY,
  drive: process.env.UPSTREAM_DRIVE_KEY,
};

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { applyCors(res); return res.status(200).end(); }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const slug = req.query.slug;
  if (!slug) return sendJson(res, 400, { error: "Missing API slug." });

  // ---- auth: marketplace key -> user ----
  const auth = await resolveApiKey(req);
  if (!auth) return sendJson(res, 401, { error: "Invalid or revoked API key." });

  // ---- load the API from the catalog ----
  const apiSnap = await db.collection("apis").doc(slug).get();
  if (!apiSnap.exists || apiSnap.data().enabled === false) {
    return sendJson(res, 404, { error: `Unknown or disabled API: ${slug}.` });
  }
  const api = apiSnap.data();
  const cost = api.credit_cost || 1;

  // ---- deduct credits atomically ----
  const newBalance = await deductCredits(auth.userId, cost);
  if (newBalance === -1) {
    return sendJson(res, 402, { error: "Not enough credits. Top up or subscribe." });
  }

  // ---- forward to the upstream API ----
  const upstreamKey = UPSTREAM_KEYS[slug];
  let upstreamStatus = 502, payload = { error: "Upstream call failed." };
  try {
    const r = await fetch(api.upstream_url, {
      method: api.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...(upstreamKey ? { Authorization: `Bearer ${upstreamKey}` } : {}),
      },
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
    });
    upstreamStatus = r.status;
    const ct = r.headers.get("content-type") || "";
    payload = ct.includes("application/json") ? await r.json() : await r.text();
  } catch (e) {
    payload = { error: "Could not reach upstream API.", detail: String(e) };
  }

  // ---- refund on 5xx, log usage ----
  if (upstreamStatus >= 500) await deductCredits(auth.userId, -cost);
  await db.collection("usage_logs").add({
    user_id: auth.userId, api_slug: slug,
    credits_used: upstreamStatus >= 500 ? 0 : cost,
    status: upstreamStatus,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection("api_keys").doc(auth.keyId)
    .set({ last_used_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  return sendJson(res, upstreamStatus, {
    api: slug, credits_remaining: newBalance, result: payload,
  });
};
