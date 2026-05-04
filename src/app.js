import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";

const DocumentScanner = registerPlugin("DocumentScanner");
import { Preferences } from "@capacitor/preferences";
import { CapacitorHttp } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import QRCode from "qrcode";

const API_BASE_URL = "https://yfiten.com";
// Google OAuth client ID for the browser-based mobile sign-in flow.
// Must match what the *production backend at API_BASE_URL* uses (not the
// local-dev .env.local — the prod server can have a different client ID).
const GOOGLE_WEB_CLIENT_ID = "525382726794-0qr41as45jera60gee9ar63ceimhkkhi.apps.googleusercontent.com";

const STORAGE_KEYS = {
  token: "yfiten_token",
  orgId: "yfiten_org_id",
  user: "yfiten_user",
};

let state = {
  token: null,
  orgId: null,
  user: null,
  organizations: [],
  capturedImage: null,
  uploading: false,
  expenseImage: null,
  clientsCache: [],
};

/* ============================================================
   Storage
   ============================================================ */

async function loadState() {
  const token = (await Preferences.get({ key: STORAGE_KEYS.token })).value;
  const orgId = (await Preferences.get({ key: STORAGE_KEYS.orgId })).value;
  const user = (await Preferences.get({ key: STORAGE_KEYS.user })).value;
  state.token = token || null;
  state.orgId = orgId || null;
  state.user = user ? JSON.parse(user) : null;
}

async function saveToken(token) {
  state.token = token;
  await Preferences.set({ key: STORAGE_KEYS.token, value: token });
}

async function saveOrgId(orgId) {
  state.orgId = orgId;
  await Preferences.set({ key: STORAGE_KEYS.orgId, value: orgId });
}

async function saveUser(user) {
  state.user = user;
  await Preferences.set({ key: STORAGE_KEYS.user, value: JSON.stringify(user) });
}

async function clearSession() {
  state.token = null;
  state.orgId = null;
  state.user = null;
  state.organizations = [];
  state.capturedImage = null;
  state.expenseImage = null;
  state.clientsCache = [];
  await Preferences.remove({ key: STORAGE_KEYS.token });
  await Preferences.remove({ key: STORAGE_KEYS.orgId });
  await Preferences.remove({ key: STORAGE_KEYS.user });
}

/* ============================================================
   API helpers
   ============================================================ */

async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const url = `${API_BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  try {
    let res;
    if (method === "GET") {
      res = await CapacitorHttp.get({ url, headers });
    } else if (method === "DELETE") {
      res = await CapacitorHttp.delete({ url, headers });
    } else if (method === "PUT" || method === "PATCH") {
      headers["Content-Type"] = "application/json";
      res = await CapacitorHttp.patch({ url, headers, data: options.body });
    } else {
      headers["Content-Type"] = "application/json";
      res = await CapacitorHttp.post({ url, headers, data: options.body });
    }

    // Auto-logout on expired token
    if (res.status === 401) {
      console.warn("apiFetch: 401 - session expired, logging out");
      await doLogout();
      return { ok: false, status: 401, data: { error: "Session expiree" } };
    }

    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
  } catch (err) {
    console.error("apiFetch error:", err);
    return { ok: false, status: 0, data: { error: "Erreur de connexion" } };
  }
}

/* ============================================================
   Utilities
   ============================================================ */

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// True when a transaction is outgoing money (debit/sortie). The API ships
// `direction` as "in"|"out"; some legacy code paths use "debit"|"credit"; and
// some payloads only carry a signed amountCents. Accept all three.
function isDebitTx(tx) {
  if (!tx) return false;
  const d = String(tx.direction || "").toLowerCase();
  if (d === "out" || d === "debit") return true;
  if (d === "in" || d === "credit") return false;
  return Number(tx.amountCents ?? tx.amount ?? 0) < 0;
}

function formatAmount(cents, currency = "MAD") {
  if (cents == null) return "-";
  const num = (cents / 100);
  return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}

function formatAmountDirect(amount, currency = "MAD") {
  if (amount == null) return "-";
  const num = Number(amount);
  return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}

function formatPeriod(period) {
  if (!period) return "-";
  const [y, m] = period.split("-");
  const months = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
  return months[parseInt(m, 10) - 1] + " " + y;
}

function statusBadge(status) {
  const map = {
    // English keys
    pending: { label: "En attente", cls: "badge-pending" },
    approved: { label: "Approuve", cls: "badge-approved" },
    rejected: { label: "Refuse", cls: "badge-rejected" },
    paid: { label: "Paye", cls: "badge-paid" },
    draft: { label: "Brouillon", cls: "badge-draft" },
    validated: { label: "Valide", cls: "badge-approved" },
    sent: { label: "Envoye", cls: "badge-sent" },
    overdue: { label: "En retard", cls: "badge-overdue" },
    cancelled: { label: "Annule", cls: "badge-rejected" },
    // French keys (from API)
    "Brouillon": { label: "Brouillon", cls: "badge-draft" },
    "À encaisser": { label: "A encaisser", cls: "badge-sent" },
    "Payée": { label: "Payee", cls: "badge-paid" },
    "En attente": { label: "En attente", cls: "badge-pending" },
    "Accepté": { label: "Accepte", cls: "badge-approved" },
    "Refusé": { label: "Refuse", cls: "badge-rejected" },
    "Expiré": { label: "Expire", cls: "badge-overdue" },
  };
  const s = map[status] || { label: status || "-", cls: "badge-default" };
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

function leaveTypeLabel(type) {
  const map = { vacation: "Conge annuel", sick: "Maladie", birth: "Naissance", marriage: "Mariage", other: "Autre" };
  return map[type] || type || "-";
}


function showToast(msg) {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function emptyState(icon, text) {
  return `<div class="list-empty">${icon}<p>${escapeHtml(text)}</p></div>`;
}

function loadingHtml() {
  return '<div class="list-loading"><div class="spinner"></div></div>';
}

function getTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(dateStr);
}

function detailRow(label, value) {
  if (!value || value === "-" || value === "undefined") return "";
  return `<div class="detail-row"><span class="detail-row-label">${escapeHtml(label)}</span><span class="detail-row-value">${escapeHtml(String(value))}</span></div>`;
}

function resultRow(label, value) {
  return `<div class="result-row"><span class="result-label">${escapeHtml(label)}</span><span class="result-value">${escapeHtml(String(value))}</span></div>`;
}


function getEntityIcon(entityType) {
  const icons = {
    ticket: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
    invoice: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    bankStatement: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
  };
  return icons[entityType] || icons.invoice;
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector(".btn-text");
  const loader = btn.querySelector(".btn-loader");
  if (text) text.style.display = loading ? "none" : "inline";
  if (loader) loader.style.display = loading ? "inline-block" : "none";
  btn.disabled = loading;
}

/* ============================================================
   Screen / Navigation
   ============================================================ */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(screenId)?.classList.add("active");
}


/* ----- DIRIGEANT NAV ----- */
let currentDirTab = "dashboard";

function switchDirTab(tabName) {
  // Hide all dirigeant tabs
  document.querySelectorAll("#screen-dirigeant .tab-content").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById(`dir-tab-${tabName}`);
  if (target) target.classList.add("active");

  // Update bottom nav active state
  const mainTabs = ["dashboard", "bank", "entrees", "sorties", "more"];
  // Map sub-screens to their parent tab for highlighting
  const tabParent = {
    invoices: "entrees", quotes: "entrees", clients: "entrees", products: "entrees",
    "invoice-new": "entrees", "quote-new": "entrees", "client-new": "entrees", "product-new": "entrees", "invoice-detail": "entrees", "quote-detail": "entrees",
    tickets: "sorties", "supplier-invoices": "sorties", "expense-notes": "sorties", suppliers: "sorties",
    "ticket-detail": "sorties", "supplier-invoice-detail": "sorties",
    collaborators: "more", "payslips-manage": "more", "leaves-manage": "more",
    treasury: "more", "tva-report": "more", "tax-declarations": "more",
    legal: "more", collecte: "more", messages: "more", settings: "more", notifications: "dashboard",
  };
  document.querySelectorAll("#dir-bottom-nav .nav-item").forEach((el) => el.classList.remove("active"));
  const navTab = mainTabs.includes(tabName) ? tabName : (tabParent[tabName] || null);
  if (navTab) {
    const navBtn = document.querySelector(`#dir-bottom-nav .nav-item[data-dir-tab="dir-tab-${navTab}"]`);
    if (navBtn) navBtn.classList.add("active");
  }

  // Show/hide bottom nav for sub-screens
  const dirBottomNav = document.getElementById("dir-bottom-nav");
  const isSubScreen = target?.classList.contains("sub-screen");
  dirBottomNav.style.display = isSubScreen ? "none" : "flex";

  currentDirTab = tabName;

  // Load data
  if (tabName === "dashboard") loadDirDashboard();
  if (tabName === "bank") switchBankSegment(currentBankSeg);
  if (tabName === "entrees" || tabName === "sorties") loadDirDashboard();
  if (tabName === "invoices") loadInvoicesTab();
  if (tabName === "quotes") loadQuotes();
  if (tabName === "supplier-invoices") loadSupplierInvoices();
  if (tabName === "tickets") loadHistory();
  if (tabName === "more") loadMoreMenu();
  if (tabName === "clients") loadClients();
  if (tabName === "suppliers") loadSuppliers();
  if (tabName === "products") loadProducts();
  if (tabName === "product-new") initProductForm();
  if (tabName === "collaborators") loadCollaborators();
  if (tabName === "payslips-manage") loadPayslipsManage();
  if (tabName === "leaves-manage") loadLeavesManage();
  if (tabName === "expense-notes") loadExpenseNotes();
  if (tabName === "legal") loadLegalDocs();
  if (tabName === "treasury") loadTreasury();
  if (tabName === "invoice-new") loadInvoiceForm();
  if (tabName === "quote-new") loadQuoteForm();
  if (tabName === "notifications") { loadNotifications(); markNotificationsRead(); }
  if (tabName === "messages") loadConversations();
  if (tabName === "settings") loadSettings();
  if (tabName === "tva-report") loadTvaReport();
  if (tabName === "tax-declarations") loadTaxDeclarations();
  if (tabName === "collecte") loadCollecte();
}

// Full-screen auth-loading overlay helpers. Shown during sign-in flows
// (email/password and Google deeplink return) so the user never sees the
// login form return silently after a successful authentication.
function showAuthLoading(message) {
  const el = document.getElementById("auth-loading");
  const txt = document.getElementById("auth-loading-text");
  if (!el) return;
  if (txt) {
    if (message === "" || message == null) {
      // Empty message → spinner only, no caption. Used by the cold-boot
      // cover so we don't show a stale "Connexion en cours…" or any text.
      txt.textContent = "";
      txt.style.display = "none";
    } else {
      txt.textContent = message;
      txt.style.display = "";
    }
  }
  el.style.display = "flex";
  el.setAttribute("aria-hidden", "false");
}
function hideAuthLoading() {
  const el = document.getElementById("auth-loading");
  if (!el) return;
  el.style.display = "none";
  el.setAttribute("aria-hidden", "true");
}
window.showAuthLoading = showAuthLoading;
window.hideAuthLoading = hideAuthLoading;

async function enterApp({ silent = false } = {}) {
  // Make the loading overlay visible across the entire transition: it
  // covers the login form -> dashboard handoff so the user never sees a
  // flash of the login screen post-auth. We skip it when {silent:true},
  // e.g. on the post-process-death scan recovery path where the
  // scan-modal already covers the screen with its own analysis state.
  if (!silent) showAuthLoading("Préparation de votre espace…");
  try {
    await loadOrganizations();
  } catch (_) {}
  if (state.organizations.length > 0 && !state.orgId) {
    try { await saveOrgId(state.organizations[0]._id || state.organizations[0].id); } catch (_) {}
  }

  showScreen("screen-dirigeant");
  initDirigeantScreen();
  if (!silent) {
    // Hide on next frame so the dashboard finishes painting first — avoids
    // a brief flash of the welcome screen behind the overlay.
    requestAnimationFrame(() => hideAuthLoading());
  }
  initNotificationSystem().then(() => startNotificationPolling());
}

/* ============================================================
   LOGIN
   ============================================================ */

let pendingGoogleAuth = null;

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomNonce() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function doGoogleLogin() {
  const errorDiv = document.getElementById("login-error");
  const googleBtn = document.getElementById("btn-google-login");
  if (googleBtn) googleBtn.disabled = true;
  errorDiv.style.display = "none";

  try {
    const state = b64url(JSON.stringify({
      nonce: randomNonce(),
      next: "/app/landing",
      mode: "login",
      popup: false,
      mobile: true,
      profile: "",
    }));

    const params = new URLSearchParams({
      client_id: GOOGLE_WEB_CLIENT_ID,
      redirect_uri: `${API_BASE_URL}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
      state,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Show the loading overlay so the moment the user closes / completes
    // the Google custom tab, they see "Connexion en cours" — never the
    // empty login screen behind the closing custom tab.
    showAuthLoading("Connexion via Google…");
    await Browser.open({ url: authUrl, presentationStyle: "fullscreen" });
  } catch (err) {
    console.error("Google login error:", err?.message || err);
    const msg = err?.message || "Erreur de connexion Google";
    errorDiv.querySelector("span").textContent = msg;
    errorDiv.style.display = "flex";
  } finally {
    if (googleBtn) googleBtn.disabled = false;
  }
}

function parseYfitenAuthUrl(url) {
  const match = /^yfiten:\/\/auth\/?\??([^#]*)/i.exec(url || "");
  if (!match) return null;
  const params = new URLSearchParams(match[1] || "");
  return {
    token: params.get("token"),
    user: params.get("user"),
    error: params.get("error"),
  };
}

let _lastHandledDeepLinkUrl = null;
async function handleGoogleDeepLink(url) {
  if (!url || url === _lastHandledDeepLinkUrl) return;
  _lastHandledDeepLinkUrl = url;
  console.log("DEEPLINK received:", url);
  const parsed = parseYfitenAuthUrl(url);
  if (!parsed) {
    console.warn("DEEPLINK not matched:", url);
    hideAuthLoading();
    return;
  }
  // Keep the overlay visible across the deeplink → token-save → enterApp
  // transition so the user never blinks back to the welcome screen.
  showAuthLoading("Finalisation de la connexion…");
  console.log("DEEPLINK parsed:", { hasToken: !!parsed.token, error: parsed.error });

  try { await Browser.close(); } catch (_) {}

  try {
    const errorDiv = document.getElementById("login-error");
    if (parsed.error) {
      hideAuthLoading();
      if (errorDiv) {
        errorDiv.querySelector("span").textContent = parsed.error;
        errorDiv.style.display = "flex";
      }
      return;
    }

    if (!parsed.token) { hideAuthLoading(); return; }

    await saveToken(parsed.token);
    if (parsed.user) {
      try { await saveUser(JSON.parse(decodeURIComponent(parsed.user))); } catch (e) { console.error("DEEPLINK user parse:", e); }
    }
    await enterApp();
  } catch (err) {
    hideAuthLoading();
    console.error("DEEPLINK handler error:", err?.message || err);
  }
}

function showGoogleOnboarding(data) {
  document.getElementById("google-onboard-email").textContent = data.email || "";
  document.getElementById("google-onboard-firstname").value = data.firstName || "";
  document.getElementById("google-onboard-lastname").value = data.lastName || "";
  showScreen("screen-google-onboarding");
}

async function completeGoogleOnboarding(e) {
  e.preventDefault();
  const btn = document.getElementById("google-onboard-btn");
  const errorDiv = document.getElementById("google-onboard-error");
  btn.querySelector(".btn-text").style.display = "none";
  btn.querySelector(".btn-loader").style.display = "inline-block";
  btn.disabled = true;
  errorDiv.style.display = "none";

  try {
    const selectedCard = document.querySelector("#screen-google-onboarding .profile-card.selected");
    const profile = selectedCard?.dataset.profile || "entrepreneur";

    const res = await CapacitorHttp.post({
      url: `${API_BASE_URL}/api/auth/google/mobile`,
      headers: { "Content-Type": "application/json" },
      data: {
        ...pendingGoogleAuth,
        firstName: document.getElementById("google-onboard-firstname").value.trim(),
        lastName: document.getElementById("google-onboard-lastname").value.trim(),
        profile,
      },
    });

    if (res.status === 200 && res.data?.token) {
      await saveToken(res.data.token);
      await saveUser(res.data.user);
      await enterApp();
    } else {
      errorDiv.querySelector("span").textContent = res.data?.error || "Erreur lors de l'inscription";
      errorDiv.style.display = "flex";
    }
  } catch (err) {
    errorDiv.querySelector("span").textContent = "Erreur de connexion";
    errorDiv.style.display = "flex";
  } finally {
    btn.querySelector(".btn-text").style.display = "inline";
    btn.querySelector(".btn-loader").style.display = "none";
    btn.disabled = false;
  }
}

async function doLogin(email, password) {
  const loginBtn = document.getElementById("login-btn");
  const btnText = loginBtn.querySelector(".btn-text");
  const btnLoader = loginBtn.querySelector(".btn-loader");
  const errorDiv = document.getElementById("login-error");

  btnText.style.display = "none";
  btnLoader.style.display = "inline-block";
  loginBtn.disabled = true;
  errorDiv.style.display = "none";
  showAuthLoading("Connexion en cours…");

  try {
    const res = await CapacitorHttp.post({
      url: `${API_BASE_URL}/api/auth/mobile`,
      headers: { "Content-Type": "application/json" },
      data: { email, password },
    });

    if (res.status === 200 && res.data?.token) {
      await saveToken(res.data.token);
      await saveUser(res.data.user || { email });
      await enterApp();   // hides the overlay itself once the dashboard mounts
    } else {
      hideAuthLoading();
      const msg = res.data?.error || res.data?.message || "Identifiants incorrects";
      errorDiv.querySelector("span").textContent = msg;
      errorDiv.style.display = "flex";
    }
  } catch (err) {
    hideAuthLoading();
    errorDiv.querySelector("span").textContent = "Erreur de connexion";
    errorDiv.style.display = "flex";
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
    loginBtn.disabled = false;
  }
}

async function loadOrganizations() {
  try {
    const res = await apiFetch("/api/organizations");
    if (res.ok && res.data) {
      state.organizations = Array.isArray(res.data) ? res.data : res.data.organizations || [];
    }
  } catch (err) {
    console.error("loadOrganizations error:", err);
  }
}

async function doLogout() {
  stopNotificationPolling();
  await clearSession();
  showScreen("screen-welcome");
}

/* ====================================================================
   DIRIGEANT MODE
   ==================================================================== */

function _getOrgName(o) {
  if (!o) return "Organisation";
  return String(o.name || o.companyName || "Organisation");
}
function _getOrgId(o) { return String(o?._id || o?.id || ""); }

// Initials for the avatar mark. "Pigma" → "P", "Pigma System" → "PS",
// "Acme Co. SARL" → "AC". Skips short noise tokens (SARL, SA, …) so
// "Pigma SARL" doesn't render "PS" — it stays "P".
const _ORG_INITIALS_NOISE = new Set(["sa", "sarl", "sas", "sasu", "snc", "eurl", "spa", "scs", "co"]);
function _getOrgInitial(o) {
  const n = _getOrgName(o).trim();
  if (!n) return "?";
  // Strip diacritics so "Élise" → "Elise" and we get "E", not a combining mark.
  const norm = n.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = norm.split(/[\s\-_'.]+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !_ORG_INITIALS_NOISE.has(t.toLowerCase()));
  const pick = meaningful.length ? meaningful : tokens;
  if (pick.length >= 2) return (pick[0][0] + pick[1][0]).toUpperCase();
  return pick[0][0].toUpperCase();
}

// Deterministic gradient per org. The avatar is a circle with a smooth
// top-left → bottom-right gradient — gives the badge real depth without
// needing imagery. The two stops are picked from the same hue family so
// it reads as a single colour, just lit. White text reads on every one.
const _ORG_AVATAR_PALETTE = [
  ["#6366f1", "#4338ca"], // indigo
  ["#8b5cf6", "#6d28d9"], // violet
  ["#3b82f6", "#1d4ed8"], // blue
  ["#06b6d4", "#0e7490"], // cyan
  ["#10b981", "#047857"], // emerald
  ["#14b8a6", "#0f766e"], // teal
  ["#f59e0b", "#b45309"], // amber
  ["#f97316", "#c2410c"], // orange
  ["#ef4444", "#b91c1c"], // red
  ["#ec4899", "#be185d"], // pink
  ["#a855f7", "#7e22ce"], // purple
  ["#0ea5e9", "#0369a1"], // sky
];
function _hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
function _getOrgAvatarGradient(o) {
  const key = String(_getOrgId(o) || _getOrgName(o));
  const idx = Math.abs(_hashString(key)) % _ORG_AVATAR_PALETTE.length;
  const [a, b] = _ORG_AVATAR_PALETTE[idx];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}
// Kept for any caller that asked for the flat colour previously — returns
// the darker (bottom) stop so old call sites still get a sensible colour.
function _getOrgAvatarColor(o) {
  const key = String(_getOrgId(o) || _getOrgName(o));
  const idx = Math.abs(_hashString(key)) % _ORG_AVATAR_PALETTE.length;
  return _ORG_AVATAR_PALETTE[idx][1];
}

// Render the topbar: company name + initials avatar (background colour
// derived from the org id/name so each company has a stable, distinct
// look). Chevron only when there's more than one org. Called on init,
// on org switch, and any time state.orgId changes.
function renderTopbarOrg() {
  const orgs = state.organizations || [];
  const current = orgs.find((o) => _getOrgId(o) === String(state.orgId)) || orgs[0] || null;
  const nameEl = document.getElementById("org-name");
  const markEl = document.getElementById("org-mark");
  const chevronEl = document.getElementById("org-switcher-chevron");
  if (nameEl) nameEl.textContent = _getOrgName(current);
  if (markEl) {
    markEl.textContent = _getOrgInitial(current);
    // Background gradient + a tiny solid fallback in case the gradient
    // is overridden by some legacy CSS rule.
    markEl.style.backgroundImage = _getOrgAvatarGradient(current);
    markEl.style.backgroundColor = _getOrgAvatarColor(current);
  }
  if (chevronEl) chevronEl.style.display = orgs.length > 1 ? "inline-block" : "none";
}

function _renderOrgSwitcherList() {
  const list = document.getElementById("org-switcher-list");
  if (!list) return;
  const orgs = state.organizations || [];
  if (orgs.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:#64748b;font-size:13px;padding:12px">Aucune entreprise</p>`;
    return;
  }
  list.innerHTML = orgs.map((o) => {
    const id = _getOrgId(o);
    const isCurrent = id === String(state.orgId);
    const label = escapeHtml(_getOrgName(o));
    const sub = o.role || o.legal?.ma?.iceNumber || "";
    const gradient = _getOrgAvatarGradient(o);
    const fallback = _getOrgAvatarColor(o);
    const initials = escapeHtml(_getOrgInitial(o));
    return `<button type="button" class="org-switcher-item ${isCurrent ? "is-current" : ""}" data-org-id="${escapeHtml(id)}">
      <span class="org-switcher-mark" style="background-image:${gradient};background-color:${fallback}">${initials}</span>
      <div class="org-switcher-info">
        <div class="org-switcher-name">${label}</div>
        ${sub ? `<div class="org-switcher-sub">${escapeHtml(sub)}</div>` : ""}
      </div>
      <svg class="org-switcher-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </button>`;
  }).join("");
}

function openOrgSwitcher() {
  const sheet = document.getElementById("org-switcher-sheet");
  const trigger = document.getElementById("org-switcher-trigger");
  if (!sheet) return;
  _renderOrgSwitcherList();
  sheet.style.display = "flex";
  document.body.style.overflow = "hidden";
  if (trigger) trigger.setAttribute("aria-expanded", "true");
}
function closeOrgSwitcher() {
  const sheet = document.getElementById("org-switcher-sheet");
  const trigger = document.getElementById("org-switcher-trigger");
  if (!sheet) return;
  sheet.style.display = "none";
  document.body.style.overflow = "";
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

async function selectOrgAndSwitch(orgId) {
  if (!orgId || String(orgId) === String(state.orgId)) {
    closeOrgSwitcher();
    return;
  }
  await saveOrgId(orgId);
  // Drop any cached dashboard data — it was for the previous org.
  if (typeof invalidateDirDataCache === "function") invalidateDirDataCache();
  renderTopbarOrg();
  closeOrgSwitcher();
  // Hard refresh of the visible tab so KPIs / lists reflect the new org.
  switchDirTab(currentDirTab || "dashboard");
}

function initDirigeantScreen() {
  const orgs = state.organizations;
  const selectorEl = document.getElementById("org-selector");
  const selectEl = document.getElementById("org-select");

  // Legacy hidden <select> kept in sync — some code still reads from it.
  // The user-facing switcher is the bottom sheet bound below.
  selectorEl.style.display = "none";
  if (selectEl) {
    selectEl.innerHTML = orgs
      .map((o) => {
        const id = _getOrgId(o);
        return `<option value="${escapeHtml(id)}" ${id === String(state.orgId) ? "selected" : ""}>${escapeHtml(_getOrgName(o))}</option>`;
      })
      .join("");
  }

  renderTopbarOrg();

  // Bind switcher trigger + sheet — idempotent, the buttons live in the
  // dashboard tab so they're present once #screen-dirigeant mounts.
  const trigger = document.getElementById("org-switcher-trigger");
  if (trigger && !trigger.dataset.bound) {
    trigger.dataset.bound = "1";
    trigger.addEventListener("click", () => {
      // Single-org accounts: don't even open the sheet, nothing to switch.
      if ((state.organizations || []).length <= 1) return;
      openOrgSwitcher();
    });
  }
  const sheet = document.getElementById("org-switcher-sheet");
  if (sheet && !sheet.dataset.bound) {
    sheet.dataset.bound = "1";
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) { closeOrgSwitcher(); return; }
      const item = e.target.closest(".org-switcher-item");
      if (item && item.dataset.orgId) selectOrgAndSwitch(item.dataset.orgId);
    });
    document.getElementById("org-switcher-close")?.addEventListener("click", closeOrgSwitcher);
  }

  // Set profile info in More tab
  if (state.user) {
    const name = state.user.name || `${state.user.firstName || ""} ${state.user.lastName || ""}`.trim() || "Utilisateur";
    document.getElementById("dir-profile-name").textContent = name;
    document.getElementById("dir-profile-email").textContent = state.user.email || "Menu";
    const initials = name.split(" ").map(w => w.charAt(0)).join("").toUpperCase().slice(0, 2) || "U";
    document.getElementById("dir-profile-avatar").textContent = initials;
  }

  switchDirTab("dashboard");
}

/* ----- DIRIGEANT DASHBOARD ----- */

// Active period for the dashboard KPIs (Ce mois / 7 jours / Année).
// Same value drives the Entrées and Sorties hero amounts.
let _currentDirPeriod = "month";

// Period helpers — each returns a Date for the start of the window.
// The end of the window is always "now" (live data, no future dates).
function _periodStart(period, now = new Date()) {
  const d = new Date(now);
  if (period === "week") {
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "year") {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // "month" (default)
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function _periodLabel(period) {
  if (period === "week") return "7 derniers jours";
  if (period === "year") return "Cette année";
  return "Ce mois";
}
// Eyebrow text for the section heroes — slightly different phrasing.
function _periodSubText(period, kind) {
  if (period === "week") return kind === "in" ? "Encaissé · 7 jours" : "Dépensé · 7 jours";
  if (period === "year") return kind === "in" ? "Encaissé cette année" : "Dépensé cette année";
  return kind === "in" ? "Encaissé ce mois" : "Dépensé ce mois";
}
// Coerce any of the various date fields the API returns into a usable
// Date or null. Forgiving — if all are missing we fall through to "no
// date" which simply excludes the row from period filters.
function _txDate(obj, fields = ["paymentDate", "date", "valueDate", "createdAt", "issueDate"]) {
  for (const f of fields) {
    const v = obj?.[f];
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
// Returns the items whose primary date falls within [start, +∞).
function _filterByPeriod(items, period, fields) {
  const start = _periodStart(period);
  return items.filter((it) => {
    const d = _txDate(it, fields);
    return d && d >= start;
  });
}

// Compute the "solde final" total for an org — same rule as the webapp's
// compte-pro/bank-accounts page: for each account, prefer the closing
// balance from its most recent statement (`/api/pro-accounts/last-balances`),
// fall back to the account's stored `balanceCents`. Returns the SUM in
// cents across every account, with the count alongside.
function computeTotalBalance(accounts, lastBalances) {
  const arr = Array.isArray(accounts) ? accounts : [];
  let total = 0;
  for (const a of arr) {
    const id = String(a?.id || a?._id || "");
    const fromStatement = id && lastBalances && lastBalances[id] != null
      ? Number(lastBalances[id])
      : null;
    const fallback = Number(a?.balanceCents ?? a?.balance ?? 0);
    total += fromStatement != null ? fromStatement : fallback;
  }
  return { totalCents: total, count: arr.length };
}

// Per-endpoint cache so navigating between dashboard / entrees / sorties /
// recent-activity doesn't re-fetch the same URL several times in a row.
// We treat the cache as fresh for 30 s — long enough to make rapid tab
// switches feel instant, short enough that hand-edited records show up
// quickly. Each entry stores the in-flight Promise so concurrent calls
// share one network round trip.
const _dirDataCache = new Map(); // url → { ts, promise }
const _DIR_CACHE_TTL = 30000;

function _cachedFetch(url) {
  const now = Date.now();
  const hit = _dirDataCache.get(url);
  if (hit && now - hit.ts < _DIR_CACHE_TTL) return hit.promise;
  const promise = apiFetch(url).catch((e) => {
    // Don't poison the cache on failure — drop the entry so the next
    // tab switch retries.
    _dirDataCache.delete(url);
    throw e;
  });
  _dirDataCache.set(url, { ts: now, promise });
  return promise;
}

// Manually invalidate the cache after writes (new invoice, attached
// receipt, etc.) so the next dashboard refresh shows the latest state.
function invalidateDirDataCache() {
  _dirDataCache.clear();
}

async function loadDirDashboard() {
  if (!state.orgId) return;

  const setKpi = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  let revenueCents = 0;
  let ticketsExpensesCents = 0;
  let supplierExpensesCents = 0;
  let pendingCount = 0;

  const refreshExpensesUI = () => {
    const totalExpenses = ticketsExpensesCents + supplierExpensesCents;
    setKpi("kpi-expenses", `−${formatAmount(totalExpenses)}`);
    setKpi("cat-sorties-expenses", formatAmount(totalExpenses));
    const netCents = revenueCents - totalExpenses;
    const sign = netCents >= 0 ? "+" : "−";
    setKpi("mc-net", `${sign}${formatAmount(Math.abs(netCents))}`);
  };

  const refreshNet = () => {
    refreshExpensesUI();
    const todo = pendingCount;
    setKpi("mc-todo-count", String(todo));
    setKpi("mc-pending-sub", todo === 0 ? "Aucune facture en attente" : (todo === 1 ? "1 facture en attente" : `${todo} factures en attente`));
  };

  // One fetch per endpoint — this used to fire 5 API calls (with two
  // duplicate /api/client-invoices) and another 2 in loadRecentActivity.
  // Now each URL is hit once, cached, and shared by every consumer.
  const orgQ = `?organizationId=${state.orgId}`;
  const invoicesP = _cachedFetch(`/api/client-invoices${orgQ}`);
  const ticketsP = _cachedFetch(`/api/tickets${orgQ}`);
  const supplierP = _cachedFetch(`/api/supplier-invoices${orgQ}`);
  const accountsP = _cachedFetch(`/api/pro-accounts${orgQ}`);
  // Last known closing balance per account, from the most recent imported
  // bank statement. Mirrors the webapp's compte-pro/bank-accounts page —
  // if the user has imported relevés, this is the authoritative balance
  // ("solde final") rather than the stale stored balance.
  const lastBalancesP = _cachedFetch(`/api/pro-accounts/last-balances${orgQ}`);

  const promises = [];

  const period = _currentDirPeriod;
  // Update the page eyebrow / sub texts so the labels match the active
  // period instead of always saying "ce mois".
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText("entrees-period-eyebrow", _periodSubText(period, "in"));
  setText("sorties-period-eyebrow", _periodSubText(period, "out"));
  setText("mc-revenue-period-sub", _periodSubText(period, "in"));

  // Revenue + pending — period-filtered for the displayed amount, but
  // pending count stays "all-time outstanding" since unpaid invoices
  // shouldn't drop off just because they're old.
  promises.push(invoicesP.then(res => {
    if (!res?.ok) return;
    const invoices = res.data?.invoices || [];
    const paidInvoices = invoices.filter(inv => inv.status === "Payée" || inv.status === "Payee");
    // Period filter on the actual payment date for booked revenue.
    const paidInPeriod = _filterByPeriod(paidInvoices, period, ["paymentDate", "issueDate", "createdAt"]);
    const paidTotal = paidInPeriod.reduce((sum, inv) => sum + (inv.amountCents || 0), 0);
    revenueCents = paidTotal;
    setKpi("kpi-revenue", `+${formatAmount(paidTotal)}`);
    setKpi("cat-entrees-revenue", formatAmount(paidTotal));
    // Sub-stat shows TOTAL invoice count (cumulative) so the sub-pages
    // header matches what the user sees inside Factures.
    setKpi("cat-entrees-invoices-sub", invoices.length === 1 ? "1 facture" : `${invoices.length} factures`);
    pendingCount = invoices.filter(i => i.status === "Brouillon" || i.status === "À encaisser").length;
    setKpi("kpi-pending", String(pendingCount));
    setKpi("cat-entrees-pending", String(pendingCount));
    refreshNet();
  }).catch(() => {}));

  promises.push(ticketsP.then(res => {
    if (!res?.ok) return;
    const allTickets = res.data?.tickets || (Array.isArray(res.data) ? res.data : []);
    const ticketsInPeriod = _filterByPeriod(allTickets, period, ["paymentDate", "createdAt"]);
    ticketsExpensesCents = ticketsInPeriod.reduce((sum, t) => sum + (t.amountCents || 0), 0);
    // Documents count: total (lifetime), so it matches what the Reçus
    // list shows internally.
    setKpi("kpi-documents", String(allTickets.length));
    setKpi("cat-sorties-tickets", String(allTickets.length));
    refreshExpensesUI();
    refreshNet();
  }).catch(() => {}));

  // Supplier invoices: amounts in the active period only. Bills outside
  // the window aren't part of "this month's spend" even if unpaid.
  promises.push(supplierP.then(res => {
    if (!res?.ok) return;
    const invoices = res.data?.invoices || res.data?.supplierInvoices || [];
    const invoicesInPeriod = _filterByPeriod(invoices, period, ["importDate", "dueDate", "createdAt"]);
    supplierExpensesCents = invoicesInPeriod.reduce((sum, i) => sum + (i.amountCents || 0), 0);
    refreshExpensesUI();
    refreshNet();
  }).catch(() => {}));

  // Solde de trésorerie — uses the "solde final" from the most recent
  // bank statement per account (matching the webapp's bank-accounts page).
  // Resolves both fetches together so we never display the stored
  // balanceCents and then flip to the (correct) statement balance.
  promises.push(Promise.all([accountsP, lastBalancesP]).then(([accRes, balRes]) => {
    if (!accRes?.ok) return;
    const accounts = accRes.data?.accounts || [];
    const balances = (balRes?.ok && balRes.data?.balances) || {};
    const { totalCents } = computeTotalBalance(accounts, balances);
    if (totalCents > 100) setKpi("kpi-balance", formatAmount(totalCents));
    else setKpi("kpi-balance", formatAmountDirect(totalCents));
  }).catch(() => {}));

  await Promise.allSettled(promises);

  // Recent activity reuses the SAME tickets + invoices responses we
  // already have — no additional network calls.
  loadRecentActivity({ ticketsP, invoicesP });
}

async function loadRecentActivity(shared = {}) {
  const container = document.getElementById("recent-activity-list");
  if (!container) return;

  try {
    // Reuse the dashboard's already-resolving promises when the caller
    // passes them in; fall through to the cache for ad-hoc calls so the
    // same URL is never hit twice within the cache window.
    const orgQ = `?organizationId=${state.orgId}`;
    const tP = shared.ticketsP || _cachedFetch(`/api/tickets${orgQ}`);
    const iP = shared.invoicesP || _cachedFetch(`/api/client-invoices${orgQ}`);
    const [ticketsRes, invoicesRes] = await Promise.allSettled([tP, iP]);

    const items = [];

    if (ticketsRes.status === "fulfilled" && ticketsRes.value.ok) {
      const tickets = ticketsRes.value.data?.tickets || (Array.isArray(ticketsRes.value.data) ? ticketsRes.value.data : []);
      tickets.slice(0, 5).forEach(t => {
        items.push({
          type: "ticket",
          title: t.beneficiaire || "Ticket",
          amount: t.amountCents != null ? formatAmount(t.amountCents, t.currency || "MAD") : "-",
          date: t.createdAt || t.paymentDate,
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
        });
      });
    }

    if (invoicesRes.status === "fulfilled" && invoicesRes.value.ok) {
      const invoices = invoicesRes.value.data?.invoices || [];
      invoices.slice(0, 5).forEach(inv => {
        items.push({
          type: "invoice",
          title: inv.client?.name || `Facture ${inv.ref || ""}`,
          amount: inv.amountCents != null ? formatAmount(inv.amountCents) : "-",
          date: inv.issueDate || inv.createdAt,
          status: inv.status,
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        });
      });
    }

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (items.length === 0) {
      container.innerHTML = emptyState(
        `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        "Aucune activite recente"
      );
      return;
    }

    container.innerHTML = items.slice(0, 10).map(item => `
      <div class="list-item">
        <div class="list-item-icon">${item.icon}</div>
        <div class="list-item-content">
          <div class="list-item-title">${escapeHtml(item.title)}</div>
          <div class="list-item-meta">${formatDate(item.date)}${item.status ? ` <span class="meta-dot"></span> ${statusBadge(item.status)}` : ""}</div>
        </div>
        <div class="list-item-amount">${item.amount}</div>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de chargement");
  }
}

/* ----- BANK ----- */

let currentBankSeg = "transactions";

// Friendly French labels for the header / sheet so the rest of the
// code can refer to segments by their internal slug.
const _BANK_PAGE_LABELS = {
  transactions: "Transactions",
  accounts: "Comptes",
  statements: "Relevés",
};

function switchBankSegment(seg) {
  currentBankSeg = seg;
  // Legacy hidden segment-control kept for any old click delegation.
  document.querySelectorAll("#bank-segment-control .segment-btn").forEach(b => b.classList.toggle("active", b.dataset.bankSeg === seg));
  document.querySelectorAll(".bank-segment").forEach(el => { el.style.display = "none"; el.classList.remove("active"); });
  const target = document.getElementById(`bank-seg-${seg}`);
  if (target) { target.style.display = "block"; target.classList.add("active"); }

  // Header switcher: update the visible page name + the sheet's "is-current"
  // marker. Done here so every code path that swaps the bank segment
  // (initial mount, sheet click, etc.) keeps the UI consistent.
  const currentLabelEl = document.getElementById("bank-page-current");
  if (currentLabelEl) currentLabelEl.textContent = _BANK_PAGE_LABELS[seg] || "Transactions";
  document.querySelectorAll("#bank-page-sheet .bank-page-item").forEach((it) => {
    it.classList.toggle("is-current", it.dataset.bankSeg === seg);
  });

  if (seg === "accounts") loadBankAccountsOnly();
  if (seg === "transactions") loadBankTransactions();
  if (seg === "statements") loadBankStatements();
}

function openBankPageSheet() {
  const sheet = document.getElementById("bank-page-sheet");
  if (!sheet) return;
  sheet.style.display = "flex";
  document.body.style.overflow = "hidden";
  const trigger = document.getElementById("bank-page-switcher");
  if (trigger) trigger.setAttribute("aria-expanded", "true");
}
function closeBankPageSheet() {
  const sheet = document.getElementById("bank-page-sheet");
  if (!sheet) return;
  sheet.style.display = "none";
  document.body.style.overflow = "";
  const trigger = document.getElementById("bank-page-switcher");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

// Format an IBAN/RIB with spaces every 4 chars for readability — same
// rule as the webapp's formatIBANDisplay / formatRIBDisplay helpers.
function _formatIbanForDisplay(s) {
  const norm = String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
  if (!norm) return "";
  return norm.match(/.{1,4}/g)?.join(" ") || norm;
}

// Bank-brand and supplier-brand logos are served from session-protected
// endpoints (/api/bank-brand-logo/<id>, /api/shared-supplier-brand-logo/<id>,
// /api/classifier-logo?domain=...), so a plain <img src> 401s in the
// WebView. We fetch via the bearer-aware helper, cache the blob URL,
// and swap it into every matching <img> on the page.
//
// Used for both bank-account cards and transaction-row supplier logos.
// Anywhere we want a logo: render <img data-auth-logo-path="…" style="display:none">
// followed by a fallback element marked [data-auth-logo-fallback]; then
// call _hydrateAuthLogos(rootEl).
const _authLogoBlobCache = new Map(); // logoPath → blobUrl
async function _resolveAuthLogoBlob(path) {
  if (!path) return null;
  if (_authLogoBlobCache.has(path)) return _authLogoBlobCache.get(path);
  try {
    const url = await fetchAuthenticatedImage(path);
    if (url) _authLogoBlobCache.set(path, url);
    return url || null;
  } catch (_) {
    return null;
  }
}
function _hydrateAuthLogos(rootEl) {
  if (!rootEl) return;
  // Accept the legacy `data-bank-logo-path` attribute too — bank-account
  // cards still use it; the underlying mechanism is identical.
  const imgs = rootEl.querySelectorAll("img[data-auth-logo-path], img[data-bank-logo-path]");
  const byPath = new Map();
  imgs.forEach((img) => {
    const p = img.dataset.authLogoPath || img.dataset.bankLogoPath;
    if (!p) return;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(img);
  });
  byPath.forEach(async (els, path) => {
    const blobUrl = await _resolveAuthLogoBlob(path);
    if (!blobUrl) return;
    els.forEach((img) => {
      img.src = blobUrl;
      img.style.display = "";
      const sibling = img.nextElementSibling;
      const fallback = (sibling && (sibling.matches("[data-auth-logo-fallback]") || sibling.matches("[data-bank-logo-fallback]")))
        ? sibling
        : img.parentElement?.querySelector("[data-auth-logo-fallback], [data-bank-logo-fallback]");
      if (fallback) fallback.style.display = "none";
    });
  });
}
// Legacy alias kept so anything that still calls _hydrateBankLogos works.
const _hydrateBankLogos = _hydrateAuthLogos;

async function loadBankAccountsOnly() {
  if (!state.orgId) return;
  // The "Comptes" segment lives at #bank-seg-accounts, with the list
  // anchored at #bank-accounts-list. (#accounts-list was the old layout
  // and may still be referenced elsewhere — we render to whichever is
  // actually mounted.)
  const newContainer = document.getElementById("bank-accounts-list");
  const legacyContainer = document.getElementById("accounts-list");
  const container = newContainer || legacyContainer;
  if (!container) return;
  container.innerHTML = loadingHtml();
  try {
    // Pull the account list AND the per-account "solde final" in parallel
    // so we never flicker between stale stored balance and the real one.
    const [accRes, balRes] = await Promise.all([
      _cachedFetch(`/api/pro-accounts?organizationId=${state.orgId}`),
      _cachedFetch(`/api/pro-accounts/last-balances?organizationId=${state.orgId}`),
    ]);
    if (!accRes?.ok) {
      container.innerHTML = emptyState("", "Erreur de chargement");
      return;
    }
    const accounts = accRes.data?.accounts || [];
    const lastBalances = (balRes?.ok && balRes.data?.balances) || {};

    if (accounts.length === 0) {
      container.innerHTML = emptyState(
        `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
        "Aucun compte bancaire"
      );
      return;
    }

    container.innerHTML = accounts.map(a => {
      const name = escapeHtml(String(a.name || a.bankName || "Compte bancaire"));
      const bankName = a.bankName ? escapeHtml(String(a.bankName)) : "Banque non identifiée";
      const isPrimary = !!a.isPrimary;
      const id = String(a.id || a._id || "");
      const lastBal = lastBalances[id];
      const displayCents = lastBal != null ? Number(lastBal) : Number(a.balanceCents ?? 0);
      const balanceClass = displayCents > 0 ? "is-positive" : (displayCents < 0 ? "is-negative" : "");
      const balanceLabel = lastBal != null ? "Dernier solde connu" : "Solde";
      const balanceFormatted = formatAmount(displayCents, a.currency || "MAD");
      // Logo: bankLogoUrl from /api/pro-accounts is a relative path to a
      // session-protected endpoint, so we render an empty <img> with a
      // data-bank-logo-path attribute and let _hydrateBankLogos() fill
      // it in via the bearer-aware fetch (blob URL). Until the swap, the
      // SVG fallback shows so the card never has a blank slot.
      const buildingSvg = `<svg data-bank-logo-fallback width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-7h6v7"/></svg>`;
      const logoHtml = a.bankLogoUrl
        ? `<img data-bank-logo-path="${escapeHtml(String(a.bankLogoUrl))}" alt="" style="display:none" />${buildingSvg}`
        : buildingSvg;

      const rows = [];
      if (a.iban) rows.push({ label: "IBAN", value: _formatIbanForDisplay(a.iban) });
      if (a.rib) rows.push({ label: "RIB", value: _formatIbanForDisplay(a.rib) });
      if (a.bic) rows.push({ label: "BIC", value: String(a.bic).toUpperCase() });
      const rowsHtml = rows.length
        ? `<div class="bank-account-rows">${rows.map(r =>
            `<div class="bank-account-row"><span class="bank-account-row-label">${r.label}</span><span class="bank-account-row-value">${escapeHtml(r.value)}</span></div>`
          ).join("")}</div>`
        : "";

      return `<div class="bank-account-card">
        <div class="bank-account-card-head">
          <div class="bank-account-logo">${logoHtml}</div>
          <div class="bank-account-meta">
            <div class="bank-account-name-row">
              <div class="bank-account-name">${name}</div>
              ${isPrimary ? `<span class="bank-account-primary-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9"/></svg>Principal</span>` : ""}
            </div>
            <div class="bank-account-bank">${bankName}</div>
          </div>
        </div>
        ${rowsHtml}
        <div class="bank-account-balance">
          <div class="bank-account-balance-label">${balanceLabel}</div>
          <div class="bank-account-balance-amount ${balanceClass}">${escapeHtml(balanceFormatted)}</div>
        </div>
      </div>`;
    }).join("");
    _hydrateBankLogos(container);
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/**
 * Transaction Justificatifs modal — pro layout inspired by the webapp's
 * ReceiptsMenu. Shows the transaction summary, an optional matched-invoice
 * card, the list of attached documents with per-row actions (view, share,
 * delete) and a primary "Ajouter un justificatif" CTA.
 *
 * `tx` shape: { id, amount, description, direction, date, receipts:[], matchedInvoice? }
 */
let _txDocsCurrent = null;
const _txDocsThumbCache = new Map();

function _txDocsIsImage(r) {
  return (r?.contentType || "").startsWith("image/")
    || /\.(jpe?g|png|gif|webp|bmp|tiff)$/i.test(r?.fileName || "");
}

/* ============================================================
   Per-receipt OCR cache. Bridges the gap until the webapp persists
   `Transaction.receipts[].extracted` server-side. We store every
   extraction the phone produces (keyed by the server's receipt fileId)
   in localStorage so the data survives a session — and merge it back
   into receipts on every read. Once the webapp is deployed and starts
   returning `extracted` in the API response, that takes precedence.
   ============================================================ */
const _LOCAL_OCR_KEY = "yfiten:receiptOcr:v1";
let _localReceiptOcrCache = null;

function _loadLocalReceiptOcrCache() {
  if (_localReceiptOcrCache) return _localReceiptOcrCache;
  _localReceiptOcrCache = {};
  try {
    const raw = localStorage.getItem(_LOCAL_OCR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") _localReceiptOcrCache = parsed;
    }
  } catch (_) {}
  return _localReceiptOcrCache;
}

function _persistLocalReceiptOcrCache() {
  try {
    localStorage.setItem(_LOCAL_OCR_KEY, JSON.stringify(_localReceiptOcrCache || {}));
  } catch (_) {}
}

function _setLocalReceiptOcr(fileId, extracted) {
  if (!fileId || !extracted) return;
  const cache = _loadLocalReceiptOcrCache();
  cache[String(fileId)] = extracted;
  _persistLocalReceiptOcrCache();
}

function _getLocalReceiptOcr(fileId) {
  if (!fileId) return null;
  const cache = _loadLocalReceiptOcrCache();
  return cache[String(fileId)] || null;
}

function _txDocsExt(r) {
  const name = (r?.fileName || "").toLowerCase();
  const m = name.match(/\.([a-z0-9]{1,5})$/);
  if (m) return m[1].toUpperCase();
  const ct = r?.contentType || "";
  if (/pdf/i.test(ct)) return "PDF";
  if (/jpeg/i.test(ct)) return "JPG";
  if (/png/i.test(ct)) return "PNG";
  if (/webp/i.test(ct)) return "WEBP";
  if (/gif/i.test(ct)) return "GIF";
  if (ct) return ct.split("/").pop().slice(0, 4).toUpperCase();
  return "DOC";
}

function _txDocsIsPdf(r) {
  return (r?.contentType || "").includes("pdf") || /\.pdf$/i.test(r?.fileName || "");
}

function _txDocsBadge(r) {
  const ext = _txDocsExt(r);
  if (_txDocsIsImage(r)) {
    return `<div class="tx-docs-thumb-badge tx-docs-thumb-badge-img"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
  }
  if (_txDocsIsPdf(r)) {
    return `<div class="tx-docs-thumb-badge tx-docs-thumb-badge-pdf"><span class="tx-docs-thumb-ext">PDF</span></div>`;
  }
  return `<div class="tx-docs-thumb-badge tx-docs-thumb-badge-doc"><span class="tx-docs-thumb-ext">${escapeHtml(ext)}</span></div>`;
}

function _txDocsContentTypeLabel(r) {
  if (_txDocsIsImage(r)) return "Image";
  if (_txDocsIsPdf(r)) return "PDF";
  const ct = r?.contentType || "";
  if (ct) return ct.split("/").pop().toUpperCase();
  return "Document";
}

const _MATCHED_TYPE_META = {
  client_invoice:   { label: "Facture client",      icon: "FILE_TEXT", tone: "blue" },
  supplier_invoice: { label: "Facture fournisseur", icon: "FILE_TEXT", tone: "violet" },
  ticket:           { label: "Reçu / Ticket",       icon: "RECEIPT",   tone: "amber" },
  payslip:          { label: "Bulletin de paie",    icon: "FILE_TEXT", tone: "emerald" },
  expense:          { label: "Note de frais",       icon: "RECEIPT",   tone: "slate"  },
  bon_commande:     { label: "Bon de commande",     icon: "FILE_TEXT", tone: "indigo" },
};

function _matchedItemIconSvg(kind) {
  if (kind === "RECEIPT") {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-2-2-2 2V2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`;
}

/**
 * Renders the per-transaction "wallet" — a card at the top of the docs
 * modal showing how much of the transaction amount has already been
 * justified (sum of matched documents) and how much is still to approve.
 * Designed to feel like a digital wallet: large amounts, clear progress.
 */
/**
 * Single source of truth for "what data do we know about the receipt at
 * index `idx`". Both the per-card renderer (_renderTxDocsList) and the
 * wallet aggregate (_renderTxDocsWallet) call this so they never disagree.
 *
 * Source priority (per-doc only — never the transaction's own data):
 *  1) The receipt's own `extracted` field (persisted in MongoDB on
 *     `Transaction.receipts[].extracted` at upload time). This is the
 *     authoritative per-doc OCR result.
 *  2) The receipt's positionally matched Ticket
 *     (`matchedItems[type=ticket][idx]`) for legacy receipts that don't
 *     yet have a stored extracted blob.
 *
 *  Returns { ticket, extracted, merchant, amountCents, htCents, tvaRate }.
 */
function _getReceiptDocData(idx, tx) {
  const receipts = Array.isArray(tx?.receipts) ? tx.receipts : [];
  const receipt = receipts[idx] || null;
  const matchedItems = (Array.isArray(tx?.matchedItems) ? tx.matchedItems : [])
    .filter(it => it && it.type === "ticket");
  const ticket = matchedItems[idx] || null;
  // Per-doc OCR: prefer what the API returned, fall back to the local
  // cache (keyed by receipt fileId) for receipts attached before the
  // server learned to persist `extracted`.
  let ext = receipt?.extracted || null;
  if (!ext && receipt?.fileId) {
    ext = _getLocalReceiptOcr(receipt.fileId);
  }

  // Default empty result.
  let merchant = "";
  let amountCents = null;
  let htCents = null;
  let tvaRateNum = null;

  // 1) Persisted per-receipt OCR (the user-facing source of truth).
  if (ext) {
    merchant = ext.classifier?.merchant_name
      || ext.beneficiaire
      || ext.emetteur
      || "";
    if (ext.montant_ttc != null) {
      amountCents = Math.round(Number(ext.montant_ttc) * 100);
    }
    if (ext.montant_ht != null) {
      htCents = Math.round(Number(ext.montant_ht) * 100);
    }
    // taux_tva can be a number or the API's bracket array.
    if (Array.isArray(ext.taux_tva)) {
      // Use the first bracket's rate as representative; the viewer panel
      // still lists every bracket separately.
      const first = ext.taux_tva[0];
      if (first && first.taux != null) {
        const r = typeof first.taux === "string"
          ? Number(String(first.taux).replace(/[^\d.]/g, ""))
          : Number(first.taux);
        if (Number.isFinite(r)) tvaRateNum = r;
      }
      // Fill TTC from the per-bracket sum when not given outright.
      if (amountCents == null) {
        let totalTtc = 0;
        for (const r of ext.taux_tva) {
          if (r && r.montant_ttc != null) totalTtc += Number(r.montant_ttc);
        }
        if (totalTtc > 0) amountCents = Math.round(totalTtc * 100);
      }
    } else if (ext.taux_tva != null) {
      const r = Number(ext.taux_tva);
      if (Number.isFinite(r)) tvaRateNum = r;
    }
    // TTC = HT × (1 + rate) when only the inputs are known.
    if (amountCents == null && htCents != null && tvaRateNum != null) {
      amountCents = Math.round(htCents * (1 + tvaRateNum / 100));
    }
  }

  // 2) Matched-ticket fallback for receipts uploaded before per-doc OCR
  //    persistence existed.
  if (ticket) {
    if (!merchant) merchant = ticket.counterpartyName || "";
    if (amountCents == null && ticket.amountCents != null) {
      amountCents = Math.abs(Number(ticket.amountCents));
    }
    if (htCents == null && ticket.htCents != null) {
      htCents = Math.abs(Number(ticket.htCents));
    }
    if (tvaRateNum == null && ticket.tvaRate != null) {
      tvaRateNum = Number(ticket.tvaRate);
    }
    if (amountCents == null && htCents != null && tvaRateNum != null) {
      amountCents = Math.round(htCents * (1 + tvaRateNum / 100));
    }
  }

  return { ticket, extracted: ext, merchant, amountCents, htCents, tvaRate: tvaRateNum };
}

function _renderTxDocsWallet(tx) {
  const slot = document.getElementById("tx-docs-wallet");
  if (!slot) return;
  if (!tx) { slot.innerHTML = ""; return; }

  const txAmountCents = Number(tx.amount ?? 0);
  if (txAmountCents <= 0) { slot.innerHTML = ""; return; }

  // The user-facing list of justificatifs is `tx.receipts[]`. We sum each
  // doc's amount via _getReceiptDocData — strictly the per-Ticket OCR
  // amount, never derived from tx-wide data.
  const receipts = Array.isArray(tx.receipts) ? tx.receipts : [];
  const docCount = receipts.length;

  let approvedCents = 0;
  let knownDocs = 0;
  let unknownDocs = 0;
  for (let i = 0; i < receipts.length; i++) {
    const { amountCents } = _getReceiptDocData(i, tx);
    if (amountCents == null || amountCents <= 0) {
      unknownDocs++;
      continue;
    }
    approvedCents += amountCents;
    knownDocs++;
  }

  // The wallet never claims "complete" without proof: completion requires
  // (a) every doc has a known amount and (b) the sum covers the tx within
  // a 1 MAD rounding tolerance.
  const remainingCents = Math.max(0, txAmountCents - approvedCents);
  const ratio = txAmountCents > 0 ? Math.min(1, approvedCents / txAmountCents) : 0;
  const pct = Math.round(ratio * 100);
  const isEmpty = docCount === 0;
  const isComplete = !isEmpty && unknownDocs === 0 && approvedCents >= txAmountCents - 100;
  const isPartial = !isEmpty && !isComplete;
  const stateClass = isComplete
    ? "tx-docs-wallet-complete"
    : isPartial
      ? "tx-docs-wallet-partial"
      : "tx-docs-wallet-empty";

  const docCountLabel = `${docCount} doc${docCount > 1 ? "s" : ""}`;
  let footerHtml;
  if (isEmpty) {
    footerHtml = "Aucun justificatif rapproché";
  } else if (isComplete) {
    footerHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg> Transaction entièrement justifiée`;
  } else if (unknownDocs > 0 && knownDocs === 0) {
    // We have docs but no extracted amount for any of them — be honest.
    footerHtml = `${docCount} doc${docCount > 1 ? "s" : ""} en attente d'analyse`;
  } else if (unknownDocs > 0) {
    footerHtml = `${pct}% rapproché · ${unknownDocs} doc${unknownDocs > 1 ? "s" : ""} sans montant`;
  } else {
    footerHtml = `${pct}% rapproché`;
  }

  slot.innerHTML = `
    <div class="tx-docs-wallet ${stateClass}">
      <div class="tx-docs-wallet-row">
        <div class="tx-docs-wallet-col">
          <div class="tx-docs-wallet-label">Rapproché</div>
          <div class="tx-docs-wallet-amount">${escapeHtml(formatAmount(approvedCents))}</div>
          <div class="tx-docs-wallet-sub">${escapeHtml(docCountLabel)}</div>
        </div>
        <div class="tx-docs-wallet-divider"></div>
        <div class="tx-docs-wallet-col tx-docs-wallet-col-right">
          <div class="tx-docs-wallet-label">${isComplete ? "Total" : "Restant"}</div>
          <div class="tx-docs-wallet-amount">${escapeHtml(formatAmount(isComplete ? txAmountCents : remainingCents))}</div>
          <div class="tx-docs-wallet-sub">${escapeHtml(formatAmount(txAmountCents))} au total</div>
        </div>
      </div>
      <div class="tx-docs-wallet-bar">
        <div class="tx-docs-wallet-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="tx-docs-wallet-foot">${footerHtml}</div>
    </div>`;
}

function _renderTxDocsMatchedItems(items) {
  const arr = Array.isArray(items) ? items.filter(it => it && it.pdfUrl) : [];
  // Find or create a slot so we can re-render after deletes.
  let slot = document.getElementById("tx-docs-matched-items");
  if (!slot) {
    const list = document.getElementById("tx-docs-list");
    if (!list) return;
    slot = document.createElement("div");
    slot.id = "tx-docs-matched-items";
    list.parentNode.insertBefore(slot, list);
  }
  if (arr.length === 0) { slot.innerHTML = ""; return; }

  const header = `<div class="tx-docs-section-title">
    <span class="tx-docs-section-title-text">Documents rapprochés</span>
    <span class="tx-docs-count-badge">${arr.length}</span>
  </div>`;

  const rows = arr.map(it => {
    const meta = _MATCHED_TYPE_META[it.type] || { label: "Document", icon: "FILE_TEXT", tone: "slate" };
    const subParts = [];
    if (it.ref) subParts.push(it.ref);
    if (it.counterpartyName) subParts.push(it.counterpartyName);
    if (it.amountCents != null) subParts.push(formatAmount(Math.abs(Number(it.amountCents))));
    const sub = subParts.join(" · ");
    return `<div class="tx-docs-matched-item tx-docs-matched-tone-${meta.tone}"
      data-tx-matched-type="${escapeHtml(it.type || "")}"
      data-tx-matched-id="${escapeHtml(String(it.id || ""))}"
      data-tx-matched-pdf-url="${escapeHtml(String(it.pdfUrl || ""))}"
      data-tx-matched-label="${escapeHtml(it.label || meta.label)}">
      <div class="tx-docs-matched-thumb">${_matchedItemIconSvg(meta.icon)}</div>
      <div class="tx-docs-matched-body">
        <div class="tx-docs-matched-title">${escapeHtml(it.label || meta.label)}</div>
        <div class="tx-docs-matched-meta">
          <span class="tx-docs-matched-pill">${escapeHtml(meta.label)}</span>
          ${sub ? `<span class="tx-docs-matched-sub">${escapeHtml(sub)}</span>` : ""}
        </div>
      </div>
      <svg class="tx-docs-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </div>`;
  }).join("");

  slot.innerHTML = `${header}<div class="tx-docs-matched-list">${rows}</div>`;
}

function _renderTxDocsMatched(matchedInvoice) {
  const slot = document.getElementById("tx-docs-matched");
  if (!slot) return;
  if (!matchedInvoice || !matchedInvoice.ref) {
    slot.innerHTML = "";
    return;
  }
  const ref = escapeHtml(String(matchedInvoice.ref));
  const client = matchedInvoice.clientName ? escapeHtml(String(matchedInvoice.clientName)) : "";
  const amount = matchedInvoice.totalTtcCents != null
    ? formatAmount(Math.abs(Number(matchedInvoice.totalTtcCents)))
    : "";
  const pdfUrl = matchedInvoice.pdfUrl ? escapeHtml(String(matchedInvoice.pdfUrl)) : "";
  slot.innerHTML = `
    <div class="tx-docs-section-title">Facture associée</div>
    <div class="tx-docs-matched-card" ${pdfUrl ? `data-tx-matched-pdf="${pdfUrl}"` : ""}>
      <div class="tx-docs-matched-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6M9 17h6"/></svg>
      </div>
      <div class="tx-docs-matched-info">
        <div class="tx-docs-matched-ref">${ref}</div>
        <div class="tx-docs-matched-sub">${client}${client && amount ? " · " : ""}${amount}</div>
      </div>
      ${pdfUrl ? `<svg class="tx-docs-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>` : ""}
    </div>`;
}

function openTransactionDocsModal(tx) {
  _txDocsCurrent = tx;
  const modal = document.getElementById("tx-docs-modal");
  if (!modal) return;

  const summary = document.getElementById("tx-docs-summary");
  const isDebit = isDebitTx(tx);
  const sign = isDebit ? "−" : "+";
  const amountClass = isDebit ? "amount-negative" : "amount-positive";
  summary.innerHTML = `
    <div class="tx-docs-summary-merchant">${escapeHtml(tx.description || "Transaction")}</div>
    <div class="tx-docs-summary-row">
      <span class="tx-docs-summary-amount ${amountClass}">${sign}${formatAmount(Math.abs(tx.amount))}</span>
      ${tx.date ? `<span class="tx-docs-summary-date">${escapeHtml(formatDate(tx.date))}</span>` : ""}
    </div>`;

  _renderTxDocsWallet(tx);
  _renderTxDocsMatched(tx.matchedInvoice);
  _renderTxDocsMatchedItems(tx.matchedItems);
  _renderTxDocsList(tx.receipts);

  const addLabel = document.getElementById("tx-docs-add-label");
  const receipts = Array.isArray(tx.receipts) ? tx.receipts : [];
  if (addLabel) {
    addLabel.textContent = receipts.length > 0 ? "Ajouter un autre justificatif" : "Ajouter un justificatif";
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function _renderTxDocsList(receipts) {
  const list = document.getElementById("tx-docs-list");
  const countEl = document.getElementById("tx-docs-count");
  if (!list || !countEl) return;
  const arr = Array.isArray(receipts) ? receipts : [];

  countEl.innerHTML = arr.length === 0
    ? `<span class="tx-docs-section-title-text">Justificatifs</span>`
    : `<span class="tx-docs-section-title-text">Justificatifs</span><span class="tx-docs-count-badge">${arr.length}</span>`;

  if (arr.length === 0) {
    list.innerHTML = `<div class="tx-docs-empty">
      <div class="tx-docs-empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </div>
      <p class="tx-docs-empty-title">Aucun justificatif</p>
      <p class="tx-docs-empty-sub">Ajoutez une photo ou un PDF pour justifier cette transaction.</p>
    </div>`;
    return;
  }

  // The card displays *document* data, never transaction data.
  //  - Title: the merchant from OCR / classifier (e.g. "McDonald's") or
  //           a fallback type label ("Reçu" / "PDF").
  //  - Subtitle: the document's TTC amount as extracted by OCR (matched
  //              ticket's amountCents, or extracted.montant_ht * (1+tva)).
  // Each receipt may have an associated Ticket among matchedItems (created
  // by /api/tickets/mobile when the doc was attached). We pair them in
  // upload order — first receipt with first ticket, etc. — which is the
  // common case.
  list.innerHTML = arr.map((r, idx) => {
    const fileId = r.fileId ? String(r.fileId) : "";
    const isPdf = _txDocsIsPdf(r);
    const isImage = _txDocsIsImage(r);
    const fallbackKind = isPdf ? "PDF" : (isImage ? "Reçu" : "Document");

    // Single source of truth — keeps card display and wallet sum in sync.
    const docData = _getReceiptDocData(idx, _txDocsCurrent);
    const ticketItem = docData.ticket;
    const merchant = docData.merchant;
    const docAmountCents = docData.amountCents;

    // Title: the document's type label, optionally numbered when the user
    // has multiple receipts on the same transaction.
    const typeLabel = ticketItem
      ? (_MATCHED_TYPE_META[ticketItem.type]?.label || "Document")
      : fallbackKind;
    const title = arr.length > 1 ? `${typeLabel} ${idx + 1}` : typeLabel;

    // Subtitle: amount + merchant when known.
    const amountStr = docAmountCents != null ? formatAmount(docAmountCents) : "";
    const subtitle = [amountStr, merchant].filter(Boolean).join(" · ") || "À analyser";

    const ct = escapeHtml(r.contentType || "");
    const fname = escapeHtml(r.fileName || "");
    return `<div class="tx-docs-item" data-tx-doc-fileid="${escapeHtml(fileId)}">
      <button class="tx-docs-item-tap" type="button" data-tx-doc-action="view" data-tx-doc-id="${escapeHtml(fileId)}" data-tx-doc-name="${fname}" data-tx-doc-ct="${ct}" aria-label="Ouvrir ${escapeHtml(title)}">
        <div class="tx-docs-thumb" id="tx-docs-thumb-${idx}">
          ${_txDocsBadge(r)}
        </div>
        <div class="tx-docs-info">
          <div class="tx-docs-name">${escapeHtml(title)}</div>
          <div class="tx-docs-sub">${escapeHtml(subtitle)}</div>
        </div>
      </button>
      <div class="tx-docs-actions">
        <button class="tx-docs-action" type="button" data-tx-doc-action="view" data-tx-doc-id="${escapeHtml(fileId)}" data-tx-doc-name="${fname}" data-tx-doc-ct="${ct}" aria-label="Ouvrir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="tx-docs-action" type="button" data-tx-doc-action="share" data-tx-doc-id="${escapeHtml(fileId)}" data-tx-doc-name="${fname}" data-tx-doc-ct="${ct}" aria-label="Partager">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
        <button class="tx-docs-action tx-docs-action-danger" type="button" data-tx-doc-action="delete" data-tx-doc-id="${escapeHtml(fileId)}" aria-label="Supprimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join("");

  // Lazy-load thumbnails (authenticated blob fetch) for image types only. PDFs
  // and other docs keep their colored badge so the card is always meaningful.
  arr.forEach((r, idx) => {
    const fileId = r.fileId ? String(r.fileId) : "";
    if (!fileId || !_txDocsIsImage(r)) return;
    const thumbEl = document.getElementById(`tx-docs-thumb-${idx}`);
    if (!thumbEl) return;
    const cachedUrl = _getCachedBlobUrl(`id:${fileId}`);
    if (cachedUrl) {
      thumbEl.innerHTML = `<img src="${cachedUrl}" alt="" />`;
      return;
    }
    fetchAuthenticatedImage(`/api/receipts/${fileId}`).then(url => {
      if (url) {
        _txDocsThumbCache.set(`id:${fileId}`, { url, type: r.contentType || "image/jpeg" });
        const el = document.getElementById(`tx-docs-thumb-${idx}`);
        if (el) el.innerHTML = `<img src="${url}" alt="" />`;
      }
    }).catch(() => {});
  });
}

function _getCachedBlobUrl(key) {
  const v = _txDocsThumbCache.get(key);
  if (!v) return null;
  return typeof v === "string" ? v : v.url || null;
}

async function shareTransactionDoc(fileId, label) {
  if (!fileId) return;
  let url = _getCachedBlobUrl(`id:${fileId}`);
  if (!url) {
    url = await fetchAuthenticatedImage(`/api/receipts/${fileId}`);
    if (url) _txDocsThumbCache.set(`id:${fileId}`, { url, type: "" });
  }
  if (!url) { showToast("Impossible de partager"); return; }
  try {
    await Share.share({
      title: label || "Justificatif",
      url,
      dialogTitle: "Partager le justificatif",
    });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg && !/cancel/i.test(msg)) showToast("Partage indisponible");
  }
}

async function deleteTransactionReceipt(fileId) {
  if (!fileId || !_txDocsCurrent) return;
  if (!confirm("Supprimer ce justificatif ?")) return;
  try {
    const res = await apiFetch(`/api/receipts/${fileId}`, { method: "DELETE" });
    if (!res.ok) {
      showToast(res.data?.error || "Suppression impossible");
      return;
    }
    // Drop from local state and re-render the list in place.
    const next = (Array.isArray(_txDocsCurrent.receipts) ? _txDocsCurrent.receipts : [])
      .filter(r => String(r.fileId) !== String(fileId));
    _txDocsCurrent.receipts = next;
    _txDocsThumbCache.delete(fileId);
    // Drop the local OCR cache entry so we don't keep stale data around.
    try {
      const cache = _loadLocalReceiptOcrCache();
      if (cache[String(fileId)]) {
        delete cache[String(fileId)];
        _persistLocalReceiptOcrCache();
      }
    } catch (_) {}
    _renderTxDocsList(next);
    _renderTxDocsWallet(_txDocsCurrent);
    const addLabel = document.getElementById("tx-docs-add-label");
    if (addLabel) {
      addLabel.textContent = next.length > 0 ? "Ajouter un autre justificatif" : "Ajouter un justificatif";
    }
    showToast("Justificatif supprimé");
    // Refresh the underlying transactions list so the row pill flips back.
    loadBankTransactions();
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

window.shareTransactionDoc = shareTransactionDoc;
window.deleteTransactionReceipt = deleteTransactionReceipt;

/**
 * Pro confirmation overlay used when the OCR-detected document amount
 * doesn't match the transaction amount. Returns a Promise<boolean> that
 * resolves to true when the user confirms ("Rapprocher quand même"), false
 * on cancel/back/backdrop.
 */
function showAmountMismatchModal({ docType, supplier, docAmountCents, txAmountCents }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("tx-mismatch-modal");
    const cancelBtn = document.getElementById("tx-mismatch-cancel");
    const confirmBtn = document.getElementById("tx-mismatch-confirm");
    const docEl = document.getElementById("tx-mismatch-doc-amount");
    const txEl = document.getElementById("tx-mismatch-tx-amount");
    const diffEl = document.getElementById("tx-mismatch-diff");
    const metaEl = document.getElementById("tx-mismatch-meta");
    if (!modal || !cancelBtn || !confirmBtn || !docEl || !txEl || !diffEl) {
      // Fallback if the modal HTML isn't present.
      resolve(true);
      return;
    }

    // Populate values.
    docEl.textContent = docAmountCents != null ? formatAmount(Math.abs(docAmountCents)) : "—";
    txEl.textContent = txAmountCents != null ? formatAmount(Math.abs(txAmountCents)) : "—";

    const metaParts = [];
    if (docType) metaParts.push(`<span class="tx-mismatch-pill">${escapeHtml(docType)}</span>`);
    if (supplier) metaParts.push(`<span class="tx-mismatch-supplier">${escapeHtml(supplier)}</span>`);
    metaEl.innerHTML = metaParts.join("");
    metaEl.style.display = metaParts.length ? "flex" : "none";

    if (docAmountCents != null && txAmountCents != null) {
      const diff = Math.abs(docAmountCents - txAmountCents);
      diffEl.textContent = `Écart : ${formatAmount(diff)}`;
      diffEl.style.display = "block";
    } else {
      diffEl.style.display = "none";
    }

    // Show modal.
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      cleanup();
      modal.style.display = "none";
      document.body.style.overflow = "";
      resolve(v);
    };
    const onCancel = () => settle(false);
    const onConfirm = () => settle(true);
    const onBackdrop = (e) => { if (e.target === modal) settle(false); };

    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    modal.addEventListener("click", onBackdrop);

    function cleanup() {
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdrop);
    }
  });
}
window.showAmountMismatchModal = showAmountMismatchModal;

function closeTransactionDocsModal() {
  const modal = document.getElementById("tx-docs-modal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
}

async function viewTransactionDoc(fileId, fileName, contentType) {
  if (!fileId) return;
  // Locate this receipt's position so we can pair it with its own matched
  // Ticket — the viewer panel must show this doc's OCR, not the tx's.
  let receiptIdx = -1;
  if (_txDocsCurrent?.receipts) {
    receiptIdx = _txDocsCurrent.receipts.findIndex(x => String(x.fileId) === String(fileId));
    if (receiptIdx >= 0) {
      const r = _txDocsCurrent.receipts[receiptIdx];
      if (!contentType) contentType = r.contentType || "";
      if (!fileName) fileName = r.fileName || "";
    }
  }

  // Pull the per-doc OCR from THIS receipt only — never from the
  // transaction's own data. Priority: the receipt's persisted `extracted`
  // (1st-class source), falling back to the matched Ticket fields.
  const docData = receiptIdx >= 0 ? _getReceiptDocData(receiptIdx, _txDocsCurrent) : null;
  const matched = docData?.ticket || null;
  // Use the receipt's stored OCR directly when present; otherwise
  // synthesize a minimal extracted from the matched ticket.
  const ticketExtracted = docData?.extracted
    ? docData.extracted
    : (matched
      ? {
          beneficiaire: matched.counterpartyName || "",
          montant_ttc: matched.amountCents != null ? matched.amountCents / 100 : null,
          montant_ht: matched.htCents != null ? matched.htCents / 100 : null,
          taux_tva: matched.tvaRate ?? null,
          devise: matched.currency || "",
          date_paiement: matched.date || "",
        }
      : null);

  await openJustificatifViewer({
    fileId,
    fileName: fileName || "",
    contentType: contentType || "",
    kind: "receipt",
    matched,
    extracted: ticketExtracted,
  });
}

/* --------------------------------------------------------------------------
 * Unified justificatif viewer overlay.
 * Renders the document in-app: <img> for images, <iframe blob:> for PDFs.
 * Provides Open-externally and Share fallbacks for any type.
 * -------------------------------------------------------------------------- */
let _justifViewerState = { blobUrl: null, fileName: "", contentType: "" };

function _disposeJustifViewer() {
  // NOTE: do NOT revoke the blob URL here — it is shared with the thumbnail
  // cache (`_txDocsThumbCache`) so future opens can reuse it instantly. If we
  // revoked it, reopening the same document would render a broken image.
  // The URL is freed when the page reloads.
  _justifViewerState = { blobUrl: null, fileName: "", contentType: "" };
}

const _JUSTIF_KIND_LABELS = {
  receipt: { label: "Justificatif", tone: "indigo" },
  ticket: { label: "Reçu", tone: "amber" },
  client_invoice: { label: "Facture client", tone: "blue" },
  supplier_invoice: { label: "Facture fournisseur", tone: "violet" },
  payslip: { label: "Bulletin de paie", tone: "emerald" },
  expense: { label: "Note de frais", tone: "slate" },
  bon_commande: { label: "Bon de commande", tone: "indigo" },
  matched: { label: "Document rapproché", tone: "indigo" },
};

function _renderViewerInfoPanel({ kind, fileName, matched, extracted }) {
  const meta = _JUSTIF_KIND_LABELS[kind] || _JUSTIF_KIND_LABELS.matched;
  const lines = [];

  // ONLY data extracted from the document itself — never transaction fields
  // (tx.description, tx.amountCents). For matched items the "document data"
  // comes from the matched record (ticket/invoice/...), for uploaded
  // receipts it comes from the OCR `extracted` payload.

  // Émetteur — from OCR / classifier / counterparty on the document
  const merchant =
    matched?.counterpartyName ||
    extracted?.classifier?.merchant_name ||
    extracted?.beneficiaire ||
    "";
  if (merchant) lines.push({ label: "Émetteur", value: merchant });

  if (matched?.ref) lines.push({ label: "Référence", value: matched.ref });
  if (extracted?.identifiant) lines.push({ label: "ICE / Identifiant", value: extracted.identifiant });
  if (extracted?.adresse) lines.push({ label: "Adresse", value: extracted.adresse });

  // Date — prefer the doc's payment date over the matched-item date.
  const dateValue = extracted?.date_paiement || matched?.date || "";
  if (dateValue) {
    // date_paiement comes as "26/01/2023" (already French) or ISO; pass to
    // formatDate which handles ISO, otherwise show the literal string.
    let displayed = dateValue;
    try {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime()) && /\d{4}-\d{2}-\d{2}/.test(String(dateValue))) {
        displayed = formatDate(dateValue);
      }
    } catch (_) {}
    lines.push({ label: "Date", value: displayed });
  }

  // Amounts read from the document, NOT from the transaction.
  // The classify API ships `montant_ttc` / `montant_ht` as currency-unit
  // floats (e.g. 4 = 4.00 EUR), and `taux_tva` as an ARRAY of
  //   { taux: "5.50%", montant_tva: 0.13, montant_ttc: 2.4 }
  // entries — one per VAT bracket. The matched-item summary (when present)
  // ships them as cents and a single rate. We accept both.
  const ttc = matched?.amountCents != null
    ? Math.abs(matched.amountCents)
    : (extracted?.montant_ttc != null ? Math.round(Number(extracted.montant_ttc) * 100) : null);
  const ht = matched?.htCents != null
    ? Math.abs(matched.htCents)
    : (extracted?.montant_ht != null ? Math.round(Number(extracted.montant_ht) * 100) : null);

  // Sum VAT amount across all brackets when we have an array.
  let tva = matched?.tvaCents != null ? Math.abs(matched.tvaCents) : null;
  if (tva == null && Array.isArray(extracted?.taux_tva)) {
    let s = 0;
    let any = false;
    for (const r of extracted.taux_tva) {
      if (r && r.montant_tva != null) {
        s += Number(r.montant_tva) || 0;
        any = true;
      }
    }
    if (any) tva = Math.round(s * 100);
  }

  // VAT rate: pretty-print the array ("5.50% / 10.00%") or a single number.
  let tvaRateDisplay = null;
  if (matched?.tvaRate != null) {
    tvaRateDisplay = `${matched.tvaRate}%`;
  } else if (Array.isArray(extracted?.taux_tva)) {
    const rates = extracted.taux_tva
      .map(r => {
        if (!r) return null;
        if (typeof r.taux === "string") return r.taux.trim();
        if (typeof r.taux === "number") return `${r.taux}%`;
        return null;
      })
      .filter(Boolean);
    if (rates.length) tvaRateDisplay = rates.join(" / ");
  } else if (extracted?.taux_tva != null) {
    tvaRateDisplay = `${extracted.taux_tva}%`;
  }

  if (ht != null) lines.push({ label: "Montant HT", value: formatAmount(ht) });
  if (tvaRateDisplay) lines.push({ label: "Taux TVA", value: tvaRateDisplay });
  if (tva != null) lines.push({ label: "Montant TVA", value: formatAmount(tva) });
  if (ttc != null) lines.push({ label: "Montant TTC", value: formatAmount(ttc), strong: true });

  if (matched?.status) lines.push({ label: "Statut", value: matched.status });

  const rowsHtml = lines.length === 0
    ? `<div class="justif-info-empty">Aucune donnée extraite pour ce document.</div>`
    : lines.map(l => `<div class="justif-info-row${l.strong ? " justif-info-row-strong" : ""}">
        <span class="justif-info-label">${escapeHtml(l.label)}</span>
        <span class="justif-info-value">${escapeHtml(String(l.value))}</span>
      </div>`).join("");

  return `<aside class="justif-info-panel">
    <header class="justif-info-header">
      <span class="justif-info-chip justif-info-chip-${meta.tone}">${escapeHtml(meta.label)}</span>
      ${fileName ? `<div class="justif-info-fname">${escapeHtml(fileName)}</div>` : ""}
    </header>
    <div class="justif-info-rows">${rowsHtml}</div>
  </aside>`;
}

// Cache enriched OCR fetched from /api/tickets/:id etc. so reopening the same
// matched document is instant and we don't hit the API repeatedly.
const _matchedDocOcrCache = new Map();

async function _fetchMatchedDocOcr(matchedType, matchedId) {
  if (!matchedId) return null;
  const cacheKey = `${matchedType}:${matchedId}`;
  if (_matchedDocOcrCache.has(cacheKey)) return _matchedDocOcrCache.get(cacheKey);

  let path = null;
  if (matchedType === "ticket") path = `/api/tickets/${matchedId}`;
  // Other matched types (client_invoice, supplier_invoice, payslip…) don't
  // expose a rich OCR detail endpoint shaped like ApiExtracted yet — we keep
  // the matched-item summary as-is for those.
  if (!path) { _matchedDocOcrCache.set(cacheKey, null); return null; }

  try {
    const res = await apiFetch(path);
    if (!res.ok) { _matchedDocOcrCache.set(cacheKey, null); return null; }
    const t = res.data?.ticket;
    if (!t) { _matchedDocOcrCache.set(cacheKey, null); return null; }
    // Prefer the raw extracted payload (which preserves the per-bracket
    // taux_tva array and the original date_paiement) over the flat fields
    // on the Ticket document. Convert cents → currency units to keep the
    // shape compatible with what /api/documents/classify returns.
    const raw = t.extracted || {};
    const enriched = {
      beneficiaire: t.beneficiaire || raw.beneficiaire || "",
      identifiant: t.identifiant || raw.identifiant || "",
      adresse: t.adresse || raw.adresse || "",
      taux_tva: raw.taux_tva ?? t.tauxTva ?? null,
      montant_ht: raw.montant_ht
        ?? (t.amountHtCents != null ? t.amountHtCents / 100 : null),
      montant_ttc: raw.montant_ttc
        ?? (t.amountCents != null ? t.amountCents / 100 : null),
      date_paiement: raw.date_paiement || t.paymentDate || "",
      devise: t.currency || raw.devise || "",
      classifier: raw.classifier || null,
    };
    _matchedDocOcrCache.set(cacheKey, enriched);
    return enriched;
  } catch (_) {
    _matchedDocOcrCache.set(cacheKey, null);
    return null;
  }
}

async function openJustificatifViewer({ fileId, fileName, contentType, path, kind, matched, extracted, txAmountCents, txDescription, localBlobUrl, statusMessage }) {
  const overlay = document.getElementById("justif-viewer");
  const body = document.getElementById("justif-viewer-body");
  const title = document.getElementById("justif-viewer-title");
  if (!overlay || !body) return;

  // Resolve the API path: explicit `path` wins (matched docs), otherwise build
  // the standard receipts endpoint from the fileId. When the caller already
  // has the file as a local blob (just-captured upload), it can pass
  // `localBlobUrl` to skip the network fetch entirely.
  const apiPath = path || (fileId ? `/api/receipts/${fileId}` : "");
  if (!apiPath && !localBlobUrl) return;

  _disposeJustifViewer();
  if (title) title.textContent = fileName || "Justificatif";

  body.innerHTML = `
    <div class="justif-viewer-loading">
      <div class="justif-viewer-spinner"></div>
      <p>Chargement du document...</p>
    </div>`;
  overlay.style.display = "flex";
  document.body.classList.add("lightbox-open");

  // Initial guess from caller-provided hints. The actual content type is read
  // from the response after fetching — many endpoints (e.g. /api/tickets/:id
  // /document) return JPEG/PNG even though the matched-item card was treated
  // as a PDF. We must trust the response, not the hint.
  const cacheKey = path ? `path:${path}` : `id:${fileId}`;
  let blobUrl = null;
  let resolvedCt = contentType || "";
  // 1) Caller provided a local blob (e.g. from a just-captured upload) —
  //    use it directly, no network fetch needed.
  if (localBlobUrl) {
    blobUrl = localBlobUrl;
    resolvedCt = contentType || "";
    if (cacheKey) _txDocsThumbCache.set(cacheKey, { url: blobUrl, type: resolvedCt });
  } else {
    const cached = _txDocsThumbCache.get(cacheKey);
    if (cached) {
      if (typeof cached === "string") {
        blobUrl = cached;
      } else {
        blobUrl = cached.url || null;
        if (cached.type) resolvedCt = cached.type;
      }
    }
  }
  if (!blobUrl) {
    try {
      const r = await fetch(`${API_BASE_URL}${apiPath}`, {
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const headerCt = r.headers.get("content-type") || "";
      const blob = await r.blob();
      // Trust order: server header > caller hint > blob.type. blob.type is
      // often empty on Android WebView fetch.
      resolvedCt = headerCt || resolvedCt || blob.type || "";
      const typed = (blob.type || !resolvedCt) ? blob : new Blob([blob], { type: resolvedCt });
      blobUrl = URL.createObjectURL(typed);
    } catch (e) {
      body.innerHTML = `
        <div class="justif-viewer-error">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p class="justif-viewer-error-title">Document introuvable</p>
          <p class="justif-viewer-error-sub">Vérifiez votre connexion ou réessayez plus tard.</p>
        </div>`;
      return;
    }
    _txDocsThumbCache.set(cacheKey, { url: blobUrl, type: resolvedCt });
  }

  _justifViewerState = { blobUrl, fileName: fileName || "justificatif", contentType: resolvedCt };

  // Decide rendering from the resolved content-type (with filename as a
  // last-resort fallback). PDFs go to <iframe>; everything that looks like
  // an image goes to the lightbox <img>.
  const isPdf = /pdf/i.test(resolvedCt) || /\.pdf$/i.test(fileName || "");
  const isImage = /^image\//i.test(resolvedCt)
    || /\.(jpe?g|png|gif|webp|bmp|tiff)$/i.test(fileName || "");

  // Kick off a parallel OCR fetch so we can swap in the rich extracted
  // fields (ICE, adresse, beneficiaire, ...) once they arrive. We use the
  // matched Ticket the caller paired with this doc — never a "first
  // matched ticket on the tx", which would copy data across cards.
  let ocrPromise = null;
  const matchedId = matched?.id ? String(matched.id) : "";
  if (matchedId && !matchedId.startsWith("local-")) {
    ocrPromise = _fetchMatchedDocOcr("ticket", matchedId);
  }

  const infoPanelHtml = _renderViewerInfoPanel({
    kind: kind || "receipt",
    fileName,
    matched,
    extracted,
  });

  // Optional inline status banner (e.g. "Rapprochement en cours...") shown
  // when the viewer is opened during a still-pending background commit.
  const initialBannerHtml = statusMessage
    ? `<div id="justif-viewer-status" class="justif-viewer-status justif-viewer-status-loading">
         <span class="justif-viewer-status-spinner"></span>
         <span class="justif-viewer-status-text">${escapeHtml(statusMessage)}</span>
       </div>`
    : `<div id="justif-viewer-status" class="justif-viewer-status" style="display:none"></div>`;

  if (isImage) {
    body.innerHTML = `
      <div class="justif-viewer-stack">
        ${initialBannerHtml}
        <div class="justif-viewer-img-wrap"><img class="justif-viewer-img" alt="${escapeHtml(fileName || "Justificatif")}" src="${blobUrl}" /></div>
        ${infoPanelHtml}
      </div>`;
  } else if (isPdf) {
    // Android System WebView renders PDFs inside iframes via the built-in
    // viewer in modern versions. We provide an explicit "open externally"
    // fallback in the header for older WebViews where the iframe stays blank.
    body.innerHTML = `
      <div class="justif-viewer-stack">
        ${initialBannerHtml}
        <iframe class="justif-viewer-iframe" src="${blobUrl}#toolbar=0" title="${escapeHtml(fileName || "PDF")}"></iframe>
        ${infoPanelHtml}
        <div class="justif-viewer-pdf-fallback">
          <p>Si la prévisualisation reste vide, ouvrez le document avec votre lecteur PDF.</p>
          <button class="btn-primary" id="justif-viewer-open-fallback" type="button">Ouvrir avec le lecteur système</button>
        </div>
      </div>`;
    document.getElementById("justif-viewer-open-fallback")?.addEventListener("click", () => {
      _openJustifExternally();
    });
  } else {
    body.innerHTML = `
      <div class="justif-viewer-stack">
        ${initialBannerHtml}
        <div class="justif-viewer-generic">
          <div class="justif-viewer-generic-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          </div>
          <p class="justif-viewer-generic-name">${escapeHtml(fileName || "Document")}</p>
          <p class="justif-viewer-generic-sub">Aperçu non disponible pour ce type de fichier.</p>
          <button class="btn-primary" id="justif-viewer-open-fallback" type="button">Ouvrir avec le lecteur système</button>
        </div>
        ${infoPanelHtml}
      </div>`;
    document.getElementById("justif-viewer-open-fallback")?.addEventListener("click", () => {
      _openJustifExternally();
    });
  }

  // After the initial render, if we have a ticket OCR fetch in flight, await
  // it and swap the info panel for the enriched version. We keep the same DOM
  // surrounding (image / iframe) so the preview doesn't flicker.
  if (ocrPromise) {
    ocrPromise.then(enriched => {
      if (!enriched) return;
      // Merge: enriched values overwrite null/empty in the previous extracted.
      const merged = { ...(extracted || {}) };
      for (const k of Object.keys(enriched)) {
        const v = enriched[k];
        if (v == null || v === "") continue;
        const cur = merged[k];
        if (cur == null || cur === "") merged[k] = v;
      }
      const panel = document.querySelector("#justif-viewer-body .justif-info-panel");
      if (!panel) return;
      panel.outerHTML = _renderViewerInfoPanel({
        kind: kind || "receipt",
        fileName,
        matched,
        extracted: merged,
      });
    }).catch(() => {});
  }
}

async function _openJustifExternally() {
  if (!_justifViewerState.blobUrl) return;
  // Persist the blob to cache then hand it to the system app picker.
  try {
    const fileName = _justifViewerState.fileName || `justificatif_${Date.now()}`;
    const r = await fetch(_justifViewerState.blobUrl);
    const blob = await r.blob();
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const v = String(fr.result || "");
        const i = v.indexOf(",");
        resolve(i >= 0 ? v.slice(i + 1) : v);
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    const uriResult = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: fileName, url: uriResult.uri, dialogTitle: "Ouvrir avec" });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg && !/cancel/i.test(msg)) showToast("Erreur d'ouverture");
  }
}

async function _shareJustifFromViewer() {
  if (!_justifViewerState.blobUrl) return;
  try {
    await Share.share({
      title: _justifViewerState.fileName || "Justificatif",
      url: _justifViewerState.blobUrl,
      dialogTitle: "Partager le justificatif",
    });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg && !/cancel/i.test(msg)) {
      // Fallback: write to filesystem first then share via system picker.
      _openJustifExternally();
    }
  }
}

function closeJustificatifViewer() {
  const overlay = document.getElementById("justif-viewer");
  if (overlay) overlay.style.display = "none";
  document.body.classList.remove("lightbox-open");
  _disposeJustifViewer();
}

window.openJustificatifViewer = openJustificatifViewer;
window.closeJustificatifViewer = closeJustificatifViewer;

/**
 * Update or hide the inline status banner inside the viewer overlay.
 * kind: "loading" | "success" | "error" — controls colour + icon.
 * Pass an empty/null message to hide the banner.
 */
function setJustifViewerStatus(message, kind = "loading", { autoHideMs } = {}) {
  const el = document.getElementById("justif-viewer-status");
  if (!el) return;
  if (!message) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.className = `justif-viewer-status justif-viewer-status-${kind}`;
  const iconHtml = kind === "loading"
    ? `<span class="justif-viewer-status-spinner"></span>`
    : kind === "success"
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  el.innerHTML = `${iconHtml}<span class="justif-viewer-status-text">${escapeHtml(message)}</span>`;
  el.style.display = "flex";
  if (autoHideMs && autoHideMs > 0) {
    setTimeout(() => {
      const cur = document.getElementById("justif-viewer-status");
      if (cur && cur.classList.contains(`justif-viewer-status-${kind}`)) {
        cur.style.display = "none";
        cur.innerHTML = "";
      }
    }, autoHideMs);
  }
}
window.setJustifViewerStatus = setJustifViewerStatus;

async function attachAnotherDocFromModal() {
  if (!_txDocsCurrent) return;
  const tx = _txDocsCurrent;
  // Hide the docs-modal during the scan flow so the scan-modal is fully
  // visible. We DO NOT reset its state — _txDocsCurrent stays around so
  // the post-upload code can re-render the cards in place and re-show the
  // modal with the freshly attached doc.
  const docsModalEl = document.getElementById("tx-docs-modal");
  if (docsModalEl) docsModalEl.style.display = "none";
  await attachDocToTransaction(tx.id, tx.amount, tx.description, "");
}

window.openTransactionDocsModal = openTransactionDocsModal;
window.closeTransactionDocsModal = closeTransactionDocsModal;

/**
 * Manual bank reconciliation flow.
 *
 * - If the transaction already has a justificatif, tap → view it in the lightbox.
 * - Otherwise: confirm intent → ML Kit scan → live processing modal during
 *   classification → ALWAYS confirm with the detected summary before attaching →
 *   POST to /api/transactions/:id/receipts.
 */
async function attachDocToTransaction(transactionId, transactionAmountCents, transactionDescription, existingReceiptId) {
  if (!transactionId) return;

  // If a receipt is already attached, show it instead of starting attach flow.
  if (existingReceiptId) {
    const url = await fetchAuthenticatedImage(`/api/receipts/${existingReceiptId}`);
    if (url) {
      _disposeTicketImage();
      _ticketImageObjectUrl = url;
      openTicketLightbox(url);
      return;
    }
    // If we couldn't fetch (deleted file etc.), fall through to attach a new one.
  }

  if (!confirm(`Voulez-vous attacher un justificatif à la transaction ?\n\n${transactionDescription || ""}`)) return;

  // Step 1: capture via ML Kit Document Scanner (back camera + auto-crop)
  let captured = null;
  try {
    if (Capacitor.getPlatform() === "android") {
      const scan = await DocumentScanner.scan({ pageLimit: 1, galleryImport: false });
      if (scan?.base64) captured = { base64: scan.base64, format: scan.format || "jpeg" };
    }
  } catch (scanErr) {
    const msg = String(scanErr?.message || scanErr || "");
    if (/cancel/i.test(msg)) return;
  }
  if (!captured) {
    try {
      const photo = await Camera.getPhoto({
        quality: 88,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        width: 1800,
        correctOrientation: true,
      });
      if (!photo?.base64String) return;
      captured = { base64: photo.base64String, format: photo.format || "jpeg" };
    } catch (_) { return; }
  }

  // Step 2: open the processing window (reuse the scan modal so the user sees
  // the captured preview + spinner instead of a vanishing toast).
  state.capturedImage = captured;
  openScanModal();
  const previewImg = document.getElementById("capture-preview");
  if (previewImg) previewImg.src = `data:image/${captured.format};base64,${captured.base64}`;
  document.getElementById("scan-step-preview").style.display = "block";
  document.getElementById("analyzing-overlay").style.display = "flex";
  document.getElementById("ticket-result").style.display = "none";
  document.getElementById("scan-error").style.display = "none";

  // Build the blob
  const fileName = `tx_${Date.now()}.${captured.format}`;
  const contentType = captured.format === "png" ? "image/png" : "image/jpeg";
  const byteChars = atob(captured.base64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: contentType });

  // Step 3: classify the captured doc first (no commit) so we can read the
  // OCR amount and confirm with the user when it differs from the
  // transaction amount. The actual commit happens in step 5.
  // The scan-modal stays open with the captured preview + analyzing
  // spinner the entire time so the user has visual feedback.
  // We KEEP the extraction payload around so step 5 can hand it to
  // /api/tickets/mobile and skip the redundant server-side OCR (saves a
  // ~15s round trip).
  let detectedAmountCents = null;
  let detectedSupplier = "";
  let detectedDocType = "";
  let prefilledExtraction = null;
  try {
    // Multipart upload — the production /api/documents/classify only
    // accepts multipart/form-data right now (the JSON+base64 alternate
    // path exists in the repo but isn't deployed yet). We use plain
    // fetch+FormData here; Capacitor's interception sometimes flakes on
    // MIUI but works fine on Samsung / stock Android, which is where
    // attach is currently failing for the user.
    const classifyForm = new FormData();
    classifyForm.append("organizationId", state.orgId);
    classifyForm.append("file", blob, fileName);
    const cRes = await fetch(`${API_BASE_URL}/api/documents/classify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      body: classifyForm,
    });
    console.log("[CLASSIFY] status:", cRes.status);
    if (cRes.ok) {
      const cData = await cRes.json().catch(() => ({}));
      const ex = Array.isArray(cData?.extraction) ? cData.extraction[0] : cData?.extraction;
      if (ex) {
        prefilledExtraction = ex;
        if (ex.montant_ttc != null) {
          detectedAmountCents = Math.round(Number(ex.montant_ttc) * 100);
        }
        detectedSupplier = ex.beneficiaire || ex.emetteur || "";
        detectedDocType = cData?.classification?.label || "";
      }
    } else {
      const errText = await cRes.text().catch(() => "");
      console.warn("[CLASSIFY] failed:", cRes.status, errText.slice(0, 200));
    }
  } catch (e) {
    console.error("[CLASSIFY] network error:", e?.message || e);
    // Classify is best-effort; if it fails we continue without the amount
    // check rather than block the user.
  }

  // Step 4: amount-mismatch confirmation. We only block the user when the
  // OCR'd TTC differs noticeably (>1 MAD) from the transaction amount.
  // When OCR didn't return an amount we let the user through silently —
  // there's nothing to compare. Hide the spinner during the prompt so the
  // OS dialog isn't covered, then re-show it for the commit.
  // Helper used on every exit path (abort, error, success) to make sure the
  // docs-modal is back in front of the user — never strand them on a blank
  // screen with body locked.
  const _restoreDocsModalOnAbort = () => {
    const docsModalEl = document.getElementById("tx-docs-modal");
    if (docsModalEl && _txDocsCurrent) {
      docsModalEl.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  };

  if (detectedAmountCents != null && transactionAmountCents > 0) {
    const diffCents = Math.abs(detectedAmountCents - transactionAmountCents);
    if (diffCents > 100) {
      document.getElementById("analyzing-overlay").style.display = "none";
      const ok = await showAmountMismatchModal({
        docType: detectedDocType || "Document",
        supplier: detectedSupplier || "",
        docAmountCents: detectedAmountCents,
        txAmountCents: transactionAmountCents,
      });
      if (!ok) {
        closeScanModal();
        _restoreDocsModalOnAbort();
        return;
      }
      // User accepted the rapprochement — don't show the OCR spinner again.
      // We close the scan-modal right away and run the commit in the
      // background; the docs-modal stays visible underneath with a subtle
      // toast, and the viewer will open as soon as the API returns.
    }
  }

  // Step 5: open the viewer immediately — no flash, no toast queue, no
  // "OCR working again" feel. We have the captured image as a local blob
  // and the OCR data from /api/documents/classify, so the user sees the
  // full receipt + extracted fields right now. The actual server commit
  // runs in the background; a subtle status banner keeps them informed.
  closeScanModal();

  // Build the OCR payload for the viewer panel from the classify result.
  // Preserve `taux_tva` as-is — it's an array of brackets which the panel
  // renders specially.
  const classifiedExtracted = prefilledExtraction
    ? {
        beneficiaire: prefilledExtraction.beneficiaire || prefilledExtraction.emetteur || "",
        identifiant: prefilledExtraction.identifiant || prefilledExtraction.ice || "",
        adresse: prefilledExtraction.adresse || "",
        taux_tva: prefilledExtraction.taux_tva ?? null,
        montant_ht: prefilledExtraction.montant_ht ?? null,
        montant_ttc: prefilledExtraction.montant_ttc ?? null,
        date_paiement: prefilledExtraction.date_paiement || "",
        devise: prefilledExtraction.devise || "",
        classifier: detectedDocType ? { categorie: detectedDocType, merchant_name: detectedSupplier } : null,
      }
    : null;

  // Restore the docs-modal *behind* the viewer so when the user closes the
  // viewer they land on the modal (which we'll have updated with the new
  // card by then).
  const docsModalEl = document.getElementById("tx-docs-modal");
  if (docsModalEl) {
    docsModalEl.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  // Local blob URL → instant preview, no fetch round trip.
  let localBlobUrl = null;
  try { localBlobUrl = URL.createObjectURL(blob); } catch (_) {}

  await openJustificatifViewer({
    fileName,
    contentType,
    kind: "receipt",
    extracted: classifiedExtracted,
    localBlobUrl,
    statusMessage: "Rapprochement en cours...",
  });

  // Step 6: commit the receipt via multipart upload. The production
  // /api/transactions/{id}/receipts endpoint only accepts multipart;
  // see classify call above for context. We send `extracted` as a
  // JSON-stringified field so the OCR payload still rides along and
  // is persisted on the receipt subdocument server-side (once that
  // change is deployed). The viewer is already showing the image +
  // OCR; only the inline status banner reflects progress.
  let aData = null;
  let commitOk = false;
  let aStatus = 0;
  try {
    const attachForm = new FormData();
    attachForm.append("organizationId", state.orgId);
    attachForm.append("file", blob, fileName);
    if (prefilledExtraction) {
      attachForm.append("extracted", JSON.stringify(prefilledExtraction));
    }
    const aRes = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}/receipts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      body: attachForm,
    });
    aStatus = aRes.status;
    aData = await aRes.json().catch(() => ({}));
    console.log("[ATTACH] status:", aStatus);
    if (aStatus >= 200 && aStatus < 300) {
      commitOk = true;
    } else if (aStatus === 409) {
      setJustifViewerStatus(aData?.error || "Document déjà attaché", "error", { autoHideMs: 4500 });
    } else {
      console.warn("[ATTACH] failed:", aStatus, aData);
      setJustifViewerStatus(aData?.error || `Erreur ${aStatus} lors de l'attachement`, "error", { autoHideMs: 5000 });
    }
  } catch (e) {
    console.error("[ATTACH] network error:", e?.message || e);
    setJustifViewerStatus(`Erreur réseau: ${e?.message || "connexion"}`, "error", { autoHideMs: 5000 });
  }

  if (!commitOk) {
    // Viewer stays open with the local image so the user can decide what
    // to do next (close, retry from the modal, etc.).
    return;
  }

  // Best-effort secondary call so the doc also lands on Sorties → Reçus.
  try {
    fetch(`${API_BASE_URL}/api/tickets/mobile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        organizationId: state.orgId,
        fileName,
        format: captured.format,
        base64: captured.base64,
        transactionId,
        prefilledExtraction,
      }),
    }).catch(err => console.warn("[ATTACH] secondary Ticket create failed:", err));
  } catch (_) {}

  // /api/transactions/:id/receipts returns { ok:true, receipt:{ fileId, fileName, contentType, size } }.
  // Re-cache the local blob URL under the real fileId so future opens of
  // this receipt skip the network fetch entirely.
  const newReceipt = aData?.receipt;
  if (newReceipt?.fileId && localBlobUrl) {
    _txDocsThumbCache.set(`id:${newReceipt.fileId}`, {
      url: localBlobUrl,
      type: newReceipt.contentType || contentType,
    });
  }
  // Persist the OCR locally keyed by the server's receipt fileId. This
  // survives navigation / app restart, so even if the webapp hasn't been
  // redeployed (and the server doesn't return `extracted` in the GET) the
  // phone still recovers the OCR on next open.
  if (newReceipt?.fileId && prefilledExtraction) {
    _setLocalReceiptOcr(newReceipt.fileId, prefilledExtraction);
  }

  // Keep the docs-modal state aligned so the new card is visible when the
  // user closes the viewer. The per-doc OCR is stored ON the receipt
  // itself — same shape we just persisted server-side — so the card
  // renderer reads it via _getReceiptDocData and shows the doc's own
  // merchant + amount.
  if (newReceipt?.fileId && _txDocsCurrent) {
    _txDocsCurrent.receipts = [...(_txDocsCurrent.receipts || []), {
      fileId: newReceipt.fileId,
      fileName: newReceipt.fileName || fileName,
      contentType: newReceipt.contentType || contentType,
      extracted: prefilledExtraction || null,
    }];
    _renderTxDocsList(_txDocsCurrent.receipts);
    _renderTxDocsWallet(_txDocsCurrent);
    const countEl = document.getElementById("tx-docs-count");
    const n = _txDocsCurrent.receipts.length;
    if (countEl) {
      countEl.innerHTML = `<span class="tx-docs-section-title-text">Justificatifs</span><span class="tx-docs-count-badge">${n}</span>`;
    }
    const addLabel = document.getElementById("tx-docs-add-label");
    if (addLabel) addLabel.textContent = n > 0 ? "Ajouter un autre justificatif" : "Ajouter un justificatif";
  }

  // Flip the inline banner from "loading" to "success" and let it fade.
  setJustifViewerStatus("Justificatif attaché", "success", { autoHideMs: 1800 });

  // Refresh the bank transactions list silently so the row pill flips to
  // "Justifié" the next time the user backs out of the viewer + modal.
  loadBankTransactions();
}
window.attachDocToTransaction = attachDocToTransaction;

// In-memory store for transaction details consulted by the click handler.
// Cleared & rebuilt on every loadBankTransactions() call.
const _txDataIndex = new Map();

// Map a category / merchant string to one of the Lucide icons we shipped to
// www/img/icons/. Falls back to "wallet". Each entry also carries a
// background colour for the avatar tile, N26-style.
const _CATEGORY_ICON_MAP = [
  // (regex tested against the lowercased string, [iconFile, bg, fg])
  [/(restaurant|food|repas|cantine|food|fastfood|fast.?food|mcdo|kfc|burger|pizza)/, ["utensils", "#fff7ed", "#c2410c"]],
  [/(cafe|coffee|starbucks)/, ["coffee", "#fef3c7", "#b45309"]],
  [/(uber|taxi|cab|car)/, ["car", "#dbeafe", "#1d4ed8"]],
  [/(bus|transport)/, ["bus", "#dbeafe", "#1d4ed8"]],
  [/(train|sncf|tgv|ouigo|ter)/, ["train-front", "#dbeafe", "#1d4ed8"]],
  [/(airline|airways|flight|avion|royal\s*air|ryanair|easyjet)/, ["plane", "#e0e7ff", "#4338ca"]],
  [/(hotel|airbnb|booking)/, ["hotel", "#ede9fe", "#6d28d9"]],
  [/(fuel|essence|station|shell|total|bp|carburant)/, ["fuel", "#fee2e2", "#b91c1c"]],
  [/(cinema|netflix|disney|prime\s*video|spectacle|theatre)/, ["film", "#fce7f3", "#be185d"]],
  [/(spotify|deezer|apple\s*music|music)/, ["music", "#dcfce7", "#15803d"]],
  [/(cadeau|gift|fleur)/, ["gift", "#fce7f3", "#be185d"]],
  [/(gym|fitness|sport|basic.?fit|smart.?fit)/, ["dumbbell", "#fef3c7", "#b45309"]],
  [/(pharmacie|pharmacy|medic|sante)/, ["heart-pulse", "#fee2e2", "#b91c1c"]],
  [/(docteur|doctor|hopital|clinique|consultation)/, ["stethoscope", "#fee2e2", "#b91c1c"]],
  [/(ecole|school|universite|formation|udemy|coursera)/, ["graduation-cap", "#dbeafe", "#1d4ed8"]],
  [/(loyer|rent|appart|maison|electricite|edf|gaz|eau|amendis|lydec)/, ["house", "#f1f5f9", "#475569"]],
  [/(internet|wifi|orange|inwi|maroc.?telecom|fibre|adsl)/, ["wifi", "#dbeafe", "#1d4ed8"]],
  [/(mobile|forfait|sfr|bouygues|free)/, ["smartphone", "#e0e7ff", "#4338ca"]],
  [/(salaire|virement.?reçu|honoraires|prestation|client)/, ["briefcase", "#dcfce7", "#15803d"]],
  [/(impot|impots|tax|cnss|tva|fisc)/, ["landmark", "#f1f5f9", "#475569"]],
  [/(retrait|dab|atm|cash)/, ["wallet", "#f1f5f9", "#475569"]],
  [/(carte|card|paiement)/, ["credit-card", "#eef2ff", "#4338ca"]],
  [/(epargne|savings|piggy)/, ["piggy-bank", "#fce7f3", "#be185d"]],
  [/(facture|invoice|recu|receipt)/, ["receipt", "#f1f5f9", "#475569"]],
  [/(amazon|shop|magasin|carrefour|marjane|aswak|acima|leclerc|auchan|ikea|h&m|zara)/, ["shopping-bag", "#fff7ed", "#c2410c"]],
  [/(reparation|garage|entretien|plomberie)/, ["wrench", "#f1f5f9", "#475569"]],
  [/(vetement|fashion|mode)/, ["shirt", "#fce7f3", "#be185d"]],
  [/(bebe|baby|enfant|pampers)/, ["baby", "#fce7f3", "#be185d"]],
];

/**
 * Returns the first meaningful character of a transaction's description
 * for use as an avatar letter. Robust against:
 *  - bank-prefix noise ("PAIEMENT", "VIREMENT", "CB", "RETRAIT", ...)
 *  - numeric tokens ("230126-274", "001", reference numbers, dates, amounts)
 *  - pure-numeric/symbol words — only A–Z letters can become the avatar
 *  - diacritics — normalised before matching the SKIP list
 *
 * Examples:
 *  "PAIEMENT CB AMAZON 230126"       → "A"
 *  "VIREMENT SALAIRE 21/04/2026"     → "S"
 *  "RETRAIT DAB BMCE 001 CASA"       → "B"
 *  "230126-274 LAGARDERE TR"         → "L"
 */
function _txAvatarInitial(desc) {
  const SKIP = new Set([
    // Operation prefixes
    "paiement", "paiment", "virement", "vir", "retrait", "prelevement",
    "achat", "remise", "frais", "cheque", "tpe", "dab", "atm", "depot",
    "transfer", "transfert", "facture",
    // Card / channel
    "cb", "carte", "credit", "debit",
    // Articles / connectors (FR)
    "par", "de", "du", "le", "la", "les", "et", "a", "au", "aux",
    "en", "pour", "sur", "sous",
    // Channel / method
    "internet", "mobile", "online", "web", "tel", "phone",
    // Common reference-y filler
    "ref", "no", "num", "id",
    // Months / weekday abbreviations that sometimes appear before merchant
    "jan", "fev", "mar", "avr", "mai", "jun", "juil", "aout", "sep",
    "oct", "nov", "dec",
  ]);

  // Strip diacritics, then take only word-like tokens. The key change vs
  // the previous version: we ONLY accept tokens that have at least one
  // ASCII letter — pure-digit / digit-prefixed strings (reference numbers,
  // dates, amounts) are skipped entirely, so the avatar is never "2" or "0".
  const tokens = String(desc || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  for (const tok of tokens) {
    // Reject anything that contains a digit OR starts with a non-letter.
    if (/[0-9]/.test(tok)) continue;
    // Reject single letters that are clearly noise ("a", "à", "e").
    if (tok.length < 2) continue;
    if (SKIP.has(tok.toLowerCase())) continue;
    // First character of the first qualifying token wins.
    const ch = tok.charAt(0).toUpperCase();
    if (/^[A-Z]$/.test(ch)) return ch;
  }

  // Fallback: scan again for any letter from any token (so "S" wins over
  // "?" when the description was something like "S.A.R.L. 230126").
  for (const tok of tokens) {
    for (const ch of tok) {
      const u = ch.toUpperCase();
      if (/^[A-Z]$/.test(u)) return u;
    }
  }
  return "?";
}

function _txCategoryAvatar(tx) {
  const text = `${tx.description || ""} ${tx.category || ""} ${tx.thirdPartyLabel || ""}`.toLowerCase();
  for (const [re, val] of _CATEGORY_ICON_MAP) {
    if (re.test(text)) return { icon: val[0], bg: val[1], fg: val[2] };
  }
  // Default depends on direction: green building for incoming, slate wallet for outgoing.
  if (isDebitTx(tx)) return { icon: "wallet", bg: "#f1f5f9", fg: "#475569" };
  return { icon: "building-2", bg: "#dcfce7", fg: "#15803d" };
}

function _renderBankBalanceCard(transactions) {
  const card = document.getElementById("bank-balance-card");
  if (!card) return;

  // Month flow + tx count come from the transactions list.
  let monthIn = 0;
  let monthOut = 0;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();
  for (const tx of transactions) {
    const c = Math.abs(Number(tx.amountCents || 0));
    const debit = isDebitTx(tx);
    const d = tx.date ? new Date(tx.date) : null;
    if (d && d.getFullYear() === yyyy && d.getMonth() === mm) {
      if (debit) monthOut += c; else monthIn += c;
    }
  }
  const monthFlow = monthIn - monthOut;

  const amountEl = document.getElementById("bank-balance-amount");
  const acctEl = document.getElementById("bank-balance-accounts");
  const flowEl = document.getElementById("bank-balance-flow");

  // Solde total = sum of "solde final" across accounts (last closing
  // balance from imported statements, fallback to stored balanceCents).
  // Mirrors the webapp's compte-pro/bank-accounts page. We query both
  // endpoints; the cache makes this near-instant when the dashboard
  // already loaded them.
  if (amountEl && state.orgId) {
    Promise.all([
      _cachedFetch(`/api/pro-accounts?organizationId=${state.orgId}`),
      _cachedFetch(`/api/pro-accounts/last-balances?organizationId=${state.orgId}`),
    ]).then(([accRes, balRes]) => {
      if (!accRes?.ok) return;
      const accounts = accRes.data?.accounts || [];
      const balances = (balRes?.ok && balRes.data?.balances) || {};
      const { totalCents, count } = computeTotalBalance(accounts, balances);
      amountEl.textContent = formatAmount(totalCents);
      if (acctEl) acctEl.textContent = `${count} compte${count > 1 ? "s" : ""}`;
      card.classList.toggle("bank-balance-card-positive", totalCents >= 0);
      card.classList.toggle("bank-balance-card-negative", totalCents < 0);
    }).catch(() => {});
  }
  if (flowEl) {
    const sign = monthFlow >= 0 ? "+" : "−";
    flowEl.textContent = `${sign}${formatAmount(Math.abs(monthFlow))} ce mois`;
  }
}
// Last-fetched, fully-formed transactions. Used by the realtime client-side
// search to filter without a network round-trip.
let _txCachedTransactions = [];

/**
 * Lowercases AND strips diacritics so "café" matches "cafe", "Société"
 * matches "societe", etc. — essential for French descriptions.
 */
const _DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function _normSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(_DIACRITICS_RE, "")
    .trim();
}

/**
 * Realtime client-side search across description, amount, category, method,
 * counterparty (matched item / extracted), status. Numeric tokens match
 * against the formatted amount too — so typing "150" finds 150,00 MAD.
 * Description is the primary field; everything else is additive.
 */
function _txMatchesSearch(tx, q) {
  const needle = _normSearch(q);
  if (!needle) return true;

  // Primary: description / label.
  const desc = _normSearch(`${tx.description || ""} ${tx.label || ""}`);
  if (desc.includes(needle)) return true;

  // Other transaction fields.
  const meta = _normSearch(
    [tx.category, tx.method, tx.thirdPartyLabel, tx.thirdPartyRef,
     tx.invoiceRef, tx.accountLabel, tx.accountCode]
      .filter(Boolean).join(" ")
  );
  if (meta.includes(needle)) return true;

  // Amount: raw digits and formatted forms.
  const amt = tx.amountCents != null ? Math.abs(tx.amountCents) : null;
  if (amt != null) {
    const digits = needle.replace(/[^\d]/g, "");
    if (digits && String(amt).includes(digits)) return true;
    if (_normSearch(formatAmount(amt)).includes(needle)) return true;
  }

  // OCR fields stored on the tx.
  const ext = tx.extracted || {};
  const fromExtracted = _normSearch(
    [ext.beneficiaire, ext.identifiant, ext.adresse,
     ext.classifier?.merchant_name, ext.classifier?.categorie]
      .filter(Boolean).join(" ")
  );
  if (fromExtracted.includes(needle)) return true;

  // Matched items (linked tickets / invoices / etc.).
  const matched = Array.isArray(tx.matchedItems) ? tx.matchedItems : [];
  for (const it of matched) {
    if (!it) continue;
    const m = _normSearch(
      [it.label, it.counterpartyName, it.ref, it.status]
        .filter(Boolean).join(" ")
    );
    if (m.includes(needle)) return true;
  }

  return false;
}

function _renderTxRows(transactions) {
  const txContainer = document.getElementById("transactions-list");
  if (!txContainer) return;
  if (transactions.length === 0) {
    txContainer.innerHTML = emptyState(
      `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      "Aucune transaction"
    );
    return;
  }
  // Group transactions by day for an N26-style timeline. The list is
  // already sorted desc by the API.
  const groups = new Map();
  for (const tx of transactions) {
    const d = tx.date || tx.valueDate;
    if (!d) continue;
    const key = String(d).slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dayLabel = (key) => {
    const dd = new Date(key);
    if (isNaN(dd.getTime())) return key;
    if (dd.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (dd.toDateString() === yest.toDateString()) return "Hier";
    return dd.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
  };
  let html = "";
  for (const [key, list] of groups) {
    let dayNet = 0;
    for (const tx of list) {
      const c = Math.abs(Number(tx.amountCents || 0));
      dayNet += isDebitTx(tx) ? -c : c;
    }
    html += `<div class="tx-day-header">
      <span class="tx-day-label">${escapeHtml(dayLabel(key))}</span>
      <span class="tx-day-total ${dayNet >= 0 ? "amount-positive" : "amount-negative"}">${dayNet >= 0 ? "+" : "−"}${formatAmount(Math.abs(dayNet))}</span>
    </div>`;
    html += list.map(_renderTxRowHtml).join("");
  }
  txContainer.innerHTML = html;
  // Resolve every <img data-auth-logo-path> through the bearer-aware
  // helper and swap blob URLs in place. Cached per session, so realtime
  // search re-renders don't re-fetch the same logos.
  _hydrateAuthLogos(txContainer);
}

function _applyTxSearchAndRender() {
  const search = document.getElementById("tx-search")?.value || "";
  const filtered = search.trim()
    ? _txCachedTransactions.filter(tx => _txMatchesSearch(tx, search))
    : _txCachedTransactions;
  _renderTxRows(filtered);
  // Hero balance always reflects the unfiltered universe so users can use
  // the search to drill in without their balance reading "lying" to them.
  _renderBankBalanceCard(_txCachedTransactions);
}

// Map: accountId → bankLogoUrl. Populated on every loadBankTransactions
// run so rows that represent a bank operation (commission, prelevement,
// frais bancaires) can fall back to the bank's logo when the supplier
// brand logo is missing. Mirrors the webapp's "if it's a bank fee, the
// counterparty IS the bank" intent.
let _txAccountBankLogoMap = new Map();

async function loadBankTransactions() {
  if (!state.orgId) return;
  _txDataIndex.clear();
  const txContainer = document.getElementById("transactions-list");
  txContainer.innerHTML = loadingHtml();
  // Server-side date / direction filters only — search is local + realtime.
  let url = `/api/transactions?organizationId=${state.orgId}&limit=200&sortDirection=desc`;
  const from = document.getElementById("tx-filter-from")?.value;
  const to = document.getElementById("tx-filter-to")?.value;
  const direction = document.getElementById("tx-filter-direction")?.value;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  if (direction) url += `&direction=${direction}`;
  try {
    const [txRes, accRes] = await Promise.all([
      apiFetch(url),
      _cachedFetch(`/api/pro-accounts?organizationId=${state.orgId}`),
    ]);
    // Refresh the accountId → bank logo lookup before rendering rows.
    _txAccountBankLogoMap = new Map();
    if (accRes?.ok) {
      const accounts = accRes.data?.accounts || [];
      for (const a of accounts) {
        const id = String(a?.id || a?._id || "");
        if (id && a?.bankLogoUrl) _txAccountBankLogoMap.set(id, String(a.bankLogoUrl));
      }
    }
    if (txRes.ok) {
      _txCachedTransactions = txRes.data?.transactions || [];
      _applyTxSearchAndRender();
      return;
    } else {
      txContainer.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    txContainer.innerHTML = emptyState("", "Erreur de connexion");
  }
}

// Bank operations: amounts paid to / received from the bank itself
// (frais de tenue de compte, commissions sur virement, prélèvements
// SEPA bancaires, etc.). For these the counterparty IS the bank and
// the row should show the bank logo, not a merchant logo.
const _BANK_OPERATION_TYPES = new Set([
  "commission", "prelevement", "frais", "frais_bancaires",
  "interets", "agios", "abonnement", "package",
]);
function _isBankOperation(tx) {
  const t = String(tx?.operationType || "").toLowerCase();
  if (t && _BANK_OPERATION_TYPES.has(t)) return true;
  // Heuristic fallback when operationType is null but the description
  // makes the bank-fee nature obvious.
  const d = String(tx?.description || "").toLowerCase();
  if (!d) return false;
  return /(commission|frais\s+bancair|frais\s+de\s+tenue|agios|int[ée]r[êe]ts|abonnement\s+bancaire|tva\s+sur\s+commission)/.test(d);
}

// Renders a single tx row's HTML and registers its data in _txDataIndex.
function _renderTxRowHtml(tx) {
  const desc = tx.description || tx.label || "Transaction";
  const amountAbs = Math.abs(tx.amountCents || 0);
  const amount = tx.amountCents != null ? formatAmount(amountAbs) : "-";
  const isDebit = isDebitTx(tx);
  const amountClass = isDebit ? "amount-negative" : "amount-positive";
  const sign = isDebit ? "-" : "+";
  const txId = tx.id || tx._id;
  const receipts = Array.isArray(tx.receipts) ? tx.receipts : [];
  const hasMatchedItems = Array.isArray(tx.matchedItems) && tx.matchedItems.some(it => it && it.pdfUrl);
  const hasReceipt = receipts.length > 0 || tx.matched === true || hasMatchedItems;
  const cat = _txCategoryAvatar(tx);
  // Avatar priority (mirrors webapp/TransactionsTable):
  //   1. supplierBrandLogoUrl from the API — this is either an uploaded
  //      brand logo (/api/shared-supplier-brand-logo/<id>) or a clearbit-
  //      style domain logo (/api/classifier-logo?domain=...).
  //   2. If it's a bank operation (frais bancaires, commission, etc.)
  //      use the bank logo of the source account — the counterparty IS
  //      the bank in that case.
  //   3. Initial avatar tinted by category (same look as the contacts
  //      list).
  const initial = _txAvatarInitial(desc);
  let authLogoPath = tx.supplierBrandLogoUrl ? String(tx.supplierBrandLogoUrl) : null;
  if (!authLogoPath && _isBankOperation(tx)) {
    const accId = tx.accountId ? String(tx.accountId) : "";
    const bankPath = accId ? _txAccountBankLogoMap.get(accId) : null;
    if (bankPath) authLogoPath = bankPath;
  }
  const initialFallback = `<span class="tx-avatar-initial" data-auth-logo-fallback>${escapeHtml(initial)}</span>`;
  const logoHtml = authLogoPath
    ? `<img data-auth-logo-path="${escapeHtml(authLogoPath)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:none" />${initialFallback}`
    : initialFallback;
  const justifiedPill = hasReceipt
    ? `<span class="tx-status-pill tx-status-justified">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        Justifié
      </span>`
    : `<span class="tx-status-pill tx-status-unjustified">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Sans justificatif
      </span>`;
  // Stash the heavy bits in an in-memory map keyed by txId. The DOM only
  // carries the txId — small dataset, no JSON.parse on click.
  _txDataIndex.set(String(txId), {
    id: String(txId),
    amount: amountAbs,
    description: desc,
    direction: isDebit ? "debit" : "credit",
    date: tx.date || tx.valueDate || "",
    receipts,
    matchedInvoice: tx.matchedInvoice || null,
    matchedItems: Array.isArray(tx.matchedItems) ? tx.matchedItems : [],
    extracted: tx.extracted || null,
  });
  return `<div class="tx-row list-item-tap ${hasReceipt ? "tx-row-justified" : "tx-row-unjustified"}" data-tx-attach-id="${escapeHtml(String(txId))}">
    <div class="tx-row-accent"></div>
    <div class="tx-row-icon" style="background:${cat.bg};color:${cat.fg}">${logoHtml}</div>
    <div class="tx-row-body">
      <div class="tx-row-line1">
        <span class="tx-row-merchant">${escapeHtml(desc)}</span>
        <span class="tx-row-amount ${amountClass}">${sign}${amount}</span>
      </div>
      <div class="tx-row-line2">
        <span class="tx-row-meta">${formatDate(tx.date || tx.valueDate)}${tx.category ? ` <span class="meta-dot"></span> ${escapeHtml(tx.category)}` : ""}</span>
        ${justifiedPill}
      </div>
    </div>
  </div>`;
}

async function loadBankStatements() {
  if (!state.orgId) return;
  const container = document.getElementById("statements-list");
  container.innerHTML = loadingHtml();
  try {
    const res = await apiFetch(`/api/bank-statements?organizationId=${state.orgId}`);
    if (res.ok) {
      const statements = res.data?.statements || res.data || [];
      if (statements.length === 0) {
        container.innerHTML = emptyState(
          `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
          "Aucun releve importe"
        );
      } else {
        container.innerHTML = statements.map(st => {
          const name = st.bankName || st.name || "Releve bancaire";
          const month = st.monthYear || "";
          const txCount = st.transactions ?? st.transactionCount ?? 0;
          const id = st._id || st.id;
          return `<div class="statement-item">
            <div class="statement-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </div>
            <div class="statement-item-info">
              <div class="statement-item-name">${escapeHtml(name)}</div>
              <div class="statement-item-meta">${escapeHtml(month)}${txCount ? ` <span class="meta-dot"></span> ${txCount} transactions` : ""}</div>
            </div>
            <div class="statement-item-badge">${txCount} tx</div>
            <button class="statement-item-delete" onclick="deleteStatement('${id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>`;
        }).join("");
      }
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function importBankStatement(files) {
  if (!files || files.length === 0 || !state.orgId) return;
  const progressEl = document.getElementById("statement-import-progress");
  const progressText = document.getElementById("import-progress-text");
  const progressFile = document.getElementById("import-progress-file");
  progressEl.style.display = "block";

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progressText.textContent = `Extraction ${i + 1}/${files.length}...`;
    progressFile.textContent = file.name;

    try {
      const formData = new FormData();
      formData.append("organizationId", state.orgId);
      formData.append("file", file);
      // Auto-detect month from filename or use current
      const now = new Date();
      const months = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
      formData.append("monthYear", `${months[now.getMonth()]} ${now.getFullYear()}`);

      const res = await fetch(`${API_BASE_URL}/api/bank-statements`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.status === 409) {
        showToast("Ce releve a deja ete importe");
      } else if (res.ok) {
        const txCount = data.statement?.transactions || 0;
        showToast(`${txCount} transactions extraites`);
      } else {
        showToast(data.error || "Erreur d'importation");
      }
    } catch (err) {
      showToast("Erreur de connexion");
    }
  }

  progressEl.style.display = "none";
  loadBankStatements();
}

async function deleteStatement(id) {
  if (!confirm("Supprimer ce releve et ses transactions ?")) return;
  try {
    const res = await apiFetch(`/api/bank-statements/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Releve supprime");
      loadBankStatements();
    } else {
      showToast(res.data?.error || "Erreur");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

async function loadBankAccounts() {
  if (!state.orgId) return;
  const accountsContainer = document.getElementById("accounts-list");
  const txContainer = document.getElementById("transactions-list");
  accountsContainer.innerHTML = loadingHtml();
  txContainer.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/pro-accounts?organizationId=${state.orgId}`);
    if (res.ok) {
      const accounts = res.data?.accounts || [];
      if (accounts.length === 0) {
        accountsContainer.innerHTML = emptyState(
          `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
          "Aucun compte bancaire"
        );
      } else {
        accountsContainer.innerHTML = accounts.map(a => {
          const name = a.bankName || a.name || "Compte bancaire";
          const number = a.accountNumber || a.iban || "";
          const balance = a.balanceCents != null ? formatAmount(a.balanceCents) : (a.balance != null ? formatAmountDirect(a.balance) : "-");
          const masked = number ? "****" + number.slice(-4) : "";
          return `<div class="account-card">
            <div class="account-card-header">
              <div class="account-card-logo">
                ${a.logoUrl ? `<img src="${API_BASE_URL}${a.logoUrl}" alt="" />` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`}
              </div>
              <div>
                <div class="account-card-name">${escapeHtml(name)}</div>
                ${masked ? `<div class="account-card-number">${escapeHtml(masked)}</div>` : ""}
              </div>
            </div>
            <div class="account-card-balance">
              <span class="account-balance-label">Solde</span>
              <span class="account-balance-value">${balance}</span>
            </div>
          </div>`;
        }).join("");
      }
    } else {
      accountsContainer.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    accountsContainer.innerHTML = emptyState("", "Erreur de connexion");
  }

  // Load recent transactions
  try {
    const res = await apiFetch(`/api/transactions?organizationId=${state.orgId}&limit=20`);
    if (res.ok) {
      const transactions = res.data?.transactions || [];
      if (transactions.length === 0) {
        txContainer.innerHTML = emptyState(
          `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
          "Aucune transaction"
        );
      } else {
        txContainer.innerHTML = transactions.map(tx => {
          const desc = tx.description || tx.label || "Transaction";
          const amount = tx.amountCents != null ? formatAmount(Math.abs(tx.amountCents)) : "-";
          const isDebit = isDebitTx(tx);
          const amountClass = isDebit ? "amount-negative" : "amount-positive";
          const sign = isDebit ? "-" : "+";
          return `<div class="list-item">
            <div class="list-item-icon" style="background:${isDebit ? "var(--red-50)" : "var(--green-50)"};color:${isDebit ? "var(--red-600)" : "var(--green-600)"}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${isDebit ? '<polyline points="7 7 17 17"/><polyline points="17 7 17 17 7 17"/>' : '<polyline points="17 7 7 17"/><polyline points="7 7 7 17 17 17"/>'}</svg>
            </div>
            <div class="list-item-content">
              <div class="list-item-title">${escapeHtml(desc)}</div>
              <div class="list-item-meta">${formatDate(tx.date || tx.valueDate)}</div>
            </div>
            <div class="list-item-amount ${amountClass}">${sign}${amount}</div>
          </div>`;
        }).join("");
      }
    } else {
      txContainer.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    txContainer.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- INVOICES TAB ----- */

function loadInvoicesTab() {
  loadClientInvoices();
}

let _invoicesState = { items: [], filter: "all", search: "" };

function initialsFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColorForName(name) {
  const palette = [
    { bg: "#ede9fe", fg: "#7c3aed" },
    { bg: "#dbeafe", fg: "#2563eb" },
    { bg: "#dcfce7", fg: "#16a34a" },
    { bg: "#fee2e2", fg: "#dc2626" },
    { bg: "#fef3c7", fg: "#d97706" },
    { bg: "#e0e7ff", fg: "#4f46e5" },
    { bg: "#cffafe", fg: "#0891b2" },
    { bg: "#fce7f3", fg: "#db2777" },
  ];
  let h = 0;
  const s = String(name || "X");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function statusToFilterKey(status) {
  if (status === "Payee" || status === "Payée") return "paid";
  if (status === "À encaisser" || status === "A encaisser") return "pending";
  if (status === "Brouillon") return "draft";
  return "other";
}

function isOverdue(inv) {
  if (!inv.dueDate) return false;
  const status = statusToFilterKey(inv.status);
  if (status === "paid" || status === "draft") return false;
  return new Date(inv.dueDate).getTime() < Date.now();
}

function renderInvoicesSummary(list) {
  const totalTtc = list.reduce((s, i) => s + Number(i.totalTtcCents || i.amountCents || 0), 0);
  const paid = list.filter(i => statusToFilterKey(i.status) === "paid");
  const paidTotal = paid.reduce((s, i) => s + Number(i.totalTtcCents || i.amountCents || 0), 0);
  const pending = list.filter(i => statusToFilterKey(i.status) === "pending");
  const pendingTotal = pending.reduce((s, i) => s + Number(i.totalTtcCents || i.amountCents || 0), 0);
  const overdue = list.filter(isOverdue).length;
  const container = document.getElementById("invoices-summary");
  if (!container) return;
  container.innerHTML = `
    <div class="inv-kpi inv-kpi-hero">
      <div class="inv-kpi-label">Chiffre d'affaires</div>
      <div class="inv-kpi-value">${formatAmount(totalTtc)}</div>
      <div class="inv-kpi-sub">${list.length} facture${list.length > 1 ? "s" : ""}</div>
    </div>
    <div class="inv-kpi-grid">
      <div class="inv-kpi inv-kpi-ok">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">Encaisse</div>
          <div class="inv-kpi-sm-value">${formatAmount(paidTotal)}</div>
        </div>
      </div>
      <div class="inv-kpi inv-kpi-pending">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">A encaisser</div>
          <div class="inv-kpi-sm-value">${formatAmount(pendingTotal)}</div>
          ${overdue > 0 ? `<div class="inv-kpi-sm-warn">${overdue} en retard</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderInvoicesFilters() {
  const counts = _invoicesState.items.reduce((acc, i) => {
    const k = statusToFilterKey(i.status);
    acc.all++; acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, { all: 0, paid: 0, pending: 0, draft: 0 });
  const container = document.getElementById("invoices-filters");
  if (!container) return;
  const chip = (key, label) => `<button type="button" class="inv-chip-filter ${_invoicesState.filter === key ? "active" : ""}" data-filter="${key}">${label}${counts[key] != null ? ` <span class="chip-count">${counts[key]}</span>` : ""}</button>`;
  container.innerHTML = chip("all", "Toutes") + chip("pending", "A encaisser") + chip("paid", "Payees") + chip("draft", "Brouillons");
  container.querySelectorAll(".inv-chip-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      _invoicesState.filter = btn.getAttribute("data-filter");
      renderInvoicesFilters();
      renderInvoicesList();
    });
  });
}

function renderInvoicesList() {
  const container = document.getElementById("invoices-clients-list");
  if (!container) return;
  const q = _invoicesState.search.trim().toLowerCase();
  const list = _invoicesState.items.filter(inv => {
    if (_invoicesState.filter !== "all" && statusToFilterKey(inv.status) !== _invoicesState.filter) return false;
    if (!q) return true;
    const name = (inv.client?.name || "") + " " + (inv.ref || "") + " " + (inv.title || "");
    return name.toLowerCase().includes(q);
  });

  if (_invoicesState.items.length === 0) {
    container.innerHTML = `<div class="inv-empty">
      <div class="inv-empty-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
      </div>
      <div class="inv-empty-title">Aucune facture</div>
      <div class="inv-empty-sub">Creez votre premiere facture client en appuyant sur le bouton ci-dessous.</div>
    </div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML = `<div class="inv-empty inv-empty-sm">
      <div class="inv-empty-title">Aucun resultat</div>
      <div class="inv-empty-sub">Aucune facture ne correspond a votre recherche.</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(inv => {
    const id = inv._id || inv.id;
    const clientName = inv.client?.name || "Client";
    const initials = initialsFromName(clientName);
    const colors = avatarColorForName(clientName);
    const amount = formatAmount(inv.totalTtcCents || inv.amountCents || 0, inv.currency || "MAD");
    const key = statusToFilterKey(inv.status);
    const overdue = isOverdue(inv);
    const stripeClass = overdue ? "stripe-overdue" : (key === "paid" ? "stripe-paid" : key === "pending" ? "stripe-pending" : "stripe-draft");
    const dueInfo = overdue
      ? `<span class="inv-due overdue"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>En retard</span>`
      : inv.dueDate && key !== "paid"
        ? `<span class="inv-due">Echeance ${formatDate(inv.dueDate)}</span>`
        : "";
    return `<div class="inv-card" onclick="showInvoiceDetail('${id}')">
      <div class="inv-card-stripe ${stripeClass}"></div>
      <div class="inv-card-body">
        <div class="inv-card-top">
          <div class="inv-avatar" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(initials)}</div>
          <div class="inv-card-head">
            <div class="inv-card-title">${escapeHtml(clientName)}</div>
            <div class="inv-card-sub">${inv.ref ? escapeHtml(inv.ref) : "Sans reference"}${inv.title ? ` · ${escapeHtml(inv.title)}` : ""}</div>
          </div>
          <div class="inv-card-amount">${amount}</div>
        </div>
        <div class="inv-card-bot">
          <span class="inv-card-date">${formatDate(inv.issueDate || inv.createdAt)}</span>
          ${statusBadge(inv.status)}
          ${dueInfo}
        </div>
      </div>
    </div>`;
  }).join("");
}

async function loadClientInvoices() {
  if (!state.orgId) return;
  const container = document.getElementById("invoices-clients-list");
  const summary = document.getElementById("invoices-summary");
  const filters = document.getElementById("invoices-filters");
  container.innerHTML = loadingHtml();
  if (summary) summary.innerHTML = "";
  if (filters) filters.innerHTML = "";

  const searchInput = document.getElementById("invoices-search");
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", (e) => {
      _invoicesState.search = e.target.value;
      renderInvoicesList();
    });
  }

  try {
    const res = await apiFetch(`/api/client-invoices?organizationId=${state.orgId}`);
    if (!res.ok) { container.innerHTML = emptyState("", "Erreur de chargement"); return; }
    const invoices = (res.data?.invoices || []).sort((a, b) => new Date(b.issueDate || b.createdAt || 0) - new Date(a.issueDate || a.createdAt || 0));
    _invoicesState.items = invoices;
    _invoicesState.filter = "all";
    _invoicesState.search = "";
    if (searchInput) searchInput.value = "";
    renderInvoicesSummary(invoices);
    renderInvoicesFilters();
    renderInvoicesList();
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function loadSupplierInvoices() {
  if (!state.orgId) return;
  const container = document.getElementById("supplier-invoices-list");
  if (!container) return;
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/supplier-invoices?organizationId=${state.orgId}`);
    if (!res.ok) {
      container.innerHTML = emptyState("", "Erreur de chargement");
      return;
    }
    const invoices = (res.data?.invoices || res.data?.supplierInvoices || [])
      .sort((a, b) => new Date(b.importDate || b.createdAt || 0) - new Date(a.importDate || a.createdAt || 0));
    if (invoices.length === 0) {
      container.innerHTML = emptyState(
        `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        "Aucune facture fournisseur"
      );
      return;
    }
    container.innerHTML = invoices.map(inv => {
      const id = inv.id || inv._id;
      const name = inv.supplier?.name || inv.supplierName || inv.title || "Facture fournisseur";
      const amount = inv.amountCents != null ? formatAmount(inv.amountCents, inv.currency || "MAD") : "-";
      const date = inv.importDate || inv.dueDate || inv.createdAt;
      return `<div class="ticket-card" onclick="showSupplierInvoiceDetail('${escapeHtml(id)}')">
        <div class="ticket-card-avatar" style="background:#fee2e2;color:#dc2626">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        </div>
        <div class="ticket-card-info">
          <div class="ticket-card-name">${escapeHtml(name)}</div>
          <div class="ticket-card-meta">
            ${date ? escapeHtml(formatDate(date)) : ""}
            ${inv.status ? statusBadge(inv.status) : ""}
          </div>
        </div>
        <div class="ticket-card-amount">
          <div class="ticket-card-amount-value">${amount}</div>
        </div>
      </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function showSupplierInvoiceDetail(invoiceId) {
  if (!invoiceId) return;
  _disposeTicketImage();
  switchDirTab("supplier-invoice-detail");
  const container = document.getElementById("supplier-invoice-detail-content");
  if (!container) return;
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/supplier-invoices/${invoiceId}`);
    if (!res.ok) {
      container.innerHTML = emptyState("", "Erreur de chargement");
      return;
    }
    const inv = res.data?.invoice || res.data;
    const currency = inv.currency || "MAD";
    const total = inv.amountCents != null ? formatAmount(inv.amountCents, currency) : "-";
    const supplier = inv.supplier?.name || inv.title || "Fournisseur";
    const dateLabel = formatDate(inv.importDate);
    const dueLabel = formatDate(inv.dueDate);
    const isMatched = !!(inv.matchedTransactionId && String(inv.matchedTransactionId).length > 0);

    let blobUrl = null;
    if (inv.documentUrl) {
      blobUrl = await fetchAuthenticatedImage(inv.documentUrl);
      _ticketImageObjectUrl = blobUrl;
    }

    let html = `<div class="ticket-doc">`;

    if (blobUrl) {
      html += `<div class="rcp-photo-card" data-ticket-img="${escapeHtml(blobUrl)}">
        <img src="${escapeHtml(blobUrl)}" alt="Facture" class="rcp-photo" />
        <div class="rcp-photo-overlay">
          <div class="rcp-photo-zoom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            Agrandir
          </div>
        </div>
      </div>`;
    } else if (inv.documentUrl) {
      html += `<div class="rcp-photo-card rcp-photo-fallback">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <span>Document indisponible</span>
      </div>`;
    }

    html += `<div class="rcp-summary">
      <div class="rcp-summary-amount">${total}</div>
      <div class="rcp-summary-merchant">${escapeHtml(supplier)}</div>
      <div class="rcp-summary-row">
        ${dateLabel ? `<span class="rcp-summary-chip">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${escapeHtml(dateLabel)}
        </span>` : ""}
        ${inv.status ? `<span class="rcp-summary-chip rcp-chip-source">${escapeHtml(inv.status)}</span>` : ""}
        <span class="rcp-summary-chip ${isMatched ? "rcp-chip-matched" : "rcp-chip-pending"}">
          ${isMatched ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`}
          ${isMatched ? "Rapproché" : "À rapprocher"}
        </span>
      </div>
    </div>`;

    const hasMontants = inv.amountHtCents != null || inv.tauxTva != null || inv.montantTvaCents != null || inv.amountCents != null;
    if (hasMontants) {
      html += `<div class="rcp-card">
        <div class="rcp-card-title">Détail des montants</div>
        <div class="rcp-rows">
          ${rcpRow("Montant HT", inv.amountHtCents != null ? formatAmount(inv.amountHtCents, currency) : null)}
          ${rcpRow("Taux TVA", inv.tauxTva != null ? inv.tauxTva + "%" : null)}
          ${rcpRow("Montant TVA", inv.montantTvaCents != null ? formatAmount(inv.montantTvaCents, currency) : null)}
          ${rcpRow("Total TTC", inv.amountCents != null ? formatAmount(inv.amountCents, currency) : null, "rcp-row-strong")}
        </div>
      </div>`;
    }

    if (supplier || inv.supplier?.ice || inv.supplier?.ifNumber || inv.ref) {
      html += `<div class="rcp-card">
        <div class="rcp-card-title">Identification</div>
        <div class="rcp-rows">
          ${rcpRow("Référence", inv.ref)}
          ${rcpRow("Fournisseur", supplier)}
          ${rcpRow("ICE", inv.supplier?.ice)}
          ${rcpRow("IF", inv.supplier?.ifNumber)}
        </div>
      </div>`;
    }

    if (dueLabel || inv.paymentStatus) {
      html += `<div class="rcp-card">
        <div class="rcp-card-title">Paiement</div>
        <div class="rcp-rows">
          ${rcpRow("Échéance", dueLabel)}
          ${rcpRow("Statut paiement", inv.paymentStatus)}
        </div>
      </div>`;
    }

    html += `<div class="rcp-actions">
      ${blobUrl ? `<button type="button" class="rcp-btn rcp-btn-primary" data-ticket-share="${escapeHtml(blobUrl)}" data-ticket-share-title="Facture ${escapeHtml(supplier)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Partager
      </button>` : ""}
      <button type="button" class="rcp-btn rcp-btn-danger" onclick="deleteSupplierInvoice('${escapeHtml(invoiceId)}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Supprimer
      </button>
    </div>`;

    const importLabel = formatDate(inv.importDate);
    if (importLabel) {
      html += `<div class="rcp-footnote">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Importée le ${escapeHtml(importLabel)}
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function deleteSupplierInvoice(invoiceId) {
  if (!invoiceId || !confirm("Supprimer cette facture fournisseur ?")) return;
  try {
    const res = await apiFetch(`/api/supplier-invoices/${invoiceId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Facture supprimée");
      switchDirTab("supplier-invoices");
    } else {
      showToast(res.data?.error || "Erreur de suppression");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

window.showSupplierInvoiceDetail = showSupplierInvoiceDetail;
window.deleteSupplierInvoice = deleteSupplierInvoice;

let _quotesState = { items: [], filter: "all", search: "" };

function quoteStatusKey(status) {
  if (status === "Accepte" || status === "Accepté") return "accepted";
  if (status === "Refuse" || status === "Refusé") return "rejected";
  if (status === "Expire" || status === "Expiré") return "expired";
  if (status === "Brouillon") return "draft";
  if (status === "En attente" || status === "À valider") return "pending";
  return "other";
}

function renderQuotesSummary(list) {
  const totalTtc = list.reduce((s, q) => s + Number(q.totalTtcCents || q.amountCents || 0), 0);
  const pending = list.filter(q => quoteStatusKey(q.status) === "pending" || quoteStatusKey(q.status) === "draft").length;
  const accepted = list.filter(q => quoteStatusKey(q.status) === "accepted").length;
  const c = document.getElementById("quotes-summary");
  if (!c) return;
  c.innerHTML = `
    <div class="inv-kpi inv-kpi-hero">
      <div class="inv-kpi-label">Montant devise</div>
      <div class="inv-kpi-value">${formatAmount(totalTtc)}</div>
      <div class="inv-kpi-sub">${list.length} devis</div>
    </div>
    <div class="inv-kpi-grid">
      <div class="inv-kpi inv-kpi-ok">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">Acceptes</div>
          <div class="inv-kpi-sm-value">${accepted}</div>
        </div>
      </div>
      <div class="inv-kpi inv-kpi-pending">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">En attente</div>
          <div class="inv-kpi-sm-value">${pending}</div>
        </div>
      </div>
    </div>`;
}

function renderQuotesFilters() {
  const counts = _quotesState.items.reduce((acc, q) => {
    acc.all++;
    const k = quoteStatusKey(q.status);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, { all: 0, accepted: 0, pending: 0, draft: 0, rejected: 0, expired: 0 });
  const container = document.getElementById("quotes-filters");
  if (!container) return;
  const chip = (key, label) => `<button type="button" class="inv-chip-filter ${_quotesState.filter === key ? "active" : ""}" data-filter="${key}">${label}${counts[key] != null ? ` <span class="chip-count">${counts[key]}</span>` : ""}</button>`;
  container.innerHTML = chip("all", "Tous") + chip("pending", "En attente") + chip("accepted", "Acceptes") + chip("draft", "Brouillons");
  container.querySelectorAll(".inv-chip-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      _quotesState.filter = btn.getAttribute("data-filter");
      renderQuotesFilters();
      renderQuotesList();
    });
  });
}

function renderQuotesList() {
  const container = document.getElementById("quotes-list");
  if (!container) return;
  const q = _quotesState.search.trim().toLowerCase();
  const list = _quotesState.items.filter(qt => {
    if (_quotesState.filter !== "all" && quoteStatusKey(qt.status) !== _quotesState.filter) return false;
    if (!q) return true;
    return `${qt.client?.name || ""} ${qt.ref || ""} ${qt.title || ""}`.toLowerCase().includes(q);
  });

  if (_quotesState.items.length === 0) {
    container.innerHTML = `<div class="inv-empty">
      <div class="inv-empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <div class="inv-empty-title">Aucun devis</div>
      <div class="inv-empty-sub">Creez votre premier devis en appuyant sur le bouton ci-dessous.</div>
    </div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML = `<div class="inv-empty inv-empty-sm">
      <div class="inv-empty-title">Aucun resultat</div>
      <div class="inv-empty-sub">Aucun devis ne correspond a votre recherche.</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(qt => {
    const id = qt._id || qt.id;
    const clientName = qt.client?.name || "Client";
    const initials = initialsFromName(clientName);
    const colors = avatarColorForName(clientName);
    const amount = formatAmount(qt.totalTtcCents || qt.amountCents || 0, qt.currency || "MAD");
    const key = quoteStatusKey(qt.status);
    const stripe = key === "accepted" ? "stripe-paid" : key === "rejected" || key === "expired" ? "stripe-overdue" : key === "pending" ? "stripe-pending" : "stripe-draft";
    return `<div class="inv-card" onclick="showQuoteDetail('${id}')">
      <div class="inv-card-stripe ${stripe}"></div>
      <div class="inv-card-body">
        <div class="inv-card-top">
          <div class="inv-avatar" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(initials)}</div>
          <div class="inv-card-head">
            <div class="inv-card-title">${escapeHtml(clientName)}</div>
            <div class="inv-card-sub">${qt.ref ? escapeHtml(qt.ref) : "Sans reference"}${qt.title ? ` · ${escapeHtml(qt.title)}` : ""}</div>
          </div>
          <div class="inv-card-amount">${amount}</div>
        </div>
        <div class="inv-card-bot">
          <span class="inv-card-date">${formatDate(qt.issueDate || qt.createdAt)}</span>
          ${statusBadge(qt.status)}
          ${qt.expiryDate ? `<span class="inv-due">Valide ${formatDate(qt.expiryDate)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

async function loadQuotes() {
  if (!state.orgId) return;
  const container = document.getElementById("quotes-list");
  const summary = document.getElementById("quotes-summary");
  const filters = document.getElementById("quotes-filters");
  container.innerHTML = loadingHtml();
  if (summary) summary.innerHTML = "";
  if (filters) filters.innerHTML = "";

  const searchInput = document.getElementById("quotes-search");
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", (e) => {
      _quotesState.search = e.target.value;
      renderQuotesList();
    });
  }

  try {
    const res = await apiFetch(`/api/client-quotes?organizationId=${state.orgId}`);
    if (!res.ok) { container.innerHTML = emptyState("", "Erreur de chargement"); return; }
    const quotes = (res.data?.quotes || []).sort((a, b) => new Date(b.issueDate || b.createdAt || 0) - new Date(a.issueDate || a.createdAt || 0));
    _quotesState.items = quotes;
    _quotesState.filter = "all";
    _quotesState.search = "";
    if (searchInput) searchInput.value = "";
    renderQuotesSummary(quotes);
    renderQuotesFilters();
    renderQuotesList();
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- TICKET SCANNER (Dirigeant) — Modal flow ----- */

function openScanModal() {
  const modal = document.getElementById("ticket-scan-modal");
  modal.style.display = "flex";
  // Reset all steps
  document.getElementById("scan-step-preview").style.display = "none";
  document.getElementById("analyzing-overlay").style.display = "none";
  document.getElementById("ticket-result").style.display = "none";
  document.getElementById("scan-error").style.display = "none";
}

function closeScanModal() {
  document.getElementById("ticket-scan-modal").style.display = "none";
  state.capturedImage = null;
}

/**
 * On low-memory MIUI devices the OS sometimes kills our process while the
 * ML Kit scanner activity is foregrounded. The native plugin persists the
 * captured JPEG to disk in that case, and we drain it here once auth is
 * ready and the JS layer is alive again. Returns true if a pending scan
 * was recovered (so the cold-boot path can skip the "Préparation de votre
 * espace…" overlay and go straight to the analysis state).
 */
async function recoverPendingScan() {
  try {
    if (Capacitor.getPlatform() !== "android") return false;
    if (!state.token) return false;
    const ds = Capacitor.Plugins.DocumentScanner;
    if (!ds || typeof ds.consumePending !== "function") return false;
    const res = await ds.consumePending();
    if (!res?.hasPending || !res.base64) return false;
    state.capturedImage = { base64: res.base64, format: res.format || "jpeg" };
    // The scan modal is markup-nested inside #screen-dirigeant — opening it
    // while the dashboard screen is `display:none` (which is the cold-boot
    // case before enterApp runs) silently keeps the modal invisible. We
    // must activate the dashboard screen first; the modal then renders on
    // top of it. enterApp({silent:true}) runs in parallel afterwards to
    // populate organizations and bind dashboard handlers — none of which
    // are needed by uploadTicket(), so it can start immediately.
    showScreen("screen-dirigeant");
    openScanModal();
    const previewImg = document.getElementById("capture-preview");
    if (previewImg) previewImg.src = `data:image/${state.capturedImage.format};base64,${state.capturedImage.base64}`;
    const step = document.getElementById("scan-step-preview");
    if (step) step.style.display = "block";
    // Show the analyzing overlay immediately so there's no gap between the
    // modal opening and uploadTicket flipping it on after a microtask.
    const analyzing = document.getElementById("analyzing-overlay");
    if (analyzing) analyzing.style.display = "flex";
    uploadTicket();
    return true;
  } catch (e) {
    console.warn("recoverPendingScan:", e);
    return false;
  }
}

/* ============================================================
   OpenCV.js custom document scanner.

   Why we built this: ML Kit's GmsDocumentScanner is a closed Activity —
   we cannot inject coaching messages or a real-time edge overlay into
   its UI. To give the user "rapprochez-vous", "tenez stable", "trop
   sombre" feedback as they frame, we run our own preview + analysis
   inside the WebView using getUserMedia + OpenCV.js.

   Pipeline per analyzed frame:
     downsample → grayscale → Gaussian blur → Canny → findContours
     → approxPolyDP (keep 4-vertex polygons) → pick largest area
     → score (area, brightness, focus, stability)
     → coach message + colour reflects the worst-scoring axis
     → auto-capture once the score holds above the threshold for ~600ms

   Capture path: pull a fresh full-res frame from the video, run
   getPerspectiveTransform + warpPerspective with the detected corners
   to deskew, encode JPEG @ 90, return base64. Output is shape- and
   size-compatible with the ML Kit plugin so downstream OCR is unchanged.
   ============================================================ */

let _cvReady = null;
function ensureOpenCV() {
  if (window.cv && window.cv.Mat) return Promise.resolve(window.cv);
  if (_cvReady) return _cvReady;
  _cvReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/opencv.js";
    script.async = true;
    script.onerror = () => { _cvReady = null; reject(new Error("opencv-load-failed")); };
    script.onload = () => {
      // OpenCV.js exposes `cv` as a global Module. It's not ready until
      // the underlying WASM has booted. Older builds expose
      // `cv.onRuntimeInitialized`; recent builds resolve `cv` itself
      // once initialised. Poll cheaply — booting takes ~1–3 s on mid
      // Android, the user is already looking at the camera preview.
      const start = Date.now();
      const tick = () => {
        if (window.cv && window.cv.Mat) return resolve(window.cv);
        if (Date.now() - start > 15000) {
          _cvReady = null;
          return reject(new Error("opencv-init-timeout"));
        }
        setTimeout(tick, 60);
      };
      tick();
    };
    document.head.appendChild(script);
  });
  return _cvReady;
}

// Order 4 corners as TL, TR, BR, BL — needed for getPerspectiveTransform
// because the destination quad is given in that fixed order.
function _orderCorners(pts) {
  // pts is [{x,y}, ...] (4 points)
  // TL = min(x+y), BR = max(x+y), TR = min(y-x), BL = max(y-x).
  let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
  let tlS = Infinity, brS = -Infinity, trS = Infinity, blS = -Infinity;
  for (const p of pts) {
    const s = p.x + p.y;
    const d = p.y - p.x;
    if (s < tlS) { tl = p; tlS = s; }
    if (s > brS) { br = p; brS = s; }
    if (d < trS) { tr = p; trS = d; }
    if (d > blS) { bl = p; blS = d; }
  }
  return [tl, tr, br, bl];
}

// Detect the largest 4-corner contour in a downsampled frame and
// score how "good" the framing is. Returns null if nothing usable.
function _detectDocument(cv, srcMat, frameW, frameH) {
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestPolyXY = null, bestArea = 0;

  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    // Canny thresholds are forgiving — we approxPolyDP downstream so
    // edge noise gets folded into the dominant rectangle anyway.
    cv.Canny(blur, edges, 50, 150);
    // Dilate slightly so broken edges from glossy paper still close.
    const k = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, k);
    k.delete();

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const minArea = frameW * frameH * 0.12; // doc must cover ≥ 12% of the frame

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < minArea || area < bestArea) { c.delete(); continue; }

      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const pts = [];
        for (let r = 0; r < 4; r++) {
          pts.push({ x: approx.data32S[r * 2], y: approx.data32S[r * 2 + 1] });
        }
        bestPolyXY = pts;
        bestArea = area;
      }
      approx.delete();
      c.delete();
    }
  } finally {
    gray.delete();
    blur.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }

  if (!bestPolyXY) return null;
  return { corners: _orderCorners(bestPolyXY), area: bestArea };
}

// Brightness + focus on a downsampled grayscale Mat. Cheap (one pass).
function _measureFrame(cv, srcMat) {
  const gray = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    const focus = stddev.doubleAt(0, 0); // higher = sharper
    cv.meanStdDev(gray, mean, stddev);
    const brightness = mean.doubleAt(0, 0);
    return { brightness, focus };
  } finally {
    gray.delete();
    lap.delete();
    mean.delete();
    stddev.delete();
  }
}

// Compute Euclidean distance between two corner sets (averaged) — used
// to detect whether the doc is "stable" enough to auto-capture.
function _cornerDelta(a, b) {
  if (!a || !b) return Infinity;
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / 4;
}

// Captures a fresh frame from the video element and warps it using the
// detected corners. Corners are in downsampled coordinates — we scale
// them up to the video's natural dimensions before warping.
function _captureWithCorners(cv, video, corners, scale) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const tmp = document.createElement("canvas");
  tmp.width = vw; tmp.height = vh;
  tmp.getContext("2d").drawImage(video, 0, 0, vw, vh);
  const src = cv.imread(tmp);
  const tl = { x: corners[0].x * scale, y: corners[0].y * scale };
  const tr = { x: corners[1].x * scale, y: corners[1].y * scale };
  const br = { x: corners[2].x * scale, y: corners[2].y * scale };
  const bl = { x: corners[3].x * scale, y: corners[3].y * scale };
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const W = Math.max(50, Math.round(Math.max(wTop, wBot)));
  const H = Math.max(50, Math.round(Math.max(hLeft, hRight)));
  const srcArr = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstArr = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
  const M = cv.getPerspectiveTransform(srcArr, dstArr);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(src, out, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    const outCanvas = document.createElement("canvas");
    outCanvas.width = W; outCanvas.height = H;
    cv.imshow(outCanvas, out);
    const dataUrl = outCanvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    return { base64, format: "jpeg" };
  } finally {
    src.delete();
    out.delete();
    M.delete();
    srcArr.delete();
    dstArr.delete();
  }
}

// Captures the current full-resolution frame without any warp — used
// when the user taps the manual capture button without a stable
// detection.
function _captureRaw(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const c = document.createElement("canvas");
  c.width = vw; c.height = vh;
  c.getContext("2d").drawImage(video, 0, 0, vw, vh);
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  return { base64: dataUrl.split(",")[1], format: "jpeg" };
}

async function customDocumentScan() {
  const overlay = document.getElementById("cv-scanner");
  const video = overlay.querySelector("video");
  const canvas = overlay.querySelector("canvas");
  const coach = overlay.querySelector(".cv-scanner-coach");
  const coachText = overlay.querySelector(".cv-coach-text");
  const cancelBtn = overlay.querySelector(".cv-scanner-cancel");
  const captureBtn = overlay.querySelector(".cv-scanner-capture");
  const fallbackBtn = overlay.querySelector(".cv-scanner-fallback");
  const loading = overlay.querySelector(".cv-scanner-loading");

  // Show overlay with loading state immediately — OpenCV booting + camera
  // permission can take a couple of seconds, the user needs feedback.
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  loading.style.display = "flex";
  coach.dataset.state = "searching";
  coachText.textContent = "Recherche d'un document…";

  // Camera stream (back camera, prefer high res — we downsample for
  // analysis but warp at full res so the OCR sees crisp text).
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (e) {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    throw new Error("camera-denied:" + (e?.message || ""));
  }
  video.srcObject = stream;
  await new Promise((res) => {
    if (video.readyState >= 2) res();
    else video.onloadedmetadata = () => res();
  });
  await video.play().catch(() => {});

  // Boot OpenCV. We do this *after* the camera is up so the preview is
  // already showing while wasm parses. ~10 MB script: 1–3 s on Android.
  let cv;
  try {
    cv = await ensureOpenCV();
  } catch (e) {
    // OpenCV failed: cleanup and bubble — captureTicketPhoto will fall
    // back to ML Kit.
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    throw new Error("opencv-failed:" + (e?.message || ""));
  }
  loading.style.display = "none";

  return new Promise((resolve, reject) => {
    // Analysis canvas (offscreen, downsampled) — keeps the per-frame
    // cost well under one display frame on mid-range Android.
    const work = document.createElement("canvas");
    let lastCorners = null;
    let stableSince = 0;
    let raf = 0;
    let ticking = true;
    let processing = false;
    let lastAnalysis = 0;

    const cleanup = () => {
      ticking = false;
      cancelAnimationFrame(raf);
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      video.srcObject = null;
      // Clear overlay canvas so the next session starts blank.
      const ctx = canvas.getContext("2d");
      ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      cancelBtn.onclick = null;
      captureBtn.onclick = null;
      fallbackBtn.onclick = null;
    };

    const finishWith = (result) => { cleanup(); resolve(result); };
    const finishCancel = (reason) => { cleanup(); reject(new Error(reason)); };

    cancelBtn.onclick = () => finishCancel("cancelled");
    fallbackBtn.onclick = () => finishCancel("fallback-mlkit");
    captureBtn.onclick = () => {
      try {
        if (lastCorners) {
          const vw = video.videoWidth || 1;
          const scale = vw / (work.width || vw);
          finishWith(_captureWithCorners(cv, video, lastCorners, scale));
        } else {
          finishWith(_captureRaw(video));
        }
      } catch (e) {
        finishCancel("capture-error:" + (e?.message || ""));
      }
    };

    const setCoach = (state, text) => {
      coach.dataset.state = state;
      coachText.textContent = text;
    };

    // Match the overlay canvas to the video's display size so we can draw
    // the detected quad in the same coordinate space the user sees.
    const fitOverlayCanvas = () => {
      const r = video.getBoundingClientRect();
      canvas.width = Math.round(r.width);
      canvas.height = Math.round(r.height);
    };
    fitOverlayCanvas();
    window.addEventListener("resize", fitOverlayCanvas);

    const drawQuad = (corners, ok) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!corners) return;
      // Map corners from work-canvas coords to overlay-canvas coords.
      const sx = canvas.width / (work.width || canvas.width);
      const sy = canvas.height / (work.height || canvas.height);
      ctx.beginPath();
      ctx.moveTo(corners[0].x * sx, corners[0].y * sy);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x * sx, corners[i].y * sy);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ok ? "rgba(16, 185, 129, 0.95)" : "rgba(255, 255, 255, 0.85)";
      ctx.stroke();
      ctx.fillStyle = ok ? "rgba(16, 185, 129, 0.18)" : "rgba(255, 255, 255, 0.06)";
      ctx.fill();
    };

    const tick = () => {
      if (!ticking) return;
      raf = requestAnimationFrame(tick);
      // Cap analysis at ~12 fps — plenty for coaching, leaves CPU
      // headroom for the WebView to paint smoothly.
      const now = performance.now();
      if (processing || now - lastAnalysis < 80) return;
      lastAnalysis = now;
      processing = true;

      try {
        if (video.readyState < 2 || !video.videoWidth) return;
        const targetW = 480;
        const scale = targetW / video.videoWidth;
        const targetH = Math.max(1, Math.round(video.videoHeight * scale));
        if (work.width !== targetW || work.height !== targetH) {
          work.width = targetW; work.height = targetH;
        }
        const ctx = work.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const src = cv.imread(work);

        let corners = null, area = 0;
        let brightness = 128, focus = 0;
        try {
          const det = _detectDocument(cv, src, targetW, targetH);
          if (det) { corners = det.corners; area = det.area; }
          const meas = _measureFrame(cv, src);
          brightness = meas.brightness;
          focus = meas.focus;
        } finally {
          src.delete();
        }

        // Score & coach — pick the worst axis as the message.
        let state = "searching";
        let text = "Recherche d'un document…";
        let okForCapture = false;

        if (!corners) {
          state = "searching";
          text = "Recherche d'un document…";
        } else {
          const coverage = area / (targetW * targetH);
          const delta = _cornerDelta(corners, lastCorners);
          if (coverage < 0.22) {
            state = "bad";
            text = "Rapprochez-vous";
          } else if (brightness < 60) {
            state = "bad";
            text = "Trop sombre — éclairez la scène";
          } else if (brightness > 235) {
            state = "bad";
            text = "Trop lumineux — évitez les reflets";
          } else if (focus < 60) {
            state = "bad";
            text = "Image floue — tenez stable";
          } else if (delta > 18) {
            state = "bad";
            text = "Tenez stable…";
          } else {
            state = "ready";
            text = "Document détecté";
            okForCapture = true;
          }
        }

        if (okForCapture) {
          if (stableSince === 0) stableSince = now;
          const held = now - stableSince;
          if (held > 200) state = "capturing";
          if (held > 600) {
            // Auto-capture.
            try {
              const vw = video.videoWidth || 1;
              const upscale = vw / targetW;
              finishWith(_captureWithCorners(cv, video, corners, upscale));
            } catch (e) {
              finishCancel("capture-error:" + (e?.message || ""));
            }
            return;
          }
        } else {
          stableSince = 0;
        }

        lastCorners = corners;
        setCoach(state, state === "capturing" ? "Capture en cours" : text);
        drawQuad(corners, state === "ready" || state === "capturing");
      } catch (e) {
        // Per-frame errors are non-fatal — keep ticking. Surface only
        // if it persists.
        // console.warn("cv-tick:", e);
      } finally {
        processing = false;
      }
    };
    tick();
  });
}

async function captureTicketPhoto(source) {
  try {
    // Show pre-scan tips on the first scan of the session. The user can
    // tap Plus tard to skip, in which case we still abort — they should
    // ack at least once.
    if (source === "camera") {
      const ok = await showScanTips();
      if (!ok) return;
    }

    let captured = null;
    let qualityWarning = null;
    let qualityMetrics = null;

    // Camera source uses ML Kit Document Scanner: live capture guide with edge detection,
    // back camera enforced, manual corner-adjust step, perspective correction, plus our
    // OCR enhancement on the cropped output. We pull the per-scan quality
    // metrics so we can BLOCK low-quality uploads and ask for a retake.
    if (source === "camera" && Capacitor.getPlatform() === "android") {
      try {
        startScanLiveCoach();
        const scan = await DocumentScanner.scan({ pageLimit: 1, galleryImport: false });
        if (scan?.base64) {
          captured = { base64: scan.base64, format: scan.format || "jpeg" };
          qualityWarning = scan.qualityWarning || null;
          qualityMetrics = {
            blurScore: scan.blurScore,
            brightness: scan.brightness,
            contrast: scan.contrast,
          };
        }
      } catch (scanErr) {
        const msg = String(scanErr?.message || scanErr || "");
        if (/cancel/i.test(msg)) { stopScanLiveCoach(); return; }
        console.warn("Document scanner unavailable, falling back to plain camera:", scanErr);
      } finally {
        stopScanLiveCoach();
      }
    }

    // Fallback (gallery picker, or scanner unavailable): plain Capacitor Camera.
    if (!captured) {
      const photo = await Camera.getPhoto({
        quality: 88,
        resultType: CameraResultType.Base64,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        width: 1800,
        correctOrientation: true,
      });
      if (!photo?.base64String) return;
      captured = { base64: photo.base64String, format: photo.format || "jpeg" };
    }

    state.capturedImage = captured;

    openScanModal();
    const previewImg = document.getElementById("capture-preview");
    previewImg.src = `data:image/${captured.format};base64,${captured.base64}`;
    document.getElementById("scan-step-preview").style.display = "block";

    // No post-capture blocking — guidance is delivered BEFORE the photo
    // (pre-scan tips overlay + live coaching banner). Whatever the user
    // captured, we upload it.
    uploadTicket();
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!/cancel/i.test(msg)) console.error("captureTicketPhoto:", err);
  }
}

/**
 * Pre-scan tips overlay — shown EVERY time the user starts a scan so the
 * guidance is constant, not one-and-done. Returns a Promise<boolean>:
 * true → continue to scanner, false → user backed out.
 */
function showScanTips() {
  return new Promise((resolve) => {
    const modal = document.getElementById("scan-tips-modal");
    const ok = document.getElementById("scan-tips-continue");
    const cancel = document.getElementById("scan-tips-cancel");
    if (!modal || !ok || !cancel) { resolve(true); return; }
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      modal.style.display = "none";
      document.body.style.overflow = "";
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(v);
    };
    const onOk = () => settle(true);
    const onCancel = () => settle(false);
    const onBackdrop = (e) => { if (e.target === modal) settle(false); };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}

/**
 * Live coaching banner shown while the native scanner is launching and
 * (briefly) after capture. Rotates 4 short French phrases on a 2-second
 * cadence — the user gets the feeling of being guided in real time even
 * though the actual ML Kit camera UI isn't ours to instrument.
 */
const _SCAN_LIVE_TIPS = [
  "Posez le document sur une surface contrastée…",
  "Cadrez avec une marge — n'oubliez aucun coin…",
  "Bonne lumière, sans reflet ni ombre…",
  "Tenez le téléphone stable — coudes appuyés…",
];
let _scanLiveTimer = null;
function startScanLiveCoach() {
  const banner = document.getElementById("scan-live-coach");
  if (!banner) return;
  banner.style.display = "flex";
  let i = 0;
  const text = banner.querySelector(".scan-live-coach-text");
  if (text) text.textContent = _SCAN_LIVE_TIPS[0];
  if (_scanLiveTimer) clearInterval(_scanLiveTimer);
  _scanLiveTimer = setInterval(() => {
    i = (i + 1) % _SCAN_LIVE_TIPS.length;
    if (text) text.textContent = _SCAN_LIVE_TIPS[i];
  }, 2200);
}
function stopScanLiveCoach() {
  if (_scanLiveTimer) { clearInterval(_scanLiveTimer); _scanLiveTimer = null; }
  const banner = document.getElementById("scan-live-coach");
  if (banner) banner.style.display = "none";
}

async function uploadTicket() {
  if (!state.capturedImage || state.uploading) return;
  if (!state.token || !state.orgId) {
    showTicketError("Session expiree, veuillez vous reconnecter");
    await doLogout();
    return;
  }
  state.uploading = true;

  document.getElementById("scan-step-preview").style.display = "block";
  document.getElementById("analyzing-overlay").style.display = "flex";
  document.getElementById("ticket-result").style.display = "none";
  document.getElementById("scan-error").style.display = "none";

  try {
    const fileName = `doc_${Date.now()}.${state.capturedImage.format}`;
    const contentType = state.capturedImage.format === "png" ? "image/png" : "image/jpeg";
    const byteChars = atob(state.capturedImage.base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: contentType });

    // Step 1: Classify via /api/documents/classify — returns { classification: { section },
    // extraction, optional croppedImage (base64 if photo cleaner ran) }.
    const classifyForm = new FormData();
    classifyForm.append("organizationId", state.orgId);
    classifyForm.append("file", blob, fileName);

    let classifyData = {};
    let classifyOk = false;
    let classifyStatus = 0;
    try {
      const classifyRes = await fetch(`${API_BASE_URL}/api/documents/classify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: classifyForm,
      });
      classifyOk = classifyRes.ok;
      classifyStatus = classifyRes.status;
      classifyData = await classifyRes.json().catch(() => ({}));
    } catch (e) {
      console.warn("classify exception, falling back to ticket:", e?.message || e);
    }

    if (classifyStatus === 401) {
      showTicketError("Session expiree, veuillez vous reconnecter");
      await doLogout();
      return;
    }

    const section = (classifyOk && classifyData?.classification?.section) || "ticket";
    const extraction = (classifyOk && classifyData?.extraction) || [];

    // Prefer the cropped/cleaned image returned by /classify when available — it's
    // already photo-cleaner-processed for OCR.
    let saveBlob = blob;
    let saveFileName = fileName;
    if (classifyOk && classifyData?.croppedImage) {
      try {
        const cb = atob(classifyData.croppedImage);
        const arr = new Uint8Array(cb.length);
        for (let i = 0; i < cb.length; i++) arr[i] = cb.charCodeAt(i);
        const ct = classifyData.croppedContentType || "image/png";
        saveBlob = new Blob([arr], { type: ct });
        saveFileName = classifyData.croppedFileName || fileName;
      } catch (_) { /* keep original */ }
    }

    // Step 2: Route to the correct collection.
    if (section === "facture" || section === "facture_fournisseur") {
      await saveAsSupplierInvoice(saveBlob, saveFileName, extraction);
    } else {
      // ticket / recu / receipt / anything else → existing receipt flow
      await saveAsTicketOnServer(saveBlob, saveFileName);
    }
  } catch (err) {
    console.error("uploadTicket: exception", err);
    document.getElementById("analyzing-overlay").style.display = "none";
    document.getElementById("scan-step-preview").style.display = "none";
    showTicketError("Erreur de connexion: " + (err.message || err));
  } finally {
    state.uploading = false;
  }
}

async function saveAsTicketOnServer(blob, fileName) {
  const formData = new FormData();
  formData.append("organizationId", state.orgId);
  formData.append("file", blob, fileName);
  const res = await fetch(`${API_BASE_URL}/api/tickets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  document.getElementById("analyzing-overlay").style.display = "none";
  document.getElementById("scan-step-preview").style.display = "none";

  if (res.status === 401) { showTicketError("Session expiree"); await doLogout(); return; }
  if (res.ok && data?.ticket) {
    showTicketResult(data);
  } else {
    showTicketError(data?.error || "Erreur lors de l'analyse");
  }
}

async function saveAsSupplierInvoice(blob, fileName, extraction) {
  const formData = new FormData();
  formData.append("organizationId", state.orgId);
  formData.append("file", blob, fileName);
  if (Array.isArray(extraction) && extraction.length) {
    // The server accepts a pre-extracted payload to skip a redundant extract call.
    try { formData.append("extraction", JSON.stringify(extraction[0])); } catch (_) {}
  }
  const res = await fetch(`${API_BASE_URL}/api/supplier-invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  document.getElementById("analyzing-overlay").style.display = "none";
  document.getElementById("scan-step-preview").style.display = "none";

  if (res.status === 401) { showTicketError("Session expiree"); await doLogout(); return; }
  if (res.ok && (data?.invoice || data?.id)) {
    // Mobile-scanned supplier invoices represent expenses the user has already paid
    // (they're keeping the invoice as proof, not waiting to settle it). Mark the doc
    // as paid so it shows up correctly under Dépenses and not under "À payer".
    const invId = data.invoice?.id || data.id;
    if (invId) {
      try {
        await apiFetch(`/api/supplier-invoices/${invId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "Payée", paymentStatus: "Payée" }),
          headers: { "Content-Type": "application/json" },
        });
        if (data.invoice) {
          data.invoice.status = "Payée";
          data.invoice.paymentStatus = "Payée";
        }
      } catch (_) { /* PATCH best-effort */ }
    }
    showSupplierInvoiceResult(data);
  } else {
    showTicketError(data?.error || "Erreur lors de l'enregistrement de la facture");
  }
}

function showSupplierInvoiceResult(data) {
  const inv = data.invoice || data;
  const details = document.getElementById("result-details");
  const title = document.querySelector("#ticket-result .result-title");
  if (title) title.textContent = "Facture fournisseur enregistrée";

  let html = `<div class="result-doctype">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
    Facture fournisseur
  </div>`;
  const supplierName = inv.supplier?.name || inv.supplier || inv.title || "";
  if (supplierName) html += resultRow("Fournisseur", supplierName);
  if (inv.amountCents != null) html += resultRow("Montant TTC", formatAmount(inv.amountCents, inv.currency || "MAD"));
  if (inv.dueDate) html += resultRow("Echéance", formatDate(inv.dueDate));
  if (inv.status) html += resultRow("Statut", inv.status);
  details.innerHTML = html;

  // Wire the "back" button to land on the supplier-invoices list instead of tickets.
  const backBtn = document.getElementById("btn-new-ticket");
  if (backBtn) {
    backBtn.textContent = "Voir les factures fournisseurs";
    backBtn.onclick = () => {
      closeScanModal();
      switchDirTab("supplier-invoices");
    };
  }
  document.getElementById("ticket-result").style.display = "block";
}

function showTicketResult(data) {
  const t = data.ticket;
  const details = document.getElementById("result-details");

  // Reset title + back button (could've been overridden by showSupplierInvoiceResult)
  const title = document.querySelector("#ticket-result .result-title");
  if (title) title.textContent = "Reçu enregistré";
  const backBtn = document.getElementById("btn-new-ticket");
  if (backBtn) {
    backBtn.textContent = "Retour à l'historique";
    backBtn.onclick = null; // restore the original listener bound in init
  }

  let html = `<div class="result-doctype result-doctype-receipt">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4"/><path d="M2 15v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
    Reçu / Ticket
  </div>`;
  if (t.beneficiaire) html += resultRow("Beneficiaire", t.beneficiaire);
  if (t.amountHtCents != null) html += resultRow("Montant HT", formatAmount(t.amountHtCents, t.currency || "MAD"));
  if (t.tauxTva != null) html += resultRow("Taux TVA", t.tauxTva + "%");
  if (t.montantTvaCents != null) html += resultRow("Montant TVA", formatAmount(t.montantTvaCents, t.currency || "MAD"));
  if (t.amountCents != null) html += resultRow("Total TTC", formatAmount(t.amountCents, t.currency || "MAD"));
  if (t.paymentDate) html += resultRow("Date", formatDate(t.paymentDate));
  if (t.identifiant) html += resultRow("Identifiant", t.identifiant);

  if (data.matchedTransaction) {
    html += `<div class="result-match"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Rapproche avec une transaction</div>`;
  }

  details.innerHTML = html;
  document.getElementById("ticket-result").style.display = "block";
  loadHistory();
}

function showTicketError(msg) {
  document.getElementById("scan-error-msg").textContent = msg;
  document.getElementById("scan-error").style.display = "block";
}

/* ============================================================
   Receipts page (Sorties → Reçus) — rendering, multi-select, bulk
   share / delete. Kept in sync visually with the bank transactions
   page so the user is in one consistent design system.
   ============================================================ */

// In-memory store of the last-loaded ticket list so the bulk-action
// handlers don't need to refetch when sharing. Keyed by ticket id.
let _ticketsCache = new Map();

// Multi-select state — when true, rows render a checkbox + tap toggles
// selection instead of opening detail.
let _ticketSelectMode = false;
const _selectedTicketIds = new Set();

function _ticketAvatarInitial(name) {
  const n = String(name || "").trim();
  if (!n) return "?";
  const norm = n.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return norm.charAt(0).toUpperCase();
}

function _renderTicketRow(t) {
  const id = String(t._id || t.id || "");
  const name = t.beneficiaire || "Reçu";
  const amount = t.amountCents != null ? formatAmount(t.amountCents, t.currency || "MAD") : "-";
  const date = formatDate(t.paymentDate || t.createdAt);
  const matched = !!t.matchedTransactionId;
  const initial = _ticketAvatarInitial(name);
  const isSelected = _selectedTicketIds.has(id);
  // Logo priority (mirrors transactions row + bank account cards):
  //   1. t.logoUrl from /api/tickets — auth-protected
  //      `/api/classifier-logo?domain=…` path. We fetch via the bearer
  //      helper and swap a blob URL in place.
  //   2. t.classifier.logo_domain → public clearbit URL as a quick win
  //      while/if the auth path isn't available.
  //   3. Initial avatar.
  const authLogoPath = t.logoUrl || (t.classifier?.logoUrl && String(t.classifier.logoUrl).startsWith("/") ? t.classifier.logoUrl : null);
  const clearbitDomain = t.classifier?.logo_domain || null;
  const initialFallback = `<span class="rcp-avatar-initial" data-auth-logo-fallback>${escapeHtml(initial)}</span>`;
  let logoHtml;
  if (authLogoPath) {
    logoHtml = `<img data-auth-logo-path="${escapeHtml(String(authLogoPath))}" alt="" style="display:none" />${initialFallback}`;
  } else if (clearbitDomain) {
    // Clearbit is direct img-loadable (no auth) — show it immediately,
    // fall back to the initial via onerror if the merchant isn't there.
    logoHtml = `<img src="https://logo.clearbit.com/${escapeHtml(clearbitDomain)}" alt="" onerror="this.remove()" />${initialFallback.replace('data-auth-logo-fallback', '')}`;
  } else {
    logoHtml = initialFallback.replace('data-auth-logo-fallback', '');
  }
  const pill = matched
    ? `<span class="rcp-row-pill rcp-pill-matched"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>Rapproché</span>`
    : `<span class="rcp-row-pill rcp-pill-pending"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>En attente</span>`;
  return `<div class="rcp-row ${isSelected ? "is-selected" : ""}" data-ticket-id="${escapeHtml(id)}">
    <div class="rcp-checkbox" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="rcp-row-icon" style="background:#eef2ff;color:#4f46e5">${logoHtml}</div>
    <div class="rcp-row-body">
      <div class="rcp-row-line1">
        <span class="rcp-row-name">${escapeHtml(name)}</span>
        <span class="rcp-row-amount">${escapeHtml(amount)}</span>
      </div>
      <div class="rcp-row-line2">
        <span class="rcp-row-meta">${escapeHtml(date || "")}</span>
        ${pill}
      </div>
    </div>
  </div>`;
}

async function loadHistory() {
  if (!state.orgId) return;
  const container = document.getElementById("tickets-list");
  if (!container) return;

  try {
    const res = await apiFetch(`/api/tickets?organizationId=${state.orgId}`);
    if (!res.ok) {
      container.innerHTML = emptyState("", "Erreur de chargement");
      return;
    }
    const tickets = Array.isArray(res.data) ? res.data : res.data?.tickets || [];
    _ticketsCache = new Map(tickets.map((t) => [String(t._id || t.id || ""), t]));

    if (tickets.length === 0) {
      _selectedTicketIds.clear();
      _exitTicketSelectMode();
      container.innerHTML = `<div class="history-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <p>Aucun reçu pour le moment</p>
        <p style="font-size:12px">Scannez ou importez votre premier reçu</p></div>`;
      return;
    }

    const sorted = [...tickets].sort((a, b) => new Date(b.createdAt || b.paymentDate || 0) - new Date(a.createdAt || a.paymentDate || 0));

    // Group by day so the page reads like the bank transactions list.
    const groups = new Map();
    for (const t of sorted) {
      const raw = t.paymentDate || t.createdAt || null;
      const key = raw ? new Date(raw).toDateString() : "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    const dayLabel = (key) => {
      if (key === "—") return "Sans date";
      const dd = new Date(key);
      if (isNaN(dd.getTime())) return key;
      if (dd.toDateString() === today.toDateString()) return "Aujourd'hui";
      if (dd.toDateString() === yest.toDateString()) return "Hier";
      return dd.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
    };

    let html = "";
    for (const [key, list] of groups) {
      const dayCount = list.length;
      html += `<div class="tx-day-header">
        <span class="tx-day-label">${escapeHtml(dayLabel(key))}</span>
        <span class="tx-day-total">${dayCount} reçu${dayCount > 1 ? "s" : ""}</span>
      </div>`;
      html += list.map(_renderTicketRow).join("");
    }
    container.innerHTML = html;
    // Resolve any /api/classifier-logo or supplier-logo paths through
    // the bearer-aware fetch + blob URL swap. Same machinery used for
    // bank account cards and transaction rows; logos are cached so
    // rerenders don't re-hit the network.
    _hydrateAuthLogos(container);
    // Drop any selected ids that no longer exist on the page (e.g. after
    // a bulk delete + reload).
    for (const id of Array.from(_selectedTicketIds)) {
      if (!_ticketsCache.has(id)) _selectedTicketIds.delete(id);
    }
    _renderTicketsMultiBar();
  } catch (e) {
    console.error("loadHistory:", e);
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- Multi-select machinery for receipts ----- */

function _enterTicketSelectMode() {
  if (_ticketSelectMode) return;
  _ticketSelectMode = true;
  document.getElementById("dir-tab-tickets")?.classList.add("is-select-mode");
  document.querySelector(".tickets-main")?.classList.add("is-select-mode");
  _renderTicketsMultiBar();
}
function _exitTicketSelectMode() {
  if (!_ticketSelectMode) return;
  _ticketSelectMode = false;
  _selectedTicketIds.clear();
  document.getElementById("dir-tab-tickets")?.classList.remove("is-select-mode");
  document.querySelector(".tickets-main")?.classList.remove("is-select-mode");
  document.querySelectorAll("#tickets-list .rcp-row.is-selected").forEach((el) => el.classList.remove("is-selected"));
  _renderTicketsMultiBar();
}
function _selectAllTickets() {
  if (!_ticketSelectMode) _enterTicketSelectMode();
  // Toggle: if everything is already selected, clear; otherwise select all.
  const allIds = Array.from(_ticketsCache.keys());
  const allSelected = allIds.length > 0 && allIds.every((id) => _selectedTicketIds.has(id));
  if (allSelected) {
    _selectedTicketIds.clear();
    document.querySelectorAll("#tickets-list .rcp-row.is-selected").forEach((el) => el.classList.remove("is-selected"));
  } else {
    for (const id of allIds) _selectedTicketIds.add(id);
    document.querySelectorAll("#tickets-list .rcp-row").forEach((el) => {
      if (el.dataset.ticketId && _selectedTicketIds.has(el.dataset.ticketId)) el.classList.add("is-selected");
    });
  }
  _renderTicketsMultiBar();
}
function _toggleTicketSelectMode() {
  if (_ticketSelectMode) _exitTicketSelectMode();
  else _enterTicketSelectMode();
}
function _toggleTicketSelection(id, rowEl) {
  if (!_ticketSelectMode) return;
  if (_selectedTicketIds.has(id)) {
    _selectedTicketIds.delete(id);
    rowEl?.classList.remove("is-selected");
  } else {
    _selectedTicketIds.add(id);
    rowEl?.classList.add("is-selected");
  }
  _renderTicketsMultiBar();
}
function _renderTicketsMultiBar() {
  const bar = document.getElementById("tickets-multi-action-bar");
  const n = _selectedTicketIds.size;
  // Header count (in select-mode header)
  const headerNum = document.getElementById("tickets-select-count-num");
  const headerSuffix = document.getElementById("tickets-select-count-suffix");
  if (headerNum) headerNum.textContent = String(n);
  if (headerSuffix) headerSuffix.textContent = n > 1 ? "s" : "";
  if (!bar) return;
  if (!_ticketSelectMode) { bar.style.display = "none"; return; }
  bar.style.display = "inline-flex";
  document.getElementById("btn-tickets-multi-share")?.toggleAttribute("disabled", n === 0);
  document.getElementById("btn-tickets-multi-delete")?.toggleAttribute("disabled", n === 0);
}

async function _bulkDeleteSelectedTickets() {
  const ids = Array.from(_selectedTicketIds);
  if (ids.length === 0) return;
  if (!confirm(`Supprimer ${ids.length} reçu${ids.length > 1 ? "s" : ""} définitivement ?`)) return;
  let okCount = 0;
  for (const id of ids) {
    try {
      const res = await apiFetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (res.ok) okCount++;
    } catch (_) {}
  }
  showToast(okCount === ids.length
    ? `${okCount} reçu${okCount > 1 ? "s" : ""} supprimé${okCount > 1 ? "s" : ""}`
    : `${okCount} sur ${ids.length} supprimé${ids.length > 1 ? "s" : ""}`);
  invalidateDirDataCache?.();
  _exitTicketSelectMode();
  loadHistory();
}

async function _bulkShareSelectedTickets() {
  const ids = Array.from(_selectedTicketIds);
  if (ids.length === 0) return;
  // Native share via Capacitor Share when available, with text-fallback
  // for the WebView. We share a simple summary (merchant + amount + date)
  // because the receipt files live behind bearer auth and aren't directly
  // shareable as URLs without re-uploading. Future improvement: fetch the
  // bytes and share as files via the Capacitor Share files: API.
  const lines = ids.map((id) => {
    const t = _ticketsCache.get(id);
    if (!t) return null;
    const name = t.beneficiaire || "Reçu";
    const amount = t.amountCents != null ? formatAmount(t.amountCents, t.currency || "MAD") : "-";
    const date = formatDate(t.paymentDate || t.createdAt);
    return `• ${name} — ${amount}${date ? ` (${date})` : ""}`;
  }).filter(Boolean);
  const summary = `${ids.length} reçu${ids.length > 1 ? "s" : ""} Yfiten\n\n${lines.join("\n")}`;
  try {
    const SharePlugin = Capacitor?.Plugins?.Share;
    if (SharePlugin && typeof SharePlugin.share === "function") {
      await SharePlugin.share({
        title: "Reçus Yfiten",
        text: summary,
        dialogTitle: "Partager les reçus",
      });
    } else if (navigator.share) {
      await navigator.share({ title: "Reçus Yfiten", text: summary });
    } else {
      // No share API available — copy the summary to clipboard as a graceful fallback.
      await navigator.clipboard?.writeText(summary).catch(() => {});
      showToast("Résumé copié dans le presse-papier");
    }
  } catch (e) {
    if (!/cancel/i.test(String(e?.message || ""))) {
      showToast("Échec du partage");
    }
  }
}

/* ----- Speed-dial FAB on the receipts page ----- */
function _toggleTicketsFab() {
  const root = document.getElementById("tickets-fab-root");
  if (!root) return;
  const open = root.classList.toggle("is-open");
  document.getElementById("btn-tickets-fab")?.setAttribute("aria-expanded", open ? "true" : "false");
}
function _closeTicketsFab() {
  const root = document.getElementById("tickets-fab-root");
  if (!root) return;
  root.classList.remove("is-open");
  document.getElementById("btn-tickets-fab")?.setAttribute("aria-expanded", "false");
}

// Click delegation on the receipts list — covers both modes:
//   - Normal: tap → open ticket detail (preserves the existing navigation).
//   - Select: tap → toggle selection; long-press → enter select mode.
function _bindTicketListInteractions() {
  const list = document.getElementById("tickets-list");
  if (!list || list.dataset.bound) return;
  list.dataset.bound = "1";
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".rcp-row");
    if (!row || !row.dataset.ticketId) return;
    const id = row.dataset.ticketId;
    if (_ticketSelectMode) {
      _toggleTicketSelection(id, row);
    } else {
      showTicketDetail(id);
    }
  });
  // Long-press to enter select mode (≥ 450 ms hold). On Android the
  // contextmenu event fires nicely after a long-press; we also use a
  // touch timer for older webviews.
  list.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".rcp-row");
    if (!row || !row.dataset.ticketId) return;
    e.preventDefault();
    if (!_ticketSelectMode) _enterTicketSelectMode();
    _toggleTicketSelection(row.dataset.ticketId, row);
  });
}

/* ----- MORE MENU ----- */

function loadMoreMenu() {
  // Profile info already set in initDirigeantScreen
}

/* ----- CLIENTS ----- */

let _clientsState = { items: [], search: "" };

function renderClientsSummary(list) {
  const c = document.getElementById("clients-summary");
  if (!c) return;
  const withIce = list.filter(x => x.ice).length;
  const withEmail = list.filter(x => x.email).length;
  c.innerHTML = `
    <div class="inv-kpi inv-kpi-hero">
      <div class="inv-kpi-label">Portefeuille clients</div>
      <div class="inv-kpi-value">${list.length}</div>
      <div class="inv-kpi-sub">${list.length > 1 ? "clients enregistres" : "client enregistre"}</div>
    </div>
    <div class="inv-kpi-grid">
      <div class="inv-kpi inv-kpi-ok">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">Avec email</div>
          <div class="inv-kpi-sm-value">${withEmail}</div>
        </div>
      </div>
      <div class="inv-kpi inv-kpi-pending">
        <div class="inv-kpi-dot"></div>
        <div>
          <div class="inv-kpi-sm-label">Avec ICE</div>
          <div class="inv-kpi-sm-value">${withIce}</div>
        </div>
      </div>
    </div>`;
}

function renderClientsList() {
  const container = document.getElementById("clients-list");
  if (!container) return;
  const q = _clientsState.search.trim().toLowerCase();
  const list = _clientsState.items.filter(c => {
    if (!q) return true;
    const s = `${c.name || ""} ${c.companyName || ""} ${c.email || ""} ${c.phone || ""} ${c.ice || ""}`.toLowerCase();
    return s.includes(q);
  });

  if (_clientsState.items.length === 0) {
    container.innerHTML = `<div class="inv-empty">
      <div class="inv-empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div class="inv-empty-title">Aucun client</div>
      <div class="inv-empty-sub">Ajoutez votre premier client en appuyant sur le bouton ci-dessous.</div>
    </div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML = `<div class="inv-empty inv-empty-sm">
      <div class="inv-empty-title">Aucun resultat</div>
      <div class="inv-empty-sub">Aucun client ne correspond a votre recherche.</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const name = c.name || c.companyName || c.email || "Client";
    const initials = initialsFromName(name);
    const colors = avatarColorForName(name);
    const contact = c.email || c.phone || "Aucun contact";
    const ice = c.ice ? `ICE ${escapeHtml(c.ice)}` : "";
    return `<div class="inv-card">
      <div class="inv-card-stripe stripe-draft"></div>
      <div class="inv-card-body">
        <div class="inv-card-top">
          <div class="inv-avatar" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(initials)}</div>
          <div class="inv-card-head">
            <div class="inv-card-title">${escapeHtml(name)}</div>
            <div class="inv-card-sub">${escapeHtml(contact)}</div>
          </div>
        </div>
        ${ice || c.phone ? `<div class="inv-card-bot">
          ${c.phone ? `<span class="inv-due">${escapeHtml(c.phone)}</span>` : ""}
          ${ice ? `<span class="inv-due">${ice}</span>` : ""}
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
}

async function loadClients() {
  if (!state.orgId) return;
  const container = document.getElementById("clients-list");
  const summary = document.getElementById("clients-summary");
  container.innerHTML = loadingHtml();
  if (summary) summary.innerHTML = "";

  const searchInput = document.getElementById("clients-search");
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", (e) => {
      _clientsState.search = e.target.value;
      renderClientsList();
    });
  }

  try {
    const res = await apiFetch(`/api/pro-clients?organizationId=${state.orgId}`);
    if (!res.ok) { container.innerHTML = emptyState("", "Erreur de chargement"); return; }
    const clients = res.data?.clients || [];
    state.clientsCache = clients;
    _clientsState.items = clients;
    _clientsState.search = "";
    if (searchInput) searchInput.value = "";
    renderClientsSummary(clients);
    renderClientsList();
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- SUPPLIERS ----- */

async function loadSuppliers() {
  if (!state.orgId) return;
  const container = document.getElementById("suppliers-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/pro-suppliers?organizationId=${state.orgId}`);
    if (res.ok) {
      const suppliers = res.data?.suppliers || [];
      if (suppliers.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`, "Aucun fournisseur");
        return;
      }
      container.innerHTML = suppliers.map(s => {
        const name = s.name || s.companyName || "Fournisseur";
        const initials = name.split(" ").map(w => w.charAt(0)).join("").toUpperCase().slice(0, 2);
        return `<div class="list-item">
          <div class="directory-avatar">${escapeHtml(initials)}</div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(name)}</div>
            <div class="list-item-meta">${escapeHtml(s.email || s.phone || s.ice || "-")}</div>
          </div>
        </div>`;
      }).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- PRODUCTS ----- */

let _productsState = { items: [], filter: "all", search: "" };

function renderProductsSummary(list) {
  const c = document.getElementById("products-summary");
  if (!c) return;
  const prods = list.filter(i => i._type === "product").length;
  const svcs = list.filter(i => i._type === "service").length;
  c.innerHTML = `
    <div class="inv-kpi inv-kpi-hero">
      <div class="inv-kpi-label">Catalogue</div>
      <div class="inv-kpi-value">${list.length}</div>
      <div class="inv-kpi-sub">article${list.length > 1 ? "s" : ""} enregistre${list.length > 1 ? "s" : ""}</div>
    </div>
    <div class="inv-kpi-grid">
      <div class="inv-kpi inv-kpi-ok">
        <div class="inv-kpi-dot" style="background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,0.15)"></div>
        <div>
          <div class="inv-kpi-sm-label">Produits</div>
          <div class="inv-kpi-sm-value">${prods}</div>
        </div>
      </div>
      <div class="inv-kpi inv-kpi-pending">
        <div class="inv-kpi-dot" style="background:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.15)"></div>
        <div>
          <div class="inv-kpi-sm-label">Services</div>
          <div class="inv-kpi-sm-value">${svcs}</div>
        </div>
      </div>
    </div>`;
}

function renderProductsFilters() {
  const counts = _productsState.items.reduce((acc, i) => {
    acc.all++;
    if (i._type === "service") acc.service++; else acc.product++;
    return acc;
  }, { all: 0, product: 0, service: 0 });
  const container = document.getElementById("products-filters");
  if (!container) return;
  const chip = (key, label) => `<button type="button" class="inv-chip-filter ${_productsState.filter === key ? "active" : ""}" data-filter="${key}">${label} <span class="chip-count">${counts[key]}</span></button>`;
  container.innerHTML = chip("all", "Tous") + chip("product", "Produits") + chip("service", "Services");
  container.querySelectorAll(".inv-chip-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      _productsState.filter = btn.getAttribute("data-filter");
      renderProductsFilters();
      renderProductsList();
    });
  });
}

function renderProductsList() {
  const container = document.getElementById("products-list");
  if (!container) return;
  const q = _productsState.search.trim().toLowerCase();
  const list = _productsState.items.filter(i => {
    if (_productsState.filter !== "all" && i._type !== _productsState.filter) return false;
    if (!q) return true;
    return `${i.name || ""} ${i.title || ""} ${i.description || ""}`.toLowerCase().includes(q);
  });

  if (_productsState.items.length === 0) {
    container.innerHTML = `<div class="inv-empty">
      <div class="inv-empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <div class="inv-empty-title">Aucun article</div>
      <div class="inv-empty-sub">Creez votre premier produit ou service en appuyant sur le bouton ci-dessous.</div>
    </div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML = `<div class="inv-empty inv-empty-sm">
      <div class="inv-empty-title">Aucun resultat</div>
      <div class="inv-empty-sub">Aucun article ne correspond a votre recherche.</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(item => {
    const name = item.name || item.title || "Article";
    const price = item.priceCents != null ? formatAmount(item.priceCents) : (item.price != null ? formatAmountDirect(item.price) : "-");
    const typeLabel = item._type === "service" ? "Service" : "Produit";
    const stripe = item._type === "service" ? "stripe-pending" : "stripe-paid";
    const iconBg = item._type === "service" ? "#ede9fe" : "#dcfce7";
    const iconFg = item._type === "service" ? "#7c3aed" : "#16a34a";
    const icon = item._type === "service"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;
    return `<div class="inv-card">
      <div class="inv-card-stripe ${stripe}"></div>
      <div class="inv-card-body">
        <div class="inv-card-top">
          <div class="inv-avatar" style="background:${iconBg};color:${iconFg}">${icon}</div>
          <div class="inv-card-head">
            <div class="inv-card-title">${escapeHtml(name)}</div>
            <div class="inv-card-sub">${escapeHtml(typeLabel)}${item.tvaRate != null ? ` · TVA ${item.tvaRate}%` : ""}${item.unit ? ` · ${escapeHtml(item.unit)}` : ""}</div>
          </div>
          <div class="inv-card-amount">${price}</div>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function loadProducts() {
  if (!state.orgId) return;
  const container = document.getElementById("products-list");
  const summary = document.getElementById("products-summary");
  const filters = document.getElementById("products-filters");
  container.innerHTML = loadingHtml();
  if (summary) summary.innerHTML = "";
  if (filters) filters.innerHTML = "";

  const searchInput = document.getElementById("products-search");
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", (e) => {
      _productsState.search = e.target.value;
      renderProductsList();
    });
  }

  try {
    const [prodRes, svcRes] = await Promise.allSettled([
      apiFetch(`/api/products?organizationId=${state.orgId}`),
      apiFetch(`/api/services?organizationId=${state.orgId}`),
    ]);
    const items = [];
    if (prodRes.status === "fulfilled" && prodRes.value.ok) {
      (prodRes.value.data?.products || []).forEach(p => items.push({ ...p, _type: "product" }));
    }
    if (svcRes.status === "fulfilled" && svcRes.value.ok) {
      (svcRes.value.data?.services || []).forEach(s => items.push({ ...s, _type: "service" }));
    }
    _productsState.items = items;
    _productsState.filter = "all";
    _productsState.search = "";
    if (searchInput) searchInput.value = "";
    renderProductsSummary(items);
    renderProductsFilters();
    renderProductsList();
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function initProductForm() {
  const form = document.getElementById("product-form");
  if (!form || form._bound) return;
  form._bound = true;
  const toggle = document.getElementById("product-type-toggle");
  let selectedType = "product";
  toggle?.querySelectorAll(".pro-toggle-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedType = btn.getAttribute("data-value");
      toggle.querySelectorAll(".pro-toggle-opt").forEach(b => b.classList.toggle("active", b === btn));
    });
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.orgId) return;
    const name = document.getElementById("product-name").value.trim();
    if (!name) { showToast("Nom requis"); return; }
    const price = parseFloat(document.getElementById("product-price").value || "0");
    const unitPriceCents = Math.round(price * 100);
    const vatRatePct = parseInt(document.getElementById("product-tva").value || "20", 10);
    const description = document.getElementById("product-description").value.trim();
    const unit = document.getElementById("product-unit").value.trim();
    const isService = selectedType === "service";
    const endpoint = isService ? "/api/services" : "/api/products";
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || (isService ? "srv" : "pro");
    const code = `${slug}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const payload = isService
      ? { organizationId: state.orgId, code, name, description, unitPriceCents, vatRatePct, billingUnit: unit }
      : { organizationId: state.orgId, code, name, description, unitPriceCents, vatRatePct, unit };
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Enregistrement..."; }
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Produit enregistre");
        form.reset();
        switchDirTab("products");
      } else {
        showToast(res.data?.error || "Erreur d'enregistrement");
      }
    } catch (e) {
      showToast("Erreur de connexion");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Enregistrer le produit"; }
    }
  });
}

/* ----- COLLABORATORS ----- */

async function loadCollaborators() {
  if (!state.orgId) return;
  const container = document.getElementById("collaborators-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/directory?organizationId=${state.orgId}`);
    const collabs = res.ok ? (res.data?.collaborators || []) : [];

    if (collabs.length === 0) {
      // Try organization-members endpoint as fallback
      const membersRes = await apiFetch(`/api/organization-members?organizationId=${state.orgId}`);
      const members = membersRes.ok ? (membersRes.data?.members || membersRes.data?.collaborators || []) : [];
      if (members.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`, "Aucun collaborateur");
        return;
      }
      renderCollaborators(container, members);
      return;
    }
    renderCollaborators(container, collabs);
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function renderCollaborators(container, collabs) {
  container.innerHTML = collabs.map(c => {
    const name = c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email;
    const initials = ((c.firstName?.charAt(0) || "") + (c.lastName?.charAt(0) || "")).toUpperCase() || name.charAt(0).toUpperCase();
    const isActive = c.employmentStatus === "active" || c.status === "active";
    return `<div class="list-item directory-item">
      <div class="directory-avatar">${escapeHtml(initials)}</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(name)}</div>
        <div class="list-item-meta">${escapeHtml(c.jobTitle || c.department || c.email || "-")}</div>
      </div>
      <span class="status-dot ${isActive ? "active" : "departed"}"></span>
    </div>`;
  }).join("");
}

/* ----- PAYSLIPS MANAGE ----- */

async function loadPayslipsManage() {
  if (!state.orgId) return;
  const container = document.getElementById("payslips-manage-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/payslips?organizationId=${state.orgId}`);
    if (res.ok) {
      const payslips = (res.data?.payslips || []).sort((a, b) => (b.period || "").localeCompare(a.period || ""));
      if (payslips.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`, "Aucun bulletin de paie");
        return;
      }
      container.innerHTML = payslips.map(p => {
        const name = p.collaboratorName || p.employeeName || formatPeriod(p.period);
        return `<div class="list-item">
          <div class="list-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(name)}</div>
            <div class="list-item-meta">${escapeHtml(formatPeriod(p.period))} ${statusBadge(p.status)}</div>
          </div>
          <div class="list-item-amount">${formatAmount(p.netAmountCents)}</div>
        </div>`;
      }).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- LEAVES MANAGE ----- */

async function loadLeavesManage() {
  if (!state.orgId) return;
  const container = document.getElementById("leaves-manage-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/holiday-requests?organizationId=${state.orgId}`);
    if (res.ok) {
      const requests = (res.data?.requests || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (requests.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/></svg>`, "Aucune demande de conge");
        return;
      }
      container.innerHTML = requests.map(r => {
        const name = r.employeeName || r.collaboratorName || r.userName || leaveTypeLabel(r.type);
        return `<div class="list-item">
          <div class="list-item-icon" style="background:var(--amber-50);color:var(--amber-600)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(name)}</div>
            <div class="list-item-meta">${formatDate(r.startDate)} - ${formatDate(r.endDate)}${r.totalDays ? ` <span class="meta-dot"></span> ${r.totalDays}j` : ""}</div>
            <div class="list-item-meta">${statusBadge(r.status)}</div>
          </div>
        </div>`;
      }).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- EXPENSE NOTES (Dirigeant) ----- */

async function loadExpenseNotes() {
  if (!state.orgId) return;
  const container = document.getElementById("expense-notes-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/expense-notes?organizationId=${state.orgId}`);
    if (res.ok) {
      const notes = (res.data?.notes || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (notes.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`, "Aucune note de frais");
        return;
      }
      container.innerHTML = notes.map(n => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--red-50);color:var(--red-600)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(n.title || n.employeeName || "Note de frais")}</div>
            <div class="list-item-meta">${formatDate(n.date || n.createdAt)} ${statusBadge(n.status)}</div>
          </div>
          <div class="list-item-amount">${formatAmountDirect(n.amount, n.currency || "MAD")}</div>
        </div>
      `).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- LEGAL DOCS ----- */

async function loadLegalDocs() {
  if (!state.orgId) return;
  const container = document.getElementById("legal-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/legal-documents?organizationId=${state.orgId}`);
    if (res.ok) {
      const docs = res.data?.documents || res.data?.legalDocuments || [];
      if (docs.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`, "Aucun document juridique");
        return;
      }
      container.innerHTML = docs.map(d => `
        <div class="list-item">
          <div class="list-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(d.name || d.title || "Document")}</div>
            <div class="list-item-meta">${escapeHtml(d.type || d.category || "")} <span class="meta-dot"></span> ${formatDate(d.createdAt)}</div>
          </div>
        </div>
      `).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ----- TREASURY ----- */

async function loadTreasury() {
  if (!state.orgId) return;
  const container = document.getElementById("treasury-list");
  container.innerHTML = loadingHtml();

  try {
    // Build treasury from bank + invoices + tickets data
    const [bankRes, invRes, ticketsRes] = await Promise.allSettled([
      apiFetch(`/api/pro-accounts?organizationId=${state.orgId}`),
      apiFetch(`/api/client-invoices?organizationId=${state.orgId}`),
      apiFetch(`/api/tickets?organizationId=${state.orgId}`),
    ]);

    let bankBalance = 0;
    if (bankRes.status === "fulfilled" && bankRes.value.ok) {
      if (bankRes.value.data?.totalBalanceCents != null) {
        bankBalance = bankRes.value.data.totalBalanceCents;
      } else {
        const accounts = bankRes.value.data?.accounts || [];
        bankBalance = accounts.reduce((sum, a) => sum + (a.balanceCents || a.balance || 0), 0);
      }
    }

    let pendingIncome = 0;
    if (invRes.status === "fulfilled" && invRes.value.ok) {
      const invoices = invRes.value.data?.invoices || [];
      pendingIncome = invoices.filter(i => i.status === "sent" || i.status === "pending").reduce((sum, i) => sum + (i.totalTTC || i.amountCents || 0), 0);
    }

    let totalExpenses = 0;
    if (ticketsRes.status === "fulfilled" && ticketsRes.value.ok) {
      const tickets = ticketsRes.value.data?.tickets || (Array.isArray(ticketsRes.value.data) ? ticketsRes.value.data : []);
      totalExpenses = tickets.reduce((sum, t) => sum + (t.amountCents || 0), 0);
    }

    const balanceFormatted = bankBalance > 100 ? formatAmount(bankBalance) : formatAmountDirect(bankBalance);
    const incomeFormatted = pendingIncome > 100 ? formatAmount(pendingIncome) : formatAmountDirect(pendingIncome / 100);
    const expFormatted = formatAmount(totalExpenses);

    container.innerHTML = `
      <div class="treasury-card">
        <h4>Solde bancaire actuel</h4>
        <div class="treasury-value">${balanceFormatted}</div>
      </div>
      <div class="treasury-card">
        <h4>Revenus en attente</h4>
        <div class="treasury-value positive">${incomeFormatted}</div>
      </div>
      <div class="treasury-card">
        <h4>Total depenses (tickets)</h4>
        <div class="treasury-value negative">${expFormatted}</div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de chargement");
  }
}

/* ----- TVA REPORT ----- */

async function loadTvaReport() {
  if (!state.orgId) return;
  const container = document.getElementById("tva-report-content");
  container.innerHTML = loadingHtml();

  try {
    const [ticketsRes, invRes] = await Promise.allSettled([
      apiFetch(`/api/tickets?organizationId=${state.orgId}`),
      apiFetch(`/api/client-invoices?organizationId=${state.orgId}`),
    ]);

    let tvaCollected = 0, tvaDeductible = 0;
    let invoiceCount = 0, ticketCount = 0;

    if (invRes.status === "fulfilled" && invRes.value.ok) {
      const invoices = invRes.value.data?.invoices || [];
      invoiceCount = invoices.length;
      // amountCents from list API is totalTtcCents; approximate VAT as 20% of HT
      tvaCollected = invoices.reduce((sum, i) => {
        const ttc = i.amountCents || 0;
        // estimate HT = TTC / 1.2 (assuming avg 20% VAT)
        const ht = Math.round(ttc / 1.2);
        return sum + (ttc - ht);
      }, 0);
    }

    if (ticketsRes.status === "fulfilled" && ticketsRes.value.ok) {
      const tickets = ticketsRes.value.data?.tickets || (Array.isArray(ticketsRes.value.data) ? ticketsRes.value.data : []);
      ticketCount = tickets.length;
      tvaDeductible = tickets.reduce((sum, t) => sum + (t.montantTvaCents || 0), 0);
    }

    const netTva = tvaCollected - tvaDeductible;

    container.innerHTML = `
      <div class="info-card">
        <div class="info-card-header">
          <h3>Resume TVA</h3>
          <span class="info-card-period">Periode courante</span>
        </div>
        <div class="tva-grid">
          <div class="tva-item">
            <span class="tva-label">TVA collectee</span>
            <span class="tva-value positive">${formatAmount(tvaCollected)}</span>
            <span class="tva-sub">${invoiceCount} facture(s)</span>
          </div>
          <div class="tva-item">
            <span class="tva-label">TVA deductible</span>
            <span class="tva-value negative">${formatAmount(tvaDeductible)}</span>
            <span class="tva-sub">${ticketCount} recu(s)</span>
          </div>
        </div>
        <div class="tva-net">
          <span>TVA nette a payer</span>
          <span class="tva-net-value ${netTva >= 0 ? 'negative' : 'positive'}">${formatAmount(Math.abs(netTva))}</span>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de chargement");
  }
}

/* ----- TAX DECLARATIONS ----- */

async function loadTaxDeclarations() {
  if (!state.orgId) return;
  const container = document.getElementById("tax-declarations-content");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/tax-declarations?organizationId=${state.orgId}`);
    if (res.ok) {
      const declarations = res.data?.declarations || [];
      if (declarations.length === 0) {
        container.innerHTML = emptyState(
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
          "Aucune declaration fiscale"
        );
        return;
      }
      container.innerHTML = declarations.map(d => `
        <div class="list-card">
          <div class="list-card-icon bg-pink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
          <div class="list-card-info">
            <div class="list-card-title">${escapeHtml(d.name || d.type || 'Declaration')}</div>
            <div class="list-card-meta">${formatDate(d.createdAt || d.date)}</div>
          </div>
          <div class="list-card-badge">${d.status || ''}</div>
        </div>
      `).join("");
    } else {
      container.innerHTML = emptyState("", "Aucune declaration");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de chargement");
  }
}

/* ----- COLLECTE ----- */

async function loadCollecte() {
  if (!state.orgId) return;
  const container = document.getElementById("collecte-content");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/organizations/${state.orgId}`);
    const org = res.ok ? res.data : null;
    const collectionEmail = org?.collectionEmail || `recus+${state.orgId}@yfiten.com`;
    const invoiceEmail = org?.invoiceCollectionEmail || `factures+${state.orgId}@yfiten.com`;

    container.innerHTML = `
      <div class="info-card">
        <div class="info-card-header">
          <h3>Collecte par email</h3>
        </div>
        <p class="info-card-desc">Envoyez vos recus et factures par email pour les importer automatiquement.</p>
        <div class="collecte-email-row">
          <div class="collecte-email-label">Recus / Tickets</div>
          <div class="collecte-email-value">${escapeHtml(collectionEmail)}</div>
        </div>
        <div class="collecte-email-row">
          <div class="collecte-email-label">Factures fournisseurs</div>
          <div class="collecte-email-value">${escapeHtml(invoiceEmail)}</div>
        </div>
      </div>
      <div class="info-card" style="margin-top:12px">
        <div class="info-card-header">
          <h3>Collecte WhatsApp</h3>
        </div>
        <p class="info-card-desc">Envoyez vos photos de recus directement via WhatsApp pour les enregistrer automatiquement.</p>
      </div>
    `;
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de chargement");
  }
}

/* ----- INVOICE FORM ----- */

async function loadInvoiceForm() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  const dueStr = due.toISOString().split("T")[0];

  document.getElementById("invoice-date").value = todayStr;
  document.getElementById("invoice-due-date").value = dueStr;

  // Reset lines to one empty placeholder line (no `required` so adding a Product/Service
  // doesn't get blocked by the empty default; submit handler filters empty lines anyway)
  const linesContainer = document.getElementById("invoice-lines");
  linesContainer.innerHTML = `<div class="line-item line-item-default" data-index="0">
    <input type="text" placeholder="Description" class="line-desc" />
    <div class="line-numbers">
      <input type="number" placeholder="Qte" class="line-qty" min="1" value="1" />
      <input type="number" placeholder="Prix HT" class="line-price" step="0.01" />
      <select class="line-tva">
        <option value="0">0%</option>
        <option value="7">7%</option>
        <option value="10">10%</option>
        <option value="14">14%</option>
        <option value="20" selected>20%</option>
      </select>
    </div>
  </div>`;

  // Load clients for dropdown
  await populateClientDropdown("invoice-client");
  recalcInvoiceTotals("invoice");
}

async function loadQuoteForm() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const expiry = new Date(today);
  expiry.setDate(expiry.getDate() + 30);
  const expiryStr = expiry.toISOString().split("T")[0];

  document.getElementById("quote-date").value = todayStr;
  document.getElementById("quote-valid-until").value = expiryStr;

  // Reset lines to one empty placeholder line (no `required`; submit filters empties)
  const linesContainer = document.getElementById("quote-lines");
  linesContainer.innerHTML = `<div class="line-item line-item-default" data-index="0">
    <input type="text" placeholder="Description" class="line-desc" />
    <div class="line-numbers">
      <input type="number" placeholder="Qte" class="line-qty" min="1" value="1" />
      <input type="number" placeholder="Prix HT" class="line-price" step="0.01" />
      <select class="line-tva">
        <option value="0">0%</option>
        <option value="7">7%</option>
        <option value="10">10%</option>
        <option value="14">14%</option>
        <option value="20" selected>20%</option>
      </select>
    </div>
  </div>`;

  await populateClientDropdown("quote-client");
  recalcInvoiceTotals("quote");
}

async function populateClientDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  if (state.clientsCache.length === 0) {
    try {
      const res = await apiFetch(`/api/pro-clients?organizationId=${state.orgId}`);
      if (res.ok) state.clientsCache = res.data?.clients || [];
    } catch (e) {}
  }

  select.innerHTML = '<option value="">Selectionner un client...</option>' +
    state.clientsCache.map(c => {
      const id = c._id || c.id;
      const name = c.name || c.companyName || c.email;
      return `<option value="${id}">${escapeHtml(name)}</option>`;
    }).join("");
}

function recalcInvoiceTotals(prefix) {
  const container = document.getElementById(`${prefix}-lines`);
  if (!container) return;

  let totalHt = 0;
  let totalTva = 0;

  container.querySelectorAll(".line-item").forEach(line => {
    const qty = parseFloat(line.querySelector(".line-qty")?.value || "0") || 0;
    const price = parseFloat(line.querySelector(".line-price")?.value || "0") || 0;
    const tva = parseFloat(line.querySelector(".line-tva")?.value || "0") || 0;
    const ht = qty * price;
    totalHt += ht;
    totalTva += ht * (tva / 100);
  });

  if (document.getElementById(`${prefix}-total-ht`)) {
    document.getElementById(`${prefix}-total-ht`).textContent = totalHt.toFixed(2) + " MAD";
    document.getElementById(`${prefix}-total-tva`).textContent = totalTva.toFixed(2) + " MAD";
    document.getElementById(`${prefix}-total-ttc`).textContent = (totalHt + totalTva).toFixed(2) + " MAD";
  }
}

function addInvoiceLine(prefix, opts = {}) {
  const container = document.getElementById(`${prefix}-lines`);
  // If the only existing line is the default placeholder and it's untouched,
  // drop it so adding a Product/Service replaces it instead of stacking on top.
  const existingLines = container.querySelectorAll(".line-item");
  if (existingLines.length === 1) {
    const only = existingLines[0];
    const desc = only.querySelector(".line-desc")?.value.trim() || "";
    const price = only.querySelector(".line-price")?.value.trim() || "";
    if (only.classList.contains("line-item-default") && !desc && !price) {
      only.remove();
    }
  }
  const idx = container.querySelectorAll(".line-item").length;
  const title = opts.title || "";
  const qty = opts.quantity || 1;
  const price = opts.price != null ? opts.price : "";
  const vatPct = opts.vatRatePct != null ? opts.vatRatePct : 20;
  const productId = opts.productId || "";
  const serviceId = opts.serviceId || "";
  const sourceType = productId ? "product" : (serviceId ? "service" : "");
  const sourceLabel = productId ? "Produit" : (serviceId ? "Service" : "");
  const unit = opts.unit || "";

  const vatOptions = [0, 7, 10, 14, 20].map(v =>
    `<option value="${v}" ${v === vatPct ? "selected" : ""}>${v}%</option>`
  ).join("");

  const lineHtml = `<div class="line-item" data-index="${idx}" data-product-id="${productId}" data-service-id="${serviceId}">
    ${sourceType ? `<span class="line-source-badge ${sourceType}">${escapeHtml(sourceLabel)}${unit ? " - " + escapeHtml(unit) : ""}</span>` : ""}
    <div class="line-header">
      <input type="text" placeholder="Description" class="line-desc" value="${escapeHtml(title)}" />
      <button type="button" class="btn-remove-line" onclick="removeLine(this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="line-numbers">
      <input type="number" placeholder="Qte" class="line-qty" value="${qty}" step="1" min="1" />
      <input type="number" placeholder="Prix HT" class="line-price" step="0.01" value="${price}" />
      <select class="line-tva">${vatOptions}</select>
    </div>
  </div>`;
  container.insertAdjacentHTML("beforeend", lineHtml);
  recalcInvoiceTotals(prefix);
}

function removeLine(btn) {
  const lineItem = btn.closest(".line-item");
  const container = lineItem.closest(".line-items");
  lineItem.remove();
  // Determine prefix from container id (invoice-lines or quote-lines)
  const prefix = container.id.replace("-lines", "");
  recalcInvoiceTotals(prefix);
}

/* ----- Catalog Picker (Products & Services) ----- */

let catalogPickerState = { type: "", prefix: "", items: [] };

async function openCatalogPicker(type, prefix) {
  catalogPickerState = { type, prefix, items: [] };
  const modal = document.getElementById("catalog-picker-modal");
  const title = document.getElementById("catalog-picker-title");
  const list = document.getElementById("catalog-list");
  const search = document.getElementById("catalog-search");

  title.textContent = type === "product" ? "Produits" : "Services";
  search.value = "";
  list.innerHTML = loadingHtml();
  modal.style.display = "flex";

  try {
    const endpoint = type === "product"
      ? `/api/products?organizationId=${state.orgId}`
      : `/api/services?organizationId=${state.orgId}`;
    const res = await apiFetch(endpoint);
    if (res.ok) {
      const items = type === "product" ? (res.data?.products || []) : (res.data?.services || []);
      catalogPickerState.items = items;
      renderCatalogList(items);
    } else {
      list.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    list.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function renderCatalogList(items) {
  const list = document.getElementById("catalog-list");
  if (items.length === 0) {
    const label = catalogPickerState.type === "product" ? "Aucun produit" : "Aucun service";
    list.innerHTML = emptyState("", label);
    return;
  }
  list.innerHTML = items.map((item, i) => {
    const name = item.name || item.title || "Article";
    const priceCents = item.unitPriceCents || item.priceCents || 0;
    const priceDisplay = formatAmount(priceCents);
    const vatPct = item.vatRatePct != null ? item.vatRatePct : 20;
    const unit = item.unit || item.billingUnit || "";
    return `<div class="list-item list-item-tap" onclick="selectCatalogItem(${i})">
      <div class="list-item-icon" style="background:${catalogPickerState.type === "service" ? "var(--purple-50)" : "var(--green-50)"};color:${catalogPickerState.type === "service" ? "var(--purple-600)" : "var(--green-600)"}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(name)}</div>
        <div class="list-item-meta">TVA ${vatPct}%${unit ? " · " + escapeHtml(unit) : ""}</div>
      </div>
      <div class="list-item-amount">${priceDisplay}</div>
    </div>`;
  }).join("");
}

function selectCatalogItem(index) {
  const item = catalogPickerState.items[index];
  if (!item) return;
  const { type, prefix } = catalogPickerState;
  const id = item._id || item.id;
  const priceCents = item.unitPriceCents || item.priceCents || 0;
  const priceHt = priceCents / 100;
  const vatPct = item.vatRatePct != null ? item.vatRatePct : 20;
  const unit = item.unit || item.billingUnit || "";

  addInvoiceLine(prefix, {
    title: item.name || item.title || "",
    price: priceHt,
    quantity: 1,
    vatRatePct: vatPct,
    productId: type === "product" ? id : "",
    serviceId: type === "service" ? id : "",
    unit,
  });

  closeCatalogPicker();
}

function closeCatalogPicker() {
  document.getElementById("catalog-picker-modal").style.display = "none";
}

function filterCatalog() {
  const q = (document.getElementById("catalog-search")?.value || "").toLowerCase();
  if (!q) {
    renderCatalogList(catalogPickerState.items);
    return;
  }
  const filtered = catalogPickerState.items.filter(item => {
    const name = (item.name || item.title || "").toLowerCase();
    const code = (item.code || "").toLowerCase();
    return name.includes(q) || code.includes(q);
  });
  renderCatalogList(filtered);
}

/* ----- PDF Preview ----- */

async function previewInvoicePdf(docType) {
  const isInvoice = docType === "invoice";
  const prefix = isInvoice ? "invoice" : "quote";

  // Gather lines
  const lines = [];
  let lineIdx = 0;
  document.querySelectorAll(`#${prefix}-lines .line-item`).forEach(line => {
    const title = line.querySelector(".line-desc")?.value || "";
    const qty = parseFloat(line.querySelector(".line-qty")?.value || "1");
    const price = parseFloat(line.querySelector(".line-price")?.value || "0");
    const vatRate = parseFloat(line.querySelector(".line-tva")?.value || "20");
    if (title || price > 0) {
      lines.push({
        id: `line-${Date.now()}-${lineIdx++}`,
        title,
        unitPriceCents: Math.round(price * 100),
        quantity: qty,
        vatRatePct: vatRate,
        productId: line.dataset.productId || undefined,
        serviceId: line.dataset.serviceId || undefined,
      });
    }
  });

  if (lines.length === 0) {
    showToast("Ajoutez au moins une ligne");
    return;
  }

  const clientId = document.getElementById(`${prefix}-client`).value;
  if (!clientId) {
    showToast("Veuillez selectionner un client");
    return;
  }

  showToast("Generation du PDF...");

  const body = {
    organizationId: state.orgId,
    clientId,
    issueDate: document.getElementById(`${prefix}-date`).value,
    lines,
    currency: "MAD",
    status: isInvoice ? "Brouillon" : "En attente",
  };

  if (isInvoice) {
    body.dueDate = document.getElementById("invoice-due-date").value;
  } else {
    body.expiryDate = document.getElementById("quote-valid-until").value;
  }

  const desc = document.getElementById(`${prefix}-description`)?.value || "";
  if (desc) body.title = desc;

  try {
    const endpoint = isInvoice ? "/api/client-invoices/pdf" : "/api/client-quotes/pdf";
    const url = `${API_BASE_URL}${endpoint}`;
    const base64 = await postPdfAsBase64(url, state.token, body);
    if (!base64) { showToast("PDF vide"); return; }
    const fname = isInvoice ? "apercu_facture.pdf" : "apercu_devis.pdf";
    displayPdfBase64(base64, fname);
  } catch (e) {
    console.error("previewInvoicePdf error:", e);
    showToast("Erreur: " + (e.message || "connexion"));
  }
}

function closePdfPreview() {
  document.getElementById("pdf-preview-container").innerHTML = "";
  document.getElementById("pdf-preview-modal").style.display = "none";
  window._lastPdfBase64 = null;
  window._lastPdfFilename = null;
}

async function submitInvoice(e) {
  e.preventDefault();
  const btn = document.querySelector("#invoice-form button[type='submit']");
  setButtonLoading(btn, true);

  try {
    const lines = [];
    let lineIdx = 0;
    document.querySelectorAll("#invoice-lines .line-item").forEach(line => {
      const title = line.querySelector(".line-desc")?.value || "";
      const qty = parseFloat(line.querySelector(".line-qty")?.value || "1");
      const price = parseFloat(line.querySelector(".line-price")?.value || "0");
      const vatRate = parseFloat(line.querySelector(".line-tva")?.value || "20");
      if (title || price > 0) {
        lines.push({
          id: `line-${Date.now()}-${lineIdx++}`,
          title,
          unitPriceCents: Math.round(price * 100),
          quantity: qty,
          vatRatePct: vatRate,
        });
      }
    });

    if (lines.length === 0) {
      showToast("Ajoutez au moins une ligne");
      setButtonLoading(btn, false);
      return;
    }

    const clientId = document.getElementById("invoice-client").value;
    if (!clientId) {
      showToast("Veuillez selectionner un client");
      setButtonLoading(btn, false);
      return;
    }

    const issueDate = document.getElementById("invoice-date").value;
    const dueDate = document.getElementById("invoice-due-date").value;
    if (!issueDate || !dueDate) {
      showToast("Veuillez renseigner les dates");
      setButtonLoading(btn, false);
      return;
    }

    const desc = document.getElementById("invoice-description").value || "";
    const body = {
      organizationId: state.orgId,
      clientId,
      issueDate,
      dueDate,
      title: desc || undefined,
      lines,
      currency: "MAD",
      status: "Brouillon",
    };

    const res = await apiFetch("/api/client-invoices", { method: "POST", body });
    if (res.ok) {
      showToast("Facture creee avec succes");
      document.getElementById("invoice-form").reset();
      switchDirTab("invoices");
    } else {
      showToast(res.data?.error || "Erreur lors de la creation");
    }
  } catch (err) {
    showToast("Erreur de connexion");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function submitQuote(e) {
  e.preventDefault();
  const btn = document.querySelector("#quote-form button[type='submit']");
  setButtonLoading(btn, true);

  try {
    const lines = [];
    let lineIdx = 0;
    document.querySelectorAll("#quote-lines .line-item").forEach(line => {
      const title = line.querySelector(".line-desc")?.value || "";
      const qty = parseFloat(line.querySelector(".line-qty")?.value || "1");
      const price = parseFloat(line.querySelector(".line-price")?.value || "0");
      const vatRate = parseFloat(line.querySelector(".line-tva")?.value || "20");
      if (title || price > 0) {
        lines.push({
          id: `line-${Date.now()}-${lineIdx++}`,
          title,
          unitPriceCents: Math.round(price * 100),
          quantity: qty,
          vatRatePct: vatRate,
        });
      }
    });

    if (lines.length === 0) {
      showToast("Ajoutez au moins une ligne");
      setButtonLoading(btn, false);
      return;
    }

    const clientId = document.getElementById("quote-client").value;
    if (!clientId) {
      showToast("Veuillez selectionner un client");
      setButtonLoading(btn, false);
      return;
    }

    const issueDate = document.getElementById("quote-date").value;
    const expiryDate = document.getElementById("quote-valid-until").value;
    if (!issueDate || !expiryDate) {
      showToast("Veuillez renseigner les dates");
      setButtonLoading(btn, false);
      return;
    }

    const desc = document.getElementById("quote-description").value || "";
    const body = {
      organizationId: state.orgId,
      clientId,
      issueDate,
      expiryDate,
      title: desc || undefined,
      lines,
      currency: "MAD",
      status: "En attente",
    };

    const res = await apiFetch("/api/client-quotes", { method: "POST", body });
    if (res.ok) {
      showToast("Devis cree avec succes");
      document.getElementById("quote-form").reset();
      switchDirTab("invoices");
    } else {
      showToast(res.data?.error || "Erreur lors de la creation");
    }
  } catch (err) {
    showToast("Erreur de connexion");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function submitClient(e) {
  e.preventDefault();
  const btn = document.querySelector("#client-form button[type='submit']");
  setButtonLoading(btn, true);

  try {
    const body = {
      organizationId: state.orgId,
      name: document.getElementById("client-name").value,
      email: document.getElementById("client-email").value || undefined,
      phone: document.getElementById("client-phone").value || undefined,
      ice: document.getElementById("client-ice").value || undefined,
      address: document.getElementById("client-address").value || undefined,
    };

    const res = await apiFetch("/api/pro-clients", { method: "POST", body });
    if (res.ok) {
      showToast("Client cree avec succes");
      state.clientsCache = [];
      document.getElementById("client-form").reset();
      switchDirTab("clients");
    } else {
      showToast(res.data?.error || "Erreur lors de la creation");
    }
  } catch (err) {
    showToast("Erreur de connexion");
  } finally {
    setButtonLoading(btn, false);
  }
}


/* ====================================================================
   NOTIFICATIONS
   ==================================================================== */

async function loadNotifications() {
  if (!state.orgId) return;
  const container = document.getElementById("notifications-list");
  container.innerHTML = loadingHtml();

  try {
    // Fetch both mobile and comment notifications
    const [mobileRes, commentRes] = await Promise.all([
      apiFetch("/api/notifications/mobile?limit=50"),
      apiFetch("/api/comment-notifications?limit=50"),
    ]);

    let allNotifs = [];

    if (mobileRes.ok) {
      (mobileRes.data?.notifications || []).forEach(n => {
        allNotifs.push({
          id: n.id,
          title: n.title,
          body: n.body,
          type: n.type,
          read: n.read,
          createdAt: n.createdAt,
        });
      });
    }

    if (commentRes.ok) {
      (commentRes.data?.notifications || []).forEach(n => {
        allNotifs.push({
          id: "c_" + n.id,
          title: n.authorName || "Commentaire",
          body: n.snippet || "Nouveau commentaire",
          type: "comment",
          read: n.read,
          createdAt: n.createdAt,
          entityType: n.entityType,
        });
      });
    }

    // Sort by date descending
    allNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalUnread = allNotifs.filter(n => !n.read).length;
    document.querySelectorAll("#notif-badge, .notif-badge").forEach(badge => {
      badge.textContent = totalUnread;
      badge.style.display = totalUnread > 0 ? "flex" : "none";
    });

    if (allNotifs.length === 0) {
      container.innerHTML = emptyState(
        `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
        "Aucune notification"
      );
      return;
    }

    const typeIcons = {
      comment: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      payslip: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20"/><path d="M7 13h3"/></svg>`,
      leave_request: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      leave_status: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>`,
      expense_submitted: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
      expense_paid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      profile_update: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      invitation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
    };

    const typeColors = {
      comment: "background:#eff6ff;color:#2563eb",
      payslip: "background:#ecfdf5;color:#16a34a",
      leave_request: "background:#fffbeb;color:#d97706",
      leave_status: "background:#f0fdf4;color:#16a34a",
      expense_submitted: "background:#fef2f2;color:#dc2626",
      expense_paid: "background:#ecfdf5;color:#16a34a",
      profile_update: "background:#f5f3ff;color:#7c3aed",
      invitation: "background:#eff6ff;color:#2563eb",
    };

    container.innerHTML = allNotifs.map(n => {
      const timeAgo = getTimeAgo(n.createdAt);
      const icon = typeIcons[n.type] || typeIcons.comment;
      const color = typeColors[n.type] || typeColors.comment;
      return `<div class="list-item notification-item ${n.read ? "" : "unread"}">
        <div class="list-item-icon" style="${color}">${icon}</div>
        <div class="list-item-content">
          <div class="list-item-title">${escapeHtml(n.title)}</div>
          <div class="list-item-meta">${escapeHtml(n.body)}</div>
          <div class="list-item-meta" style="color:var(--muted);font-size:11px">${timeAgo}</div>
        </div>
        ${n.read ? "" : '<div class="notif-dot"></div>'}
      </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function markNotificationsRead() {
  try {
    await Promise.all([
      apiFetch("/api/comment-notifications", { method: "PATCH", body: { action: "mark-all-read" } }),
      apiFetch("/api/notifications/mobile", { method: "PATCH", body: { action: "mark-all-read" } }),
    ]);
    document.querySelectorAll("#notif-badge, .notif-badge").forEach(badge => {
      badge.style.display = "none";
    });
  } catch (e) {}
}

/* ====================================================================
   PUSH / LOCAL NOTIFICATION POLLING
   ==================================================================== */

let _notifPollingTimer = null;
let _lastSeenNotifIds = new Set();
let _notifIdCounter = 1000;

async function initNotificationSystem() {
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      console.warn("[NOTIF] Permission denied");
      return;
    }

    // Create notification channel for Android 8+
    try {
      await LocalNotifications.createChannel({
        id: "yfiten_notifications",
        name: "Yfiten",
        description: "Notifications Yfiten",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
    } catch (chErr) {
      console.warn("[NOTIF] Channel creation skipped:", chErr);
    }

    // Listen for notification taps — go to notifications screen
    LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      switchDirTab("notifications");
    });

    console.log("[NOTIF] Local notifications initialized");
  } catch (e) {
    console.error("[NOTIF] Init error:", e);
  }
}

function startNotificationPolling() {
  if (_notifPollingTimer) return;
  // First check immediately
  checkForNewNotifications();
  // Then poll every 30 seconds
  _notifPollingTimer = setInterval(checkForNewNotifications, 30000);
  console.log("[NOTIF] Polling started (30s interval)");
}

function stopNotificationPolling() {
  if (_notifPollingTimer) {
    clearInterval(_notifPollingTimer);
    _notifPollingTimer = null;
  }
  _lastSeenNotifIds.clear();
}

async function checkForNewNotifications() {
  if (!state.token || !state.orgId) return;

  try {
    // Poll both mobile notifications AND comment notifications
    const [mobileRes, commentRes] = await Promise.all([
      apiFetch("/api/notifications/mobile?unreadOnly=1&limit=20"),
      apiFetch("/api/comment-notifications?unreadOnly=1&limit=20"),
    ]);

    let allNotifs = [];
    let totalUnread = 0;

    // Process mobile notifications (payslip, leave, expense, invitation, etc.)
    if (mobileRes.ok) {
      const mNotifs = (mobileRes.data?.notifications || []).map(n => ({
        ...n, source: "mobile"
      }));
      allNotifs.push(...mNotifs);
      totalUnread += mobileRes.data?.unreadCount || 0;
    }

    // Process comment notifications
    if (commentRes.ok) {
      const cNotifs = (commentRes.data?.notifications || []).map(n => ({
        id: n.id,
        type: "comment",
        title: n.authorName || "Commentaire",
        body: n.snippet || "Nouveau commentaire",
        read: n.read,
        createdAt: n.createdAt,
        source: "comment",
        entityType: n.entityType,
      }));
      allNotifs.push(...cNotifs);
      totalUnread += commentRes.data?.unreadCount || 0;
    }

    // Update badge on all notification badge elements
    document.querySelectorAll("#notif-badge, .notif-badge").forEach(badge => {
      badge.textContent = totalUnread;
      badge.style.display = totalUnread > 0 ? "flex" : "none";
    });

    // On first poll, just record existing IDs (don't spam old notifications)
    if (_lastSeenNotifIds.size === 0 && allNotifs.length > 0) {
      allNotifs.forEach(n => _lastSeenNotifIds.add(n.id));
      return;
    }

    // Find truly new notifications
    const newNotifs = allNotifs.filter(n => !_lastSeenNotifIds.has(n.id));

    if (newNotifs.length > 0) {
      // Update seen set
      allNotifs.forEach(n => _lastSeenNotifIds.add(n.id));

      // Show Android local notifications for each new one
      for (const n of newNotifs) {
        await showLocalNotification(n);
      }
    }
  } catch (e) {
    // Silent fail on polling
  }
}

async function showLocalNotification(notif) {
  try {
    const title = notif.title || "Yfiten";
    const body = notif.body || "Nouvelle notification";

    await LocalNotifications.schedule({
      notifications: [{
        title,
        body,
        id: _notifIdCounter++,
        schedule: { at: new Date(Date.now() + 100) },
        sound: "default",
        smallIcon: "ic_notification",
        largeIcon: "ic_notification",
        channelId: "yfiten_notifications",
        extra: {
          type: notif.type || "general",
          notifId: notif.id,
        },
      }],
    });
  } catch (e) {
    console.error("[NOTIF] Failed to show local notification:", e);
  }
}

/* ====================================================================
   MESSAGES / CONVERSATIONS
   ==================================================================== */

async function loadConversations() {
  if (!state.orgId) return;
  const container = document.getElementById("messages-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/conversations?organizationId=${state.orgId}`);
    if (res.ok) {
      const convos = res.data?.conversations || [];
      if (convos.length === 0) {
        container.innerHTML = emptyState(
          `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
          "Aucune conversation"
        );
        return;
      }

      container.innerHTML = convos.map(c => {
        const title = c.title || "Conversation";
        const subtitle = c.lastMessage || c.subtitle || "";
        const time = c.lastMessageAt ? getTimeAgo(c.lastMessageAt) : "";
        const unread = c.unreadCount || 0;
        const kindIcon = c.kind === "dm" ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>` :
          c.kind === "group" ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` :
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

        return `<div class="list-item conversation-item" data-convo-id="${c.id}" data-entity-type="${c.entityType || ""}" data-entity-id="${c.entityId || ""}">
          <div class="list-item-icon" style="background:var(--purple-50);color:var(--purple-600)">${kindIcon}</div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(title)}</div>
            <div class="list-item-meta" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(subtitle)}</div>
          </div>
          <div style="text-align:right">
            <div class="list-item-meta" style="font-size:11px">${time}</div>
            ${unread > 0 ? `<span class="convo-badge">${unread}</span>` : ""}
          </div>
        </div>`;
      }).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

/* ====================================================================
   DETAIL VIEWS
   ==================================================================== */

/* ============================================================
   Client invoice / quote detail helpers
   ============================================================ */

const FR_UNITS = ["zero","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"];
const FR_TENS = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante", 7: "soixante", 8: "quatre-vingt", 9: "quatre-vingt" };
const FR_CURRENCY = {
  MAD: { s: "dirham", p: "dirhams", cs: "centime", cp: "centimes" },
  EUR: { s: "euro", p: "euros", cs: "centime", cp: "centimes" },
  USD: { s: "dollar", p: "dollars", cs: "cent", cp: "cents" },
};

function frBelowHundred(n) {
  if (n < 20) return FR_UNITS[n];
  const t = Math.floor(n / 10), o = n % 10, base = FR_TENS[t] || "";
  if (t === 7 || t === 9) return t === 7 && o === 1 ? `${base} et onze` : `${base}-${FR_UNITS[10 + o]}`;
  if (o === 0) return t === 8 ? "quatre-vingts" : base;
  if (o === 1 && t !== 8) return `${base} et un`;
  return `${base}-${FR_UNITS[o]}`;
}
function frBelowThousand(n) {
  if (n < 100) return frBelowHundred(n);
  const h = Math.floor(n / 100), r = n % 100;
  const head = h === 1 ? "cent" : `${FR_UNITS[h]} cent${r === 0 ? "s" : ""}`;
  return r === 0 ? head : `${head} ${frBelowHundred(r)}`;
}
function frToWords(n) {
  if (n === 0) return "zero";
  const parts = [];
  const m = Math.floor(n / 1_000_000), t = Math.floor((n % 1_000_000) / 1000), r = n % 1000;
  if (m > 0) parts.push(m === 1 ? "un million" : `${frBelowThousand(m)} millions`);
  if (t > 0) parts.push(t === 1 ? "mille" : `${frBelowThousand(t)} mille`);
  if (r > 0) parts.push(frBelowThousand(r));
  return parts.join(" ");
}
function amountInWords(cents, currency = "MAD") {
  const code = String(currency || "MAD").toUpperCase();
  const w = FR_CURRENCY[code] || { s: code.toLowerCase(), p: code.toLowerCase(), cs: "centime", cp: "centimes" };
  const c = Math.max(0, Math.round(cents || 0));
  const whole = Math.floor(c / 100), centsPart = c % 100;
  const main = `${frToWords(whole)} ${whole === 1 ? w.s : w.p}`;
  const text = centsPart === 0 ? main : `${main} et ${frToWords(centsPart)} ${centsPart === 1 ? w.cs : w.cp}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function fetchPermanentShareUrl(kind, id) {
  try {
    const endpoint = kind === "invoice"
      ? `/api/client-invoices/${id}/permanent-link`
      : `/api/client-quotes/${id}/permanent-link`;
    const res = await apiFetch(endpoint);
    if (res.ok && res.data?.url) return res.data.url;
  } catch (e) { console.warn("permanent-link fetch failed", e); }
  return null;
}

async function renderQrCode(targetId, url) {
  if (!url) return;
  const el = document.getElementById(targetId);
  if (!el) return;
  try {
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 180, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
    el.innerHTML = svg;
  } catch (e) { console.warn("QR render failed", e); }
}

async function shareDocumentLink(url, title) {
  if (!url) { showToast("Lien indisponible"); return; }
  try {
    await Share.share({ title: title || "Document", text: title || "", url, dialogTitle: "Partager le lien" });
  } catch (e) {
    // Share.share rejects on user-cancel with a recognisable message; show a toast only for real errors.
    const msg = String(e?.message || e || "");
    if (msg && !/cancel|canceled|cancelled|abort/i.test(msg)) {
      console.warn("share failed", e);
      showToast("Partage indisponible");
    }
  }
}

async function copyLinkToClipboard(url) {
  if (!url) { showToast("Lien indisponible"); return; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Lien copie");
      return;
    }
  } catch (_) { /* fall through to execCommand */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(ok ? "Lien copie" : "Erreur de copie");
  } catch (e) { showToast("Erreur de copie"); }
}

function formatAddressBlock(entity) {
  if (!entity) return "";
  const lines = [];
  if (entity.addressLine1 || entity.address) lines.push(entity.addressLine1 || entity.address);
  if (entity.addressLine2) lines.push(entity.addressLine2);
  const cityLine = [entity.postalCode, entity.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (entity.country) lines.push(entity.country);
  return lines.map(l => escapeHtml(String(l))).join("<br/>");
}

function legalIdsBlock(entity) {
  if (!entity) return "";
  const rows = [];
  if (entity.ice) rows.push(`ICE : ${escapeHtml(entity.ice)}`);
  if (entity.ifNumber) rows.push(`IF : ${escapeHtml(entity.ifNumber)}`);
  if (entity.rc || entity.registrationNumber) rows.push(`RC : ${escapeHtml(entity.rc || entity.registrationNumber)}`);
  if (entity.siren) rows.push(`SIREN : ${escapeHtml(entity.siren)}`);
  if (entity.siret) rows.push(`SIRET : ${escapeHtml(entity.siret)}`);
  if (entity.vatNumber) rows.push(`TVA : ${escapeHtml(entity.vatNumber)}`);
  if (entity.patente) rows.push(`Patente : ${escapeHtml(entity.patente)}`);
  if (entity.cnss) rows.push(`CNSS : ${escapeHtml(entity.cnss)}`);
  return rows.length ? `<div class="party-legal">${rows.join("<br/>")}</div>` : "";
}

function documentStatusLabel(kind, status, isPaid) {
  const label = kind === "invoice" ? "Facture" : "Devis";
  return `${label}`;
}

async function showInvoiceDetail(invoiceId) {
  if (!invoiceId) return;
  switchDirTab("invoice-detail");
  const container = document.getElementById("invoice-detail-content");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/client-invoices/${invoiceId}`);
    if (!res.ok) { container.innerHTML = emptyState("", "Erreur de chargement"); return; }
    const inv = res.data?.invoice || res.data;
    const client = res.data?.client;
    const organization = res.data?.organization || state.organizations?.find(o => String(o._id) === String(state.orgId));
    container.innerHTML = renderDocumentDetail("invoice", inv, client, organization, invoiceId);
    const shareUrl = await fetchPermanentShareUrl("invoice", invoiceId);
    if (shareUrl) {
      window._lastShareUrl = shareUrl;
      await renderQrCode(`qr-${invoiceId}`, shareUrl);
      const caption = document.getElementById(`qr-caption-${invoiceId}`);
      if (caption) caption.style.display = "block";
      bindShareButtons(invoiceId, shareUrl);
    } else {
      const wrap = document.getElementById(`qr-wrap-${invoiceId}`);
      if (wrap) wrap.innerHTML = `<div class="qr-unavailable">Lien de partage indisponible</div>`;
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function renderInvoiceStatusSwitcher(invoiceId, currentStatus) {
  const opts = [
    { value: "Brouillon", label: "Brouillon" },
    { value: "À encaisser", label: "A encaisser" },
    { value: "Payée", label: "Payee" },
  ];
  return `<div class="inv-status-switcher">
    ${opts.map(o => `<button type="button" class="inv-status-opt${o.value === currentStatus ? " active" : ""}" data-invoice-id="${invoiceId}" data-status="${escapeHtml(o.value)}">${o.label}</button>`).join("")}
  </div>`;
}

async function setInvoiceStatus(invoiceId, newStatus) {
  if (!invoiceId || !newStatus) return;
  try {
    const res = await apiFetch(`/api/client-invoices/${invoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      showToast("Statut mis a jour");
      showInvoiceDetail(invoiceId);
    } else {
      showToast(res.data?.error || "Erreur de mise a jour");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

function bindShareButtons(id, url) {
  const wrap = document.getElementById(`qr-wrap-${id}`);
  const section = wrap?.closest(".inv-qr");
  if (!section) return;
  section.querySelectorAll(".btn-share-link, .btn-copy-link").forEach(btn => {
    btn.dataset.shareUrl = url;
    btn.disabled = false;
  });
}

async function showQuoteDetail(quoteId) {
  if (!quoteId) return;
  switchDirTab("quote-detail");
  const container = document.getElementById("quote-detail-content");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/client-quotes/${quoteId}`);
    if (!res.ok) { container.innerHTML = emptyState("", "Erreur de chargement"); return; }
    const q = res.data?.quote || res.data;
    const client = res.data?.client;
    const organization = res.data?.organization || state.organizations?.find(o => String(o._id) === String(state.orgId));
    container.innerHTML = renderDocumentDetail("quote", q, client, organization, quoteId);
    const shareUrl = await fetchPermanentShareUrl("quote", quoteId);
    if (shareUrl) {
      window._lastShareUrl = shareUrl;
      await renderQrCode(`qr-${quoteId}`, shareUrl);
      const caption = document.getElementById(`qr-caption-${quoteId}`);
      if (caption) caption.style.display = "block";
      bindShareButtons(quoteId, shareUrl);
    } else {
      const wrap = document.getElementById(`qr-wrap-${quoteId}`);
      if (wrap) wrap.innerHTML = `<div class="qr-unavailable">Lien de partage indisponible</div>`;
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function renderDocumentDetail(kind, doc, client, organization, id) {
  const isInvoice = kind === "invoice";
  const currency = doc.currency || organization?.currency || "MAD";
  const ref = doc.ref || "";
  const totalTtc = Number(doc.totalTtcCents ?? doc.amountCents ?? 0);
  const totalHt = Number(doc.totalHtCents ?? 0);
  const totalVat = Number(doc.totalVatCents ?? 0);
  const globalDiscountPct = Number(doc.globalDiscountPct ?? 0);
  const subtotalHt = globalDiscountPct > 0 ? Math.round(totalHt / (1 - globalDiscountPct / 100)) : totalHt;
  const items = Array.isArray(doc.lines) ? doc.lines : [];
  const isPaid = isInvoice && String(doc.status) === "Payée";
  const orgLegal = organization?.legal || organization || {};
  const orgName = organization?.name || orgLegal.name || "";
  const showAmountWords = doc.showAmountInWords !== false && totalTtc > 0;

  const pdfBtn = isInvoice ? "viewInvoicePdf" : "viewQuotePdf";
  const downloadBtn = isInvoice ? "downloadInvoicePdf" : "downloadQuotePdf";

  let html = `
    <div class="inv-doc">
      <div class="inv-hero">
        <div class="inv-hero-top">
          <div class="inv-type-badge">${isInvoice ? "FACTURE" : "DEVIS"}</div>
          ${statusBadge(doc.status)}
        </div>
        ${ref ? `<div class="inv-ref">${escapeHtml(ref)}</div>` : ""}
        ${doc.title ? `<div class="inv-title">${escapeHtml(doc.title)}</div>` : ""}
        <div class="inv-total-label">Montant total TTC</div>
        <div class="inv-total-amount">${formatAmount(totalTtc, currency)}</div>
        ${isPaid ? `<div class="inv-paid-pill"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> Payee</div>` : ""}
        ${isInvoice ? renderInvoiceStatusSwitcher(id, String(doc.status || "")) : ""}
      </div>

      <div class="inv-section inv-parties">
        <div class="inv-party">
          <div class="inv-party-label">Emise par</div>
          <div class="inv-party-name">${escapeHtml(String(orgName || "-").toUpperCase())}</div>
          ${formatAddressBlock(orgLegal) ? `<div class="party-address">${formatAddressBlock(orgLegal)}</div>` : ""}
          ${legalIdsBlock(orgLegal)}
        </div>
        <div class="inv-party-sep"></div>
        <div class="inv-party">
          <div class="inv-party-label">Facturee a</div>
          <div class="inv-party-name">${escapeHtml(client?.name || "Client")}</div>
          ${formatAddressBlock(client) ? `<div class="party-address">${formatAddressBlock(client)}</div>` : ""}
          ${legalIdsBlock(client)}
        </div>
      </div>

      <div class="inv-section inv-dates">
        <div class="inv-date-cell">
          <div class="inv-date-label">Date d'emission</div>
          <div class="inv-date-value">${formatDate(doc.issueDate)}</div>
        </div>
        ${isInvoice && doc.dueDate ? `<div class="inv-date-cell"><div class="inv-date-label">Echeance</div><div class="inv-date-value">${formatDate(doc.dueDate)}</div></div>` : ""}
        ${!isInvoice && doc.expiryDate ? `<div class="inv-date-cell"><div class="inv-date-label">Valable jusqu'au</div><div class="inv-date-value">${formatDate(doc.expiryDate)}</div></div>` : ""}
        ${doc.paymentDate ? `<div class="inv-date-cell"><div class="inv-date-label">Payee le</div><div class="inv-date-value">${formatDate(doc.paymentDate)}</div></div>` : ""}
      </div>`;

  if (items.length > 0) {
    html += `<div class="inv-section inv-items">
      <div class="inv-section-title">Designation (${items.length})</div>`;
    items.forEach((item) => {
      const qty = Number(item.quantity || 1);
      const unit = Number(item.unitPriceCents || 0);
      const vat = Number(item.vatRatePct || 0);
      const discPct = Number(item.discountPct || 0);
      const lineHt = Math.round(qty * unit * (1 - discPct / 100));
      html += `
        <div class="inv-item">
          <div class="inv-item-head">
            <div class="inv-item-title">${escapeHtml(item.title || item.description || "Article")}</div>
            <div class="inv-item-total">${formatAmount(lineHt, currency)}</div>
          </div>
          ${item.title && item.description ? `<div class="inv-item-desc">${escapeHtml(item.description)}</div>` : ""}
          <div class="inv-item-meta">
            <span>${qty}${item.unit ? " " + escapeHtml(item.unit) : ""} x ${formatAmount(unit, currency)}</span>
            ${vat > 0 ? `<span class="inv-chip">TVA ${vat}%</span>` : ""}
            ${discPct > 0 ? `<span class="inv-chip inv-chip-warn">-${discPct}%</span>` : ""}
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="inv-section inv-totals-box">
    ${globalDiscountPct > 0 ? `<div class="inv-total-row"><span>Sous-total HT</span><span>${formatAmount(subtotalHt, currency)}</span></div>
    <div class="inv-total-row inv-discount"><span>Remise (${globalDiscountPct}%)</span><span>-${formatAmount(subtotalHt - totalHt, currency)}</span></div>` : ""}
    <div class="inv-total-row"><span>Total HT</span><span>${formatAmount(totalHt, currency)}</span></div>
    <div class="inv-total-row"><span>Total TVA</span><span>${formatAmount(totalVat, currency)}</span></div>
    <div class="inv-total-row inv-total-grand"><span>Total TTC</span><span>${formatAmount(totalTtc, currency)}</span></div>
    ${showAmountWords ? `<div class="inv-total-words">${escapeHtml(amountInWords(totalTtc, currency))}</div>` : ""}
  </div>`;

  html += `<div class="inv-section inv-qr">
    <div class="inv-section-title">Lien de consultation</div>
    <div id="qr-wrap-${id}" class="inv-qr-frame">
      <div id="qr-${id}" class="inv-qr-code"><div class="qr-placeholder"><div class="spinner"></div></div></div>
    </div>
    <div id="qr-caption-${id}" class="inv-qr-caption" style="display:none">Scannez ce QR code pour consulter ${isInvoice ? "la facture" : "le devis"} en ligne</div>
    <div class="inv-qr-actions">
      <button type="button" class="btn-mini btn-share-link" data-doc-title="${isInvoice ? "Facture" : "Devis"} ${escapeHtml(ref)}" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Partager
      </button>
      <button type="button" class="btn-mini btn-copy-link" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copier
      </button>
    </div>
  </div>`;

  if (doc.showBankDetails !== false && doc.bankDetails) {
    html += `<div class="inv-section inv-notes">
      <div class="inv-section-title">Coordonnees bancaires</div>
      <div class="inv-note-body">${escapeHtml(doc.bankDetails).replace(/\n/g, "<br/>")}</div>
    </div>`;
  }
  if (doc.showPaymentConditions !== false && doc.footerNote) {
    html += `<div class="inv-section inv-notes">
      <div class="inv-section-title">Conditions de paiement</div>
      <div class="inv-note-body">${escapeHtml(doc.footerNote).replace(/\n/g, "<br/>")}</div>
    </div>`;
  }
  if (doc.paymentMode) {
    html += `<div class="inv-section inv-notes">
      <div class="inv-section-title">Mode de paiement</div>
      <div class="inv-note-body">${escapeHtml(doc.paymentMode)}</div>
    </div>`;
  }
  if (doc.showFreeField !== false && doc.freeField) {
    html += `<div class="inv-section inv-notes">
      <div class="inv-section-title">Note</div>
      <div class="inv-note-body">${escapeHtml(doc.freeField).replace(/\n/g, "<br/>")}</div>
    </div>`;
  }
  if (doc.showFooter !== false && doc.footerContent) {
    html += `<div class="inv-footer-text">${escapeHtml(doc.footerContent).replace(/\n/g, "<br/>")}</div>`;
  }

  html += `<div class="detail-actions">
    <button type="button" class="btn-action btn-action-primary" onclick="${pdfBtn}('${id}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <span>Voir le PDF</span>
    </button>
    <button type="button" class="btn-action btn-action-secondary" onclick="${downloadBtn}('${id}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Telecharger</span>
    </button>
    ${!isInvoice ? `<button type="button" class="btn-action btn-action-success" onclick="convertQuoteToInvoice('${id}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>Convertir en facture</span>
    </button>` : ""}
    <button type="button" class="btn-action btn-action-danger" onclick="${isInvoice ? "deleteInvoice" : "deleteQuote"}('${id}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      <span>Supprimer</span>
    </button>
  </div>
    </div>`;

  return html;
}

async function viewInvoicePdf(invoiceId) {
  await openPdfNative(`/api/client-invoices/${invoiceId}/pdf`, `facture_${invoiceId}.pdf`);
}

async function viewQuotePdf(quoteId) {
  await openPdfNative(`/api/client-quotes/${quoteId}/pdf`, `devis_${quoteId}.pdf`);
}

async function downloadInvoicePdf(invoiceId) {
  await openPdfNative(`/api/client-invoices/${invoiceId}/pdf?download=1`, `facture_${invoiceId}.pdf`);
}

async function downloadQuotePdf(quoteId) {
  await openPdfNative(`/api/client-quotes/${quoteId}/pdf?download=1`, `devis_${quoteId}.pdf`);
}

function fetchPdfAsBase64(url, token) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        const bytes = new Uint8Array(xhr.response);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        resolve(btoa(binary));
      } else {
        reject(new Error("HTTP " + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send();
  });
}

function postPdfAsBase64(url, token, bodyData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "arraybuffer";
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        const bytes = new Uint8Array(xhr.response);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        resolve(btoa(binary));
      } else {
        reject(new Error("HTTP " + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(JSON.stringify(bodyData));
  });
}

async function openPdfNative(apiPath, filename) {
  showToast("Chargement du PDF...");
  try {
    const url = `${API_BASE_URL}${apiPath}`;
    const base64 = await fetchPdfAsBase64(url, state.token);
    if (!base64) { showToast("PDF vide"); return; }
    displayPdfBase64(base64, filename);
  } catch (e) {
    console.error("openPdfNative error:", e);
    showToast("Erreur: " + (e.message || "connexion"));
  }
}

async function displayPdfBase64(base64, filename) {
  // Save PDF to device filesystem
  try {
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
  } catch (e) {
    console.error("writeFile error:", e);
  }

  window._lastPdfBase64 = base64;
  window._lastPdfFilename = filename;

  const modal = document.getElementById("pdf-preview-modal");
  const container = document.getElementById("pdf-preview-container");
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;background:#f5f5f5">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="1.5" style="margin-bottom:20px">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <path d="M9 15l2 2 4-4"/>
      </svg>
      <h3 style="margin:0 0 8px;font-size:18px;color:#333">PDF pret</h3>
      <p style="margin:0 0 24px;font-size:14px;color:#666">${escapeHtml(filename)}</p>
      <button onclick="openPdfFile()" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:#1a73e8;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:12px;cursor:pointer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Ouvrir le PDF
      </button>
      <button onclick="sharePdfFile()" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#fff;color:#333;border:1.5px solid #ddd;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Partager
      </button>
    </div>
  `;
  modal.style.display = "flex";
}

async function openPdfFile() {
  const filename = window._lastPdfFilename;
  if (!filename) return;
  try {
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });
    // Use Share to open with system PDF viewer
    await Share.share({
      title: filename,
      url: uriResult.uri,
      dialogTitle: "Ouvrir avec",
    });
  } catch (e) {
    console.error("openPdfFile error:", e);
    showToast("Erreur d'ouverture");
  }
}

async function sharePdfFile() {
  const filename = window._lastPdfFilename;
  if (!filename) return;
  try {
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });
    await Share.share({
      title: filename,
      url: uriResult.uri,
      dialogTitle: "Partager le PDF",
    });
  } catch (e) {
    console.error("sharePdfFile error:", e);
    showToast("Erreur de partage");
  }
}

async function deleteInvoice(invoiceId) {
  if (!confirm("Supprimer cette facture ?")) return;
  try {
    const res = await apiFetch(`/api/client-invoices/${invoiceId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Facture supprimee");
      switchDirTab("invoices");
    } else {
      showToast(res.data?.error || "Erreur de suppression");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

async function deleteQuote(quoteId) {
  if (!confirm("Supprimer ce devis ?")) return;
  try {
    const res = await apiFetch(`/api/client-quotes/${quoteId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Devis supprime");
      switchDirTab("invoices");
    } else {
      showToast(res.data?.error || "Erreur de suppression");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

async function convertQuoteToInvoice(quoteId) {
  if (!confirm("Convertir ce devis en facture ?")) return;
  try {
    const res = await apiFetch(`/api/client-quotes/${quoteId}/convert-to-invoice`, { method: "POST" });
    if (res.ok) {
      showToast("Devis converti en facture");
      switchDirTab("invoices");
    } else {
      showToast(res.data?.error || "Erreur de conversion");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

// Track blob URLs we create so we can revoke them when leaving the screen.
let _ticketImageObjectUrl = null;
function _disposeTicketImage() {
  if (_ticketImageObjectUrl) {
    try { URL.revokeObjectURL(_ticketImageObjectUrl); } catch (_) {}
    _ticketImageObjectUrl = null;
  }
}

async function fetchAuthenticatedImage(path) {
  // <img src> can't carry Authorization headers, so we fetch the bytes ourselves
  // and turn them into a blob URL the WebView is happy to render.
  try {
    const r = await fetch(`${API_BASE_URL}${path}`, {
      headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  } catch (_) {
    return null;
  }
}

async function showTicketDetail(ticketId) {
  if (!ticketId) return;
  _disposeTicketImage();
  switchDirTab("ticket-detail");
  const container = document.getElementById("ticket-detail-content");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/tickets/${ticketId}`);
    if (!res.ok) {
      container.innerHTML = emptyState("", "Erreur de chargement");
      return;
    }
    const t = res.data?.ticket || res.data;
    const currency = t.currency || "MAD";
    const total = t.amountCents != null ? formatAmount(t.amountCents, currency) : "-";
    const dateLabel = formatDate(t.paymentDate);
    const merchant = t.beneficiaire || "Reçu";
    const isMatched = !!t.matchedTransactionId;

    // Pre-load the receipt image as a blob URL so it actually shows up
    // (the API is bearer-auth protected; raw <img src> 401s without it).
    let blobUrl = null;
    if (t.documentFileId) {
      blobUrl = await fetchAuthenticatedImage(`/api/tickets/${ticketId}/document`);
      _ticketImageObjectUrl = blobUrl;
    }

    let html = `<div class="ticket-doc">`;

    // Receipt image hero (Conto-style: real photo as the centerpiece) ----
    if (blobUrl) {
      html += `<div class="rcp-photo-card" data-ticket-img="${escapeHtml(blobUrl)}">
        <img src="${escapeHtml(blobUrl)}" alt="Reçu" class="rcp-photo" />
        <div class="rcp-photo-overlay">
          <div class="rcp-photo-zoom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            Agrandir
          </div>
        </div>
      </div>`;
    } else if (t.documentFileId) {
      html += `<div class="rcp-photo-card rcp-photo-fallback">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span>Image indisponible</span>
      </div>`;
    }

    // Summary card: amount + merchant + date + match badge ----------------
    html += `<div class="rcp-summary">
      <div class="rcp-summary-amount">${total}</div>
      <div class="rcp-summary-merchant">${escapeHtml(merchant)}</div>
      <div class="rcp-summary-row">
        ${dateLabel ? `<span class="rcp-summary-chip">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${escapeHtml(dateLabel)}
        </span>` : ""}
        ${t.source ? `<span class="rcp-summary-chip rcp-chip-source">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
          ${escapeHtml(t.source)}
        </span>` : ""}
        <span class="rcp-summary-chip ${isMatched ? "rcp-chip-matched" : "rcp-chip-pending"}">
          ${isMatched ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`}
          ${isMatched ? "Rapproché" : "À rapprocher"}
        </span>
      </div>
    </div>`;

    // Détail des montants ------------------------------------------------
    const hasMontants = t.amountHtCents != null || t.tauxTva != null || t.montantTvaCents != null || t.amountCents != null;
    if (hasMontants) {
      html += `<div class="rcp-card">
        <div class="rcp-card-title">Détail des montants</div>
        <div class="rcp-rows">
          ${rcpRow("Montant HT", t.amountHtCents != null ? formatAmount(t.amountHtCents, currency) : null)}
          ${rcpRow("Taux TVA", t.tauxTva != null ? t.tauxTva + "%" : null)}
          ${rcpRow("Montant TVA", t.montantTvaCents != null ? formatAmount(t.montantTvaCents, currency) : null)}
          ${rcpRow("Total TTC", t.amountCents != null ? formatAmount(t.amountCents, currency) : null, "rcp-row-strong")}
        </div>
      </div>`;
    }

    // Identification -----------------------------------------------------
    if (t.identifiant || t.adresse) {
      html += `<div class="rcp-card">
        <div class="rcp-card-title">Identification</div>
        <div class="rcp-rows">
          ${rcpRow("Identifiant", t.identifiant)}
          ${rcpRow("Adresse", t.adresse)}
        </div>
      </div>`;
    }

    // Actions ------------------------------------------------------------
    html += `<div class="rcp-actions">
      ${blobUrl ? `<button type="button" class="rcp-btn rcp-btn-primary" data-ticket-share="${escapeHtml(blobUrl)}" data-ticket-share-title="Reçu ${escapeHtml(merchant)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Partager
      </button>` : ""}
      <button type="button" class="rcp-btn rcp-btn-danger" onclick="deleteTicket('${ticketId}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Supprimer
      </button>
    </div>`;

    // Discreet trace line at the bottom (replaces the Métadonnées card) ---
    const createdLabel = formatDate(t.createdAt);
    if (createdLabel || t.source) {
      const sourceLabel = t.source ? (t.source.toLowerCase() === "ocr" ? "OCR" : t.source) : "";
      const parts = [];
      if (sourceLabel) parts.push(`Importé via ${escapeHtml(sourceLabel)}`);
      if (createdLabel) parts.push(escapeHtml(createdLabel));
      html += `<div class="rcp-footnote">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${parts.join(" · ")}
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

function rcpRow(label, value, extraCls) {
  if (value == null || value === "") return "";
  return `<div class="rcp-row ${extraCls || ""}">
    <span class="rcp-row-label">${escapeHtml(label)}</span>
    <span class="rcp-row-value">${escapeHtml(String(value))}</span>
  </div>`;
}

function ticketField(label, value, extraCls) {
  if (value == null || value === "") return "";
  return `<div class="ticket-field ${extraCls || ""}">
    <div class="ticket-field-label">${escapeHtml(label)}</div>
    <div class="ticket-field-value">${escapeHtml(String(value))}</div>
  </div>`;
}

function openTicketLightbox(url) {
  if (!url) return;
  let lb = document.getElementById("ticket-image-lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "ticket-image-lightbox";
    lb.className = "image-lightbox";
    lb.innerHTML = `
      <button class="image-lightbox-close" type="button" aria-label="Fermer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="image-lightbox-inner">
        <img class="image-lightbox-img" alt="Reçu" />
      </div>`;
    document.body.appendChild(lb);
    lb.addEventListener("click", (e) => {
      if (e.target === lb || e.target.closest(".image-lightbox-close")) closeTicketLightbox();
    });
  }
  lb.querySelector(".image-lightbox-img").src = url;
  lb.classList.add("open");
  document.body.classList.add("lightbox-open");
}

function closeTicketLightbox() {
  const lb = document.getElementById("ticket-image-lightbox");
  if (lb) lb.classList.remove("open");
  document.body.classList.remove("lightbox-open");
}

async function shareTicketImage(url, title) {
  if (!url) return;
  try {
    await Share.share({
      title: title || "Reçu",
      url,
      dialogTitle: "Partager le reçu",
    });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg && !/cancel/i.test(msg)) showToast("Partage indisponible");
  }
}

async function deleteTicket(ticketId) {
  if (!confirm("Supprimer ce ticket ?")) return;
  try {
    const res = await apiFetch(`/api/tickets/${ticketId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Ticket supprime");
      switchDirTab("tickets");
    } else {
      showToast(res.data?.error || "Erreur de suppression");
    }
  } catch (e) {
    showToast("Erreur de connexion");
  }
}

/* ====================================================================
   SETTINGS
   ==================================================================== */

async function loadSettings() {
  const container = document.getElementById("settings-content");
  if (!container) return;

  const user = state.user || {};
  const orgName = state.organizations.find(o => (o._id || o.id) === state.orgId)?.name || "Organisation";

  let html = `
    <div class="section-card">
      <div class="section-card-header"><span>Profil</span></div>
      <div class="detail-rows">
        ${detailRow("Nom", user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim())}
        ${detailRow("Email", user.email)}
        ${detailRow("Role", "Dirigeant")}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><span>Organisation</span></div>
      <div class="detail-rows">
        ${detailRow("Nom", orgName)}
        ${detailRow("ID", state.orgId)}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><span>Application</span></div>
      <div class="detail-rows">
        ${detailRow("Version", "1.0.0")}
        ${detailRow("Plateforme", "Capacitor")}
        ${detailRow("Serveur", API_BASE_URL)}
      </div>
    </div>

    <button type="button" class="btn-submit btn-danger" style="margin-top:16px" onclick="doLogout()">
      Se deconnecter
    </button>
  `;

  container.innerHTML = html;
}

/* ====================================================================
   GLOBAL WINDOW BINDINGS (for onclick in innerHTML)
   ==================================================================== */

window.showInvoiceDetail = showInvoiceDetail;
window.showQuoteDetail = showQuoteDetail;
window.showTicketDetail = showTicketDetail;
window.downloadInvoicePdf = downloadInvoicePdf;
window.downloadQuotePdf = downloadQuotePdf;
window.deleteInvoice = deleteInvoice;
window.deleteQuote = deleteQuote;
window.convertQuoteToInvoice = convertQuoteToInvoice;
window.deleteTicket = deleteTicket;
window.doLogout = doLogout;
window.removeLine = removeLine;
window.selectCatalogItem = selectCatalogItem;
window.closeCatalogPicker = closeCatalogPicker;
window.viewInvoicePdf = viewInvoicePdf;
window.viewQuotePdf = viewQuotePdf;
window.openPdfFile = openPdfFile;
window.sharePdfFile = sharePdfFile;
window.shareDocumentLink = shareDocumentLink;
window.copyLinkToClipboard = copyLinkToClipboard;

/* ============================================================
   INIT & EVENT BINDING
   ============================================================ */

async function init() {
  console.log("INIT: starting...");
  // Cover the welcome screen synchronously so cold-boot — including the
  // post-process-death scan-recovery path on MIUI — never flashes the
  // welcome between page-load and the dashboard / scan modal opening.
  showAuthLoading("");
  try { await loadState(); } catch(e) { console.error("INIT loadState error:", e); }
  try {
    // Subsequent deeplinks (warm resume): the OS routes the URL through
    // appUrlOpen while the app is in memory.
    CapApp.addListener("appUrlOpen", (data) => {
      if (data?.url) handleGoogleDeepLink(data.url);
    });
    // Cold-start deeplinks: when Chrome Custom Tab finishes the OAuth
    // redirect, Android may LAUNCH a fresh instance of the app with the
    // deeplink as the launch intent. In that case appUrlOpen never fires
    // for the initial URL — we have to fetch it explicitly. Without this
    // call, "I select my Google account but the app doesn't enter" is
    // the exact symptom (token sits in the launch intent, never consumed).
    //
    // IMPORTANT: only process the launch URL when we're NOT already
    // logged in. Otherwise re-entering the app from any sub-activity
    // (Camera, DocumentScanner, Browser…) re-fires `getLaunchUrl()` with
    // the stale auth URL, races with in-flight API calls and can wipe
    // the session.
    try {
      if (!state.token) {
        const launch = await CapApp.getLaunchUrl();
        if (launch?.url) handleGoogleDeepLink(launch.url);
      }
    } catch (e) { console.error("getLaunchUrl error:", e); }
    // Also check on every resume — Capacitor sometimes delivers the
    // deeplink via a paused custom tab that returns when the app
    // foregrounds. Same guard: skip when we already have a token.
    CapApp.addListener("appStateChange", async (s) => {
      if (!s?.isActive) return;
      // Two independent recovery paths fire on resume:
      //  1) Google OAuth deeplink — only when we don't have a token yet.
      //  2) Pending scan from a process-death recovery — only when we DO
      //     have a token (otherwise the OCR upload would 401).
      if (!state.token) {
        try {
          const launch = await CapApp.getLaunchUrl();
          if (launch?.url) handleGoogleDeepLink(launch.url);
        } catch (_) {}
      } else {
        recoverPendingScan();
      }
    });
  } catch(e) { console.error("Deep link listener init:", e); }

  // Hardware back-button handling. Without this, Android's default behavior
  // either tries to navigate the WebView (breaking our SPA state and
  // stranding the user on stale pages) or exits the app immediately.
  // We pop the topmost open overlay first, then sub-screens, then exit.
  try {
    CapApp.addListener("backButton", () => {
      try {
        // 1) Justificatif viewer (full-screen overlay)
        const viewer = document.getElementById("justif-viewer");
        if (viewer && viewer.style.display !== "none" && viewer.style.display !== "") {
          closeJustificatifViewer();
          return;
        }
        // 2) Image lightbox (older receipt viewer)
        const lb = document.getElementById("ticket-image-lightbox");
        if (lb && lb.classList.contains("open")) {
          closeTicketLightbox();
          return;
        }
        // 3) Any modal-overlay currently shown
        const openModal = Array.from(document.querySelectorAll(".modal-overlay"))
          .reverse()
          .find(m => m.style.display && m.style.display !== "none");
        if (openModal) {
          openModal.style.display = "none";
          document.body.style.overflow = "";
          document.body.classList.remove("lightbox-open");
          return;
        }
        // 4) Sub-screens inside the dirigeant shell — fall back to the
        //    parent tab so the user doesn't get stuck on a hidden-nav page.
        const activeTab = document.querySelector("#screen-dirigeant .tab-content.active");
        if (activeTab && activeTab.classList.contains("sub-screen")) {
          const id = (activeTab.id || "").replace("dir-tab-", "");
          const parents = {
            "invoice-new": "invoices", "quote-new": "quotes", "client-new": "clients",
            "product-new": "products", "invoice-detail": "invoices", "quote-detail": "quotes",
            "ticket-detail": "tickets", "supplier-invoice-detail": "supplier-invoices",
            tickets: "sorties", "supplier-invoices": "sorties", "expense-notes": "sorties",
            suppliers: "sorties", invoices: "entrees", quotes: "entrees", clients: "entrees",
            products: "entrees", collaborators: "more", "payslips-manage": "more",
            "leaves-manage": "more", treasury: "more", "tva-report": "more",
            "tax-declarations": "more", legal: "more", collecte: "more",
            messages: "more", settings: "more", notifications: "dashboard",
          };
          switchDirTab(parents[id] || "dashboard");
          return;
        }
        // 5) Top-level tab — exit the app.
        CapApp.exitApp();
      } catch (e) {
        console.error("backButton handler:", e);
      }
    });
  } catch (e) { console.error("Back button listener init:", e); }

  // Safety reset: if the previous session left the body in a locked state
  // (overlay class, hidden overflow), clear it on every fresh start so the
  // user is never stranded.
  try {
    document.body.style.overflow = "";
    document.body.classList.remove("lightbox-open");
    document.querySelectorAll(".modal-overlay").forEach(m => {
      if (m.style.display && m.style.display !== "none") m.style.display = "none";
    });
    const viewer = document.getElementById("justif-viewer");
    if (viewer) viewer.style.display = "none";
  } catch (_) {}

  // ===== WELCOME SCREEN =====
  document.getElementById("btn-go-login")?.addEventListener("click", () => showScreen("screen-login"));
  // Helper: opening the register screen always resets to step 1 (profile
  // picker) with the right title/subtitle, no matter what state was left
  // behind from a previous session.
  const _openRegister = () => {
    document.getElementById("register-step-1").style.display = "block";
    document.getElementById("register-step-2").style.display = "none";
    const otpEl = document.getElementById("register-otp");
    if (otpEl) otpEl.style.display = "none";
    const successEl = document.getElementById("register-success");
    if (successEl) successEl.style.display = "none";
    const sub = document.getElementById("register-subtitle");
    if (sub) sub.textContent = "Pour qui est ce compte ?";
    document.querySelectorAll("#register-step-1 .profile-card").forEach(c => c.classList.remove("selected"));
    showScreen("screen-register");
  };
  document.getElementById("btn-go-register")?.addEventListener("click", _openRegister);
  document.getElementById("btn-back-welcome")?.addEventListener("click", () => showScreen("screen-welcome"));
  document.getElementById("btn-back-welcome-reg")?.addEventListener("click", () => showScreen("screen-welcome"));
  document.getElementById("link-to-register")?.addEventListener("click", (e) => { e.preventDefault(); _openRegister(); });
  document.getElementById("link-to-login")?.addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-login"); });
  document.getElementById("link-to-login-2")?.addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-login"); });
  document.getElementById("btn-back-to-welcome")?.addEventListener("click", () => showScreen("screen-welcome"));

  // Register - profile selection. Scope the listener to the register
  // screen ONLY so Google-onboarding profile cards don't accidentally
  // trigger the step-1 → step-2 advance.
  let selectedProfile = null;
  document.querySelectorAll("#register-step-1 .profile-card").forEach(card => {
    card.addEventListener("click", () => {
      // Salarié is not available yet — toast + stay on step 1.
      if (card.dataset.profile === "salarie" || card.classList.contains("profile-card-disabled")) {
        showToast("Bientôt disponible — l'espace Salarié arrive prochainement");
        return;
      }
      selectedProfile = card.dataset.profile;
      document.querySelectorAll("#register-step-1 .profile-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      // Advance to the form step.
      document.getElementById("register-step-1").style.display = "none";
      document.getElementById("register-step-2").style.display = "block";
      const sub = document.getElementById("register-subtitle");
      if (sub) sub.textContent = "Remplissez vos informations";
    });
  });

  // Holds the email + token of the freshly-registered account between
  // step-2 (form submit) and step-3 (OTP verification) so the OTP screen
  // knows where to send the verify request and what token to activate.
  const _pendingRegister = { email: "", token: "", user: null };

  // Register form submit
  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("register-btn");
    const errDiv = document.getElementById("register-error");
    const pw = document.getElementById("register-password").value;
    const pwc = document.getElementById("register-password-confirm").value;

    if (pw !== pwc) {
      errDiv.querySelector("span").textContent = "Les mots de passe ne correspondent pas";
      errDiv.style.display = "flex";
      return;
    }

    btn.querySelector(".btn-text").style.display = "none";
    btn.querySelector(".btn-loader").style.display = "inline-block";
    btn.disabled = true;
    errDiv.style.display = "none";

    const email = document.getElementById("register-email").value.trim();
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE_URL}/api/auth/register`,
        headers: { "Content-Type": "application/json" },
        data: {
          name: document.getElementById("register-firstname").value.trim() + " " + document.getElementById("register-lastname").value.trim(),
          email,
          password: pw,
          profile: selectedProfile || "entrepreneur",
        },
      });

      if (res.status >= 200 && res.status < 300) {
        // Server has emailed a 6-digit code. Stash the token (we'll save
        // it permanently AFTER the OTP is verified) and switch to the
        // OTP step.
        _pendingRegister.email = email;
        _pendingRegister.token = res.data?.token || "";
        _pendingRegister.user = res.data?.user || { email };

        document.getElementById("register-step-2").style.display = "none";
        document.getElementById("register-otp").style.display = "block";
        const targetEl = document.getElementById("otp-target-email");
        if (targetEl) targetEl.textContent = email;
        const sub = document.getElementById("register-subtitle");
        if (sub) sub.textContent = "Vérification de votre email";
        const otpInput = document.getElementById("otp-input");
        if (otpInput) { otpInput.value = ""; setTimeout(() => otpInput.focus(), 50); }
        const otpErr = document.getElementById("otp-error");
        if (otpErr) otpErr.style.display = "none";
      } else {
        const msg = res.data?.error || "Erreur lors de l'inscription";
        errDiv.querySelector("span").textContent = msg;
        errDiv.style.display = "flex";
      }
    } catch (err) {
      errDiv.querySelector("span").textContent = "Erreur de connexion";
      errDiv.style.display = "flex";
    } finally {
      btn.querySelector(".btn-text").style.display = "inline";
      btn.querySelector(".btn-loader").style.display = "none";
      btn.disabled = false;
    }
  });

  // OTP verify — POST /api/auth/verify-email
  document.getElementById("btn-otp-verify")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-otp-verify");
    const errDiv = document.getElementById("otp-error");
    const code = (document.getElementById("otp-input").value || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      errDiv.querySelector("span").textContent = "Saisissez les 6 chiffres reçus par email.";
      errDiv.style.display = "flex";
      return;
    }
    btn.querySelector(".btn-text").style.display = "none";
    btn.querySelector(".btn-loader").style.display = "inline-block";
    btn.disabled = true;
    errDiv.style.display = "none";
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE_URL}/api/auth/verify-email`,
        headers: { "Content-Type": "application/json" },
        data: { email: _pendingRegister.email, code },
      });
      if (res.status >= 200 && res.status < 300) {
        // Code OK — persist the token and enter the app.
        if (_pendingRegister.token) await saveToken(_pendingRegister.token);
        if (_pendingRegister.user) await saveUser(_pendingRegister.user);
        showAuthLoading("Préparation de votre espace…");
        await enterApp();
      } else {
        const msg = res.data?.error || "Code incorrect";
        errDiv.querySelector("span").textContent = msg;
        errDiv.style.display = "flex";
      }
    } catch (e) {
      errDiv.querySelector("span").textContent = "Erreur de connexion";
      errDiv.style.display = "flex";
    } finally {
      btn.querySelector(".btn-text").style.display = "inline";
      btn.querySelector(".btn-loader").style.display = "none";
      btn.disabled = false;
    }
  });

  // OTP resend — PUT /api/auth/verify-email
  document.getElementById("btn-otp-resend")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-otp-resend");
    const errDiv = document.getElementById("otp-error");
    if (!_pendingRegister.email) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Envoi…";
    try {
      const res = await CapacitorHttp.put({
        url: `${API_BASE_URL}/api/auth/verify-email`,
        headers: { "Content-Type": "application/json" },
        data: { email: _pendingRegister.email },
      });
      if (res.status >= 200 && res.status < 300) {
        showToast("Un nouveau code vous a été envoyé");
      } else {
        const msg = res.data?.error || "Impossible d'envoyer un nouveau code";
        errDiv.querySelector("span").textContent = msg;
        errDiv.style.display = "flex";
      }
    } catch (_) {
      errDiv.querySelector("span").textContent = "Erreur de connexion";
      errDiv.style.display = "flex";
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  // Login
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
  });

  document.getElementById("btn-google-login")?.addEventListener("click", () => doGoogleLogin());

  // Google onboarding
  document.getElementById("btn-back-google-onboard")?.addEventListener("click", () => showScreen("screen-login"));
  document.getElementById("google-onboard-form")?.addEventListener("submit", completeGoogleOnboarding);
  document.querySelectorAll("#screen-google-onboarding .profile-card").forEach(card => {
    card.addEventListener("click", () => {
      // Salarié is not yet available — keep the entrepreneur selection
      // and inform the user with a toast.
      if (card.dataset.profile === "salarie" || card.classList.contains("profile-card-disabled")) {
        showToast("Bientôt disponible — l'espace Salarié arrive prochainement");
        return;
      }
      document.querySelectorAll("#screen-google-onboarding .profile-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });

  // Generic password-visibility toggle. Works for the login screen
  // (#toggle-password) AND for any input that opts in via
  // data-toggle-pw="<input-id>" — used by the two register fields.
  const _wirePwToggle = (btn, inputId) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const input = document.getElementById(inputId);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      const eye = btn.querySelector(".icon-eye");
      const eyeOff = btn.querySelector(".icon-eye-off");
      if (eye) eye.style.display = isPassword ? "none" : "block";
      if (eyeOff) eyeOff.style.display = isPassword ? "block" : "none";
      btn.setAttribute("aria-label", isPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
    });
  };
  _wirePwToggle(document.getElementById("toggle-password"), "login-password");
  document.querySelectorAll("[data-toggle-pw]").forEach(btn => {
    _wirePwToggle(btn, btn.dataset.togglePw);
  });

  // Logout buttons
  document.getElementById("btn-logout-dir")?.addEventListener("click", doLogout);

  // ===== DIRIGEANT EVENTS =====

  // Bottom nav - data-dir-tab values are full IDs like "dir-tab-dashboard", strip prefix
  document.querySelectorAll("#dir-bottom-nav .nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.dirTab;
      if (val) switchDirTab(val.replace("dir-tab-", ""));
    });
  });

  // Legacy <select> change handler — kept in case any code path still
  // surfaces the hidden element. Routes through the same flow as the
  // bottom-sheet switcher so cache invalidation + topbar redraw happen.
  document.getElementById("org-select")?.addEventListener("change", (e) => {
    selectOrgAndSwitch(e.target.value);
  });

  // Dashboard quick actions - data-action values: scan-ticket, new-invoice, new-quote, bank
  document.querySelectorAll(".quick-action-btn[data-action], .dash-action-btn[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "scan-ticket") switchDirTab("tickets");
      else if (action === "new-invoice") switchDirTab("invoice-new");
      else if (action === "new-quote") switchDirTab("quote-new");
      else if (action === "bank") switchDirTab("bank");
    });
  });

  // Bank segment tabs (legacy hidden control — kept for backwards compat
  // in case any code still toggles them programmatically).
  document.querySelectorAll("#bank-segment-control .segment-btn").forEach(btn => {
    btn.addEventListener("click", () => switchBankSegment(btn.dataset.bankSeg));
  });

  // Bank page switcher (header title + grid icon both open the sheet).
  document.getElementById("bank-page-switcher")?.addEventListener("click", openBankPageSheet);
  document.getElementById("btn-bank-page-menu")?.addEventListener("click", openBankPageSheet);
  document.getElementById("bank-page-sheet-close")?.addEventListener("click", closeBankPageSheet);
  // Backdrop click closes; tapping a row swaps the segment + closes.
  document.getElementById("bank-page-sheet")?.addEventListener("click", (e) => {
    const sheet = e.currentTarget;
    if (e.target === sheet) { closeBankPageSheet(); return; }
    const row = e.target.closest(".bank-page-item");
    if (row && row.dataset.bankSeg) {
      switchBankSegment(row.dataset.bankSeg);
      closeBankPageSheet();
    }
  });

  // Bank statement import buttons
  const stmtFileInput = document.getElementById("statement-file-input");
  document.getElementById("btn-import-statement")?.addEventListener("click", () => stmtFileInput?.click());
  document.getElementById("btn-import-statement-card")?.addEventListener("click", () => stmtFileInput?.click());
  stmtFileInput?.addEventListener("change", (e) => {
    if (e.target.files?.length) {
      importBankStatement(e.target.files);
      e.target.value = "";
    }
  });

  // Transaction filters
  document.getElementById("btn-tx-filter-toggle")?.addEventListener("click", () => {
    const panel = document.getElementById("tx-filter-panel");
    const btn = document.getElementById("btn-tx-filter-toggle");
    const visible = panel.style.display !== "none";
    panel.style.display = visible ? "none" : "block";
    btn.classList.toggle("active", !visible);
  });
  document.getElementById("btn-tx-filter-apply")?.addEventListener("click", () => loadBankTransactions());
  document.getElementById("btn-tx-filter-reset")?.addEventListener("click", () => {
    document.getElementById("tx-filter-from").value = "";
    document.getElementById("tx-filter-to").value = "";
    document.getElementById("tx-filter-direction").value = "";
    document.getElementById("tx-search").value = "";
    loadBankTransactions();
  });
  // Realtime client-side filter — fires on every keystroke against the
  // already-loaded list (no network round-trip). Matches description,
  // amount (raw cents and formatted), category, method, third-party,
  // matched-item label/counterparty, and OCR fields.
  document.getElementById("tx-search")?.addEventListener("input", () => {
    _applyTxSearchAndRender();
  });

  // [data-dir-tab] navigation is handled by the body-level click delegation
  // earlier in init — keeping this here would double-fire switchDirTab and
  // double the data-loading calls, making navigation feel laggy.

  // Back buttons - class .back-btn with data-back attribute
  document.querySelectorAll(".back-btn[data-back]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.back;
      // For dirigeant back buttons, strip dir-tab- prefix
      if (target.startsWith("dir-tab-")) {
        switchDirTab(target.replace("dir-tab-", ""));
      }
    });
  });

  // Notifications bell
  document.getElementById("btn-notifications")?.addEventListener("click", () => switchDirTab("notifications"));

  // Quick scan button in dashboard header — go directly to camera capture
  document.getElementById("btn-quick-scan")?.addEventListener("click", () => captureTicketPhoto("camera"));

  // Ticket scanner
  // Ticket action buttons
  // Speed-dial FAB triggers (Scanner camera / Importer gallery).
  // Dashboard period selector — Ce mois / 7 jours / Année. Active
  // chip drives _currentDirPeriod which all KPI computations read.
  document.getElementById("mc-period-control")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".mc-period-chip");
    if (!chip || !chip.dataset.period) return;
    const next = chip.dataset.period;
    if (next === _currentDirPeriod) return;
    _currentDirPeriod = next;
    document.querySelectorAll("#mc-period-control .mc-period-chip").forEach((b) =>
      b.classList.toggle("active", b.dataset.period === next),
    );
    // Period changes the in-period totals; the cached responses are
    // still valid (we just slice them differently), so no need to
    // invalidate the data cache.
    loadDirDashboard();
  });

  document.getElementById("btn-take-photo")?.addEventListener("click", () => {
    _closeTicketsFab();
    captureTicketPhoto("camera");
  });
  document.getElementById("btn-pick-gallery")?.addEventListener("click", () => {
    _closeTicketsFab();
    captureTicketPhoto("gallery");
  });
  document.getElementById("btn-tickets-fab")?.addEventListener("click", _toggleTicketsFab);
  // Backdrop click (the dimmer behind the open FAB) closes the speed-dial.
  document.getElementById("tickets-fab-root")?.addEventListener("click", (e) => {
    if (e.target?.id === "tickets-fab-root") _closeTicketsFab();
  });
  // Select-mode header: Annuler exits, Tout toggles select-all.
  document.getElementById("btn-tickets-cancel")?.addEventListener("click", _exitTicketSelectMode);
  document.getElementById("btn-tickets-select-all")?.addEventListener("click", _selectAllTickets);
  // Bulk action buttons.
  document.getElementById("btn-tickets-multi-share")?.addEventListener("click", _bulkShareSelectedTickets);
  document.getElementById("btn-tickets-multi-delete")?.addEventListener("click", _bulkDeleteSelectedTickets);
  _bindTicketListInteractions();

  // Scan modal buttons
  document.getElementById("btn-close-scan-modal")?.addEventListener("click", closeScanModal);
  document.getElementById("btn-new-ticket")?.addEventListener("click", () => { closeScanModal(); loadHistory(); });
  document.getElementById("btn-retry-scan")?.addEventListener("click", () => {
    closeScanModal();
    captureTicketPhoto("camera");
  });
  document.getElementById("btn-close-error")?.addEventListener("click", closeScanModal);

  // Transaction Justificatifs modal
  document.getElementById("tx-docs-close")?.addEventListener("click", closeTransactionDocsModal);
  document.getElementById("tx-docs-add")?.addEventListener("click", attachAnotherDocFromModal);

  // Justificatif viewer overlay
  document.getElementById("justif-viewer-close")?.addEventListener("click", closeJustificatifViewer);
  document.getElementById("justif-viewer-share")?.addEventListener("click", _shareJustifFromViewer);
  document.getElementById("justif-viewer-open")?.addEventListener("click", _openJustifExternally);

  // Bottom-nav primary scan CTA — full doc-scan flow.
  document.getElementById("btn-bottom-scan")?.addEventListener("click", () => captureTicketPhoto("camera"));

  // Bank refresh
  document.getElementById("btn-refresh-bank")?.addEventListener("click", loadBankAccounts);

  // Invoice form
  document.getElementById("btn-add-invoice-line")?.addEventListener("click", () => addInvoiceLine("invoice"));
  document.getElementById("btn-add-invoice-product")?.addEventListener("click", () => openCatalogPicker("product", "invoice"));
  document.getElementById("btn-add-invoice-service")?.addEventListener("click", () => openCatalogPicker("service", "invoice"));
  document.getElementById("invoice-lines")?.addEventListener("input", () => recalcInvoiceTotals("invoice"));
  document.getElementById("invoice-form")?.addEventListener("submit", submitInvoice);
  document.getElementById("btn-preview-invoice-pdf")?.addEventListener("click", () => previewInvoicePdf("invoice"));

  // QR + status switcher delegated handlers (the buttons are rendered dynamically
  // inside the invoice/quote detail screen, so we attach once on body)
  document.body.addEventListener("click", (e) => {
    const shareBtn = e.target.closest(".btn-share-link");
    if (shareBtn) {
      shareDocumentLink(shareBtn.dataset.shareUrl, shareBtn.dataset.docTitle);
      return;
    }
    const copyBtn = e.target.closest(".btn-copy-link");
    if (copyBtn) {
      copyLinkToClipboard(copyBtn.dataset.shareUrl);
      return;
    }
    const statusBtn = e.target.closest(".inv-status-opt");
    if (statusBtn) {
      if (statusBtn.classList.contains("active")) return; // no-op when tapping current status
      setInvoiceStatus(statusBtn.dataset.invoiceId, statusBtn.dataset.status);
      return;
    }
    // Catch-all: any element with [data-dir-tab] navigates. The earlier handler in init
    // only covered .menu-item / .icon-btn / .fab — this picks up everything else
    // (hero links, KPI cards, tile cards, action items, etc.).
    const tabTrigger = e.target.closest("[data-dir-tab]");
    if (tabTrigger && !tabTrigger.classList.contains("nav-item")) {
      const val = tabTrigger.dataset.dirTab;
      if (val) {
        e.preventDefault();
        switchDirTab(val.replace("dir-tab-", ""));
        return;
      }
    }
    const zoomTrigger = e.target.closest("[data-ticket-img]");
    if (zoomTrigger) {
      openTicketLightbox(zoomTrigger.dataset.ticketImg);
      return;
    }
    const shareBtnTk = e.target.closest("[data-ticket-share]");
    if (shareBtnTk) {
      shareTicketImage(shareBtnTk.dataset.ticketShare, shareBtnTk.dataset.ticketShareTitle);
      return;
    }
    // Per-row action buttons inside the docs modal (view/share/delete) — handled
    // before the row-level handler so the action wins.
    const txDocAction = e.target.closest("[data-tx-doc-action]");
    if (txDocAction) {
      e.stopPropagation();
      const action = txDocAction.dataset.txDocAction;
      const fileId = txDocAction.dataset.txDocId;
      const name = txDocAction.dataset.txDocName || "";
      const ct = txDocAction.dataset.txDocCt || "";
      if (action === "view") viewTransactionDoc(fileId, name, ct);
      else if (action === "share") shareTransactionDoc(fileId, name);
      else if (action === "delete") deleteTransactionReceipt(fileId);
      return;
    }
    const txMatchedPdf = e.target.closest("[data-tx-matched-pdf]");
    if (txMatchedPdf) {
      const url = txMatchedPdf.dataset.txMatchedPdf;
      if (url) Browser.open({ url: `${API_BASE_URL}${url}` }).catch(() => {});
      return;
    }
    // Tap on a "Document rapproché" card → open it inside the viewer overlay.
    const txMatchedItem = e.target.closest("[data-tx-matched-pdf-url]");
    if (txMatchedItem) {
      e.stopPropagation();
      const path = txMatchedItem.dataset.txMatchedPdfUrl;
      const label = txMatchedItem.dataset.txMatchedLabel || "Document rapproché";
      const matchedType = txMatchedItem.dataset.txMatchedType || "";
      const matchedId = txMatchedItem.dataset.txMatchedId || "";
      if (path) {
        // Look up full matched-item details from current state for the panel.
        const item = (_txDocsCurrent?.matchedItems || []).find(
          it => String(it.id) === String(matchedId) || String(it.pdfUrl) === String(path)
        ) || null;
        // No contentType hint — the viewer reads the actual Content-Type from
        // the response. Tickets serve JPEG, invoices serve PDF, etc.
        openJustificatifViewer({
          path,
          fileName: label,
          contentType: "",
          kind: matchedType || "matched",
          matched: item,
          extracted: _txDocsCurrent?.extracted || null,
          txAmountCents: _txDocsCurrent?.amount || 0,
          txDescription: _txDocsCurrent?.description || "",
        });
      }
      return;
    }
    const txAttach = e.target.closest("[data-tx-attach-id]");
    if (txAttach) {
      const txId = txAttach.dataset.txAttachId;
      const data = _txDataIndex.get(String(txId));
      if (data) openTransactionDocsModal(data);
      return;
    }
    const txDocItem = e.target.closest("[data-tx-doc-fileid]");
    if (txDocItem) {
      viewTransactionDoc(txDocItem.dataset.txDocFileid);
    }
  });

  // Quote form
  document.getElementById("btn-add-quote-line")?.addEventListener("click", () => addInvoiceLine("quote"));
  document.getElementById("btn-add-quote-product")?.addEventListener("click", () => openCatalogPicker("product", "quote"));
  document.getElementById("btn-add-quote-service")?.addEventListener("click", () => openCatalogPicker("service", "quote"));
  document.getElementById("quote-lines")?.addEventListener("input", () => recalcInvoiceTotals("quote"));
  document.getElementById("quote-form")?.addEventListener("submit", submitQuote);
  document.getElementById("btn-preview-quote-pdf")?.addEventListener("click", () => previewInvoicePdf("quote"));

  // Catalog picker
  document.getElementById("btn-close-catalog")?.addEventListener("click", closeCatalogPicker);
  document.getElementById("catalog-search")?.addEventListener("input", filterCatalog);

  // PDF preview
  document.getElementById("btn-close-pdf-preview")?.addEventListener("click", closePdfPreview);

  // Client form
  document.getElementById("client-form")?.addEventListener("submit", submitClient);


  // Auto-login if token exists. Check first for a pending scan persisted by
  // the native plugin after a process kill — if there is one, run recovery
  // BEFORE enterApp so the scan modal opens immediately and we skip the
  // "Préparation de votre espace…" auth overlay. The dashboard still mounts
  // in the background so it's ready when the user dismisses the scan flow.
  if (state.token) {
    const recovered = await recoverPendingScan();
    if (recovered) {
      // Scan modal is opening and uploadTicket is already running in the
      // background. The modal slides up over 300ms (CSS slideUp anim) and
      // the dashboard underneath is empty until enterApp finishes
      // populating it (loadOrganizations + initDirigeantScreen). We hold
      // the auth-loading overlay (z-index 10000) on top through BOTH —
      // dashboard population AND the slide-up animation — so the user
      // never sees the empty dashboard skeleton or a half-animated modal.
      // The OCR call is much longer (~5–15s) than enterApp, so there's
      // no risk of hiding the spinner before the analysis state is up.
      await Promise.all([
        enterApp({ silent: true }),
        new Promise((r) => setTimeout(r, 350)),
      ]);
      hideAuthLoading();
    } else {
      // No pending scan — normal cold-boot. enterApp manages its own
      // overlay text; hide ours so we don't double-stack.
      hideAuthLoading();
      await enterApp();
    }
  } else {
    // No saved session — reveal the welcome screen. (It no longer has the
    // "active" class in HTML, since that would have caused a flash on the
    // cold-boot scan-recovery path.)
    showScreen("screen-welcome");
    hideAuthLoading();
  }
}

document.addEventListener("DOMContentLoaded", init);
