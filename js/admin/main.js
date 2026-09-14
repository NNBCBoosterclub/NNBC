// ═══════════════════════════════════════════════════════════════════
//  Admin — entry point
//  See js/store/main.js for the note on why importing each feature
//  module (for its listener-attaching side effects) before running
//  this file's own top-level code is what makes the ordering safe.
// ═══════════════════════════════════════════════════════════════════
import { route } from "./pin.js";
import { renderStoreStatus } from "./store-status.js";
import { renderReceiptHistory, buildBulkRestockGrid } from "./receipts.js";

// These modules attach their own listeners on import; nothing here
// needs their exports directly.
import "./products.js";
import "./item-form.js";
import "./orders.js";
import "./github-sync.js";

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
route();
renderStoreStatus();
buildBulkRestockGrid();
renderReceiptHistory();
