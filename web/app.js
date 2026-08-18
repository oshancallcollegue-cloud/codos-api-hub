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
async function loadDashboard() {
  if (!db) { document.getElementById("balance").textContent = "100"; return; }
  const user = auth.currentUser;
  if (!user) return show("auth");

  // balance
  try {
    const c = await getDoc(doc(db, "credits", user.uid));
    document.getElementById("balance").textContent = c.exists() ? (c.data().balance ?? 0) : "0";
  } catch { document.getElementById("balance").textContent = "—"; }

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
      document.getElementById("key-area").innerHTML =
        `<p class="msg ok">Save this now — it won't be shown again:</p>
         <div class="key-box">${j.api_key}</div>
         <button class="btn dark" style="margin-top:12px" onclick="loadDashboard()">Done</button>`;
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
