// ═══════════════════════════════════════════════════════════════════
//  Admin — add/edit item modal: image upload, stock/nutrition fields,
//  subcategory field, form submit. See products.js for the circular
//  import note (safe -- deferred-only usage on both sides).
// ═══════════════════════════════════════════════════════════════════
import { state, SUBCATEGORIES, IMAGE_QUALITY, MAX_IMAGE_BYTES } from "./state.js";
import { $, escHtml, showToast } from "./utils.js";
import { loadProducts, saveProducts, nextId, renderProductList } from "./products.js";

// ─────────────────────────────────────────────────────
//  IMAGE HELPERS
// ─────────────────────────────────────────────────────
export function resizeAndEncode(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("File too large (max 10 MB)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
        // Safety check: only accept image data URLs
        if (!dataUrl.startsWith("data:image/")) {
          reject(new Error("Invalid image output"));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$("f-image").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeAndEncode(file);
    state.pendingImageUrl = dataUrl;
    $("img-preview").src = dataUrl;
    $("img-preview").classList.add("visible");
    $("clear-img-btn").classList.add("visible");
  } catch (err) {
    showToast(err.message || "Could not load image. Please try another file.", true);
    $("f-image").value = "";
  }
});

$("clear-img-btn").addEventListener("click", () => {
  state.pendingImageUrl = "";
  $("f-image").value = "";
  $("img-preview").src = "";
  $("img-preview").classList.remove("visible");
  $("clear-img-btn").classList.remove("visible");
});

function resetImageField(existingUrl) {
  // Called both when opening edit mode and when resetting form state.
  state.pendingImageUrl = null;
  $("f-image").value = "";
  if (existingUrl) {
    $("img-preview").src = existingUrl;
    $("img-preview").classList.add("visible");
    $("clear-img-btn").classList.add("visible");
  } else {
    $("img-preview").src = "";
    $("img-preview").classList.remove("visible");
    $("clear-img-btn").classList.remove("visible");
  }
}

// ─────────────────────────────────────────────────────
//  STOCK FIELD TOGGLE (unlimited checkbox)
// ─────────────────────────────────────────────────────
// "Unlimited" means stock is not tracked; stored value becomes null.
$("f-stock-unlimited").addEventListener("change", () => {
  $("f-stock").disabled = $("f-stock-unlimited").checked;
  if ($("f-stock-unlimited").checked) $("f-stock").value = "";
});

function getStockFieldValue() {
  // Normalizes invalid numeric input back to null for safe persistence.
  if ($("f-stock-unlimited").checked) return null; // not tracked
  const v = parseInt($("f-stock").value, 10);
  return (isNaN(v) || v < 0) ? null : v;
}

function setStockField(stock) {
  if (stock === null || stock === undefined) {
    $("f-stock-unlimited").checked = true;
    $("f-stock").disabled = true;
    $("f-stock").value = "";
  } else {
    $("f-stock-unlimited").checked = false;
    $("f-stock").disabled = false;
    $("f-stock").value = stock;
  }
}

// ─────────────────────────────────────────────────────
//  NUTRITION FIELDS
// ─────────────────────────────────────────────────────
// Nutrition is optional; returns null if no meaningful data was entered.
$("nutrition-toggle-btn").addEventListener("click", () => {
  const fields = $("nutrition-fields");
  const icon   = $("nutrition-toggle-icon");
  const open   = fields.classList.toggle("open");
  icon.textContent = open ? "▲" : "▼";
});

function getNutritionFields() {
  const numVal = id => {
    const v = parseFloat($(id).value);
    return isNaN(v) ? null : v;
  };
  const n = {
    servingSize:   $("f-serving").value.trim() || null,
    calories:      numVal("f-calories"),
    totalFat:      numVal("f-total-fat"),
    saturatedFat:  numVal("f-sat-fat"),
    transFat:      numVal("f-trans-fat"),
    cholesterol:   numVal("f-cholesterol"),
    sodium:        numVal("f-sodium"),
    totalCarbs:    numVal("f-total-carbs"),
    dietaryFiber:  numVal("f-fiber"),
    totalSugars:   numVal("f-sugars"),
    protein:       numVal("f-protein"),
  };
  // Return null when all fields are empty so nutrition is omitted entirely.
  const hasData = Object.values(n).some(v => v !== null);
  return hasData ? n : null;
}

function setNutritionFields(n) {
  const setNum = (id, val) => { $(id).value = (val !== null && val !== undefined) ? val : ""; };
  $("f-serving").value  = (n && n.servingSize) ? n.servingSize : "";
  setNum("f-calories",   n && n.calories);
  setNum("f-total-fat",  n && n.totalFat);
  setNum("f-sat-fat",    n && n.saturatedFat);
  setNum("f-trans-fat",  n && n.transFat);
  setNum("f-cholesterol",n && n.cholesterol);
  setNum("f-sodium",     n && n.sodium);
  setNum("f-total-carbs",n && n.totalCarbs);
  setNum("f-fiber",      n && n.dietaryFiber);
  setNum("f-sugars",     n && n.totalSugars);
  setNum("f-protein",    n && n.protein);
  // Auto-expand section if existing nutrition data is present.
  if (n) {
    $("nutrition-fields").classList.add("open");
    $("nutrition-toggle-icon").textContent = "▲";
  } else {
    $("nutrition-fields").classList.remove("open");
    $("nutrition-toggle-icon").textContent = "▼";
  }
}

// ─────────────────────────────────────────────────────
//  SUBCATEGORY FIELD
// ─────────────────────────────────────────────────────
// Rebuilds subcategory options whenever category changes or edit data loads.
function updateSubcategoryField(category, currentValue) {
  const group  = $("f-subcategory-group");
  const select = $("f-subcategory");
  const subs   = SUBCATEGORIES[category];

  if (subs) {
    select.innerHTML = `<option value="">— Select subcategory —</option>` +
      subs.map(s => `<option value="${escHtml(s)}"${s === currentValue ? " selected" : ""}>${escHtml(s)}</option>`).join("");
    group.style.display = "";
  } else {
    select.innerHTML = "";
    group.style.display = "none";
  }
}

$("f-category").addEventListener("change", () => {
  updateSubcategoryField($("f-category").value, "");
});

// ─────────────────────────────────────────────────────
//  ADD / EDIT FORM
// ─────────────────────────────────────────────────────
// Full form reset for both "cancel" and post-save cleanup paths.
export function resetForm() {
  $("item-form").reset();
  $("edit-id").value = "";
  $("form-heading").textContent = "➕ Add New Item";
  $("form-submit-btn").textContent = "Add Item";
  $("cancel-edit-btn").style.display = "none";
  setStockField(null);
  resetImageField(null);
  $("f-allergies").value = "";
  $("f-subcategory-group").style.display = "none";
  $("f-subcategory").innerHTML = "";
  setNutritionFields(null);
  closeItemModal();
}

export function startEdit(id) {
  // Populates modal from current storage snapshot to avoid stale form data.
  const list = loadProducts();
  const p = list.find(x => x.id === id);
  if (!p) return;

  $("edit-id").value    = id;
  $("f-name").value     = p.name;
  $("f-price").value    = p.price;
  $("f-category").value = p.category;
  $("f-emoji").value    = p.emoji || "";
  $("f-barcode").value  = p.barcode || "";
  $("f-is-ticket").checked = !!p.isTicket;
  setStockField(p.stock !== undefined ? p.stock : null);
  resetImageField(p.imageUrl || null);
  updateSubcategoryField(p.category, p.subcategory || "");
  setNutritionFields(p.nutrition || null);
  $("f-allergies").value = p.allergies || "";

  $("form-heading").textContent      = "✏️ Edit Item";
  $("form-submit-btn").textContent   = "Save Changes";
  $("cancel-edit-btn").style.display = "inline-flex";

  openItemModal();
}

$("cancel-edit-btn").addEventListener("click", resetForm);

// ─────────────────────────────────────────────────────
//  ADD/EDIT ITEM MODAL
// ─────────────────────────────────────────────────────
function openItemModal() {
  $("add-item-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("f-name").focus(), 50);
}

function closeItemModal() {
  $("add-item-modal").classList.remove("open");
  document.body.style.overflow = "";
}

$("close-item-modal").addEventListener("click", resetForm);
$("add-item-modal").addEventListener("click", e => {
  if (e.target === $("add-item-modal")) resetForm();
});

// ─────────────────────────────────────────────────────
//  HERO PANEL BUTTONS
// ─────────────────────────────────────────────────────
$("hero-new-item-btn").addEventListener("click", () => {
  resetForm();
  openItemModal();
});
$("menu-new-item-btn").addEventListener("click", () => {
  resetForm();
  openItemModal();
});

$("hero-analytics-btn").addEventListener("click", () => {
  $("orders-section-title").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("hero-stock-btn").addEventListener("click", () => {
  $("menu-section-title").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("item-form").addEventListener("submit", async e => {
  e.preventDefault();

  const name        = $("f-name").value.trim();
  const price       = parseFloat($("f-price").value);
  const category    = $("f-category").value.trim();
  const emoji       = $("f-emoji").value.trim();
  const barcode     = $("f-barcode").value.trim() || null;
  const stock       = getStockFieldValue();
  const editId      = $("edit-id").value;
  const subcategory = SUBCATEGORIES[category] ? ($("f-subcategory").value || null) : null;
  const nutrition   = getNutritionFields();
  const allergies   = $("f-allergies").value.trim() || null;
  const isTicket    = $("f-is-ticket").checked;

  if (!name || isNaN(price) || price < 0 || !category) {
    showToast("Please fill in all required fields.", true);
    return;
  }

  const list = loadProducts();

  try {
    if (editId) {
      // Edit flow preserves existing image unless user explicitly changes/removes it.
      const idx = list.findIndex(x => x.id === +editId);
      if (idx === -1) { showToast("Item not found.", true); return; }

      let imageUrl = list[idx].imageUrl;
      if (state.pendingImageUrl === "")        imageUrl = null;
      else if (state.pendingImageUrl !== null) imageUrl = state.pendingImageUrl;

      list[idx] = { ...list[idx], name, price, category, subcategory, emoji, barcode, imageUrl, stock, nutrition, allergies, isTicket };
      await saveProducts(list);
      showToast(`✅ "${name}" updated.`);
    } else {
      // Add flow blocks duplicate names (case-insensitive) for cleaner menu UX.
      const duplicate = list.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicate) {
        showToast(`⚠️ "${name}" is already on the menu.`, true);
        return;
      }
      const imageUrl = (state.pendingImageUrl && state.pendingImageUrl !== "") ? state.pendingImageUrl : null;
      list.push({ id: nextId(list), name, price, category, subcategory, emoji, barcode, imageUrl, stock, nutrition, allergies, isTicket });
      await saveProducts(list);
      showToast(`✅ "${name}" added to menu.`);
    }

    resetForm();
    renderProductList();
  } catch (err) {
    showToast(`⚠️ ${err.message || "Could not publish menu changes."}`, true);
  }
});
