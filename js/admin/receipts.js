// ═══════════════════════════════════════════════════════════════════
//  Admin — receipt upload, bulk restock grid, receipt history.
//  Owns state.receipts / state.pendingReceiptImageUrl.
//  See products.js for the circular-import note with this module.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { $, escHtml, showToast } from "./utils.js";
import { loadProducts, saveProducts, nextId, renderProductList } from "./products.js";
import { resizeAndEncode } from "./item-form.js";

export function normalizeReceipts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    id: typeof r?.id === "string" ? r.id : "",
    ts: Number.isFinite(r?.ts) ? r.ts : Date.now(),
    imageUrl: (typeof r?.imageUrl === "string" && r.imageUrl.startsWith("data:image/")) ? r.imageUrl : null,
    notes: typeof r?.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
    items: Array.isArray(r?.items)
      ? r.items
          .filter(item => item && Number.isFinite(Number(item.qty)) && Number(item.qty) > 0)
          .map(item => ({
            productId: Number(item.productId),
            productName: String(item.productName || ""),
            qty: Number(item.qty),
          }))
      : [],
  })).filter(r => r.id);
}

export function loadReceipts() {
  return structuredClone(state.receipts);
}

// Kept for rollback compatibility only — does nothing in Supabase mode.
export async function saveReceipts(list) {
  state.receipts = normalizeReceipts(list);
}

function nextReceiptId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REC-${Date.now()}-${randomPart}`;
}

// Receipt image handling
$("receipt-image").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeAndEncode(file);
    state.pendingReceiptImageUrl = dataUrl;
    $("receipt-img-preview").src = dataUrl;
    $("receipt-img-preview").classList.add("visible");
    $("clear-receipt-img-btn").classList.add("visible");
  } catch (err) {
    showToast(err.message || "Could not load image.", true);
    $("receipt-image").value = "";
  }
});

$("clear-receipt-img-btn").addEventListener("click", () => {
  state.pendingReceiptImageUrl = null;
  $("receipt-image").value = "";
  $("receipt-img-preview").src = "";
  $("receipt-img-preview").classList.remove("visible");
  $("clear-receipt-img-btn").classList.remove("visible");
});

// Build the bulk restock grid from current product list
export function buildBulkRestockGrid() {
  const items = loadProducts();
  const grid  = $("bulk-restock-grid");
  grid.innerHTML = "";
  if (items.length === 0) {
    grid.innerHTML = `<p class="empty-inline-note">No items on the menu yet.</p>`;
    return;
  }
  items.forEach(p => {
    const stockLabel = p.stock === null || p.stock === undefined ? "∞" : String(p.stock);
    const div = document.createElement("div");
    div.className = "bulk-restock-item";
    div.dataset.id = p.id;
    div.innerHTML = `
      <span class="bulk-restock-item-name" title="${escHtml(p.name)}">${p.emoji ? escHtml(p.emoji) + ' ' : ''}${escHtml(p.name)}</span>
      <span class="bulk-restock-item-stock">in stock: ${escHtml(stockLabel)}</span>
      <input type="number" class="bulk-qty-input" placeholder="qty" min="0" step="1"
        aria-label="Received quantity for ${escHtml(p.name)}" />`;
    grid.appendChild(div);
  });
}

function ensureMenuContainsReceiptItems(productList, receiptItems) {
  let changed = false;

  receiptItems.forEach(entry => {
    const productName = String(entry?.productName || "").trim();
    if (!productName) return;
    const productNameLower = productName.toLowerCase();

    const match = productList.find(product =>
      (Number.isFinite(Number(entry?.productId)) && product.id === Number(entry.productId)) ||
      product.name.trim().toLowerCase() === productNameLower
    );
    if (match) return;

    productList.push({
      id: nextId(productList),
      name: productName,
      emoji: "🛍️",
      price: 0,
      category: "Other",
      subcategory: null,
      imageUrl: null,
      stock: Number.isFinite(Number(entry?.qty)) ? Number(entry.qty) : 0,
      nutrition: null,
      barcode: null,
      allergies: null,
    });
    changed = true;
  });

  return changed;
}

$("apply-bulk-restock-btn").addEventListener("click", async () => {
  const notes       = $("receipt-notes").value.trim();
  const imageUrl    = state.pendingReceiptImageUrl || null;
  const grid        = $("bulk-restock-grid");
  const inputs      = grid.querySelectorAll(".bulk-restock-item");
  const restockedItems = [];

  const previousProducts = loadProducts();
  const prods = structuredClone(previousProducts);
  let anyChange = false;

  inputs.forEach(row => {
    const pid   = +row.dataset.id;
    const input = row.querySelector(".bulk-qty-input");
    const qty   = parseInt(input.value, 10);
    if (!qty || qty <= 0) return;

    const item = prods.find(x => x.id === pid);
    if (!item) return;

    const wasUnlimited = item.stock === null || item.stock === undefined;
    item.stock = wasUnlimited ? qty : item.stock + qty;
    restockedItems.push({ productId: pid, productName: item.name, qty });
    anyChange = true;
  });

  if (!anyChange && !notes && !imageUrl) {
    showToast("Enter at least one item quantity to restock.", true);
    return;
  }

  const nextProducts = structuredClone(prods);
  const addedFromReceipt = ensureMenuContainsReceiptItems(nextProducts, restockedItems);

  // Save receipt record
  const receipt = {
    id:       nextReceiptId(),
    ts:       Date.now(),
    imageUrl,
    notes:    notes || null,
    items:    restockedItems,
  };
  // Save image to Supabase Storage if present, then save receipt record.
  let finalImageUrl = null;
  try {
    if (imageUrl) {
      const uploaded = await DB.uploadReceiptImage(receipt.id, imageUrl);
      finalImageUrl = uploaded.imageUrl;
    }
  } catch(imgErr) {
    console.warn("Receipt image upload failed, saving without image:", imgErr);
  }
  receipt.imageUrl = finalImageUrl;

  try {
    if (anyChange || addedFromReceipt) {
      await saveProducts(nextProducts);
    }
    await DB.saveReceipt(receipt);
    state.receipts.unshift(receipt);
  } catch (err) {
    if (anyChange || addedFromReceipt) {
      try {
        await saveProducts(previousProducts);
      } catch (rollbackErr) {
        console.warn("Receipt sync failed and product rollback also failed:", rollbackErr);
      }
    }
    showToast(`⚠️ ${err.message || "Could not publish receipt changes."}`, true);
    return;
  }

  // Reset receipt form
  $("receipt-notes").value = "";
  $("receipt-image").value = "";
  $("receipt-img-preview").src = "";
  $("receipt-img-preview").classList.remove("visible");
  $("clear-receipt-img-btn").classList.remove("visible");
  state.pendingReceiptImageUrl = null;
  buildBulkRestockGrid();

  const itemCount = restockedItems.length;
  const msg = anyChange
    ? `✅ Restocked ${itemCount} item${itemCount !== 1 ? "s" : ""}. Receipt saved.`
    : `📄 Receipt saved (no stock changes).`;
  $("receipt-save-msg").textContent = msg;
  setTimeout(() => { $("receipt-save-msg").textContent = ""; }, 4000);

  renderReceiptHistory();
  renderProductList();
  showToast(msg);
});

export function renderReceiptHistory() {
  const list      = loadReceipts();
  const container = $("receipt-history-list");
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-inline-note-sm">No receipts uploaded yet.</p>`;
    return;
  }
  container.innerHTML = "";
  list.forEach(r => {
    const date     = new Date(r.ts);
    const dateStr  = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const itemsStr = r.items && r.items.length
      ? r.items.map(i => `${i.qty}× ${escHtml(i.productName)}`).join(", ")
      : "No stock changes recorded.";

    const card = document.createElement("div");
    card.className = "receipt-card";

    if (r.imageUrl) {
      const safeUrl = (typeof r.imageUrl === "string" && r.imageUrl.startsWith("data:image/")) ? r.imageUrl : null;
      if (safeUrl) {
        const img = document.createElement("img");
        img.className = "receipt-thumb";
        img.src = safeUrl;
        img.alt = "Receipt";
        card.appendChild(img);
      }
    }

    const info = document.createElement("div");
    info.className = "receipt-info";
    info.innerHTML = `
      <div class="receipt-date">${escHtml(dateStr)} &nbsp;·&nbsp; ${escHtml(r.id)}</div>
      ${r.notes ? `<div class="receipt-notes-text">${escHtml(r.notes)}</div>` : ""}
      <div class="receipt-items-text">${itemsStr}</div>`;
    card.appendChild(info);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-del-receipt";
    delBtn.type = "button";
    delBtn.title = "Delete receipt record";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this receipt record?")) return;
      try {
        await DB.deleteReceipt(r.id);
        state.receipts = state.receipts.filter(x => x.id !== r.id);
        renderReceiptHistory();
        showToast("Receipt deleted.");
      } catch (err) {
        showToast(`⚠️ ${err.message || "Could not delete receipt."}`, true);
      }
    });
    card.appendChild(delBtn);
    container.appendChild(card);
  });
}
