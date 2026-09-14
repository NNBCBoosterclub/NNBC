// ═══════════════════════════════════════════════════════════════════
//  Storefront — ticket gate business rule (event tickets, e.g. Jersey Friday)
//
//  Pure functions: both take a store-status-shaped object and return a
//  value, no imports and no reads of shared state. Kept as its own
//  module because it's a standalone business rule worth being able to
//  read (and eventually unit-test) in isolation from rendering code.
//
//  Automatic rule: ticket items are locked all day Friday, Eastern time
//  (America/New_York, so it tracks EST/EDT automatically) -- sales for
//  the week close the night before per the Thursday 23:59 ET cutoff,
//  and reopen Saturday for the following week. An admin override in
//  store_status (open/closed) always wins over the automatic schedule.
// ═══════════════════════════════════════════════════════════════════

export function isTicketSaleOpen(status) {
  if (status && status.ticketGateOverride === "open")   return true;
  if (status && status.ticketGateOverride === "closed") return false;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date());
  return weekday !== "Fri";
}

export function ticketGateMessage(status) {
  if (status && status.ticketGateOverride === "closed") return "Ticket sales closed";
  if (status && status.ticketGateOverride === "open")   return null;
  return "Ticket sales closed for today — reopens tomorrow";
}
