// ============================================================================
// Shared Firebase Admin SDK init for all Vercel serverless functions.
// The Admin SDK bypasses Firestore security rules, so server logic (credit
// checks, key lookups, forwarding) has full trusted access.
//
// Set these env vars in Vercel (Project Settings -> Environment Variables):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (paste the whole key; \n newlines are handled below)
// ============================================================================

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stores the key with literal \n — turn them into real newlines.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// crypto helper: sha-256 hex (matches the key hashing everywhere).
const crypto = require("crypto");
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// small CORS + json helpers reused by every function
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function sendJson(res, status, body) {
  applyCors(res);
  res.status(status).json(body);
}

module.exports = { admin, db, sha256Hex, applyCors, sendJson };
