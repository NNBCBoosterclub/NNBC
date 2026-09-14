// ═══════════════════════════════════════════════════════════════════
//  Storefront — checkout modal, checkout access code, ticket-gate
//  re-check at payment time, cash/Venmo payment, cash receipt modal.
// ═══════════════════════════════════════════════════════════════════
import { state, VENMO_USERNAME, VENMO_DISPLAY, GUEST_NAME, STORAGE_KEY } from "./state.js";
import { getById, formatPrice, escHtml, showToast } from "./utils.js";
import { cartTotal, cartNutritionTotals, cartAllergens, updateCartUI, closeCart } from "./cart.js";
import { buildTabs, renderProducts } from "./catalog.js";
import { getDisplayName, getCurrentUsername } from "./account.js";
import { loadStoreStatus } from "./store-status.js";
import { isTicketSaleOpen } from "./ticket-gate.js";

// ─────────────────────────────────────────────────────
//  ORDER LOG — Supabase-backed
// ─────────────────────────────────────────────────────
async function logOrder(method) {
  const entries = Object.entries(state.cart).filter(([,q]) => q > 0);
  if (!entries.length) return null;
  const items = entries.map(([pid, qty]) => {
    const p = state.products.find(p => p.id === +pid);
    return p ? { id: p.id, name: p.name, emoji: p.emoji, qty, price: p.price } : null;
  }).filter(Boolean);
  const order = await DB.logOrder({
    items,
    method,
    buyerName: getDisplayName(),
    userId:    state.sbUser ? state.sbUser.id : null,
  });
  // Keep local orders cache in sync for the profile modal.
  state.sbOrders.unshift(order);
  return order;
}

// ─────────────────────────────────────────────────────
//  CHECKOUT MODAL
// ─────────────────────────────────────────────────────
// Builds checkout summary from current in-memory cart.
export function openCheckout() {
  const entries = Object.entries(state.cart).filter(([,q]) => q > 0);
  const total   = cartTotal();

  // Populate buyer name and adjust the change-button label
  getById("checkout-buyer-name").textContent = getDisplayName();
  getById("change-name-btn").textContent = getCurrentUsername() ? "👤 Profile" : "✏️ Sign In";

  const list = getById("modal-order-list");
  list.innerHTML = "";
  entries.forEach(([id, qty]) => {
    const p = state.products.find(p => p.id === +id);
    if (!p) return;
    const li = document.createElement("li");
    li.innerHTML = `<span>${p.emoji || '🛍️'} ${qty}× ${escHtml(p.name)}</span><span>${formatPrice(p.price * qty)}</span>`;
    list.appendChild(li);
  });

  getById("modal-total").textContent       = formatPrice(total);
  getById("venmo-display-name").textContent = VENMO_DISPLAY;
  getById("venmo-handle").textContent       = "@" + VENMO_USERNAME;

  // Nutrition totals
  const checkoutNutEl = getById("checkout-nutrition-summary");
  if (checkoutNutEl) {
    const { totalCal, totalProt, hasCal, hasProt } = cartNutritionTotals();
    if (hasCal || hasProt) {
      const parts = [];
      if (hasCal)  parts.push(`🔥 ${totalCal} cal`);
      if (hasProt) parts.push(`💪 ${totalProt}g protein`);
      checkoutNutEl.innerHTML = `<span>Order nutrition total:</span><span>${escHtml(parts.join(' · '))}</span>`;
      checkoutNutEl.classList.remove("is-hidden");
    } else {
      checkoutNutEl.classList.add("is-hidden");
    }
  }

  // Allergen warning
  const checkoutAlgEl = getById("checkout-allergy-warning");
  if (checkoutAlgEl) {
    const allergens = cartAllergens();
    if (allergens.length > 0) {
      checkoutAlgEl.innerHTML = `<span>⚠️</span><span><strong>Allergen notice:</strong> Your order contains items with: ${escHtml(allergens.join(', '))}</span>`;
      checkoutAlgEl.classList.remove("is-hidden");
    } else {
      checkoutAlgEl.classList.add("is-hidden");
    }
  }

  const status = loadStoreStatus();
  const codeBlock = getById("checkout-code-block");
  const codeInput = getById("checkout-access-code");
  const codeError = getById("checkout-code-error");
  if (codeBlock && codeInput && codeError) {
    const required = !!status.checkoutRequired && !!status.checkoutCodeHash;
    codeBlock.classList.toggle("is-hidden", !required);
    codeInput.value = "";
    codeError.textContent = "";
    if (required) setTimeout(() => codeInput.focus(), 0);
  }

  getById("checkout-modal").classList.add("open");
}

export function closeCheckout() {
  getById("checkout-modal").classList.remove("open");
}

getById("checkout-btn").addEventListener("click", () => { closeCart(); openCheckout(); });
getById("close-modal").addEventListener("click", closeCheckout);
getById("cancel-checkout").addEventListener("click", closeCheckout);
getById("checkout-modal").addEventListener("click", e => {
  if (e.target === getById("checkout-modal")) closeCheckout();
});

// ─────────────────────────────────────────────────────
//  CHECKOUT ACCESS CODE
// ─────────────────────────────────────────────────────
async function hashCheckoutCode(code) {
  const encoder = new TextEncoder();
  const data = encoder.encode("nnbc_checkout_code_v1:" + code);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function validateCheckoutAccessCode() {
  const status = loadStoreStatus();
  const codeBlock = getById("checkout-code-block");
  const codeInput = getById("checkout-access-code");
  const codeError = getById("checkout-code-error");
  if (!codeBlock || !codeInput || !codeError) return true;

  if (!status.checkoutRequired || !status.checkoutCodeHash) {
    codeBlock.classList.add("is-hidden");
    codeInput.value = "";
    codeError.textContent = "";
    return true;
  }

  const rawCode = codeInput.value.trim();
  if (!rawCode) {
    codeError.textContent = "Enter the checkout code to continue.";
    return false;
  }

  const inputHash = await hashCheckoutCode(rawCode);
  if (inputHash !== status.checkoutCodeHash) {
    codeError.textContent = "Invalid checkout code.";
    return false;
  }

  codeError.textContent = "";
  return true;
}

// Defense-in-depth: re-check the ticket gate at the moment of payment,
// not just at render time. A ticket could have been added to the cart
// before the Thu 23:59 ET cutoff and paid for after it, if the tab was
// left open. Blocks the specific gated items rather than the whole cart.
function validateTicketGateForCart() {
  if (isTicketSaleOpen(loadStoreStatus())) return true;
  const blocked = Object.entries(state.cart)
    .filter(([, q]) => q > 0)
    .map(([id]) => state.products.find(p => p.id === +id))
    .filter(p => p && p.isTicket);
  if (blocked.length === 0) return true;
  blocked.forEach(p => delete state.cart[p.id]);
  updateCartUI();
  renderProducts();
  showToast(`Ticket sales are closed right now — removed ${blocked.map(p => p.name).join(', ')} from your cart.`);
  return false;
}

// ─────────────────────────────────────────────────────
//  CASH PAYMENT
// ─────────────────────────────────────────────────────
getById("pay-cash-btn").addEventListener("click", async () => {
  if (!validateTicketGateForCart()) return;
  if (!(await validateCheckoutAccessCode())) return;

  // Decrement stock locally for instant UI feedback.
  Object.entries(state.cart).forEach(([id, qty]) => {
    const item = state.products.find(p => p.id === +id);
    if (item && item.stock !== null && item.stock !== undefined) {
      item.stock = Math.max(0, item.stock - qty);
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));

  // Persist order to Supabase (also decrements stock atomically on server).
  let order = null;
  try {
    order = await logOrder("cash");
  } catch(e) {
    console.warn("Order log failed:", e);
  }

  closeCheckout();
  Object.keys(state.cart).forEach(k => delete state.cart[k]);
  updateCartUI();
  buildTabs();
  renderProducts();

  if (order) {
    openCashReceipt(order);
  } else {
    showToast("Cash order placed! Please pay at the counter 💵");
  }
});

// ─────────────────────────────────────────────────────
//  VENMO DEEP LINK + STOCK DECREMENT
// ─────────────────────────────────────────────────────
getById("open-venmo-btn").addEventListener("click", async () => {
  if (!validateTicketGateForCart()) return;
  if (!(await validateCheckoutAccessCode())) return;

  const total     = cartTotal();
  const buyerName = getDisplayName();

  // Venmo note includes buyer name (if known) plus compact item list.
  const noteParts = Object.entries(state.cart)
    .filter(([,q]) => q > 0)
    .map(([id, qty]) => {
      const p = state.products.find(p => p.id === +id);
      return p ? `${qty}x ${p.name}` : "";
    })
    .filter(Boolean);
  const namePrefix = buyerName !== GUEST_NAME ? buyerName + " - " : "";
  const note = "NNBC Snack Bar: " + namePrefix + noteParts.join(", ");

  // Match cash behavior: reduce tracked stock client-side for instant UI feedback.
  Object.entries(state.cart).forEach(([id, qty]) => {
    const item = state.products.find(p => p.id === +id);
    if (item && item.stock !== null && item.stock !== undefined) {
      item.stock = Math.max(0, item.stock - qty);
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));

  // Venmo orders are logged as paid right away (async, non-blocking).
  logOrder("venmo").catch(e => console.warn("Order log failed:", e));

  const params = new URLSearchParams({
    txn:        "pay",
    audience:   "private",
    recipients: VENMO_USERNAME,
    amount:     total.toFixed(2),
    note:       note,
  });
  window.open("https://venmo.com/?" + params.toString(), "_blank", "noopener,noreferrer");

  closeCheckout();
  Object.keys(state.cart).forEach(k => delete state.cart[k]);
  updateCartUI();
  // Re-render products to reflect stock changes (e.g., newly out-of-stock items)
  buildTabs();
  renderProducts();
  showToast("Thanks! Complete payment in Venmo 🎉");
});

// ─────────────────────────────────────────────────────
//  CASH RECEIPT MODAL
// ─────────────────────────────────────────────────────
function openCashReceipt(order) {
  getById("receipt-order-num").textContent  = order.id;
  getById("receipt-buyer-name").textContent = order.buyerName;
  const ul = getById("receipt-items-list");
  ul.innerHTML = "";
  order.items.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${item.qty}× ${escHtml(item.name)}</span><span>${formatPrice(item.price * item.qty)}</span>`;
    ul.appendChild(li);
  });
  getById("receipt-total-amt").textContent = formatPrice(order.total);
  getById("cash-receipt-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCashReceipt() {
  getById("cash-receipt-modal").classList.remove("open");
  document.body.style.overflow = "";
}

getById("close-cash-receipt").addEventListener("click", closeCashReceipt);
getById("done-cash-btn").addEventListener("click", closeCashReceipt);
getById("cash-receipt-modal").addEventListener("click", e => {
  if (e.target === getById("cash-receipt-modal")) closeCashReceipt();
});
