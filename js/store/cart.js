// ═══════════════════════════════════════════════════════════════════
//  Storefront — cart math, cart drawer rendering, open/close
//  Owns state.cart (product-quantity map).
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { getById, formatPrice, escHtml, safeImageUrl } from "./utils.js";

// Total is computed dynamically from current cart quantities and current product prices.
export function cartTotal() {
  return Object.entries(state.cart).reduce((sum, [id, qty]) => {
    const p = state.products.find(p => p.id === +id);
    return sum + (p ? p.price * qty : 0);
  }, 0);
}

export function cartCount() {
  return Object.values(state.cart).reduce((s, q) => s + q, 0);
}

export function cartNutritionTotals() {
  let totalCal = 0, totalProt = 0, hasCal = false, hasProt = false;
  Object.entries(state.cart).forEach(([id, qty]) => {
    const p = state.products.find(p => p.id === +id);
    if (p && p.nutrition) {
      if (p.nutrition.calories != null) { totalCal += p.nutrition.calories * qty; hasCal = true; }
      if (p.nutrition.protein  != null) { totalProt += p.nutrition.protein  * qty; hasProt = true; }
    }
  });
  return {
    totalCal:  Math.round(totalCal),
    totalProt: Math.round(totalProt * 10) / 10,
    hasCal,
    hasProt,
  };
}

export function cartAllergens() {
  const set = new Set();
  Object.entries(state.cart).forEach(([id, qty]) => {
    if (qty <= 0) return;
    const p = state.products.find(p => p.id === +id);
    if (p && p.allergies) {
      p.allergies.split(',').map(a => a.trim()).filter(Boolean).forEach(a => set.add(a));
    }
  });
  return [...set];
}

export function updateCartUI() {
  // Main cart redraw entry point; call after every cart mutation.
  const count = cartCount();
  const badge = getById("cart-badge");
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
  getById("cart-total").textContent = formatPrice(cartTotal());
  getById("checkout-btn").disabled = count === 0;

  // Nutrition summary
  const nutEl = getById("cart-nutrition-summary");
  if (nutEl) {
    const { totalCal, totalProt, hasCal, hasProt } = cartNutritionTotals();
    if (count > 0 && (hasCal || hasProt)) {
      const parts = [];
      if (hasCal)  parts.push(`🔥 ${totalCal} cal`);
      if (hasProt) parts.push(`💪 ${totalProt}g protein`);
      nutEl.innerHTML = `<span>Cart nutrition total</span><span>${escHtml(parts.join(' · '))}</span>`;
      nutEl.classList.remove("is-hidden");
    } else {
      nutEl.classList.add("is-hidden");
    }
  }

  // Allergen warning
  const algEl = getById("cart-allergy-warning");
  if (algEl) {
    const allergens = cartAllergens();
    if (count > 0 && allergens.length > 0) {
      algEl.innerHTML = `<span>⚠️</span><span><strong>Allergens in cart:</strong> ${escHtml(allergens.join(', '))}</span>`;
      algEl.classList.remove("is-hidden");
    } else {
      algEl.classList.add("is-hidden");
    }
  }

  renderCartItems();
}

function renderCartItems() {
  const container = getById("cart-items");
  const entries = Object.entries(state.cart).filter(([,q]) => q > 0);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span>🛒</span>
        Your cart is empty.<br>Add some snacks!
      </div>`;
    return;
  }

  container.innerHTML = "";
  entries.forEach(([id, qty]) => {
    const p = state.products.find(p => p.id === +id);
    if (!p) return;
    const row = document.createElement("div");
    row.className = "cart-item";

    const imgUrl = safeImageUrl(p.imageUrl);
    const visual = document.createElement(imgUrl ? "img" : "div");
    if (imgUrl) {
      visual.className = "cart-item-img";
      visual.alt = p.name;
      visual.src = imgUrl;
    } else {
      visual.className = "cart-item-emoji";
      visual.textContent = p.emoji || "🛍️";
    }

    row.insertAdjacentHTML("beforeend", `
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(p.name)}</div>
        <div class="cart-item-unit">${formatPrice(p.price)} each</div>
      </div>
      <div class="cart-item-qty">
        <button class="cqty-btn" data-id="${p.id}" data-action="dec" aria-label="Remove one ${escHtml(p.name)}">−</button>
        <span class="cqty-val">${qty}</span>
        <button class="cqty-btn" data-id="${p.id}" data-action="inc" aria-label="Add one ${escHtml(p.name)}">+</button>
      </div>
      <div class="cart-item-total">${formatPrice(p.price * qty)}</div>`);
    row.insertBefore(visual, row.firstChild);

    // In-cart +/- keeps adjustments close to checkout.
    row.querySelectorAll(".cqty-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const pid = +btn.dataset.id;
        if (btn.dataset.action === "inc") {
          state.cart[pid] = (state.cart[pid] || 0) + 1;
        } else {
          state.cart[pid] = Math.max(0, (state.cart[pid] || 0) - 1);
          if (state.cart[pid] === 0) delete state.cart[pid];
        }
        updateCartUI();
      });
    });

    container.appendChild(row);
  });
}

// ─────────────────────────────────────────────────────
//  CART OPEN / CLOSE
// ─────────────────────────────────────────────────────
export function openCart() {
  getById("cart-drawer").classList.add("open");
  getById("cart-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeCart() {
  getById("cart-drawer").classList.remove("open");
  getById("cart-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

getById("cart-btn").addEventListener("click", openCart);
getById("close-cart").addEventListener("click", closeCart);
getById("cart-overlay").addEventListener("click", closeCart);
