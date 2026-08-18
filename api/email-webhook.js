// ============================================================================
// POST /api/email-webhook   (Vercel serverless function)
// Receives Resend delivery/bounce events and updates email_sends.status,
// making delivery tracking real. Point your Resend webhook here.
// ============================================================================

const { db, admin } = require("./_lib/firebase");

const STATUS_MAP = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "bounced",
  "email.delivery_delayed": "queued",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Use POST");

  const event = req.body || {};
  const providerId = event?.data?.email_id || event?.data?.id;
  const newStatus = STATUS_MAP[event?.type];

  if (!providerId || !newStatus) return res.status(200).send("ignored");

  const patch = { status: newStatus, updated_at: admin.firestore.FieldValue.serverTimestamp() };
  if (newStatus === "bounced") patch.error = event?.data?.reason || "bounced";

  const snap = await db.collection("email_sends").where("provider_id", "==", providerId).limit(5).get();
  const writes = [];
  snap.forEach((doc) => writes.push(doc.ref.set(patch, { merge: true })));
  await Promise.all(writes);

  return res.status(200).send("ok");
};
