# API Hub — Firebase + Vercel version

Fully free, no credit card. **Firebase** (Spark plan) for login + database.
**Vercel** for the backend logic that Firebase's free plan can't run.

```
marketplace-fb/
├─ firestore.rules            # security rules (lock data to each user)
├─ web/                       # the website (Firebase Auth + Firestore)
│  ├─ index.html
│  ├─ app.js
│  └─ config.js               # <- your Firebase web config + Vercel backend URL
├─ api/                       # Vercel serverless functions (the backend)
│  ├─ _lib/                   # firebase admin, credits, auth helpers
│  ├─ create-key.js           # generate a marketplace key
│  ├─ gateway/[slug].js       # THE GATEWAY: key check → deduct → forward
│  ├─ email-send.js           # enhanced email (variables, rate limit, sandbox…)
│  └─ email-webhook.js        # Resend delivery/bounce receiver
├─ scripts/seed-apis.js       # one-time: fill the apis catalog in Firestore
└─ package.json
```

## Why two services
- **Firebase Spark (free):** great at Auth + Firestore, but its free plan can't make
  the outbound calls a gateway needs.
- **Vercel (free):** runs the gateway logic, holds your secret upstream keys, and forwards
  calls. This is where credits get checked and deducted.

## Setup

### 1. Firebase (data + login)
1. Go to console.firebase.google.com → **Add project** (no card).
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Build → Firestore Database → Create database → Production mode.**
4. Paste the contents of `firestore.rules` into **Firestore → Rules → Publish.**
5. **Project Settings → Your apps → Web (`</>`)** → register an app → copy the
   `firebaseConfig` values into `web/config.js`.
6. **Project Settings → Service accounts → Generate new private key.** You'll use the
   `project_id`, `client_email`, and `private_key` from that JSON as Vercel env vars.

### 2. Vercel (backend)
1. Push this `marketplace-fb` folder to a GitHub repo.
2. vercel.com → **Add New → Project → Import** the repo.
3. Add **Environment Variables**:
   ```
   FIREBASE_PROJECT_ID   = from the service-account JSON
   FIREBASE_CLIENT_EMAIL = from the service-account JSON
   FIREBASE_PRIVATE_KEY  = from the service-account JSON (paste the whole key)
   UPSTREAM_EMAIL_URL    = your deployed email API send URL
   UPSTREAM_EMAIL_KEY    = your email API key
   UPSTREAM_GDOCS_KEY / UPSTREAM_SHEETS_KEY / UPSTREAM_DRIVE_KEY / UPSTREAM_PSCB_KEY
   EMAIL_RATE_LIMIT      = 60
   ```
4. Deploy. You'll get a backend URL like `https://api-hub-backend.vercel.app`.
5. Put that URL in `web/config.js` as `BACKEND_URL`.

### 3. Seed the catalog
Locally, with the FIREBASE_* env vars set:
```bash
npm install
node scripts/seed-apis.js
```
Then edit the `upstream_url` of each API doc (in Firestore console) to your real
deployed API URLs.

### 4. Host the website
Deploy `web/` to Vercel (or Firebase Hosting) the same way — drag-and-drop or GitHub.

## What works after setup
- Real signup / login (Firebase Auth)
- 100 free credits on signup
- Generate an API key (via the Vercel `create-key` function)
- Call any API through `/api/gateway/<slug>` — credits checked + deducted server-side
- Enhanced email: `{{variables}}`, rate limiting, request logs, delivery tracking, sandbox

## Still to build later
- Stripe subscriptions (test mode) + credit top-up webhook
- Deploying the 5 upstream APIs and pointing the catalog at them
- "Try it" forms per API in the dashboard
