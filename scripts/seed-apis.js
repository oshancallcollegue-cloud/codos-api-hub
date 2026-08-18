// ============================================================================
// One-time seed: populate the `apis` catalog collection in Firestore.
// Run locally after setting the FIREBASE_* env vars:
//   node scripts/seed-apis.js
// ============================================================================

// Load local .env when running this script from your machine.
// (On Vercel the env vars come from the dashboard, so this is harmless there.)
try { require("dotenv").config(); } catch { /* dotenv optional */ }

const { db } = require("../api/_lib/firebase");

// Each service has its OWN price (credit_cost) and its OWN credit balance
// (see api/_lib/credits.js). test_body is the sample payload the dashboard's
// "Test" button and the generated curl command send.
const APIS = [
  { slug: "email",      name: "Email Sender",   description: "Send HTML email with {{variables}}, delivery tracking, and a free sandbox mode.", credit_cost: 1, upstream_url: "https://REPLACE-email-api.example.com/api/public/send", method: "POST", enabled: true,
    test_body: { to: "test@example.com", subject: "Hello {{name}}", html: "<b>Hi {{name}}</b>", variables: { name: "Sam" }, sandbox: true } },
  { slug: "gdocs",      name: "Google Docs",    description: "Create and manage Google Docs.", credit_cost: 3, upstream_url: "https://REPLACE-gdocs-api.example.com/api/documents", method: "POST", enabled: true,
    test_body: { title: "Test doc from API Hub", body: "Hello from a test call." } },
  { slug: "sheets",     name: "Google Sheets",  description: "Read, write, update and delete Google Sheet rows.", credit_cost: 1, upstream_url: "https://REPLACE-viacodos-api.example.com/api/sheets/read", method: "POST", enabled: true,
    test_body: { sheet_id: "TEST_SHEET_ID", range: "A1:B2" } },
  { slug: "drive",      name: "Google Drive",   description: "List, upload and manage Google Drive files/images.", credit_cost: 2, upstream_url: "https://REPLACE-viacodos-api.example.com/api/v1/drive", method: "POST", enabled: true,
    test_body: { action: "list", folder: "root" } },
  { slug: "screenshot", name: "Screenshot API", description: "Capture a full-page PNG screenshot of any public URL.", credit_cost: 2, upstream_url: "https://REPLACE-screenshot-api.example.com/api/v1/capture", method: "POST", enabled: true,
    test_body: { url: "https://example.com", full_page: true, format: "png" } },
];

(async () => {
  for (const api of APIS) {
    await db.collection("apis").doc(api.slug).set(api);
    console.log("seeded:", api.slug);
  }
  console.log("Done. 5 services in the catalog (email, gdocs, sheets, drive, screenshot).");
  process.exit(0);
})();
