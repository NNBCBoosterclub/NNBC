// ═══════════════════════════════════════════════════════════════════
//  Admin — shared state and configuration constants
//  See js/store/state.js for the rationale behind the `state` object
//  pattern used here (safe to mutate across ES modules, just not
//  reassignable from outside the module that owns it).
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────
// Storage keys used by the admin experience.
// Renaming these keys disconnects this page from existing saved browser data.
export const STORAGE_KEY  = "nnbc_products";
export const SESSION_KEY  = "nnbc_admin_auth";
// Image settings affect compression quality and max upload size.
export const IMAGE_QUALITY  = 0.82;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Keep this list aligned with front-page subcategory behavior.
// Category names must exactly match values used in products.
export const SUBCATEGORIES = {
  "Drink": ["Energy Drink", "Soda", "Other"],
  "Snack": ["Protein", "Health", "Savory", "Sweet"]
};

// Default items pre-populated on first load (no localStorage data yet).
// stock: null = not tracked (unlimited); 0 = out of stock; N = N units available
export const DEFAULT_PRODUCTS = [
  { id: 1,  name: "Chips",          emoji: "🥔", price: 1.00, category: "Snack", subcategory: "Savory",  imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 2,  name: "Pretzels",       emoji: "🥨", price: 1.00, category: "Snack", subcategory: "Savory",  imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 3,  name: "Granola Bar",    emoji: "🍫", price: 1.50, category: "Snack", subcategory: "Health",  imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 4,  name: "Cookies",        emoji: "🍪", price: 1.00, category: "Snack", subcategory: "Sweet",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 5,  name: "Crackers",       emoji: "🫙", price: 1.00, category: "Snack", subcategory: "Savory",  imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 6,  name: "Fruit Snacks",   emoji: "🍬", price: 1.00, category: "Snack", subcategory: "Sweet",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 7,  name: "Popcorn",        emoji: "🍿", price: 1.00, category: "Snack", subcategory: "Savory",  imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 8,  name: "Candy Bar",      emoji: "🍫", price: 1.50, category: "Snack", subcategory: "Sweet",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 9,  name: "Water",          emoji: "💧", price: 1.00, category: "Drink", subcategory: "Other",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 10, name: "Sports Drink",   emoji: "🥤", price: 2.00, category: "Drink", subcategory: "Other",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 11, name: "Juice Box",      emoji: "🧃", price: 1.50, category: "Drink", subcategory: "Other",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 12, name: "Soda",           emoji: "🥤", price: 1.50, category: "Drink", subcategory: "Soda",    imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 13, name: "Hot Chocolate",  emoji: "☕", price: 2.00, category: "Drink", subcategory: "Other",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 14, name: "Coffee",         emoji: "☕", price: 1.50, category: "Drink", subcategory: "Other",   imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 15, name: "Sandwich",       emoji: "🥪", price: 4.00, category: "Meal",  subcategory: null,      imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 16, name: "Hot Dog",        emoji: "🌭", price: 3.00, category: "Meal",  subcategory: null,      imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 17, name: "Nachos",         emoji: "🧀", price: 3.00, category: "Meal",  subcategory: null,      imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 18, name: "Pizza Slice",    emoji: "🍕", price: 3.00, category: "Meal",  subcategory: null,      imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
  { id: 19, name: "Jersey Friday | Business Casual", emoji: "👕", price: 5.00, category: "Other", subcategory: null,     imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null, isTicket: true },
  { id: 20, name: "Miscellaneous",  emoji: "🛍️", price: 1.00, category: "Other", subcategory: null,     imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
];

export const DEFAULT_STORE_STATUS = { state: "normal", message: null, ts: null, checkoutRequired: false, checkoutCodeHash: null, ticketGateOverride: null };

// ─────────────────────────────────────────────────────
//  SHARED MUTABLE STATE
// ─────────────────────────────────────────────────────
// Admin-managed data is stored in Supabase so every visitor/admin
// sees the same menu, restock status, and receipt history.
export const state = {
  products:            structuredClone(DEFAULT_PRODUCTS),
  restockStatus:        { ...DEFAULT_STORE_STATUS },
  receipts:             [],
  adminOrders:          [],

  // Admin list has independent category/search state from the customer page.
  adminActiveCategory:  "All",
  adminSearchQuery:     "",
  activeOrderFilter:    "all",

  // null = no change; "" = cleared; "data:..." = new image
  pendingImageUrl:        null,
  pendingReceiptImageUrl: null,
};
