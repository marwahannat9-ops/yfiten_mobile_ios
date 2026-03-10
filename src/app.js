import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Preferences } from "@capacitor/preferences";
import { CapacitorHttp } from "@capacitor/core";

const API_BASE_URL = "https://yfiten.com";

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
  // Dirigeant
  capturedImage: null,
  uploading: false,
  // Salarié
  expenseImage: null,
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

  if (method === "GET") {
    const res = await CapacitorHttp.get({ url, headers });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
  }
  headers["Content-Type"] = "application/json";
  const res = await CapacitorHttp.post({ url, headers, data: options.body });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
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
  return (cents / 100).toFixed(2) + " " + currency;
}

function formatAmountDirect(amount, currency = "MAD") {
  if (amount == null) return "-";
  return Number(amount).toFixed(2) + " " + currency;
}

function formatPeriod(period) {
  if (!period) return "-";
  const [y, m] = period.split("-");
  const months = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
  return months[parseInt(m, 10) - 1] + " " + y;
}

function statusBadge(status) {
  const map = {
    pending: { label: "En attente", cls: "badge-pending" },
    approved: { label: "Approuve", cls: "badge-approved" },
    rejected: { label: "Refuse", cls: "badge-rejected" },
    paid: { label: "Paye", cls: "badge-paid" },
    draft: { label: "Brouillon", cls: "badge-draft" },
    validated: { label: "Valide", cls: "badge-approved" },
    sent: { label: "Envoye", cls: "badge-sent" },
  };
  const s = map[status] || { label: status || "-", cls: "badge-default" };
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

function leaveTypeLabel(type) {
  const map = { vacation: "Conge annuel", sick: "Maladie", birth: "Naissance", marriage: "Mariage", other: "Autre" };
  return map[type] || type || "-";
}

function getUserProfile() {
  return state.user?.profile || "";
}

function isSalarie() {
  return getUserProfile() === "salarie";
}

/* ============================================================
   Screen / Navigation
   ============================================================ */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(screenId)?.classList.add("active");
}

let currentTab = "dashboard";

function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (navBtn) navBtn.classList.add("active");

  const bottomNav = document.getElementById("bottom-nav");
  const subScreens = ["leave-form", "expense-form", "directory"];
  bottomNav.style.display = subScreens.includes(tabName) ? "none" : "flex";

  currentTab = tabName;

  if (tabName === "dashboard") loadDashboard();
  if (tabName === "payslips") loadPayslips();
  if (tabName === "leaves") loadLeaves();
  if (tabName === "expenses") loadExpenses();
  if (tabName === "directory") loadDirectory();
  if (tabName === "profile") loadProfile();
}

async function enterApp() {
  await loadOrganizations();
  if (state.organizations.length > 0 && !state.orgId) {
    await saveOrgId(state.organizations[0]._id || state.organizations[0].id);
  }

  if (isSalarie()) {
    showScreen("screen-salarie");
    switchTab("dashboard");
  } else {
    showScreen("screen-dirigeant");
    initDirigeantScreen();
  }
}

/* ============================================================
   LOGIN
   ============================================================ */

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
      url: `${API_BASE_URL}/api/auth/login`,
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
  await clearSession();
  showScreen("screen-login");
  document.getElementById("login-form").reset();
}

/* ====================================================================
   DIRIGEANT MODE — Ticket Scanner
   ==================================================================== */

function initDirigeantScreen() {
  const orgs = state.organizations;
  const selectorEl = document.getElementById("dir-org-selector");
  const selectEl = document.getElementById("dir-org-select");

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

  resetCapture();
  loadHistory();
}

function resetCapture() {
  state.capturedImage = null;
  document.getElementById("capture-placeholder").style.display = "flex";
  document.getElementById("capture-preview").style.display = "none";
  document.getElementById("analyzing-overlay").style.display = "none";
  document.getElementById("result-section").style.display = "none";
}

async function captureTicketPhoto(source) {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Base64,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      width: 1600,
    });

    state.capturedImage = { base64: photo.base64String, format: photo.format || "jpeg" };

    document.getElementById("preview-img").src = `data:image/${photo.format || "jpeg"};base64,${photo.base64String}`;
    document.getElementById("capture-placeholder").style.display = "none";
    document.getElementById("capture-preview").style.display = "block";

    // Auto-upload
    uploadTicket();
  } catch (err) {
    console.error("captureTicketPhoto:", err);
  }
}

async function uploadTicket() {
  if (!state.capturedImage || state.uploading) return;
  state.uploading = true;

  document.getElementById("analyzing-overlay").style.display = "flex";
  document.getElementById("result-section").style.display = "none";

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

    const res = await fetch(`${API_BASE_URL}/api/tickets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    document.getElementById("analyzing-overlay").style.display = "none";

    if (res.ok && data.ticket) {
      showTicketResult(data);
    } else {
      showTicketError(data.error || "Erreur lors de l'analyse");
    }
  } catch (err) {
    document.getElementById("analyzing-overlay").style.display = "none";
    showTicketError("Erreur de connexion");
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

  // Reset header to success
  const header = document.querySelector("#result-section .result-header");
  header.className = "result-header";

  document.getElementById("result-section").style.display = "block";
  loadHistory();
}

function showTicketError(msg) {
  const details = document.getElementById("result-details");
  details.innerHTML = `<div class="result-error">${escapeHtml(msg)}</div>`;

  const header = document.querySelector("#result-section .result-header");
  header.className = "result-header result-header-error";

  document.getElementById("result-section").style.display = "block";
}

function resultRow(label, value) {
  return `<div class="result-row"><span class="result-label">${escapeHtml(label)}</span><span class="result-value">${escapeHtml(String(value))}</span></div>`;
}

async function loadHistory() {
  if (!state.orgId) return;
  const container = document.getElementById("history-list");

  try {
    const res = await apiFetch(`/api/tickets?organizationId=${state.orgId}`);
    if (res.ok) {
      const tickets = Array.isArray(res.data) ? res.data : res.data?.tickets || [];
      if (tickets.length === 0) {
        container.innerHTML = `<div class="history-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>
          <p>Aucun ticket recent</p></div>`;
        return;
      }

      const sorted = tickets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 20);
      container.innerHTML = sorted
        .map((t) => {
          const name = t.beneficiaire || "Ticket";
          const amount = t.amountCents != null ? formatAmount(t.amountCents, t.currency || "MAD") : "-";
          const date = formatDate(t.paymentDate || t.createdAt);
          const matched = t.matchedTransactionId ? '<span class="history-match">Rapproche</span>' : "";
          return `<div class="history-item">
            <div class="history-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg></div>
            <div class="history-item-content">
              <div class="history-item-title">${escapeHtml(name)}</div>
              <div class="history-item-meta">${date} ${matched}</div>
            </div>
            <div class="history-item-amount">${amount}</div>
          </div>`;
        })
        .join("");
    }
  } catch (e) {
    console.error("loadHistory:", e);
  }
}

/* ====================================================================
   SALARIE MODE — Full Employee App
   ==================================================================== */

async function loadDashboard() {
  if (!state.orgId) return;

  try {
    const res = await apiFetch("/api/me/payslips");
    if (res.ok) document.getElementById("stat-payslips").textContent = (res.data?.payslips || []).length;
  } catch (e) {}

  try {
    const res = await apiFetch(`/api/holiday-requests?organizationId=${state.orgId}`);
    if (res.ok) {
      const pending = (res.data?.requests || []).filter((r) => r.status === "pending").length;
      document.getElementById("stat-leaves").textContent = pending;
    }
  } catch (e) {}

  try {
    const res = await apiFetch(`/api/expense-notes?organizationId=${state.orgId}`);
    if (res.ok) {
      const pending = (res.data?.notes || []).filter((n) => n.status === "pending").length;
      document.getElementById("stat-expenses").textContent = pending;
    }
  } catch (e) {}

  try {
    const res = await apiFetch(`/api/leave-balances?organizationId=${state.orgId}`);
    if (res.ok) {
      const balances = res.data?.balances || [];
      if (balances.length > 0) {
        const b = balances[0];
        document.getElementById("bal-available").textContent = b.availableDays ?? b.totalDays ?? "-";
        document.getElementById("bal-used").textContent = b.usedDays ?? 0;
        document.getElementById("bal-remaining").textContent = b.remainingDays ?? "-";
        document.getElementById("bal-carryover").textContent = b.carryOverDays ?? 0;
      }
    }
  } catch (e) {}
}

async function loadPayslips() {
  const container = document.getElementById("payslips-list");
  container.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch("/api/me/payslips");
    if (res.ok) {
      const payslips = (res.data?.payslips || []).sort((a, b) => (b.period || "").localeCompare(a.period || ""));
      if (payslips.length === 0) {
        container.innerHTML = '<div class="list-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Aucun bulletin de paie</p></div>';
        return;
      }
      container.innerHTML = payslips
        .map((p) => `<div class="list-item"><div class="list-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="list-item-content"><div class="list-item-title">${escapeHtml(formatPeriod(p.period))}</div><div class="list-item-meta">${statusBadge(p.status)}</div></div><div class="list-item-amount">${formatAmount(p.netAmountCents)}</div></div>`)
        .join("");
    } else {
      container.innerHTML = '<div class="list-empty"><p>Erreur de chargement</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="list-empty"><p>Erreur de connexion</p></div>';
  }
}

async function loadLeaves() {
  const container = document.getElementById("leaves-list");
  container.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/holiday-requests?organizationId=${state.orgId}`);
    if (res.ok) {
      const requests = (res.data?.requests || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (requests.length === 0) {
        container.innerHTML = '<div class="list-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><p>Aucune demande de conge</p></div>';
        return;
      }
      container.innerHTML = requests
        .map((r) => `<div class="list-item"><div class="list-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="list-item-content"><div class="list-item-title">${escapeHtml(leaveTypeLabel(r.type))}</div><div class="list-item-meta">${formatDate(r.startDate)} - ${formatDate(r.endDate)}${r.totalDays ? ` <span class="meta-dot"></span> ${r.totalDays}j` : ""}</div><div class="list-item-meta">${statusBadge(r.status)}</div></div></div>`)
        .join("");
    } else {
      container.innerHTML = '<div class="list-empty"><p>Erreur de chargement</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="list-empty"><p>Erreur de connexion</p></div>';
  }
}

async function submitLeave(e) {
  e.preventDefault();
  const btn = document.getElementById("leave-submit-btn");
  const btnText = btn.querySelector(".btn-text");
  const btnLoader = btn.querySelector(".btn-loader");
  btnText.style.display = "none";
  btnLoader.style.display = "inline-block";
  btn.disabled = true;

  try {
    const body = {
      organizationId: state.orgId,
      type: document.getElementById("leave-type").value,
      startDate: document.getElementById("leave-start").value,
      endDate: document.getElementById("leave-end").value,
      startTime: document.getElementById("leave-start-time").value,
      endTime: document.getElementById("leave-end-time").value,
      reason: document.getElementById("leave-reason").value || "",
    };

    const res = await apiFetch("/api/holiday-requests", { method: "POST", body });
    if (res.ok) {
      document.getElementById("leave-form").reset();
      switchTab("leaves");
    } else {
      alert(res.data?.error || "Erreur lors de l'envoi");
    }
  } catch (err) {
    alert("Erreur de connexion");
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
    btn.disabled = false;
  }
}

async function loadExpenses() {
  const container = document.getElementById("expenses-list");
  container.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/expense-notes?organizationId=${state.orgId}`);
    if (res.ok) {
      const notes = (res.data?.notes || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (notes.length === 0) {
        container.innerHTML = '<div class="list-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><p>Aucune note de frais</p></div>';
        return;
      }
      container.innerHTML = notes
        .map((n) => `<div class="list-item"><div class="list-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="list-item-content"><div class="list-item-title">${escapeHtml(n.title || "Sans titre")}</div><div class="list-item-meta">${formatDate(n.date || n.createdAt)}${n.hasDocument ? ' <span class="meta-dot"></span><span class="meta-attachment">Justificatif</span>' : ""}</div><div class="list-item-meta">${statusBadge(n.status)}</div></div><div class="list-item-amount">${formatAmountDirect(n.amount, n.currency || "MAD")}</div></div>`)
        .join("");
    } else {
      container.innerHTML = '<div class="list-empty"><p>Erreur de chargement</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="list-empty"><p>Erreur de connexion</p></div>';
  }
}

async function captureExpensePhoto(source) {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Base64,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      width: 1200,
    });
    state.expenseImage = { base64: photo.base64String, format: photo.format || "jpeg" };
    document.getElementById("expense-preview-img").src = `data:image/${photo.format || "jpeg"};base64,${photo.base64String}`;
    document.getElementById("expense-capture-placeholder").style.display = "none";
    document.getElementById("expense-preview").style.display = "flex";
  } catch (err) {
    console.error("captureExpensePhoto:", err);
  }
}

async function submitExpense(e) {
  e.preventDefault();
  const btn = document.getElementById("expense-submit-btn");
  const btnText = btn.querySelector(".btn-text");
  const btnLoader = btn.querySelector(".btn-loader");
  btnText.style.display = "none";
  btnLoader.style.display = "inline-block";
  btn.disabled = true;

  try {
    const title = document.getElementById("expense-title").value;
    const amount = document.getElementById("expense-amount").value;
    const currency = document.getElementById("expense-currency").value;
    const date = document.getElementById("expense-date").value;
    const description = document.getElementById("expense-description").value;

    if (state.expenseImage) {
      const formData = new FormData();
      formData.append("organizationId", state.orgId);
      formData.append("title", title);
      if (amount) formData.append("amount", amount);
      if (currency) formData.append("currency", currency);
      if (date) formData.append("date", date);
      if (description) formData.append("description", description);

      const byteChars = atob(state.expenseImage.base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: `image/${state.expenseImage.format}` });
      formData.append("file", blob, `receipt.${state.expenseImage.format}`);

      const res = await fetch(`${API_BASE_URL}/api/expense-notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: formData,
      });

      if (res.ok) {
        resetExpenseForm();
        switchTab("expenses");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Erreur lors de l'envoi");
      }
    } else {
      const body = { organizationId: state.orgId, title };
      if (amount) body.amount = parseFloat(amount);
      if (currency) body.currency = currency;
      if (date) body.date = date;
      if (description) body.description = description;

      const res = await apiFetch("/api/expense-notes", { method: "POST", body });
      if (res.ok) {
        resetExpenseForm();
        switchTab("expenses");
      } else {
        alert(res.data?.error || "Erreur lors de l'envoi");
      }
    }
  } catch (err) {
    alert("Erreur de connexion");
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
    btn.disabled = false;
  }
}

function resetExpenseForm() {
  document.getElementById("expense-form").reset();
  state.expenseImage = null;
  document.getElementById("expense-capture-placeholder").style.display = "block";
  document.getElementById("expense-preview").style.display = "none";
}

async function loadDirectory() {
  const container = document.getElementById("directory-list");
  container.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/directory?organizationId=${state.orgId}`);
    if (res.ok) {
      const collaborators = res.data?.collaborators || [];
      if (collaborators.length === 0) {
        container.innerHTML = '<div class="list-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>Aucun collegue trouve</p></div>';
        return;
      }
      container.innerHTML = collaborators
        .map((c) => {
          const name = c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email;
          const initials = ((c.firstName?.charAt(0) || "") + (c.lastName?.charAt(0) || "")).toUpperCase() || "?";
          return `<div class="list-item directory-item"><div class="directory-avatar">${escapeHtml(initials)}</div><div class="list-item-content"><div class="list-item-title">${escapeHtml(name)}</div><div class="list-item-meta">${escapeHtml(c.jobTitle || c.department || c.email || "-")}</div></div>${c.employmentStatus === "active" ? '<span class="status-dot active"></span>' : '<span class="status-dot departed"></span>'}</div>`;
        })
        .join("");
    } else {
      container.innerHTML = '<div class="list-empty"><p>Erreur de chargement</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="list-empty"><p>Erreur de connexion</p></div>';
  }
}

async function loadProfile() {
  if (!state.user) return;
  const user = state.user;
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || user.email || "-";
  const initials = ((user.firstName?.charAt(0) || "") + (user.lastName?.charAt(0) || "")).toUpperCase() || "U";

  document.getElementById("profile-name").textContent = fullName;
  document.getElementById("profile-job").textContent = user.jobTitle || "Salarie";
  document.getElementById("profile-avatar").textContent = initials;
  document.getElementById("profile-avatar-large").textContent = initials;
  document.getElementById("profile-fullname").textContent = fullName;
  document.getElementById("profile-email").textContent = user.email || "-";

  try {
    const res = await apiFetch(`/api/directory?organizationId=${state.orgId}`);
    if (res.ok) {
      const collaborators = res.data?.collaborators || [];
      const me = collaborators.find((c) => c.email === user.email || c._id === user._id || c._id === user.id);
      if (me) {
        await saveUser({ ...user, ...me });
        const fn = `${me.firstName || ""} ${me.lastName || ""}`.trim() || me.email;
        const ini = ((me.firstName?.charAt(0) || "") + (me.lastName?.charAt(0) || "")).toUpperCase() || "U";

        document.getElementById("profile-name").textContent = fn;
        document.getElementById("profile-job").textContent = me.jobTitle || "Salarie";
        document.getElementById("profile-avatar").textContent = ini;
        document.getElementById("profile-avatar-large").textContent = ini;
        document.getElementById("profile-fullname").textContent = fn;
        document.getElementById("profile-email").textContent = me.email || "-";

        document.getElementById("profile-personal").innerHTML = [
          profileRow("Email", me.email),
          profileRow("Telephone", me.phone),
          profileRow("Genre", me.gender === "male" ? "Homme" : me.gender === "female" ? "Femme" : me.gender),
          profileRow("Adresse", me.address),
          profileRow("CIN", me.cniNumber),
        ].join("");

        document.getElementById("profile-professional").innerHTML = [
          profileRow("Poste", me.jobTitle),
          profileRow("Departement", me.department || (me.departments || []).join(", ")),
          profileRow("Type de contrat", me.contractType),
          profileRow("Date d'embauche", formatDate(me.hireDate)),
          profileRow("N° CNSS", me.cnssNumber),
          profileRow("RIB", me.rib),
        ].join("");
      }
    }
  } catch (e) {
    console.error("loadProfile:", e);
  }
}

function profileRow(label, value) {
  if (!value || value === "-") return "";
  return `<div class="profile-row"><span class="profile-row-label">${escapeHtml(label)}</span><span class="profile-row-value">${escapeHtml(String(value))}</span></div>`;
}

/* ============================================================
   INIT & EVENT BINDING
   ============================================================ */

async function init() {
  await loadState();

  // Login
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
  });

  document.getElementById("toggle-password").addEventListener("click", () => {
    const input = document.getElementById("login-password");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    document.getElementById("eye-icon").style.display = isPassword ? "none" : "block";
    document.getElementById("eye-off-icon").style.display = isPassword ? "block" : "none";
  });

  // All logout buttons
  document.querySelectorAll(".logout-action").forEach((btn) => btn.addEventListener("click", doLogout));

  // ===== DIRIGEANT EVENTS =====
  document.getElementById("capture-btn")?.addEventListener("click", () => captureTicketPhoto("camera"));
  document.getElementById("gallery-btn")?.addEventListener("click", () => captureTicketPhoto("gallery"));
  document.getElementById("retake-btn")?.addEventListener("click", resetCapture);
  document.getElementById("new-capture-btn")?.addEventListener("click", resetCapture);
  document.getElementById("refresh-btn")?.addEventListener("click", loadHistory);

  document.getElementById("dir-org-select")?.addEventListener("change", async (e) => {
    await saveOrgId(e.target.value);
    loadHistory();
  });

  // ===== SALARIE EVENTS =====
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("qa-leave")?.addEventListener("click", () => switchTab("leave-form"));
  document.getElementById("qa-expense")?.addEventListener("click", () => switchTab("expense-form"));
  document.getElementById("qa-payslips")?.addEventListener("click", () => switchTab("payslips"));

  document.getElementById("btn-new-leave")?.addEventListener("click", () => switchTab("leave-form"));
  document.getElementById("btn-new-expense")?.addEventListener("click", () => switchTab("expense-form"));

  document.getElementById("back-from-leave-form")?.addEventListener("click", () => switchTab("leaves"));
  document.getElementById("back-from-expense-form")?.addEventListener("click", () => switchTab("expenses"));
  document.getElementById("back-from-directory")?.addEventListener("click", () => switchTab("profile"));

  document.getElementById("leave-form")?.addEventListener("submit", submitLeave);
  document.getElementById("expense-form")?.addEventListener("submit", submitExpense);

  document.getElementById("expense-photo-btn")?.addEventListener("click", () => captureExpensePhoto("camera"));
  document.getElementById("expense-gallery-btn")?.addEventListener("click", () => captureExpensePhoto("gallery"));
  document.getElementById("expense-retake-btn")?.addEventListener("click", () => {
    state.expenseImage = null;
    document.getElementById("expense-capture-placeholder").style.display = "block";
    document.getElementById("expense-preview").style.display = "none";
  });

  document.getElementById("menu-directory")?.addEventListener("click", () => switchTab("directory"));
  document.querySelector(".btn-refresh-payslips")?.addEventListener("click", loadPayslips);

  const today = new Date().toISOString().split("T")[0];
  const expDate = document.getElementById("expense-date");
  if (expDate) expDate.value = today;

  // Auto-login if token exists
  if (state.token) {
    await enterApp();
  }
}

document.addEventListener("DOMContentLoaded", init);
