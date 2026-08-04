# NNBC Shop - Site Breakdown

## Purpose
This document is a technical map of the app architecture, major components, external dependencies, and operational data flows.

## Application Surfaces
1. `index.html` (Customer storefront)
- Product browsing (categories, subcategories, search)
- Cart and checkout (cash and Venmo flow)
- Checkout access code gate (optional, admin-controlled)
- User auth/profile modal and purchase history
- Barcode scanner and share/QR tools

2. `admin.html` (Admin operations panel)
- Admin PIN login
- Product CRUD and stock management
- Receipt upload and bulk restock workflow
- Order management and status updates
- Store status banner controls
- Checkout access code configuration

3. `js/db.js` (Data abstraction layer)
- Supabase client initialization
- Table read/write APIs (products, store status, orders, receipts, profiles)
- Storage uploads (avatars, receipts)
- Realtime subscriptions

4. `supabase/schema.sql` (Database and policy definition)
- Table creation
- RLS policy setup
- Utility functions (for example stock decrement)
- Seed data

## Frontend Structure
### JavaScript Modules (native ES modules, no build step)
Both pages load a single `<script type="module" src="js/{store|admin}/main.js">` entry point. `js/db.js` stays a classic script exposing `window.DB` globally, called identically from both module sets.

`js/store/` (storefront, loaded by `index.html`):
- `state.js`: constants (Venmo info, storage keys, subcategories, default products) and the shared `state` object (products, cart, active category/search, auth/profile, store status)
- `utils.js`: DOM/formatting helpers (`$`, `formatPrice`, `showToast`, `escHtml`, `safeImageUrl`)
- `ticket-gate.js`: pure EST/EDT-aware ticket sale window logic
- `store-status.js`: load/normalize/render the store status banner
- `products.js`: load/save products, barcode map, server sync
- `cart.js`: cart totals, nutrition/allergen rollups, cart drawer UI
- `catalog.js`: category tabs, product grid rendering, nutrition modal, search
- `account.js`: auth/profile modals, user chip, auth sync
- `checkout.js`: checkout modal, ticket-gate + access-code validation, cash/Venmo payment, order logging
- `share-scanner.js`: share/QR modal and barcode scanner
- `main.js`: entry point — imports every module, runs page init, realtime subscription

`js/admin/` (admin panel, loaded by `admin.html`):
- `state.js`: constants and the shared `state` object (products, restock status, receipts, orders)
- `utils.js`: DOM/formatting helpers
- `products.js`: product list rendering and CRUD, restock UI
- `item-form.js`: item modal, image resize/upload, nutrition/stock fields
- `orders.js`: order history rendering and filters
- `store-status.js`: status banner, checkout-code and ticket-gate settings
- `receipts.js`: receipt history, image upload, bulk restock
- `github-sync.js`: disables the legacy (now unused) GitHub token UI
- `data-sync.js`: pulls latest shared data from Supabase on login/startup
- `pin.js`: login/logout, backend PIN verification and change (routing)
- `main.js`: entry point — imports every module, runs page init

Notes: `products.js` has intentional circular imports with `item-form.js` and `receipts.js` — safe because neither side references the other's exports at module top-level, only inside functions called later. `data-sync.js` exists as its own module specifically to avoid a `pin.js` <-> `main.js` cycle.

### Storefront Modules (`Styles/index`)
- `layout.css`: page shell, header, tab layout
- `products.css`: product cards/grid behavior
- `cart.css`: cart drawer and cart item controls
- `checkout-share.css`: checkout modal, payment UI, share modal
- `account-modals.css`: auth/profile/cash-receipt modals
- `responsive.css`: storefront responsive breakpoints
- `search-nutrition.css`: nutrition/allergen panels and search UI
- `status-scanner.css`: store status banner and scanner modal

### Admin Modules (`Styles/admin`)
- `auth.css`: admin setup/login screens
- `shell.css`: admin page shell, section layout, shared admin text patterns
- `forms.css`: item form controls and helper text
- `product-list.css`: menu list rows, badges, row actions
- `orders.css`: order history cards and actions
- `layout-modals.css`: admin hero, toolbar, item modal, responsive rules
- `status-receipts.css`: store status and receipt/restock sections

### Shared Styling
- `Styles/shared.css`
- Global tokens/variables
- Shared utility classes
- Shared compliance banner and toast styles

## Data Architecture
### Primary backend
- Supabase (PostgreSQL + Auth + Storage + Realtime)

### Core tables
- `menu_items`
- `store_status`
- `orders`
- `order_lines`
- `profiles`
- `receipts`
- `receipt_lines`

### Important app settings in `store_status`
- `state` / `message` / `ts`
- `checkout_required` (boolean)
- `checkout_code_hash` (hashed code)

## Account and Access Model
### Customer accounts
- Managed by Supabase Auth
- Sign up/sign in from storefront modal
- Profile metadata in `profiles`

### Admin access
- Single admin PIN, verified server-side via Supabase `SECURITY DEFINER` RPCs (`verify_admin_pin`, `set_admin_pin` in `supabase/schema.sql`) — the PIN itself is never stored or checked client-side
- `sessionStorage` only holds a per-tab "already authenticated" flag, not the PIN

### Ticket sale gate
- `menu_items.is_ticket` flags event-ticket products (for example the Jersey Friday item)
- Sales are only allowed within an EST/EDT-aware window (`js/store/ticket-gate.js`), with an admin override (`store_status.ticket_gate_override`) to force it open/closed

### Checkout restriction
- Optional checkout code requirement configured in admin
- Storefront validates entered code hash before payment action

## External Dependencies
### CDN scripts in `index.html`
- `qrcode` (QR code generation)
- `html5-qrcode` (barcode scanning)
- `@supabase/supabase-js` (Supabase browser client)

### CDN scripts in `admin.html`
- `@supabase/supabase-js`

### Browser APIs used
- `crypto.subtle` (hashing)
- Camera access (scanner)
- Web Share API (when available)
- `localStorage` and `sessionStorage`

## Operational Flows
1. Storefront load
- Read cached menu for fast first paint
- Sync fresh menu/status from Supabase
- Render tabs, products, cart state, user chip

2. Checkout flow
- Build order summary modal
- Enforce checkout code if required
- On payment action: log order and update stock

3. Admin update flow
- Load products/status/receipts from Supabase
- Apply mutations from forms/actions
- Save through `window.DB` APIs

## Configuration Points
1. `js/db.js`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

2. `index.html`
- `VENMO_USERNAME`
- `VENMO_DISPLAY`

3. Supabase project
- Run `supabase/schema.sql`
- Ensure storage buckets exist (`avatars`, `receipts`)

## File Inventory (High Value)
- `index.html`
- `admin.html`
- `js/db.js`
- `supabase/schema.sql`
- `Styles/shared.css`
- `Styles/index.css` (import manifest)
- `Styles/admin.css` (import manifest)

## Notes for Maintainers
1. Keep shared/global rules in `Styles/shared.css` only.
2. Keep page behavior in page modules; avoid inline style attributes.
3. Route all backend mutations through `window.DB` methods to keep behavior consistent.
4. If checkout access logic changes, update both admin settings UI and storefront validation together.
