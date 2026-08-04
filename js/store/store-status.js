// ═══════════════════════════════════════════════════════════════════
//  Storefront — store status banner (ordered / restocked / normal)
//  Owns state.storeStatus: reads/writes go through the functions here.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { getById } from "./utils.js";

export function normalizeStoreStatus(value) {
  const rawState = value && typeof value === "object" ? value.state : null;
  const rawOverride = value?.ticketGateOverride;
  return {
    state: rawState === "ordered" || rawState === "restocked" ? rawState : "normal",
    message: value && typeof value.message === "string" ? value.message : null,
    ts: Number.isFinite(value?.ts) ? value.ts : null,
    checkoutRequired: !!value?.checkoutRequired,
    checkoutCodeHash: typeof value?.checkoutCodeHash === "string" && value.checkoutCodeHash ? value.checkoutCodeHash : null,
    ticketGateOverride: rawOverride === "open" || rawOverride === "closed" ? rawOverride : null,
  };
}

export function loadStoreStatus() {
  return { ...state.storeStatus };
}

export async function initStoreStatusFromServer() {
  try {
    const row = await DB.fetchStoreStatus();
    if (row) state.storeStatus = normalizeStoreStatus(row);
    updateStatusBanner();
  } catch (e) {
    console.warn("Could not fetch store status:", e);
  }
}

export function updateStatusBanner() {
  const status = loadStoreStatus();
  const banner = getById("store-status-banner");
  if (!banner) return;
  if (!status || !status.state || status.state === "normal") {
    banner.className = "store-status-banner is-hidden";
    return;
  }
  if (status.state === "ordered") {
    banner.className = "store-status-banner";
    banner.innerHTML = `📦 <strong>Items have been ordered</strong> — Restocking in progress, check back soon!`;
  } else if (status.state === "restocked") {
    banner.className = "store-status-banner restocked";
    banner.innerHTML = `✅ <strong>Store has been restocked!</strong> — New items are now available.`;
  }
}
