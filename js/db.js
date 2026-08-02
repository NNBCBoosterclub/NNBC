// ═══════════════════════════════════════════════════════════════════
//  NNBC Snack Bar — Supabase Data Layer  (window.DB)
//
//  Setup:
//    1. Create a Supabase project at https://supabase.com
//    2. Run supabase/schema.sql in the SQL Editor
//    3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your
//       project values (Dashboard → Project Settings → API)
//    4. Create Storage buckets:  avatars (public), receipts (private)
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL      = "https://rmzgirkyfsdpytdhxcdb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtemdpcmt5ZnNkcHl0ZGh4Y2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjI3NDcsImV4cCI6MjA5NDEzODc0N30.I86NxGDoKb4WrR9xCA6R54nGOEtefCdZdxjB2dd8rGc";

// Supabase JS v2 is loaded via CDN before this file.
// The global `supabase` object is provided by the CDN bundle.
const { createClient } = supabase;  // eslint-disable-line no-undef

const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ─────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────

// Map a database row to the shape the frontend expects.
function _normalizeProduct(row) {
  return {
    id:          row.id,
    name:        row.name,
    emoji:       row.emoji || "🛍️",
    price:       parseFloat(row.price) || 0,
    category:    row.category || "Other",
    subcategory: row.subcategory || null,
    imageUrl:    row.image_url   || null,
    stock:       (row.stock !== undefined && row.stock !== null) ? row.stock : null,
    nutrition:   row.nutrition   || null,
    allergies:   row.allergies   || null,
    barcode:     row.barcode     || null,
  };
}

// Map a frontend product object to a database row.
function _productToRow(p) {
  return {
    id:          p.id,
    name:        p.name,
    emoji:       p.emoji       || null,
    price:       p.price,
    category:    p.category,
    subcategory: p.subcategory || null,
    image_url:   p.imageUrl    || null,
    stock:       (p.stock !== undefined) ? p.stock : null,
    nutrition:   p.nutrition   || null,
    allergies:   p.allergies   || null,
    barcode:     p.barcode     || null,
  };
}

// ─────────────────────────────────────────────────────────────
//  PRODUCTS
// ─────────────────────────────────────────────────────────────

async function fetchProducts() {
  const { data, error } = await _sb
    .from("menu_items")
    .select("*")
    .order("id");
  if (error) throw error;
  return (data || []).map(_normalizeProduct);
}

// Replace the full product list (used by admin "Reset to defaults").
async function setProducts(products) {
  // Delete all rows then insert fresh ones so removed items disappear.
  const { error: delErr } = await _sb.from("menu_items").delete().neq("id", -1);
  if (delErr) throw delErr;
  const rows = products.map(_productToRow);
  const { error } = await _sb.from("menu_items").insert(rows);
  if (error) throw error;
}

// Upsert (create or update) one or many products without touching others.
async function upsertProducts(products) {
  const rows = (Array.isArray(products) ? products : [products]).map(_productToRow);
  const { error } = await _sb
    .from("menu_items")
    .upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function deleteProduct(id) {
  const { error } = await _sb.from("menu_items").delete().eq("id", id);
  if (error) throw error;
}

// Atomic stock decrement via a stored Postgres function.
// Silently skips items where stock IS NULL (unlimited).
async function decrementStock(itemId, qty) {
  const { error } = await _sb.rpc("decrement_stock", { item_id: itemId, qty });
  if (error) console.warn("Stock decrement failed for item", itemId, error);
}

// Returns a Supabase RealtimeChannel; call .unsubscribe() to clean up.
function subscribeToProducts(callback) {
  return _sb
    .channel("menu_items_rt")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "menu_items" },
      callback
    )
    .subscribe();
}

// ─────────────────────────────────────────────────────────────
//  STORE STATUS
// ─────────────────────────────────────────────────────────────

async function fetchStoreStatus() {
  const { data, error } = await _sb
    .from("store_status")
    .select("*")
    .eq("id", 1)
    .single();
  // PGRST116 = row not found; return default instead of throwing.
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return { state: "normal", message: null, ts: null };
  return {
    state:             data.state || "normal",
    message:           data.message || null,
    ts:                data.ts ? new Date(data.ts).getTime() : null,
    checkoutRequired:  !!data.checkout_required,
    checkoutCodeHash:  data.checkout_code_hash || null,
  };
}

async function saveStoreStatus(state, message = null) {
  const current = await fetchStoreStatus();
  const { error } = await _sb
    .from("store_status")
    .upsert(
      {
        id: 1,
        state: state || "normal",
        message: message || null,
        ts: new Date().toISOString(),
        checkout_required: !!current.checkoutRequired,
        checkout_code_hash: current.checkoutCodeHash || null,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

async function saveCheckoutAccess({ required, codeHash }) {
  const current = await fetchStoreStatus();
  const { error } = await _sb
    .from("store_status")
    .upsert(
      {
        id: 1,
        state: current.state || "normal",
        message: current.message || null,
        ts: new Date().toISOString(),
        checkout_required: !!required,
        checkout_code_hash: codeHash || null,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
//  ORDERS
// ─────────────────────────────────────────────────────────────

// Create an order + its line items, decrement tracked stock.
// Returns an order object shaped the same as the old localStorage format.
async function logOrder({ items, method, buyerName, userId }) {
  const total   = items.reduce((s, i) => s + i.price * i.qty, 0);
  const rand    = Math.random().toString(36).slice(2, 7).toUpperCase();
  const orderId = `ORD-${Date.now()}-${rand}`;

  const orderRow = {
    id:             orderId,
    user_id:        userId || null,
    buyer_name:     buyerName || "Guest",
    status:         method === "cash" ? "pending" : "paid",
    total:          total,
    payment_method: method,
    created_at:     new Date().toISOString(),
  };

  const { error: orderErr } = await _sb.from("orders").insert(orderRow);
  if (orderErr) throw orderErr;

  const lineRows = items.map(i => ({
    order_id:     orderId,
    menu_item_id: i.id,
    quantity:     i.qty,
    unit_price:   i.price,
  }));
  const { error: lineErr } = await _sb.from("order_lines").insert(lineRows);
  if (lineErr) throw lineErr;

  // Decrement tracked stock (errors are warned but do not abort the order).
  await Promise.all(items.map(i => decrementStock(i.id, i.qty)));

  return {
    id:        orderId,
    ts:        Date.now(),
    buyerName: buyerName || "Guest",
    userId,
    items,
    total,
    method,
    status: method === "cash" ? "pending" : "paid",
  };
}

// Load all orders (admin) or orders for a specific user.
async function loadOrders(userId) {
  let query = _sb
    .from("orders")
    .select("*, order_lines(menu_item_id, quantity, unit_price, menu_items(name, emoji))")
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(o => ({
    id:        o.id,
    ts:        new Date(o.created_at).getTime(),
    buyerName: o.buyer_name,
    userId:    o.user_id,
    items:     (o.order_lines || []).map(l => ({
      id:    l.menu_item_id,
      name:  l.menu_items?.name  || "Unknown",
      emoji: l.menu_items?.emoji || "🛍️",
      qty:   l.quantity,
      price: parseFloat(l.unit_price),
    })),
    total:  parseFloat(o.total),
    method: o.payment_method,
    status: o.status,
  }));
}

async function updateOrderStatus(orderId, status) {
  const { error } = await _sb.from("orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

async function deleteOrder(orderId) {
  // order_lines cascade-delete on orders FK; explicit delete is a safety measure.
  await _sb.from("order_lines").delete().eq("order_id", orderId);
  const { error } = await _sb.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

async function clearAllOrders() {
  await _sb.from("order_lines").delete().neq("id", 0);
  await _sb.from("orders").delete().neq("id", "");
}

function subscribeToOrders(callback) {
  return _sb
    .channel("orders_rt")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      callback
    )
    .subscribe();
}

// ─────────────────────────────────────────────────────────────
//  RECEIPTS
// ─────────────────────────────────────────────────────────────

async function loadReceipts() {
  const { data, error } = await _sb
    .from("receipts")
    .select("*, receipt_lines(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data || []).map(r => ({
    id:       r.id,
    ts:       new Date(r.created_at).getTime(),
    imageUrl: r.image_url || null,
    notes:    r.notes     || null,
    items:    (r.receipt_lines || []).map(l => ({
      productId:   l.menu_item_id,
      productName: l.product_name || "",
      qty:         l.qty_received,
    })),
  }));
}

// Save a receipt record.  Pass imageUrl as a data URL or a storage URL.
async function saveReceipt({ id, imageUrl, notes, items }) {
  const receiptId = id || `REC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { error: rErr } = await _sb.from("receipts").insert({
    id:        receiptId,
    image_url: imageUrl || null,
    notes:     notes    || null,
    created_at: new Date().toISOString(),
  });
  if (rErr) throw rErr;

  if (items && items.length) {
    const lineRows = items.map(i => ({
      receipt_id:   receiptId,
      menu_item_id: i.productId || null,
      product_name: i.productName || "",
      qty_received: i.qty,
    }));
    const { error: lErr } = await _sb.from("receipt_lines").insert(lineRows);
    if (lErr) throw lErr;
  }

  return receiptId;
}

async function deleteReceipt(receiptId) {
  await _sb.from("receipt_lines").delete().eq("receipt_id", receiptId);
  const { error } = await _sb.from("receipts").delete().eq("id", receiptId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
//  ADMIN PIN (single shared PIN, verified server-side via RPC —
//  see supabase/schema.sql for verify_admin_pin / set_admin_pin)
// ─────────────────────────────────────────────────────────────

async function verifyAdminPin(pin) {
  const { data, error } = await _sb.rpc("verify_admin_pin", { attempt: pin });
  if (error) throw error;
  return !!data;
}

async function setAdminPin(oldPin, newPin) {
  const { data, error } = await _sb.rpc("set_admin_pin", { old_pin: oldPin, new_pin: newPin });
  if (error) throw error;
  return !!data;
}

// ─────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────

async function signUp(email, password) {
  const { data, error } = await _sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

async function signIn(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function signOut() {
  const { error } = await _sb.auth.signOut();
  if (error) throw error;
}

// Returns the current user synchronously from the in-memory session.
// Prefer onAuthChange for reactive updates.
async function getUser() {
  const { data } = await _sb.auth.getUser();
  return data?.user || null;
}

// Register a callback for auth state changes (login, logout, token refresh).
// Returns an object with an `unsubscribe()` method.
function onAuthChange(callback) {
  const { data } = _sb.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null, event);
  });
  return data;
}

// ─────────────────────────────────────────────────────────────
//  PROFILES
// ─────────────────────────────────────────────────────────────

async function loadProfile(userId) {
  if (!userId) return null;
  const { data, error } = await _sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

// Updates can include: favorite_item_id, avatar_url
async function upsertProfile(userId, updates) {
  const { error } = await _sb
    .from("profiles")
    .upsert(
      { id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// Upload a data-URL avatar to Supabase Storage.
// Returns the public CDN URL.
async function uploadAvatar(userId, dataUrl) {
  const res  = await fetch(dataUrl);
  const blob = await res.blob();
  const ext  = blob.type.split("/")[1] || "jpeg";
  const path = `avatars/${userId}.${ext}`;

  const { error } = await _sb.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;

  const { data } = _sb.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

// Upload a data-URL receipt image to Supabase Storage.
// Returns the public URL (receipts bucket should be private; adjust as needed).
async function uploadReceiptImage(receiptId, dataUrl) {
  const res  = await fetch(dataUrl);
  const blob = await res.blob();
  const ext  = blob.type.split("/")[1] || "jpeg";
  const path = `receipts/${receiptId}.${ext}`;

  const { error } = await _sb.storage
    .from("receipts")
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;

  // For a private bucket, generate a signed URL valid for 7 days.
  const { data, error: urlErr } = await _sb.storage
    .from("receipts")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (urlErr) throw urlErr;
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────
//  EXPORT  — available as window.DB throughout the app
// ─────────────────────────────────────────────────────────────

window.DB = {
  // Raw client (escape hatch for one-off queries)
  client: _sb,

  // Admin PIN
  verifyAdminPin,
  setAdminPin,

  // Products
  fetchProducts,
  upsertProducts,
  setProducts,
  deleteProduct,
  decrementStock,
  subscribeToProducts,

  // Store status
  fetchStoreStatus,
  saveStoreStatus,
  saveCheckoutAccess,

  // Orders
  logOrder,
  loadOrders,
  updateOrderStatus,
  deleteOrder,
  clearAllOrders,
  subscribeToOrders,

  // Receipts
  loadReceipts,
  saveReceipt,
  deleteReceipt,

  // Auth
  signUp,
  signIn,
  signOut,
  getUser,
  onAuthChange,

  // Profiles
  loadProfile,
  upsertProfile,
  uploadAvatar,
  uploadReceiptImage,
};
