// ═══════════════════════════════════════════════════════════════════
//  Storefront — menu browsing: category/subcategory tabs, product grid,
//  nutrition facts modal. Owns activeCategory/activeSubcategory/
//  shopSearchQuery on state.
// ═══════════════════════════════════════════════════════════════════
import { state, SUBCATEGORIES } from "./state.js";
import { getById, formatPrice, escHtml, safeImageUrl, showToast } from "./utils.js";
import { loadStoreStatus } from "./store-status.js";
import { isTicketSaleOpen, ticketGateMessage } from "./ticket-gate.js";
import { updateCartUI } from "./cart.js";

// ─────────────────────────────────────────────────────
//  NUTRITION FACTS MODAL
// ─────────────────────────────────────────────────────
export function openNutritionModal(product) {
  const n = product.nutrition;
  const panel = getById("nutrition-panel-content");

  // Helper to format a numeric value with a unit, or "—" if absent.
  const fmt = (val, unit) => (val !== null && val !== undefined) ? `${val}${unit}` : "—";

  let html = `<div class="nf-title">Nutrition Facts</div>`;
  html += `<div class="nf-serving">${escHtml(product.name)}</div>`;

  if (n) {
    if (n.servingSize) {
      html += `<div class="nf-serving">Serving size: ${escHtml(n.servingSize)}</div>`;
    }

    html += `<div class="nf-calories-row">
      <span class="nf-cal-label">Calories</span>
      <span class="nf-cal-val">${fmt(n.calories, "")}</span>
    </div>`;

    html += `<div class="nf-daily-note">% Daily Value*</div>`;

    const rows = [
      { label: "Total Fat",          val: fmt(n.totalFat,      "g"),  sub: false },
      { label: "Saturated Fat",      val: fmt(n.saturatedFat,  "g"),  sub: true  },
      { label: "Trans Fat",          val: fmt(n.transFat,      "g"),  sub: true  },
      { label: "Cholesterol",        val: fmt(n.cholesterol,   "mg"), sub: false },
      { label: "Sodium",             val: fmt(n.sodium,        "mg"), sub: false },
      { label: "Total Carbohydrate", val: fmt(n.totalCarbs,    "g"),  sub: false },
      { label: "Dietary Fiber",      val: fmt(n.dietaryFiber,  "g"),  sub: true  },
      { label: "Total Sugars",       val: fmt(n.totalSugars,   "g"),  sub: true  },
      { label: "Protein",            val: fmt(n.protein,       "g"),  sub: false, thick: true },
    ];

    rows.forEach(r => {
      const cls = ["nf-row", r.sub ? "sub" : "", r.thick ? "thick" : ""].filter(Boolean).join(" ");
      html += `<div class="${cls}">
        <span class="nf-label">${escHtml(r.label)}</span>
        <span class="nf-val">${escHtml(r.val)}</span>
      </div>`;
    });
  } else {
    html += `<div class="nutrition-empty-note">Nutrition information not available for this item.</div>`;
  }

  // Allergen section (always shown if present, regardless of nutrition data)
  if (product.allergies) {
    html += `<div class="nf-allergy">
      <strong>⚠️ Allergen Information:</strong>
      ${escHtml(product.allergies)}
    </div>`;
  }

  panel.innerHTML = html;
  getById("nutrition-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeNutritionModal() {
  getById("nutrition-modal").classList.remove("open");
  document.body.style.overflow = "";
}

getById("close-nutrition-modal").addEventListener("click", closeNutritionModal);
getById("nutrition-modal").addEventListener("click", e => {
  if (e.target === getById("nutrition-modal")) closeNutritionModal();
});

// ─────────────────────────────────────────────────────
//  RENDER MENU
// ─────────────────────────────────────────────────────
export function getCategories() {
  return ["All", ...new Set(state.products.map(p => p.category))];
}

export function buildTabs() {
  const container = getById("tabs");
  container.innerHTML = "";

  // Parent tabs row
  const parentRow = document.createElement("div");
  parentRow.className = "tabs-row";
  getCategories().forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (cat === state.activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      state.activeCategory    = cat;
      state.activeSubcategory = "All";
      buildTabs();
      renderProducts();
    });
    parentRow.appendChild(btn);
  });
  container.appendChild(parentRow);

  // Render sub-tabs only when the current category has entries in SUBCATEGORIES.
  if (state.activeCategory !== "All" && SUBCATEGORIES[state.activeCategory]) {
    const subRow = document.createElement("div");
    subRow.className = "tabs-row subtabs-row";

    const allBtn = document.createElement("button");
    allBtn.className = "tab-btn subtab-btn" + (state.activeSubcategory === "All" ? " active" : "");
    allBtn.textContent = "All " + state.activeCategory + "s";
    allBtn.addEventListener("click", () => {
      state.activeSubcategory = "All";
      buildTabs();
      renderProducts();
    });
    subRow.appendChild(allBtn);

    SUBCATEGORIES[state.activeCategory].forEach(sub => {
      const btn = document.createElement("button");
      btn.className = "tab-btn subtab-btn" + (sub === state.activeSubcategory ? " active" : "");
      btn.textContent = sub;
      btn.addEventListener("click", () => {
        state.activeSubcategory = sub;
        buildTabs();
        renderProducts();
      });
      subRow.appendChild(btn);
    });
    container.appendChild(subRow);
  }
}

export function renderProducts() {
  const grid = getById("product-grid");
  grid.innerHTML = "";
  let filtered = state.activeCategory === "All"
    ? state.products
    : state.products.filter(p => p.category === state.activeCategory);

  if (state.activeSubcategory !== "All" && SUBCATEGORIES[state.activeCategory]) {
    filtered = filtered.filter(p => p.subcategory === state.activeSubcategory);
  }

  // Search spans name/category/subcategory so users can find items quickly.
  if (state.shopSearchQuery.trim()) {
    const q = state.shopSearchQuery.trim().toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.subcategory && p.subcategory.toLowerCase().includes(q))
    );
  }

  const ticketStatus = loadStoreStatus();
  const ticketSaleOpen = isTicketSaleOpen(ticketStatus);

  filtered.forEach(p => {
    // Stock model:
    // null/undefined => unlimited (always purchasable)
    // 0              => out of stock
    // positive int   => tracked remaining quantity
    const ticketGated = !!p.isTicket && !ticketSaleOpen;
    const outOfStock  = p.stock === 0 || ticketGated;
    const qty = state.cart[p.id] || 0;

    const card = document.createElement("div");
    card.className = "product-card" + (outOfStock ? " out-of-stock" : "");
    card.dataset.id = p.id;

    // Visual: image takes priority over emoji
    const imgUrl = safeImageUrl(p.imageUrl);
    const visual = document.createElement(imgUrl ? "img" : "div");
    if (imgUrl) {
      visual.className = "product-img";
      visual.alt = p.name;
      visual.src = imgUrl;
    } else {
      visual.className = "product-emoji";
      visual.textContent = p.emoji || "🛍️";
    }
    card.appendChild(visual);

    // Low-stock threshold lives here.
    // Change "<= 5" if you want earlier/later warning badges.
    const lowStockBadge = (p.stock !== null && p.stock > 0 && p.stock <= 5)
      ? `<div class="stock-badge low">Only ${p.stock} left!</div>`
      : "";

    // Inline calories & protein under the price
    const calStr  = p.nutrition && p.nutrition.calories != null ? `🔥 ${p.nutrition.calories} cal` : null;
    const protStr = p.nutrition && p.nutrition.protein  != null ? `💪 ${p.nutrition.protein}g protein` : null;
    const nutritionInline = (calStr || protStr)
      ? `<div class="product-nutrition-inline">${[calStr, protStr].filter(Boolean).map(escHtml).join(' · ')}</div>`
      : '';

    // Allergy badge (click opens nutrition modal for full details)
    const allergyBadge = p.allergies
      ? `<button class="product-allergy-badge" aria-label="View allergen info for ${escHtml(p.name)}">⚠️ Contains allergens</button>`
      : '';

    card.insertAdjacentHTML("beforeend", `
      <div class="product-name">${escHtml(p.name)}</div>
      <div class="product-price">${formatPrice(p.price)}</div>
      ${nutritionInline}
      ${allergyBadge}
      ${lowStockBadge}
      ${(p.nutrition || p.allergies) ? `<button class="nutrition-btn" aria-label="View nutrition facts for ${escHtml(p.name)}">🥗 ${p.allergies && !p.nutrition ? 'Allergen Info' : 'Nutrition Facts'}</button>` : ""}
      <div class="qty-control">
        <button class="qty-btn" data-action="dec" aria-label="Decrease quantity" ${outOfStock ? 'disabled' : ''}>−</button>
        <span class="qty-display" id="qty-${p.id}">${qty}</span>
        <button class="qty-btn" data-action="inc" aria-label="Increase quantity" ${outOfStock ? 'disabled' : ''}>+</button>
      </div>
      <button class="add-btn" ${qty === 0 || outOfStock ? 'disabled' : ''} data-id="${p.id}">
        ${ticketGated ? (ticketGateMessage(ticketStatus) || 'Ticket sales closed') : outOfStock ? 'Out of Stock' : qty === 0 ? 'Select quantity' : `Add ${qty} to cart`}
      </button>`);

    // Nutrition button opens the nutrition facts panel.
    const nutritionBtn = card.querySelector(".nutrition-btn");
    if (nutritionBtn) {
      nutritionBtn.addEventListener("click", () => openNutritionModal(p));
    }

    // Allergy badge also opens the nutrition modal (where full allergen info lives).
    const allergyBadgeBtn = card.querySelector(".product-allergy-badge");
    if (allergyBadgeBtn) {
      allergyBadgeBtn.addEventListener("click", () => openNutritionModal(p));
    }

    // Qty controls update card-local quantity only.
    // Cart is updated when the user presses "Add ... to cart".
    card.querySelectorAll(".qty-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (outOfStock) return;
        const action = btn.dataset.action;
        const cur = parseInt(getById("qty-" + p.id).textContent, 10);
        // Clamp quantity to available tracked stock.
        const maxQty = (p.stock !== null) ? p.stock : Infinity;
        const next = action === "inc"
          ? Math.min(cur + 1, maxQty)
          : Math.max(0, cur - 1);
        getById("qty-" + p.id).textContent = next;
        const addBtn = card.querySelector(".add-btn");
        addBtn.disabled = next === 0;
        addBtn.textContent = next === 0 ? "Select quantity" : `Add ${next} to cart`;
      });
    });

    // Commit selected quantity into shared cart state.
    card.querySelector(".add-btn").addEventListener("click", () => {
      const qty = parseInt(getById("qty-" + p.id).textContent, 10);
      if (qty > 0 && !outOfStock) {
        state.cart[p.id] = (state.cart[p.id] || 0) + qty;
        getById("qty-" + p.id).textContent = 0;
        card.querySelector(".add-btn").disabled = true;
        card.querySelector(".add-btn").textContent = "Select quantity";
        updateCartUI();
        showToast(`✅ ${qty}× ${p.name} added to cart`);
      }
    });

    grid.appendChild(card);
  });
}

getById("shop-search").addEventListener("input", () => {
  state.shopSearchQuery = getById("shop-search").value;
  renderProducts();
});
