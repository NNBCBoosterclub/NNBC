// ═══════════════════════════════════════════════════════════════════
//  Storefront — entry point
//
//  Importing each feature module runs its top-level code once, which
//  is where they attach their own button/modal event listeners (same
//  as the old single inline <script> did line-by-line). ES modules
//  guarantee every imported module has fully finished that top-level
//  setup before this file's own top-level code below runs, so the
//  ordering bug from the pre-module version (a render call reading a
//  variable declared further down the same script) can't happen here
//  by construction -- the module graph is resolved before anything
//  executes, not linearly top-to-bottom in one file.
// ═══════════════════════════════════════════════════════════════════
import { state, STORAGE_KEY } from "./state.js";
import { loadProducts, initProductsFromServer, buildBarcodeMap } from "./products.js";
import { buildTabs, renderProducts } from "./catalog.js";
import { updateCartUI } from "./cart.js";
import { updateUserChip, initAuthSync, openAuthModal } from "./account.js";
import { updateStatusBanner, initStoreStatusFromServer, loadStoreStatus } from "./store-status.js";
import { isTicketSaleOpen } from "./ticket-gate.js";

// These modules have no exports main.js needs directly, but importing
// them is what runs their event-listener wiring.
import "./checkout.js";
import "./share-scanner.js";

// ─────────────────────────────────────────────────────
//  STATE — initial catalog load (localStorage cache first, Supabase next)
// ─────────────────────────────────────────────────────
state.products = loadProducts();

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
// Startup order is intentional: filters/tabs render first, then cart/user display updates.
buildTabs();
renderProducts();
buildBarcodeMap();
updateCartUI();
updateUserChip();
initAuthSync();

// Fetch the latest catalog from Supabase (localStorage provides instant first paint).
initProductsFromServer(() => {
  buildTabs();
  renderProducts();
  buildBarcodeMap();
});

// ─────────────────────────────────────────────────────
//  STORE STATUS BANNER
// ─────────────────────────────────────────────────────
updateStatusBanner();
initStoreStatusFromServer();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) initStoreStatusFromServer();
});

// Re-check the ticket gate roughly every minute so a tab left open
// across the Thu 23:59 ET cutoff (or the Sat reopen) flips over on its
// own instead of waiting for the next reload or tab-focus event.
let _lastTicketGateOpen = isTicketSaleOpen(loadStoreStatus());
setInterval(() => {
  const nowOpen = isTicketSaleOpen(loadStoreStatus());
  if (nowOpen !== _lastTicketGateOpen) {
    _lastTicketGateOpen = nowOpen;
    renderProducts();
  }
}, 60 * 1000);

// ─────────────────────────────────────────────────────
//  REALTIME — refresh product list when stock changes on any device
// ─────────────────────────────────────────────────────
DB.subscribeToProducts(async () => {
  const fresh = await DB.fetchProducts().catch(() => null);
  if (!fresh) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  state.products = fresh;
  buildTabs();
  renderProducts();
  buildBarcodeMap();
});

// Show auth modal on first visit if not logged in and not dismissed as guest
if (!state.sbUser && !localStorage.getItem("nnbc_guest_dismissed")) {
  setTimeout(() => openAuthModal("login"), 800);
}
