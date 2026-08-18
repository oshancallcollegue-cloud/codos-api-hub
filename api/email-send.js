// ============================================================================
// POST /api/email-send   (Vercel serverless function)
// Enhanced email endpoint. Features:
//   1. Variable injection {{name}}   2. Rate limiting   3. Request/error logs
//   4. Delivery tracking (via webhook)   5. Sandbox mode   6. Credit deduction
//
// Header: x-api-key: <marketplace key>
// Body: { to, subject, html, variables?, sandbox? }
// ============================================================================

const { db, admin, sendJson, applyCors } = require("./_lib/firebase");
const { resolveApiKey } = require("./_lib/auth");
const { deductCredits, checkRateLimit } = require("./_lib/credits");

const EMAIL_UPSTREAM = process.env.UPSTREAM_EMAIL_URL || "";
const EMAIL_KEY = process.env.UPSTREAM_EMAIL_KEY || "";
const RATE_LIMIT = Number(process.env.EMAIL_RATE_LIMIT || "60");
const COST = 1;

function inject(tpl, vars) {
  return String(tpl).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) =>
    vars && k in vars ? String(vars[k]) : "");
}
function isEmail(s) { return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); }

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { applyCors(res); return res.status(200).end(); }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const auth = await resolveApiKey(req);
  if (!auth) return sendJson(res, 401, { error: "Invalid or revoked API key." });

  // rate limit
  const ok = await checkRateLimit(auth.keyHash, RATE_LIMIT);
  if (!ok) return sendJson(res, 429, { error: `Rate limit exceeded (${RATE_LIMIT}/min).` });

  const b = req.body || {};
  const vars = (b.variables && typeof b.variables === "object") ? b.variables : {};
  const sandbox = b.sandbox === true;

  if (!isEmail(b.to)) return sendJson(res, 400, { error: "`to` must be a valid email." });
  if (!b.subject || !b.html) return sendJson(res, 400, { error: "`subject` and `html` required." });

  const subject = inject(b.subject, vars);
  const html = inject(b.html, vars);

  // create the send log up front
  const sendRef = await db.collection("email_sends").add({
    user_id: auth.userId, to_email: b.to, subject,
    status: sandbox ? "sandbox" : "queued", sandbox,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // sandbox: stop here, no email, no credit
  if (sandbox) {
    return sendJson(res, 200, {
      sandbox: true, send_id: sendRef.id, status: "sandbox",
      preview: { to: b.to, subject, html },
      note: "Sandbox mode: validated and logged, no email sent, no credit used.",
    });
  }

  // deduct a credit
  const newBalance = await deductCredits(auth.userId, COST);
  if (newBalance === -1) {
    await sendRef.set({ status: "failed", error: "insufficient credits" }, { merge: true });
    return sendJson(res, 402, { error: "Not enough credits." });
  }

  // forward to the real Resend-based send API
  let status = "sent", errMsg = null, providerId = null, upstreamStatus = 502;
  try {
    const r = await fetch(EMAIL_UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMAIL_KEY}` },
      body: JSON.stringify({ to: b.to, subject, html }),
    });
    upstreamStatus = r.status;
    const data = await r.json().catch(() => ({}));
    providerId = data.id || data.messageId || null;
    if (r.status >= 400) { status = "failed"; errMsg = data.error || `upstream ${r.status}`; }
  } catch (e) { status = "failed"; errMsg = String(e); }

  if (status === "failed") await deductCredits(auth.userId, -COST);
  await sendRef.set({
    status, error: errMsg, provider_id: providerId,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (status === "failed") {
    return sendJson(res, upstreamStatus >= 400 ? upstreamStatus : 502,
      { error: "Send failed.", detail: errMsg, send_id: sendRef.id });
  }
  return sendJson(res, 200, { status: "sent", send_id: sendRef.id, provider_id: providerId, credits_remaining: newBalance });
};
