// ============================================================================
// FILL THIS IN with your Firebase web config.
// Get it from: Firebase Console -> Project Settings -> Your apps -> Web app -> SDK config.
// All of these values are safe to expose in the browser (they're public by design;
// Firestore security rules protect your data, not these keys).
//
// Also set BACKEND_URL to your deployed Vercel backend once you have it,
// e.g. "https://api-hub-backend.vercel.app"
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtLGXW7qbxnINdYumvFKTcB_KBS7Jhh8I",
  authDomain: "codos-api-hub.firebaseapp.com",
  projectId: "codos-api-hub",
  storageBucket: "codos-api-hub.firebasestorage.app",
  messagingSenderId: "834295025531",
  appId: "1:834295025531:web:068488aa4cf1e29adf77de",
};

export const BACKEND_URL = "https://codos-api-hub.vercel.app"; // Vercel backend

// Catalog shown before Firestore loads (fallback).
export const DEMO_APIS = [
  { slug: "email",      name: "Email Sender",   credit_cost: 1, description: "Send HTML email with {{variables}}, delivery tracking, and a free sandbox mode." },
  { slug: "gdocs",      name: "Google Docs",    credit_cost: 3, description: "Create and manage Google Docs." },
  { slug: "sheets",     name: "Google Sheets",  credit_cost: 1, description: "Read, write, update and delete rows in a Google Sheet." },
  { slug: "drive",      name: "Google Drive",   credit_cost: 2, description: "List, upload and manage Google Drive files and images." },
  { slug: "screenshot", name: "Screenshot API", credit_cost: 2, description: "Capture a full-page PNG screenshot of any public URL." },
];
