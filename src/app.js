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
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
    "ticket-detail": "sorties",
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

async function enterApp() {
  await loadOrganizations();
  if (state.organizations.length > 0 && !state.orgId) {
    await saveOrgId(state.organizations[0]._id || state.organizations[0].id);
  }

  showScreen("screen-dirigeant");
  initDirigeantScreen();
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

async function handleGoogleDeepLink(url) {
  console.log("DEEPLINK received:", url);
  const parsed = parseYfitenAuthUrl(url);
  if (!parsed) {
    console.warn("DEEPLINK not matched:", url);
    return;
  }
  console.log("DEEPLINK parsed:", { hasToken: !!parsed.token, error: parsed.error });

  try { await Browser.close(); } catch (_) {}

  try {
    const errorDiv = document.getElementById("login-error");
    if (parsed.error) {
      if (errorDiv) {
        errorDiv.querySelector("span").textContent = parsed.error;
        errorDiv.style.display = "flex";
      }
      return;
    }

    if (!parsed.token) return;

    await saveToken(parsed.token);
    if (parsed.user) {
      try { await saveUser(JSON.parse(decodeURIComponent(parsed.user))); } catch (e) { console.error("DEEPLINK user parse:", e); }
    }
    await enterApp();
  } catch (err) {
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

  try {
    const res = await CapacitorHttp.post({
      url: `${API_BASE_URL}/api/auth/mobile`,
      headers: { "Content-Type": "application/json" },
      data: { email, password },
    });

    if (res.status === 200 && res.data?.token) {
      await saveToken(res.data.token);
      await saveUser(res.data.user || { email });
      await enterApp();
    } else {
      const msg = res.data?.error || res.data?.message || "Identifiants incorrects";
      errorDiv.querySelector("span").textContent = msg;
      errorDiv.style.display = "flex";
    }
  } catch (err) {
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

function initDirigeantScreen() {
  const orgs = state.organizations;
  const selectorEl = document.getElementById("org-selector");
  const selectEl = document.getElementById("org-select");

  if (orgs.length > 1) {
    selectorEl.style.display = "block";
    selectEl.innerHTML = orgs
      .map((o) => {
        const id = o._id || o.id;
        return `<option value="${id}" ${id === state.orgId ? "selected" : ""}>${escapeHtml(o.name || o.companyName || "Organisation")}</option>`;
      })
      .join("");
  } else {
    selectorEl.style.display = "none";
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

async function loadDirDashboard() {
  if (!state.orgId) return;

  const setKpi = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  let revenueCents = 0;
  let expensesCents = 0;
  let pendingCount = 0;

  const refreshNet = () => {
    const netCents = revenueCents - expensesCents;
    const sign = netCents >= 0 ? "+" : "−";
    setKpi("mc-net", `${sign}${formatAmount(Math.abs(netCents))}`);
    const todo = pendingCount;
    setKpi("mc-todo-count", String(todo));
    setKpi("mc-pending-sub", todo === 0 ? "Aucune facture en attente" : (todo === 1 ? "1 facture en attente" : `${todo} factures en attente`));
  };

  // Load KPIs in parallel
  const promises = [];

  // Revenue (client invoices total)
  promises.push(
    apiFetch(`/api/client-invoices?organizationId=${state.orgId}`).then(res => {
      if (res.ok) {
        const invoices = res.data?.invoices || [];
        const total = invoices.reduce((sum, inv) => sum + (inv.amountCents || 0), 0);
        revenueCents = total;
        setKpi("kpi-revenue", `+${formatAmount(total)}`);
        setKpi("cat-entrees-revenue", formatAmount(total));
        setKpi("cat-entrees-invoices-sub", invoices.length === 1 ? "1 facture" : `${invoices.length} factures`);
        refreshNet();
      }
    }).catch(() => {})
  );

  // Expenses (tickets) — also drives the documents count
  promises.push(
    apiFetch(`/api/tickets?organizationId=${state.orgId}`).then(res => {
      if (res.ok) {
        const tickets = res.data?.tickets || (Array.isArray(res.data) ? res.data : []);
        const total = tickets.reduce((sum, t) => sum + (t.amountCents || 0), 0);
        expensesCents = total;
        setKpi("kpi-expenses", `−${formatAmount(total)}`);
        setKpi("kpi-documents", String(tickets.length));
        setKpi("cat-sorties-expenses", formatAmount(total));
        setKpi("cat-sorties-tickets", String(tickets.length));
        refreshNet();
      }
    }).catch(() => {})
  );

  // Bank balance
  promises.push(
    apiFetch(`/api/pro-accounts?organizationId=${state.orgId}`).then(res => {
      if (res.ok) {
        const totalBalanceCents = res.data?.totalBalanceCents;
        if (totalBalanceCents != null) {
          setKpi("kpi-balance", formatAmount(totalBalanceCents));
        } else {
          const accounts = res.data?.accounts || [];
          const total = accounts.reduce((sum, a) => sum + (a.balanceCents || a.balance || 0), 0);
          if (total > 100) {
            setKpi("kpi-balance", formatAmount(total));
          } else {
            setKpi("kpi-balance", formatAmountDirect(total));
          }
        }
      }
    }).catch(() => {})
  );

  // Pending invoices
  promises.push(
    apiFetch(`/api/client-invoices?organizationId=${state.orgId}`).then(res => {
      if (res.ok) {
        const invoices = res.data?.invoices || [];
        const pending = invoices.filter(i => i.status === "Brouillon" || i.status === "À encaisser").length;
        pendingCount = pending;
        setKpi("kpi-pending", String(pending));
        setKpi("cat-entrees-pending", String(pending));
        refreshNet();
      }
    }).catch(() => {})
  );

  await Promise.allSettled(promises);

  // Load recent activity
  loadRecentActivity();
}

async function loadRecentActivity() {
  const container = document.getElementById("recent-activity-list");
  if (!container) return;

  try {
    const [ticketsRes, invoicesRes] = await Promise.allSettled([
      apiFetch(`/api/tickets?organizationId=${state.orgId}`),
      apiFetch(`/api/client-invoices?organizationId=${state.orgId}`),
    ]);

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

function switchBankSegment(seg) {
  currentBankSeg = seg;
  document.querySelectorAll("#bank-segment-control .segment-btn").forEach(b => b.classList.toggle("active", b.dataset.bankSeg === seg));
  document.querySelectorAll(".bank-segment").forEach(el => { el.style.display = "none"; el.classList.remove("active"); });
  const target = document.getElementById(`bank-seg-${seg}`);
  if (target) { target.style.display = "block"; target.classList.add("active"); }

  if (seg === "accounts") loadBankAccountsOnly();
  if (seg === "transactions") loadBankTransactions();
  if (seg === "statements") loadBankStatements();
}

async function loadBankAccountsOnly() {
  if (!state.orgId) return;
  const container = document.getElementById("accounts-list");
  container.innerHTML = loadingHtml();
  try {
    const res = await apiFetch(`/api/pro-accounts?organizationId=${state.orgId}`);
    if (res.ok) {
      const accounts = res.data?.accounts || [];
      if (accounts.length === 0) {
        container.innerHTML = emptyState(
          `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>`,
          "Aucun compte bancaire"
        );
      } else {
        container.innerHTML = accounts.map(a => {
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
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

async function loadBankTransactions() {
  if (!state.orgId) return;
  const txContainer = document.getElementById("transactions-list");
  txContainer.innerHTML = loadingHtml();
  let url = `/api/transactions?organizationId=${state.orgId}&limit=50&sortDirection=desc`;
  // Apply filters
  const from = document.getElementById("tx-filter-from")?.value;
  const to = document.getElementById("tx-filter-to")?.value;
  const direction = document.getElementById("tx-filter-direction")?.value;
  const search = document.getElementById("tx-search")?.value?.trim();
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  if (direction) url += `&direction=${direction}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  try {
    const res = await apiFetch(url);
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
          const isDebit = (tx.direction === "debit" || tx.amountCents < 0);
          const amountClass = isDebit ? "amount-negative" : "amount-positive";
          const sign = isDebit ? "-" : "+";
          const logoHtml = tx.logoUrl
            ? `<img src="${API_BASE_URL}${tx.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius)" />`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${isDebit ? '<polyline points="7 7 17 17"/><polyline points="17 7 17 17 7 17"/>' : '<polyline points="17 7 7 17"/><polyline points="7 7 7 17 17 17"/>'}</svg>`;
          return `<div class="list-item">
            <div class="list-item-icon" style="background:${isDebit ? "var(--red-50)" : "var(--green-50)"};color:${isDebit ? "var(--red-600)" : "var(--green-600)"}">${logoHtml}</div>
            <div class="list-item-content">
              <div class="list-item-title">${escapeHtml(desc)}</div>
              <div class="list-item-meta">${formatDate(tx.date || tx.valueDate)}${tx.category ? ` <span class="meta-dot"></span> ${escapeHtml(tx.category)}` : ""}</div>
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
          const isDebit = (tx.direction === "debit" || tx.amountCents < 0);
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
  const container = document.getElementById("invoices-suppliers-list");
  container.innerHTML = loadingHtml();

  try {
    const res = await apiFetch(`/api/supplier-invoices?organizationId=${state.orgId}`);
    if (res.ok) {
      const invoices = (res.data?.invoices || res.data?.supplierInvoices || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (invoices.length === 0) {
        container.innerHTML = emptyState(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`, "Aucune facture fournisseur");
        return;
      }
      container.innerHTML = invoices.map(inv => {
        const name = inv.supplierName || inv.supplier?.name || "Facture fournisseur";
        const amount = inv.totalTTC != null ? formatAmountDirect(inv.totalTTC / 100) : (inv.amountCents != null ? formatAmount(inv.amountCents) : "-");
        return `<div class="list-item">
          <div class="list-item-icon" style="background:var(--red-50);color:var(--red-600)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(name)}</div>
            <div class="list-item-meta">${formatDate(inv.date || inv.createdAt)} ${statusBadge(inv.status)}</div>
          </div>
          <div class="list-item-amount amount-negative">${amount}</div>
        </div>`;
      }).join("");
    } else {
      container.innerHTML = emptyState("", "Erreur de chargement");
    }
  } catch (e) {
    container.innerHTML = emptyState("", "Erreur de connexion");
  }
}

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

async function captureTicketPhoto(source) {
  try {
    let captured = null;

    // Camera source uses ML Kit Document Scanner: live capture guide with edge detection,
    // back camera enforced, manual corner-adjust step, perspective correction, plus our
    // OCR enhancement on the cropped output. We trust the scanner's output and upload
    // directly — no blocking quality warnings.
    if (source === "camera" && Capacitor.getPlatform() === "android") {
      try {
        const scan = await DocumentScanner.scan({ pageLimit: 1, galleryImport: false });
        if (scan?.base64) {
          captured = { base64: scan.base64, format: scan.format || "jpeg" };
        }
      } catch (scanErr) {
        const msg = String(scanErr?.message || scanErr || "");
        if (/cancel/i.test(msg)) return;
        console.warn("Document scanner unavailable, falling back to plain camera:", scanErr);
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

    uploadTicket();
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!/cancel/i.test(msg)) console.error("captureTicketPhoto:", err);
  }
}

function qualityWarningMessage(code) {
  switch (code) {
    case "blur":
      return "Photo floue. Stabilisez votre téléphone (posez-le ou appuyez les coudes) et réessayez.";
    case "dark":
      return "Eclairage insuffisant. Approchez une source de lumière ou changez d'endroit.";
    case "bright":
      return "Image surexposée. Évitez la lumière directe ou les reflets sur le document.";
    case "lowContrast":
      return "Contraste trop faible. Posez le document sur une surface contrastée et améliorez l'éclairage.";
    default:
      return "Qualité d'image faible. Réessayez en améliorant l'éclairage et la stabilité.";
  }
}

function showQualityWarning(code) {
  document.getElementById("scan-step-preview").style.display = "block";
  document.getElementById("analyzing-overlay").style.display = "none";
  document.getElementById("ticket-result").style.display = "none";
  document.getElementById("scan-error").style.display = "none";
  const warn = document.getElementById("scan-quality-warning");
  document.getElementById("scan-quality-msg").textContent = qualityWarningMessage(code);
  warn.style.display = "flex";
}

function hideQualityWarning() {
  const warn = document.getElementById("scan-quality-warning");
  if (warn) warn.style.display = "none";
}

async function uploadTicket() {
  if (!state.capturedImage || state.uploading) return;
  if (!state.token || !state.orgId) {
    showTicketError("Session expiree, veuillez vous reconnecter");
    await doLogout();
    return;
  }
  state.uploading = true;

  // Show analyzing step
  document.getElementById("scan-step-preview").style.display = "block";
  document.getElementById("analyzing-overlay").style.display = "flex";
  document.getElementById("ticket-result").style.display = "none";
  document.getElementById("scan-error").style.display = "none";

  try {
    const fileName = `ticket_${Date.now()}.${state.capturedImage.format}`;
    const contentType = state.capturedImage.format === "png" ? "image/png" : "image/jpeg";

    // Convert base64 to blob
    const byteChars = atob(state.capturedImage.base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: contentType });

    const formData = new FormData();
    formData.append("organizationId", state.orgId);
    formData.append("file", blob, fileName);

    console.log("uploadTicket: sending to", `${API_BASE_URL}/api/tickets`, "orgId:", state.orgId, "fileSize:", blob.size);
    const fetchRes = await fetch(`${API_BASE_URL}/api/tickets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      body: formData,
    });
    const data = await fetchRes.json().catch(() => ({}));
    console.log("uploadTicket: status", fetchRes.status, "data:", JSON.stringify(data).substring(0, 300));
    const res = { ok: fetchRes.ok, status: fetchRes.status, data };

    document.getElementById("analyzing-overlay").style.display = "none";
    document.getElementById("scan-step-preview").style.display = "none";

    if (res.status === 401) {
      showTicketError("Session expiree, veuillez vous reconnecter");
      await doLogout();
      return;
    }

    if (res.ok && res.data?.ticket) {
      showTicketResult(res.data);
    } else {
      console.error("uploadTicket: failed", res.status, res.data?.error);
      showTicketError(res.data?.error || "Erreur lors de l'analyse");
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

function showTicketResult(data) {
  const t = data.ticket;
  const details = document.getElementById("result-details");

  let html = "";
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

async function loadHistory() {
  if (!state.orgId) return;
  const container = document.getElementById("tickets-list");

  try {
    const res = await apiFetch(`/api/tickets?organizationId=${state.orgId}`);
    if (res.ok) {
      const tickets = Array.isArray(res.data) ? res.data : res.data?.tickets || [];
      if (tickets.length === 0) {
        container.innerHTML = `<div class="history-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <p>Aucun recu pour le moment</p>
          <p style="font-size:12px">Scannez ou importez votre premier recu</p></div>`;
        return;
      }

      const sorted = tickets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 30);
      container.innerHTML = sorted
        .map((t) => {
          const id = t._id || t.id;
          const name = t.beneficiaire || "Recu";
          const initial = name.trim().charAt(0).toUpperCase();
          const amount = t.amountCents != null ? formatAmount(t.amountCents, t.currency || "MAD") : "-";
          const currency = t.currency || "MAD";
          const date = formatDate(t.paymentDate || t.createdAt);
          const matched = t.matchedTransactionId;
          const logoUrl = t.logoUrl || t.classifier?.logo_domain;
          const avatarContent = logoUrl
            ? `<img src="${logoUrl.startsWith('/') ? API_BASE_URL + logoUrl : 'https://logo.clearbit.com/' + logoUrl}" alt="" onerror="this.style.display='none';this.parentNode.textContent='${initial}'">`
            : initial;

          return `<div class="ticket-card" onclick="showTicketDetail('${id}')">
            <div class="ticket-card-avatar">${avatarContent}</div>
            <div class="ticket-card-info">
              <div class="ticket-card-name">${escapeHtml(name)}</div>
              <div class="ticket-card-meta">
                <span>${date}</span>
                ${matched ? '<span class="ticket-card-badge badge-matched">Rapproche</span>' : '<span class="ticket-card-badge badge-pending">En attente</span>'}
              </div>
            </div>
            <div class="ticket-card-amount">
              <div class="ticket-card-amount-value">${amount}</div>
              <div class="ticket-card-amount-currency">${currency}</div>
            </div>
            <div class="ticket-card-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
          </div>`;
        })
        .join("");
    }
  } catch (e) {
    console.error("loadHistory:", e);
  }
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
  try { await loadState(); } catch(e) { console.error("INIT loadState error:", e); }
  try {
    CapApp.addListener("appUrlOpen", (data) => {
      if (data?.url) handleGoogleDeepLink(data.url);
    });
  } catch(e) { console.error("Deep link listener init:", e); }

  // ===== WELCOME SCREEN =====
  document.getElementById("btn-go-login")?.addEventListener("click", () => showScreen("screen-login"));
  document.getElementById("btn-go-register")?.addEventListener("click", () => showScreen("screen-register"));
  document.getElementById("btn-back-welcome")?.addEventListener("click", () => showScreen("screen-welcome"));
  document.getElementById("btn-back-welcome-reg")?.addEventListener("click", () => showScreen("screen-welcome"));
  document.getElementById("link-to-register")?.addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-register"); });
  document.getElementById("link-to-login")?.addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-login"); });
  document.getElementById("link-to-login-2")?.addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-login"); });
  document.getElementById("btn-back-to-welcome")?.addEventListener("click", () => showScreen("screen-welcome"));

  // Register - profile selection
  let selectedProfile = null;
  document.querySelectorAll(".profile-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedProfile = card.dataset.profile;
      document.querySelectorAll(".profile-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      // Go to step 2
      document.getElementById("register-step-1").style.display = "none";
      document.getElementById("register-step-2").style.display = "block";
      document.querySelector(".register-screen .auth-title").textContent = "Creer un compte";
      document.querySelector(".register-screen .login-subtitle").textContent = "Remplissez vos informations";
    });
  });

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

    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE_URL}/api/auth/register`,
        headers: { "Content-Type": "application/json" },
        data: {
          name: document.getElementById("register-firstname").value.trim() + " " + document.getElementById("register-lastname").value.trim(),
          email: document.getElementById("register-email").value.trim(),
          password: pw,
          profile: selectedProfile || "entrepreneur",
        },
      });

      if (res.status >= 200 && res.status < 300) {
        document.getElementById("register-step-2").style.display = "none";
        document.getElementById("register-success").style.display = "block";
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
      document.querySelectorAll("#screen-google-onboarding .profile-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });

  document.getElementById("toggle-password").addEventListener("click", () => {
    const input = document.getElementById("login-password");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    const eyeIcon = document.querySelector("#toggle-password .icon-eye");
    const eyeOffIcon = document.querySelector("#toggle-password .icon-eye-off");
    if (eyeIcon) eyeIcon.style.display = isPassword ? "none" : "block";
    if (eyeOffIcon) eyeOffIcon.style.display = isPassword ? "block" : "none";
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

  // Org selector
  document.getElementById("org-select")?.addEventListener("change", async (e) => {
    await saveOrgId(e.target.value);
    switchDirTab("dashboard");
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

  // Bank segment tabs
  document.querySelectorAll("#bank-segment-control .segment-btn").forEach(btn => {
    btn.addEventListener("click", () => switchBankSegment(btn.dataset.bankSeg));
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
  // Search on enter
  document.getElementById("tx-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadBankTransactions();
  });

  // Menu items & icon buttons with data-dir-tab
  document.querySelectorAll(".menu-item[data-dir-tab], .icon-btn[data-dir-tab], .fab[data-dir-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.dirTab;
      if (val) switchDirTab(val.replace("dir-tab-", ""));
    });
  });

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
  document.getElementById("btn-take-photo")?.addEventListener("click", () => captureTicketPhoto("camera"));
  document.getElementById("btn-pick-gallery")?.addEventListener("click", () => captureTicketPhoto("gallery"));
  document.getElementById("btn-refresh-tickets")?.addEventListener("click", loadHistory);

  // Scan modal buttons
  document.getElementById("btn-close-scan-modal")?.addEventListener("click", closeScanModal);
  document.getElementById("btn-new-ticket")?.addEventListener("click", () => { closeScanModal(); loadHistory(); });
  document.getElementById("btn-retry-scan")?.addEventListener("click", () => {
    closeScanModal();
    captureTicketPhoto("camera");
  });
  document.getElementById("btn-close-error")?.addEventListener("click", closeScanModal);

  // Quality-warning step buttons
  document.getElementById("btn-quality-retry")?.addEventListener("click", () => {
    hideQualityWarning();
    closeScanModal();
    captureTicketPhoto("camera");
  });
  document.getElementById("btn-quality-continue")?.addEventListener("click", () => {
    hideQualityWarning();
    uploadTicket();
  });

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


  // Auto-login if token exists
  if (state.token) {
    await enterApp();
  }
}

document.addEventListener("DOMContentLoaded", init);
