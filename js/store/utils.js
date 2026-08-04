// ═══════════════════════════════════════════════════════════════════
//  Storefront — small stateless DOM/formatting helpers
//  No imports, no shared state. Safe to use from any other module.
// ═══════════════════════════════════════════════════════════════════

export const getById = id => document.getElementById(id);

export function formatPrice(n) { return "$" + n.toFixed(2); }

export function showToast(msg) {
  const t = getById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Validate data URL is a safe image before rendering
export function safeImageUrl(url) {
  return (typeof url === "string" && url.startsWith("data:image/")) ? url : null;
}
