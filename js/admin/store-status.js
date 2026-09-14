// ═══════════════════════════════════════════════════════════════════
//  Admin — store status banner, checkout access code, ticket sales
//  gate settings. Owns state.restockStatus.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { $, showToast } from "./utils.js";

export function normalizeStoreStatus(value) {
  const rawState = value && typeof value === "object" ? value.state : null;
  const normalizedState = rawState === "ordered" || rawState === "restocked" ? rawState : "normal";
  return {
    state: normalizedState,
    message: value && typeof value.message === "string" ? value.message : null,
    ts: Number.isFinite(value?.ts) ? value.ts : null,
    checkoutRequired: !!value?.checkoutRequired,
    checkoutCodeHash: typeof value?.checkoutCodeHash === "string" && value.checkoutCodeHash ? value.checkoutCodeHash : null,
    ticketGateOverride: (value?.ticketGateOverride === "open" || value?.ticketGateOverride === "closed") ? value.ticketGateOverride : null,
  };
}

export async function hashCheckoutCode(code) {
  const encoder = new TextEncoder();
  const data = encoder.encode("nnbc_checkout_code_v1:" + code);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────
//  STORE STATUS MANAGEMENT
// ─────────────────────────────────────────────────────
export function loadRestockStatus() {
  return { ...state.restockStatus };
}

export async function saveRestockStatus(newState, message = null) {
  const nextStatus = normalizeStoreStatus({ state: newState, message, ts: Date.now() });
  await DB.saveStoreStatus(newState, message);
  state.restockStatus = nextStatus;
}

export function renderStoreStatus() {
  const status = loadRestockStatus();
  const el = $("admin-status-display");
  if (!el) return;
  if (!status || !status.state || status.state === "normal") {
    el.textContent = "No active status message — store is in normal operation.";
    el.style.color = "";
  } else if (status.state === "ordered") {
    el.innerHTML = `📦 <strong>Items Ordered</strong> — Customers see: "Items have been ordered — Restocking in progress!"`;
    el.style.color = "#7a5a00";
  } else if (status.state === "restocked") {
    el.innerHTML = `✅ <strong>Store Restocked</strong> — Customers see: "Store has been restocked!"`;
    el.style.color = "#1a7a40";
  }
}

export function renderCheckoutAccessSettings() {
  const enabledEl = $("checkout-code-enabled");
  const inputEl = $("checkout-code-input");
  const statusEl = $("checkout-code-status");
  if (!enabledEl || !inputEl || !statusEl) return;

  const enabled = !!state.restockStatus.checkoutRequired;
  enabledEl.checked = enabled;
  statusEl.textContent = enabled
    ? "🔒 Checkout code is currently required."
    : "🔓 Checkout code is currently optional.";
  statusEl.style.color = enabled ? "#7a5a00" : "var(--success)";
}

$("checkout-code-enabled").addEventListener("change", () => {
  const statusEl = $("checkout-code-status");
  if (!statusEl) return;
  statusEl.textContent = "Unsaved changes. Click Save Checkout Code to publish.";
  statusEl.style.color = "#7a5a00";
});

$("save-checkout-code-btn").addEventListener("click", async () => {
  const enabled = $("checkout-code-enabled").checked;
  const rawCode = $("checkout-code-input").value.trim();
  const statusEl = $("checkout-code-status");

  try {
    let codeHash = state.restockStatus.checkoutCodeHash || null;
    if (rawCode) {
      if (rawCode.length < 4) {
        statusEl.textContent = "Checkout code must be at least 4 characters.";
        statusEl.style.color = "var(--danger)";
        return;
      }
      codeHash = await hashCheckoutCode(rawCode);
    }

    if (enabled && !codeHash) {
      statusEl.textContent = "Set a checkout code before enabling this requirement.";
      statusEl.style.color = "var(--danger)";
      return;
    }

    await DB.saveCheckoutAccess({ required: enabled, codeHash });
    state.restockStatus = {
      ...state.restockStatus,
      checkoutRequired: enabled,
      checkoutCodeHash: codeHash,
    };

    $("checkout-code-input").value = "";
    renderCheckoutAccessSettings();
    showToast("🔐 Checkout access settings saved.");
  } catch (err) {
    statusEl.textContent = err.message || "Could not save checkout code settings.";
    statusEl.style.color = "var(--danger)";
    showToast(`⚠️ ${err.message || "Could not save checkout code settings."}`, true);
  }
});

// ─────────────────────────────────────────────────────
//  TICKET SALES GATE
// ─────────────────────────────────────────────────────
export function renderTicketGateSettings() {
  const modeEl = $("ticket-gate-mode");
  const statusEl = $("ticket-gate-status");
  if (!modeEl || !statusEl) return;

  const override = state.restockStatus.ticketGateOverride || null;
  modeEl.value = override === "open" ? "open" : override === "closed" ? "closed" : "auto";

  if (override === "open") {
    statusEl.textContent = "🔓 Forced open — ticket items sell regardless of day.";
    statusEl.style.color = "var(--success)";
  } else if (override === "closed") {
    statusEl.textContent = "🔒 Forced closed — ticket items are blocked regardless of day.";
    statusEl.style.color = "var(--danger)";
  } else {
    statusEl.textContent = "⏱️ Automatic — closes all day Friday (Eastern time), reopens Saturday.";
    statusEl.style.color = "#7a5a00";
  }
}

$("save-ticket-gate-btn").addEventListener("click", async () => {
  const mode = $("ticket-gate-mode").value;
  const override = mode === "open" ? "open" : mode === "closed" ? "closed" : null;
  const statusEl = $("ticket-gate-status");

  try {
    await DB.saveTicketGateOverride(override);
    state.restockStatus = { ...state.restockStatus, ticketGateOverride: override };
    renderTicketGateSettings();
    showToast("🎟️ Ticket gate setting saved.");
  } catch (err) {
    statusEl.textContent = err.message || "Could not save ticket gate setting.";
    statusEl.style.color = "var(--danger)";
    showToast(`⚠️ ${err.message || "Could not save ticket gate setting."}`, true);
  }
});

$("btn-mark-ordered").addEventListener("click", async () => {
  try {
    await saveRestockStatus("ordered");
    renderStoreStatus();
    showToast("📦 Status set to 'Items Ordered'.");
  } catch (err) {
    showToast(`⚠️ ${err.message || "Could not publish status change."}`, true);
  }
});

$("btn-mark-restocked").addEventListener("click", async () => {
  try {
    await saveRestockStatus("restocked");
    renderStoreStatus();
    showToast("✅ Status set to 'Store Restocked'.");
  } catch (err) {
    showToast(`⚠️ ${err.message || "Could not publish status change."}`, true);
  }
});

$("btn-clear-status").addEventListener("click", async () => {
  try {
    await saveRestockStatus("normal");
    renderStoreStatus();
    showToast("🔕 Status cleared.");
  } catch (err) {
    showToast(`⚠️ ${err.message || "Could not publish status change."}`, true);
  }
});
