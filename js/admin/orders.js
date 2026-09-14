// ═══════════════════════════════════════════════════════════════════
//  Admin — order history: dashboard stats, filters, mark paid, delete.
//  Orders are stored in Supabase — shared across all devices.
//  Owns state.adminOrders / state.activeOrderFilter.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { $, escHtml, showToast } from "./utils.js";

export async function refreshOrders() {
  try {
    state.adminOrders = await DB.loadOrders();
  } catch (e) {
    console.warn("Could not load orders from Supabase:", e);
    state.adminOrders = [];
  }
  renderOrders();
}

export function renderOrders() {
  const all       = state.adminOrders;
  const statsEl   = $("orders-stats");
  const container = $("order-list");

  // Dashboard stats count only paid orders as collected revenue.
  const paid        = all.filter(o => o.status === "paid");
  const pendingList = all.filter(o => o.status === "pending");
  const totalRev    = paid.reduce((s, o) => s + o.total, 0);
  const pendingAmt  = pendingList.reduce((s, o) => s + o.total, 0);
  statsEl.innerHTML = `
    <div class="stat-chip">Orders: <strong>${all.length}</strong></div>
    <div class="stat-chip">Collected: <strong>$${totalRev.toFixed(2)}</strong></div>
    <div class="stat-chip">Pending Cash: <strong>${pendingList.length} ($${pendingAmt.toFixed(2)})</strong></div>`;

  // Filter chips control which subset is rendered below.
  let filtered = all;
  if (state.activeOrderFilter === "cash")    filtered = all.filter(o => o.method === "cash");
  if (state.activeOrderFilter === "venmo")   filtered = all.filter(o => o.method === "venmo");
  if (state.activeOrderFilter === "pending") filtered = all.filter(o => o.status === "pending");

  if (filtered.length === 0) {
    container.innerHTML = `<div class="orders-empty">No orders found. Orders appear here after customers check out on this device.</div>`;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(order => {
    const date      = new Date(order.ts);
    const timeStr   = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isPending = order.status === "pending";
    const cardClass = order.method === "venmo" ? "venmo" : (isPending ? "cash-pending" : "cash-paid");
    const itemsText = order.items.map(i => `${i.qty}× ${escHtml(i.name)}`).join(", ");

    const methodBadge = order.method === "venmo"
      ? `<span class="order-method-badge venmo">Venmo</span>`
      : `<span class="order-method-badge cash">💵 Cash</span>`;
    const statusBadge = isPending
      ? `<span class="order-status-badge pending">⏳ Pending</span>`
      : `<span class="order-status-badge paid">✓ Paid</span>`;

    const div = document.createElement("div");
    div.className = `order-card ${cardClass}`;
    div.innerHTML = `
      <div class="order-card-header">
        <span class="order-buyer">👤 ${escHtml(order.buyerName)}</span>
        ${methodBadge}
        ${statusBadge}
        <span class="order-time">${timeStr}</span>
      </div>
      <div class="order-items">${itemsText}</div>
      <div class="order-card-footer">
        <span class="order-id">${escHtml(order.id)}</span>
        <span class="order-total">$${order.total.toFixed(2)}</span>
        <div class="order-actions">
          ${isPending ? `<button class="btn-mark-paid" type="button">✓ Mark Paid</button>` : ""}
          <button class="btn-del-order" type="button" aria-label="Delete order">🗑</button>
        </div>
      </div>`;

    div.querySelector(".btn-del-order").addEventListener("click", () => {
      if (!confirm("Delete this order record?")) return;
      DB.deleteOrder(order.id).then(() => {
        state.adminOrders = state.adminOrders.filter(o => o.id !== order.id);
        showToast("Order deleted.");
        renderOrders();
      }).catch(e => showToast("⚠️ Could not delete order: " + e.message));
    });

    if (isPending) {
      div.querySelector(".btn-mark-paid").addEventListener("click", () => {
        DB.updateOrderStatus(order.id, "paid").then(() => {
          const idx = state.adminOrders.findIndex(o => o.id === order.id);
          if (idx !== -1) state.adminOrders[idx].status = "paid";
          showToast("✅ Order marked as paid.");
          renderOrders();
        }).catch(e => showToast("⚠️ " + e.message));
      });
    }

    container.appendChild(div);
  });
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.activeOrderFilter = btn.dataset.filter;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderOrders();
  });
});

$("clear-orders-btn").addEventListener("click", () => {
  if (!confirm("Clear ALL order history from Supabase? This cannot be undone.")) return;
  DB.clearAllOrders().then(() => {
    state.adminOrders = [];
    showToast("Order history cleared.");
    renderOrders();
  }).catch(e => showToast("⚠️ " + e.message));
});
