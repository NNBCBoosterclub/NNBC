# NNBC Snack Bar - Implementation Plan (Collaborative, Gate-Based)

## Build Intent

This document is the active implementation ledger. We are building in small phases with explicit review checkpoints so implementation remains conversational and transparent.

### Collaboration Rules
1. No large end-to-end build without interim updates.
2. Every phase ends with a go/no-go checkpoint.
3. Changes are made in small slices with rationale and verification notes.

## Architecture Decision (Locked)

Program-level choice: Need both.

1. Public runtime: Keep direct path (storefront and checkout run without SharePoint dependency).
2. Internal operations: internal-only mirror for manifests, calendar coordination, and communication.
3. Failure rule: internal automation failures must not block public checkout.

## Mandatory Compliance Statement

Required text for public-facing interfaces:

"This organization is an Unofficial Activity / Private Organization. It is not a part of the Department of Defense or any of its components and has no governmental status."

Status:
1. Implemented in storefront header area.
2. Implemented in admin interface header area.
3. Remaining: verify QR/print and any future landing pages also include the notice.

## Phase Ledger

### Phase 0 - Scope and Compliance Baseline

Objective: lock constraints before deeper build.

Checklist:
1. [x] Architecture separation defined and documented.
2. [x] Mandatory disclaimer added to primary pages.
3. [ ] Confirm exact legal wording and placement for QR/print flows.
4. [ ] Confirm timezone authority for Thursday 23:59 and Friday 00:00 events.

Gate A decision needed from operator:
1. Final disclaimer wording approved.
2. Event time standard approved.

### Phase 1 - Public Storefront Controls

Objective: ensure customer flow remains robust and policy-compliant.

Primary path (COA 1):
1. Barcode scanner in mobile browser camera flow.
2. Programmatic ticket gate at Thursday 23:59.

Fallback (COA 2):
1. Manual product search and add-to-cart when camera is blocked.
2. Manual ticket quantity deprecation by admin at cutoff.

Checklist:
1. [ ] Verify scanner and manual search both pass on mobile.
2. [ ] Implement and test ticket hard-gate behavior for event items.
3. [ ] Validate checkout tax behavior and display language.

Gate B:
1. Confirm ticket gating behavior is acceptable before internal automation work begins.

### Phase 2 - Internal Data Hub (SharePoint/M365 Lane)

Objective: stage internal operational mirror without coupling storefront runtime.

Primary path (COA 1):
1. SharePoint Lists: Inventory Master, Historical Transactions, Event Attendance.

Fallback (COA 2):
1. Teams-hosted secured spreadsheet mirror with equivalent schema.

Mirror payload scope (minimum):
1. Order id
2. Attendee name
3. Item type
4. Quantity
5. Event date
6. Order timestamp
7. Payment status

Checklist:
1. [ ] Finalize mirror schema mapping from existing Supabase tables.
2. [ ] Define one-way sync contract and retry behavior.
3. [ ] Define manual export contingency for blocked connector scenarios.

Gate C:
1. Approve internal schema and sync contract.

### Phase 3 - Friday Manifest and Email Automation

Objective: generate and deliver Friday manifest at required time.

Primary path (COA 1):
1. Scheduled flow at Thursday 23:59 or Friday 00:00.
2. Build unclassified plain-text roster from ticket data.
3. Send through approved internal relay to .mil distribution lists.

Fallback (COA 2):
1. Manual CSV roster export.
2. Manual controlled email release.

Checklist:
1. [ ] Define scheduler owner and timezone source.
2. [ ] Draft manifest format template.
3. [ ] Run dry-run with sample data.
4. [ ] Validate message format against gateway filter expectations.

Gate D:
1. Approve automation job and manual fallback playbook.

### Phase 4 - Calendar and Communication Sync

Objective: align event comms without affecting payment runtime.

Checklist:
1. [ ] Select calendar source of truth.
2. [ ] Map one-way event timing sync into storefront gate controls.
3. [ ] Verify no coupling to checkout path.

Gate E:
1. Approve calendar/comms boundaries.

### Phase 5 - Restock Logistics Optimization

Objective: reduce operator effort for replenishment.

Primary path (COA 1):
1. Threshold-based restock manifest generation.
2. Optional wholesale deep-link/cart prefill where supported.

Fallback (COA 2):
1. Plain-text restock ledger optimized for rapid manual entry/search.

Checklist:
1. [ ] Confirm threshold policy.
2. [ ] Implement manifest output format.
3. [ ] Validate fallback usability.

Gate F:
1. Approve final logistics flow.

## Current Sprint Start (Today)

Started implementation with Phase 0 baseline items:
1. Added mandatory compliance banner to customer page and admin page.
2. Replaced planning document with phase-gated implementation ledger.

Next implementation slice:
1. Ticket gate controls (programmatic cutoff + manual contingency workflow).
