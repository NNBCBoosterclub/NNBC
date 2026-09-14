// ═══════════════════════════════════════════════════════════════════
//  Storefront — product catalog loading (localStorage cache + Supabase)
//  Owns state.products and state.barcodeMap.
// ═══════════════════════════════════════════════════════════════════
import { state, STORAGE_KEY, DEFAULT_PRODUCTS } from "./state.js";

// Reads and normalizes menu data from localStorage.
// Back-compat logic lets older stored payloads keep working.
export function loadProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Back-compat: convert old boolean inStock to stock field
      return parsed.map(p => {
        if (!('stock' in p)) {
          p.stock = (p.inStock === false) ? 0 : null;
          delete p.inStock;
        }
        // Back-compat: ensure subcategory field exists
        if (!('subcategory' in p)) p.subcategory = null;
        // Back-compat: ensure nutrition field exists
        if (!('nutrition' in p)) p.nutrition = null;
        // Back-compat: ensure barcode field exists
        if (!('barcode' in p)) p.barcode = null;
        // Back-compat: ensure allergies field exists
        if (!('allergies' in p)) p.allergies = null;
        // Back-compat: ensure isTicket field exists
        if (!('isTicket' in p)) p.isTicket = false;
        return p;
      });
    }
  } catch (e) {
    console.warn("Failed to load products:", e);
  }
  return structuredClone(DEFAULT_PRODUCTS);
}

// Save products: update the local cache and push to Supabase.
// (Canonical: the old file had two `saveProducts` declarations with the
// same name -- a leftover localStorage-only one and this Supabase-synced
// one. The second silently shadowed the first in the original single
// script; this is the one that was actually running.)
export async function saveProducts(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  try {
    await DB.upsertProducts(list);
  } catch (e) {
    console.warn("Could not sync products to Supabase:", e);
  }
}

// Normalized barcode lookup map: lowercased barcode string → product.
// Rebuilt whenever products array is updated.
export function buildBarcodeMap() {
  state.barcodeMap = new Map();
  state.products.forEach(p => {
    if (p.barcode) state.barcodeMap.set(p.barcode.trim().toLowerCase(), p);
  });
}

// Fetch the canonical menu from Supabase and refresh the in-memory list.
// localStorage is still used as an instant first-paint cache.
// `onUpdated` lets callers (main.js init, the realtime subscription) run
// their own re-render sequence after products actually change.
export async function initProductsFromServer(onUpdated) {
  try {
    const fresh = await DB.fetchProducts();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    state.products = fresh;
    if (onUpdated) onUpdated();
  } catch (e) {
    console.warn("Could not fetch products from Supabase:", e);
  }
}
