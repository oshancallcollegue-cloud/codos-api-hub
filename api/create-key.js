// ============================================================================
// POST /api/create-key   (Vercel serverless function)
// A logged-in user generates a marketplace API key. Stores only the hash.
// Header: Authorization: Bearer <Firebase ID token>
// Body:   { "label": "my key" }  (optional)
// ============================================================================

const crypto = require("crypto");
const { db, admin, sha256Hex, sendJson, applyCors } = require("./_lib/firebase");
const { verifyUser } = require("./_lib/auth");
const { ensureUserSetup } = require("./_lib/credits");

function generateKey() {
  return "mk_live_" + crypto.randomBytes(24).toString("hex");
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { applyCors(res); return res.status(200).end(); }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not logged in." });

  // Safety net: make sure profile + 100 credits exist before issuing a key.
  await ensureUserSetup(user.uid, user.email);

  // Cap active keys at 5 per user.
  const active = await db.collection("api_keys")
    .where("user_id", "==", user.uid).where("revoked", "==", false).get();
  if (active.size >= 5) {
    return sendJson(res, 409, { error: "Key limit reached (5 active). Revoke one first." });
  }

  let label = "default";
  if (req.body && req.body.label) label = String(req.body.label).slice(0, 60);

  const rawKey = generateKey();
  const keyHash = sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  await db.collection("api_keys").add({
    user_id: user.uid,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    label,
    revoked: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return sendJson(res, 201, {
    api_key: rawKey, prefix: keyPrefix, label,
    note: "Save this key now — it will not be shown again.",
  });
};
