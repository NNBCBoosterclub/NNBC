// ═══════════════════════════════════════════════════════════════════
//  Admin — small stateless DOM/formatting helpers
//  No imports, no shared state. Safe to use from any other module.
// ═══════════════════════════════════════════════════════════════════

export const $ = id => document.getElementById(id);

export function showToast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = isError ? "#c0392b" : "#1a3a5c";
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2500);
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
