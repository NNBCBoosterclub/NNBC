// ═══════════════════════════════════════════════════════════════════
//  Admin — legacy GitHub token settings UI
//  GitHub token settings are no longer needed — all data is synced via
//  Supabase. The token UI elements remain in the HTML but are
//  non-functional; this just disables them and explains why.
// ═══════════════════════════════════════════════════════════════════
import { $ } from "./utils.js";

(function initTokenUI() {
  const statusEl = $("token-status");
  if (statusEl) {
    statusEl.textContent = "✅ Data is synced via Supabase — no GitHub token needed.";
    statusEl.style.color = "var(--success)";
  }
  const saveBtn  = $("save-token-btn");
  const clearBtn = $("clear-token-btn");
  if (saveBtn)  saveBtn.disabled  = true;
  if (clearBtn) clearBtn.disabled = true;
})();
