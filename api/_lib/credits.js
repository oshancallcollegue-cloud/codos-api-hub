// ============================================================================
// Atomic credit operations using Firestore transactions.
// deductCredits returns the new balance, or -1 if there weren't enough.
// A negative amount refunds (used when an upstream call fails).
// ============================================================================

const { db, admin } = require("./firebase");

// Deduct `amount` from a SPECIFIC service's balance (balances.<service>).
// Returns the new balance for that service, or -1 if there weren't enough.
// A negative amount refunds. Falls back gracefully if the doc is old-style.
async function deductCredits(userId, amount, service) {
  const ref = db.collection("credits").doc(userId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const balances = data.balances || {};
      const balance = balances[service] || 0;

      // refund (negative amount) always allowed
      if (amount < 0) {
        const nb = balance - amount; // minus a negative = add
        tx.set(ref, {
          balances: { ...balances, [service]: nb },
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return nb;
      }

      if (balance < amount) return -1; // not enough for this service
      const nb = balance - amount;
      tx.set(ref, {
        balances: { ...balances, [service]: nb },
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
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
  const FREE = { email: 50, gdocs: 25, sheets: 50, drive: 25, screenshot: 50 };
  if (!c.exists) {
    // New user: grant each service its own free balance.
    writes.push(creditsRef.set({
      balances: { ...FREE },
      free_granted: true,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }));
  } else {
    // Existing user (maybe old single-balance style, or missing a new service):
    // heal any service that has no balance yet, without touching existing ones.
    const existing = c.data().balances || {};
    const patched = { ...existing };
    let changed = false;
    for (const [svc, amt] of Object.entries(FREE)) {
      if (patched[svc] == null) { patched[svc] = amt; changed = true; }
    }
    if (changed) {
      writes.push(creditsRef.set({
        balances: patched,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }));
    }
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
