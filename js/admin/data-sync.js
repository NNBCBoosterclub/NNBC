// ═══════════════════════════════════════════════════════════════════
//  Admin — pulls the latest shared admin data from Supabase and
//  re-renders. Split into its own module (rather than living in
//  pin.js or main.js) because both of those need to call it: pin.js's
//  route() calls it on every successful login, and main.js calls it
//  indirectly via route() at startup. Keeping it here avoids a
//  pin.js <-> main.js cycle.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { renderProductList } from "./products.js";
import { normalizeStoreStatus, renderStoreStatus, renderCheckoutAccessSettings, renderTicketGateSettings } from "./store-status.js";
import { normalizeReceipts, renderReceiptHistory } from "./receipts.js";

export async function initSharedDataFromServer() {
  const [productsResult, statusResult, receiptsResult] = await Promise.allSettled([
    DB.fetchProducts(),
    DB.fetchStoreStatus(),
    DB.loadReceipts(),
  ]);

  if (productsResult.status === "fulfilled") {
    state.products = productsResult.value;
  } else {
    console.warn("Could not fetch products from Supabase:", productsResult.reason);
  }

  if (statusResult.status === "fulfilled" && statusResult.value) {
    state.restockStatus = normalizeStoreStatus(statusResult.value);
  } else if (statusResult.status === "rejected") {
    console.warn("Could not fetch store status from Supabase:", statusResult.reason);
  }

  if (receiptsResult.status === "fulfilled") {
    state.receipts = normalizeReceipts(receiptsResult.value);
  } else {
    console.warn("Could not fetch receipts from Supabase:", receiptsResult.reason);
  }

  renderProductList();
  renderStoreStatus();
  renderCheckoutAccessSettings();
  renderTicketGateSettings();
  renderReceiptHistory();
}
