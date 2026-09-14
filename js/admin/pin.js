// ═══════════════════════════════════════════════════════════════════
//  Admin — routing (login screen vs. panel) and login/logout.
//
//  The PIN itself lives in the backend (see supabase/schema.sql —
//  admin_auth table + verify_admin_pin/set_admin_pin functions).
//  Nothing here can read or set the PIN directly; every check is a
//  round-trip to the server so there is no local "first run creates
//  an admin" path. SESSION_KEY is just a per-tab convenience flag so
//  you're not re-entering the PIN on every click.
// ═══════════════════════════════════════════════════════════════════
import { SESSION_KEY } from "./state.js";
import { $, showToast } from "./utils.js";
import { renderProductList } from "./products.js";
import { renderStoreStatus } from "./store-status.js";
import { renderReceiptHistory } from "./receipts.js";
import { refreshOrders } from "./orders.js";
import { initSharedDataFromServer } from "./data-sync.js";

// Determines which screen should be visible: login or admin panel.
// Also triggers initial data rendering once authenticated.
export function route() {
  const authed = sessionStorage.getItem(SESSION_KEY) === "1";

  $("login-screen").style.display  = "none";
  $("admin-panel").style.display   = "none";

  if (!authed) {
    $("login-screen").style.display = "flex";
    requestAnimationFrame(() => $("pin-input").focus());
  } else {
    $("admin-panel").style.display = "block";
    renderProductList();
    renderStoreStatus();
    renderReceiptHistory();
    refreshOrders();
    initSharedDataFromServer();
  }
}

// ─────────────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────────────
$("login-btn").addEventListener("click", async () => {
  const pin = $("pin-input").value;
  $("login-error").textContent = "";
  let ok = false;
  try {
    ok = await DB.verifyAdminPin(pin);
  } catch (e) {
    console.error("verifyAdminPin failed:", e);
    $("login-error").textContent = "Server error: " + (e?.message || "unknown — check console");
    return;
  }
  if (ok) {
    sessionStorage.setItem(SESSION_KEY, "1");
    $("pin-input").value = "";
    route();
  } else {
    $("login-error").textContent = "Incorrect PIN. Please try again.";
    $("pin-input").select();
  }
});

$("pin-input").addEventListener("keydown", e => { if (e.key === "Enter") $("login-btn").click(); });

// ─────────────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────────────
$("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  route();
});

// ─────────────────────────────────────────────────────
//  CHANGE PIN
// ─────────────────────────────────────────────────────
$("change-pin-btn").addEventListener("click", async () => {
  const oldPin = $("current-pin").value.trim();
  const pin    = $("new-pin").value.trim();
  const pin2   = $("new-pin-confirm").value.trim();
  $("pin-change-error").textContent = "";

  if (!oldPin)         { $("pin-change-error").textContent = "Enter the current PIN."; return; }
  if (pin.length < 4)  { $("pin-change-error").textContent = "PIN must be at least 4 characters."; return; }
  if (pin !== pin2)    { $("pin-change-error").textContent = "PINs do not match."; return; }

  let ok = false;
  try {
    ok = await DB.setAdminPin(oldPin, pin);
  } catch (e) {
    console.error("setAdminPin failed:", e);
    $("pin-change-error").textContent = "Server error: " + (e?.message || "unknown — check console");
    return;
  }
  if (!ok) {
    $("pin-change-error").textContent = "Current PIN is incorrect.";
    return;
  }
  $("current-pin").value = "";
  $("new-pin").value = "";
  $("new-pin-confirm").value = "";
  showToast("✅ PIN updated successfully.");
});
