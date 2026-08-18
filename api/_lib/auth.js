// ============================================================================
// Auth helpers shared by the Vercel functions.
//   verifyUser  — checks a Firebase ID token (logged-in browser user)
//   resolveApiKey — hashes a marketplace key and finds its user in Firestore
// ============================================================================

const { admin, db, sha256Hex } = require("./firebase");

// Verify a Firebase ID token from the Authorization: Bearer <token> header.
async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token); // { uid, email, ... }
  } catch {
    return null;
  }
}

// Resolve a marketplace API key (x-api-key or Bearer) to { userId, keyHash }.
async function resolveApiKey(req) {
  const raw = req.headers["x-api-key"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;

  const keyHash = sha256Hex(raw);
  const snap = await db.collection("api_keys")
    .where("key_hash", "==", keyHash).where("revoked", "==", false).limit(1).get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  return { userId: doc.data().user_id, keyHash, keyId: doc.id };
}

module.exports = { verifyUser, resolveApiKey };
