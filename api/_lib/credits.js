// ============================================================================
// Atomic credit operations using Firestore transactions.
// deductCredits returns the new balance, or -1 if there weren't enough.
// A negative amount refunds (used when an upstream call fails).
// ============================================================================

const { db, admin } = require("./firebase");

async function deductCredits(userId, amount) {
  const ref = db.collection("credits").doc(userId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const balance = snap.exists ? (snap.data().balance || 0) : 0;

      // refund (negative amount) always allowed
      if (amount < 0) {
        const nb = balance - amount; // minus a negative = add
        tx.set(ref, { balance: nb, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return nb;
      }

      if (balance < amount) return -1; // not enough
      const nb = balance - amount;
      tx.set(ref, { balance: nb, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return nb;
    });
  } catch (e) {
    return -1;
  }
}

// Ensure a user has profile + credits (safety net if signup hook didn't run).
async function ensureUserSetup(userId, email) {
  const profileRef = db.collection("profiles").doc(userId);
  const creditsRef = db.collection("credits").doc(userId);
  const [p, c] = await Promise.all([profileRef.get(), creditsRef.get()]);
  const writes = [];
  if (!p.exists) {
    writes.push(profileRef.set({ email: email || null, plan: "free", created_at: admin.firestore.FieldValue.serverTimestamp() }));
  }
  if (!c.exists) {
    writes.push(creditsRef.set({ balance: 100, free_granted: true, updated_at: admin.firestore.FieldValue.serverTimestamp() }));
  }
  await Promise.all(writes);
}

// Sliding-window rate limit: max `limit` calls per minute for a key.
async function checkRateLimit(keyHash, limit) {
  const win = new Date();
  win.setSeconds(0, 0); // truncate to the minute
  const id = `${keyHash}_${win.getTime()}`;
  const ref = db.collection("rate_limits").doc(id);
  try {
    const count = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = (snap.exists ? snap.data().count : 0) + 1;
      tx.set(ref, { count: n, key_hash: keyHash, window: win }, { merge: true });
      return n;
    });
    return count <= limit;
  } catch {
    return true; // fail open on transient errors
  }
}

module.exports = { deductCredits, ensureUserSetup, checkRateLimit };
