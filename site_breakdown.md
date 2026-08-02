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
- Local admin PIN flow in `admin.html`
- PIN hash stored in browser storage for admin-page guard

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
