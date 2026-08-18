// ============================================================================
// API Hub front-end — Firebase Auth + Firestore.
// Falls back to a demo view if Firebase config isn't filled in yet.
// ============================================================================
import { FIREBASE_CONFIG, BACKEND_URL, DEMO_APIS } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const configured = !FIREBASE_CONFIG.projectId.includes("YOUR-PROJECT");
let auth = null, db = null, currentUser = null;

if (configured) {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
  document.getElementById("config-banner").style.display = "none";
  onAuthStateChanged(auth, (user) => { currentUser = user; refreshNav(user); });
}

let mode = "signup";
const SECTIONS = ["landing", "auth", "dashboard", "catalog", "pricing"];
window.show = function (id) {
  SECTIONS.forEach((s) => document.getElementById(s).classList.toggle("hidden", s !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "dashboard") loadDashboard();
  if (id === "catalog") renderCatalog("catalog-apis");
  if (id === "pricing") renderCatalog("pricing-apis");
};
function msg(el, text, kind = "err") {
  document.getElementById(el).innerHTML = text ? `<div class="msg ${kind}">${text}</div>` : "";
}

// ---------- catalog ----------
async function getApis() {
  if (db) {
    try {
      const snap = await getDocs(collection(db, "apis"));
      if (!snap.empty) return snap.docs.map((d) => d.data());
    } catch { /* fall through to demo */ }
  }
  return DEMO_APIS;
}
async function renderCatalog(targetId) {
  const apis = await getApis();
  document.getElementById(targetId).innerHTML = apis.map((a) => `
    <div class="api-card">
      <div class="top"><h3>${a.name}</h3><span class="cost">${a.credit_cost} cr</span></div>
      <p>${a.description || ""}</p>
      <span class="slug">POST /api/gateway/${a.slug}</span>
    </div>`).join("");
}

// ---------- nav ----------
function refreshNav(user) {
  const nav = document.getElementById("nav-auth");
  if (user) {
    nav.innerHTML = `<button class="btn dark" onclick="show('dashboard')">Dashboard</button>
                     <button class="btn gold" onclick="logout()">Log out</button>`;
  } else {
    nav.innerHTML = `<button class="btn gold" onclick="show('auth')">Sign up</button>`;
  }
}

// ---------- auth ----------
document.getElementById("auth-switch").onclick = (e) => {
  e.preventDefault();
  mode = mode === "signup" ? "login" : "signup";
  document.getElementById("auth-title").textContent = mode === "signup" ? "Create your account" : "Welcome back";
  document.getElementById("auth-sub").textContent = mode === "signup" ? "Get 100 free credits — no card needed." : "Log in to your dashboard.";
  document.getElementById("auth-submit").textContent = mode === "signup" ? "Sign up" : "Log in";
  document.getElementById("auth-switch-text").textContent = mode === "signup" ? "Already have an account?" : "Need an account?";
  document.getElementById("auth-switch").textContent = mode === "signup" ? "Log in" : "Sign up";
  msg("auth-msg", "");
};

document.getElementById("auth-submit").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return msg("auth-msg", "Enter email and password.");
  if (!auth) return msg("auth-msg", "Add your Firebase config in config.js to enable accounts.");
  try {
    if (mode === "signup") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    show("dashboard");
  } catch (e) {
    msg("auth-msg", e.message.replace("Firebase: ", ""));
  }
};

window.logout = async function () { if (auth) await signOut(auth); show("landing"); };

// ---------- dashboard ----------
let LAST_KEY = null; // the plaintext key from the most recent generate (memory only)

window.loadDashboard = async function loadDashboard() {
  if (!db) return;
  const user = auth.currentUser;
  if (!user) return show("auth");

  // per-service balances
  let balances = {};
  try {
    const c = await getDoc(doc(db, "credits", user.uid));
    balances = c.exists() ? (c.data().balances || {}) : {};
  } catch { /* ignore */ }
  await renderServices(balances);

  // keys
  try {
    const q = query(collection(db, "api_keys"), where("user_id", "==", user.uid), where("revoked", "==", false));
    const snap = await getDocs(q);
    if (!snap.empty) {
      document.getElementById("key-area").innerHTML = snap.docs.map((d) => {
        const k = d.data();
        return `<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span class="key-box" style="flex:1">${k.key_prefix}••••••••</span></div>`;
      }).join("") + `<button class="btn gold" style="margin-top:6px" onclick="createKey()">+ New key</button>`;
    }
  } catch { /* ignore */ }

  // usage
  try {
    const q = query(collection(db, "usage_logs"), where("user_id", "==", user.uid), orderBy("created_at", "desc"), limit(10));
    const snap = await getDocs(q);
    if (!snap.empty) {
      document.getElementById("usage-body").innerHTML = snap.docs.map((d) => {
        const u = d.data();
        const when = u.created_at?.toDate ? u.created_at.toDate().toLocaleString() : "—";
        return `<tr><td>${when}</td><td>${u.api_slug}</td><td>${u.credits_used}</td><td>${u.status}</td></tr>`;
      }).join("");
    }
  } catch { /* index may be building */ }
}

// ---------- per-service panels: balance + price + Test button + curl ----------
async function renderServices(balances) {
  const apis = await getApis();
  const target = document.getElementById("services");
  if (!target) return;
  target.innerHTML = apis.map((a) => {
    const bal = balances[a.slug] ?? 0;
    const body = JSON.stringify(a.test_body || {});
    const curl =
      `curl -X POST "${BACKEND_URL}/api/gateway/${a.slug}" \\\n` +
      `  -H "x-api-key: ${LAST_KEY || "YOUR_KEY"}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${body}'`;
    return `
      <div class="panel" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <h3 style="margin:0">${a.name}</h3>
            <p style="color:var(--muted);font-size:13.5px;margin:6px 0 0">${a.description || ""}</p>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-family:var(--serif);font-size:30px;color:var(--gold);line-height:1">${bal}</div>
            <div style="color:var(--muted);font-size:12px">credits · ${a.credit_cost}/call</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn gold" onclick="testService('${a.slug}')">Test this API</button>
          <button class="btn dark" onclick="toggleCurl('${a.slug}')">Show curl</button>
        </div>
        <div id="test-${a.slug}" style="margin-top:12px"></div>
        <pre id="curl-${a.slug}" class="code hidden" style="margin-top:12px">${curl.replace(/</g,"&lt;")}</pre>
      </div>`;
  }).join("");
}

window.toggleCurl = function (slug) {
  document.getElementById(`curl-${slug}`).classList.toggle("hidden");
};

// Make a REAL call through the gateway with the user's key.
window.testService = async function (slug) {
  const out = document.getElementById(`test-${slug}`);
  if (!LAST_KEY) {
    out.innerHTML = `<div class="msg err">Generate an API key first (top of the page), then test.</div>`;
    return;
  }
  out.innerHTML = `<div class="msg" style="background:var(--ink);color:var(--muted)">Calling ${slug}…</div>`;
  const apis = await getApis();
  const api = apis.find((x) => x.slug === slug) || {};
  try {
    const res = await fetch(`${BACKEND_URL}/api/gateway/${slug}`, {
      method: "POST",
      headers: { "x-api-key": LAST_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(api.test_body || {}),
    });
    const j = await res.json();
    const ok = res.status < 400;
    out.innerHTML = `<div class="msg ${ok ? "ok" : "err"}">
        <b>${ok ? "✓ Key works" : "✗ Failed"}</b> · HTTP ${res.status}
        ${j.credits_remaining != null ? ` · ${j.credits_remaining} ${slug} credits left` : ""}
      </div>
      <pre class="code" style="margin-top:8px">${JSON.stringify(j, null, 2).replace(/</g,"&lt;")}</pre>`;
    loadDashboard(); // refresh balances
  } catch (e) {
    out.innerHTML = `<div class="msg err">Could not reach backend: ${String(e)}</div>`;
  }
};

// ---------- create key (calls the Vercel backend) ----------
window.createKey = async function () {
  if (!auth || !auth.currentUser) return alert("Log in first.");
  const token = await auth.currentUser.getIdToken();
  try {
    const res = await fetch(`${BACKEND_URL}/api/create-key`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "web" }),
    });
    const j = await res.json();
    if (j.api_key) {
      LAST_KEY = j.api_key; // remember so Test buttons + curl can use it this session
      document.getElementById("key-area").innerHTML =
        `<p class="msg ok">Save this now — it won't be shown again:</p>
         <div class="key-box">${j.api_key}</div>
         <button class="btn dark" style="margin-top:12px" onclick="loadDashboard()">Done</button>`;
      loadDashboard(); // refresh curl commands with the real key
    } else {
      alert(j.error || "Could not create key.");
    }
  } catch (e) {
    alert("Backend not reachable. Set BACKEND_URL in config.js once your Vercel backend is deployed.");
  }
};

window.subscribe = function () {
  alert("Stripe checkout goes here — build it in Stripe test mode (no card needed).");
};

// ---------- boot ----------
(async function init() {
  renderCatalog("landing-apis");
  const curl = document.getElementById("curl-sample");
  if (curl && configured) curl.innerHTML = curl.innerHTML.replace("https://YOUR-BACKEND.vercel.app", BACKEND_URL);
})();
