// ═══════════════════════════════════════════════════════════════════
//  Storefront — shared state and configuration constants
//
//  Every other storefront module imports the `state` object from here
//  rather than declaring its own copy. `state` is a single mutable
//  object (never reassigned, only its properties are written), which
//  is what makes this safe to share across ES modules: importing
//  `state` and writing `state.products = x` is just a property
//  assignment on a shared object reference, not a reassignment of the
//  imported binding (which ES modules forbid from outside the owning
//  module). This mirrors the flat set of top-level `let`s the old
//  single-script version used, just gathered under one object so it
//  can cross file boundaries.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────
//  CONFIGURATION — Venmo info
// ─────────────────────────────────────────────────────
// Main payment destination settings.
// Edit these when account ownership changes.
// VENMO_USERNAME must stay handle-only (no "@").
export const VENMO_USERNAME = "NNBoosterClub";         // @handle (no @)
export const VENMO_DISPLAY  = "Northern Neck Booster Club";

// Browser storage keys. Renaming these resets visible data for this page.
export const STORAGE_KEY   = "nnbc_products";
export const USER_KEY      = "nnbc_user";
export const ORDERS_KEY    = "nnbc_orders";
export const ORDER_SEQ_KEY = "nnbc_order_seq";
export const GUEST_NAME    = "Guest";

// Data-driven sub-tabs.
// If a category appears here, subcategory chips automatically render for it.
export const SUBCATEGORIES = {
  "Drink": ["Energy Drink", "Soda", "Other"],
  "Snack": ["Protein", "Health", "Savory", "Sweet"]
};

// Avatar upload settings.
export const MAX_AVATAR_BYTES    = 10 * 1024 * 1024;
export const AVATAR_SIZE_PX      = 256;
export const AVATAR_JPEG_QUALITY = 0.8;
export const EMAIL_REGEX         = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;

// ─────────────────────────────────────────────────────
//  PRODUCT STORAGE
// ─────────────────────────────────────────────────────
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
  { id: 19, name: "Jersey Friday | Business Casual",    emoji: "👕", price: 5.00, category: "Other", subcategory: null,     imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null, isTicket: true },
  { id: 20, name: "Miscellaneous",  emoji: "🛍️", price: 1.00, category: "Other", subcategory: null,     imageUrl: null, stock: null, nutrition: null, barcode: null, allergies: null },
];

// ─────────────────────────────────────────────────────
//  SHARED MUTABLE STATE
// ─────────────────────────────────────────────────────
export const state = {
  products: [],                 // set at init by products.js (loadProducts())
  cart: {},                     // { productId: quantity }
  activeCategory: "All",
  activeSubcategory: "All",
  shopSearchQuery: "",
  barcodeMap: new Map(),        // normalized barcode string -> product

  // Supabase auth/session state.
  sbUser: null,      // Supabase User object
  sbProfile: null,   // profiles table row
  sbOrders: [],      // cached orders for profile history

  // Store status banner + ticket gate + checkout code config.
  storeStatus: { state: "normal", message: null, ts: null, checkoutRequired: false, checkoutCodeHash: null, ticketGateOverride: null },
};
