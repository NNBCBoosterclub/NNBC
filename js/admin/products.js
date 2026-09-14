// ═══════════════════════════════════════════════════════════════════
//  Admin — product catalog: load/save, list rendering, category tabs,
//  inline restock, danger-zone reset. Owns state.products.
//
//  Circular import note: this module imports from item-form.js (which
//  imports back from here) and from receipts.js (same). Both sides in
//  each pair only call the other's exports from inside event-listener
//  callbacks, never at module top level, so the cycle is safe -- by
//  the time any callback actually fires, every module has finished
//  loading.
// ═══════════════════════════════════════════════════════════════════
import { state, DEFAULT_PRODUCTS } from "./state.js";
import { $, escHtml, showToast } from "./utils.js";
import { startEdit, resetForm } from "./item-form.js";
import { buildBulkRestockGrid } from "./receipts.js";

// Applies back-compat migrations to a raw product array from any source.
export function normalizeProducts(arr) {
  return arr.map(p => {
    const { inStock, ...rest } = p;
    return {
      ...rest,
      stock:       ('stock'       in p) ? p.stock       : (inStock === false ? 0 : null),
      subcategory: ('subcategory' in p) ? p.subcategory : null,
      nutrition:   ('nutrition'   in p) ? p.nutrition   : null,
      barcode:     ('barcode'     in p) ? p.barcode     : null,
      allergies:   ('allergies'   in p) ? p.allergies   : null,
      isTicket:    !!p.isTicket,
    };
  });
}

// Reads menu data from the last shared snapshot loaded from Supabase.
export function loadProducts() {
  return structuredClone(state.products);
}

export async function saveProducts(list) {
  const normalized = normalizeProducts(list);
  await DB.upsertProducts(normalized);
  state.products = normalized;
}

export function nextId(list) {
  // IDs are generated from the current shared catalog snapshot.
  return list.length === 0 ? 1 : Math.max(...list.map(p => p.id)) + 1;
}

// ─────────────────────────────────────────────────────
//  STOCK HELPERS
// ─────────────────────────────────────────────────────
// Update badge wording/colors here if stock messaging needs to change globally.
export function stockPillHtml(stock) {
  if (stock === null || stock === undefined) {
    return `<span class="stock-pill unlimited">∞ Unlimited</span>`;
  }
  if (stock === 0) {
    return `<span class="stock-pill empty">Out of Stock</span>`;
  }
  if (stock <= 5) {
    return `<span class="stock-pill low">⚠ ${stock} left</span>`;
  }
  return `<span class="stock-pill ok">✓ ${stock} in stock</span>`;
}

// ─────────────────────────────────────────────────────
//  RENDER PRODUCT LIST
// ─────────────────────────────────────────────────────
export function buildAdminCatTabs() {
  const allItems = loadProducts();
  const cats = ["All", ...new Set(allItems.map(p => p.category))];
  const container = $("admin-cat-tabs");
  container.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "admin-cat-btn" + (cat === state.adminActiveCategory ? " active" : "");
    btn.textContent = cat;
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.adminActiveCategory = cat;
      renderProductList();
    });
    container.appendChild(btn);
  });
}

$("admin-search").addEventListener("input", () => {
  state.adminSearchQuery = $("admin-search").value;
  renderProductList();
});

export function renderProductList() {
  let list = loadProducts();
  const container = $("product-list");

  buildAdminCatTabs();
  // Keep bulk restock grid in sync with current product list
  buildBulkRestockGrid();

  // Apply category filter first, then search filter to minimize result set.
  if (state.adminActiveCategory !== "All") {
    list = list.filter(p => p.category === state.adminActiveCategory);
  }

  // Search covers name/category/subcategory to match shop-side discoverability.
  if (state.adminSearchQuery.trim()) {
    const q = state.adminSearchQuery.trim().toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.subcategory && p.subcategory.toLowerCase().includes(q))
    );
  }

  if (list.length === 0) {
    const allItems = loadProducts();
    container.innerHTML = allItems.length === 0
      ? `<div class="empty-state">No items yet. Click "➕ New Item" to add your first item!</div>`
      : `<div class="empty-state">No items match your search.</div>`;
    return;
  }

  const cats = [...new Set(list.map(p => p.category))];
  container.innerHTML = "";

  cats.forEach(cat => {
    const items = list.filter(p => p.category === cat);

    const heading = document.createElement("p");
    heading.className = "category-heading";
    heading.textContent = cat;
    container.appendChild(heading);

    items.forEach(p => {
      const outOfStock = p.stock === 0;
      const row = document.createElement("div");
      row.className = "product-row" + (outOfStock ? " out-of-stock" : "");
      row.dataset.id = p.id;

      // Visual (emoji or image)
      const visual = document.createElement("div");
      visual.className = "row-visual";
      if (p.imageUrl) {
        const img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = p.name;
        visual.appendChild(img);
      } else {
        visual.textContent = p.emoji || "🛍️";
      }
      row.appendChild(visual);

      // Info
      const info = document.createElement("div");
      info.className = "row-info";
      const subcatBadge = p.subcategory
          ? ` &nbsp;·&nbsp; <span class="cat-badge cat-badge-subcategory">${escHtml(p.subcategory)}</span>`
        : "";
      const allergyBadge = p.allergies
          ? ` &nbsp;·&nbsp; <span class="cat-badge cat-badge-allergy">⚠️ Allergens</span>`
        : "";
      const nutritionBadge = p.nutrition
          ? ` &nbsp;·&nbsp; <span class="cat-badge cat-badge-nutrition">🥗 Nutrition</span>`
        : "";
      const ticketBadge = p.isTicket
          ? ` &nbsp;·&nbsp; <span class="cat-badge cat-badge-nutrition">🎟️ Ticket</span>`
        : "";
      info.innerHTML = `
        <div class="row-name">${escHtml(p.name)}</div>
        <div class="row-meta">$${p.price.toFixed(2)} &nbsp;·&nbsp; <span class="cat-badge">${escHtml(p.category)}</span>${subcatBadge}${nutritionBadge}${allergyBadge}${ticketBadge}</div>`;
      row.appendChild(info);

      // Stock section (badge + restock button)
      const stockSection = document.createElement("div");
      stockSection.className = "stock-section";
      stockSection.innerHTML = `
        ${stockPillHtml(p.stock)}
        <button class="restock-btn" type="button">+ Restock</button>
        <div class="restock-form">
          <input type="number" class="restock-qty" placeholder="qty" min="1" step="1" aria-label="Restock quantity for ${escHtml(p.name)}" />
          <button class="restock-confirm" type="button">✓</button>
          <button class="restock-cancel" type="button">✕</button>
        </div>`;

      const restockBtn  = stockSection.querySelector(".restock-btn");
      const restockForm = stockSection.querySelector(".restock-form");
      const restockQty  = stockSection.querySelector(".restock-qty");
      const confirmBtn  = stockSection.querySelector(".restock-confirm");
      const cancelBtn   = stockSection.querySelector(".restock-cancel");

      restockBtn.addEventListener("click", () => {
        restockBtn.style.display = "none";
        restockForm.classList.add("visible");
        restockQty.value = "";
        restockQty.focus();
      });

      cancelBtn.addEventListener("click", () => {
        restockForm.classList.remove("visible");
        restockBtn.style.display = "";
      });

      async function applyRestock() {
        const addQty = parseInt(restockQty.value, 10);
        if (isNaN(addQty) || addQty < 1) {
          showToast("Enter a valid quantity (at least 1).", true);
          restockQty.focus();
          return;
        }
        const prods = loadProducts();
        const item  = prods.find(x => x.id === p.id);
        if (!item) return;
        const wasUnlimited = item.stock === null || item.stock === undefined;
        // If item was unlimited, restocking starts tracked inventory at addQty.
        item.stock = wasUnlimited ? addQty : item.stock + addQty;
        try {
          await saveProducts(prods);
          const note = wasUnlimited ? ` (stock tracking started)` : "";
          showToast(`✅ +${addQty} ${p.name} restocked. Now: ${item.stock}${note}`);
          renderProductList();
        } catch (err) {
          showToast(`⚠️ ${err.message || "Could not publish restock update."}`, true);
        }
      }

      confirmBtn.addEventListener("click", applyRestock);
      restockQty.addEventListener("keydown", e => {
        if (e.key === "Enter") applyRestock();
        if (e.key === "Escape") cancelBtn.click();
      });

      row.appendChild(stockSection);

      // Actions
      const actions = document.createElement("div");
      actions.className = "row-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-edit";
      editBtn.type = "button";
      editBtn.textContent = "✏️ Edit";
      editBtn.addEventListener("click", () => startEdit(p.id));
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "btn-delete";
      delBtn.type = "button";
      delBtn.textContent = "🗑 Delete";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        const prods = loadProducts().filter(x => x.id !== p.id);
        try {
          await saveProducts(prods);
          showToast(`"${p.name}" deleted.`);
          renderProductList();
          if ($("edit-id").value === String(p.id)) resetForm();
        } catch (err) {
          showToast(`⚠️ ${err.message || "Could not delete item globally."}`, true);
        }
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      container.appendChild(row);
    });
  });
}

// ─────────────────────────────────────────────────────
//  RESET TO DEFAULTS
// ─────────────────────────────────────────────────────
$("reset-btn").addEventListener("click", async () => {
  if (!confirm("Reset all menu items to defaults? All your custom items and photos will be lost.")) return;
  try {
    await saveProducts(structuredClone(DEFAULT_PRODUCTS));
    showToast("Menu reset to defaults.");
    renderProductList();
    resetForm();
  } catch (err) {
    showToast(`⚠️ ${err.message || "Could not reset menu globally."}`, true);
  }
});
