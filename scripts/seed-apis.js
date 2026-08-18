// ============================================================================
// One-time seed: populate the `apis` catalog collection in Firestore.
// Run locally after setting the FIREBASE_* env vars:
//   node scripts/seed-apis.js
// ============================================================================

const { db } = require("../api/_lib/firebase");

const APIS = [
  { slug: "email",  name: "Email Sender",  description: "Send HTML email with {{variables}}, delivery tracking, and a free sandbox mode.", credit_cost: 1, upstream_url: "https://REPLACE-email-api.example.com/api/public/send", method: "POST", enabled: true },
  { slug: "gdocs",  name: "Google Docs",   description: "Create and manage Google Docs.", credit_cost: 2, upstream_url: "https://REPLACE-gdocs-api.example.com/api/documents", method: "POST", enabled: true },
  { slug: "sheets", name: "Google Sheets", description: "Read, write, update and delete Google Sheet rows.", credit_cost: 1, upstream_url: "https://REPLACE-viacodos-api.example.com/api/sheets/read", method: "GET", enabled: true },
  { slug: "drive",  name: "Google Drive",  description: "List, upload and manage Google Drive files/images.", credit_cost: 2, upstream_url: "https://REPLACE-viacodos-api.example.com/api/v1/drive", method: "POST", enabled: true },
  { slug: "pscb",   name: "Secure Viewer", description: "Create a short-lived signed viewer session.", credit_cost: 1, upstream_url: "https://REPLACE-pscb-api.example.com/api/v1/sessions", method: "POST", enabled: true },
];

(async () => {
  for (const api of APIS) {
    await db.collection("apis").doc(api.slug).set(api);
    console.log("seeded:", api.slug);
  }
  console.log("Done. 5 APIs in the catalog.");
  process.exit(0);
})();
