-- ═══════════════════════════════════════════════════════════════════
--  NNBC Snack Bar — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
--  TABLES
-- ─────────────────────────────────────────────────────────────

-- Menu items (replaces products.json)
CREATE TABLE IF NOT EXISTS public.menu_items (
  id          BIGINT PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT,
  price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'Other',
  subcategory TEXT,
  image_url   TEXT,
  stock       INT,       -- NULL = unlimited; 0 = out of stock; N = units remaining
  nutrition   JSONB,     -- { calories, protein, totalFat, saturatedFat, ... }
  allergies   TEXT,
  barcode     TEXT,
  is_ticket   BOOLEAN NOT NULL DEFAULT false,  -- event ticket item, subject to the weekly ticket gate
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_ticket BOOLEAN NOT NULL DEFAULT false;

-- Store status (replaces store-status.json)
CREATE TABLE IF NOT EXISTS public.store_status (
  id                   INT PRIMARY KEY DEFAULT 1,
  state                TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'ordered' | 'restocked'
  message              TEXT,
  ts                   TIMESTAMPTZ,
  checkout_required    BOOLEAN NOT NULL DEFAULT false,
  checkout_code_hash   TEXT,
  ticket_gate_override TEXT  -- NULL = automatic schedule; 'open'/'closed' = manual override
);

-- Backward-compatible migration helpers for existing projects.
ALTER TABLE public.store_status
  ADD COLUMN IF NOT EXISTS checkout_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.store_status
  ADD COLUMN IF NOT EXISTS checkout_code_hash TEXT;

ALTER TABLE public.store_status
  ADD COLUMN IF NOT EXISTS ticket_gate_override TEXT;

-- Seed initial row so upsert always has something to update
INSERT INTO public.store_status (id, state, message, ts)
VALUES (1, 'normal', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Customer profiles (extended user data alongside Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  favorite_item_id BIGINT REFERENCES public.menu_items,
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id             TEXT PRIMARY KEY,           -- ORD-XXXXX format
  user_id        UUID REFERENCES auth.users,
  buyer_name     TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'completed'
  total          DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,                    -- 'cash' | 'venmo'
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Order line items
CREATE TABLE IF NOT EXISTS public.order_lines (
  id           BIGSERIAL PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES public.menu_items,
  quantity     INT NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL
);

-- Admin receipts (replaces receipts.json)
CREATE TABLE IF NOT EXISTS public.receipts (
  id         TEXT PRIMARY KEY,
  image_url  TEXT,
  notes      TEXT,
  admin_id   UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items restocked per receipt
CREATE TABLE IF NOT EXISTS public.receipt_lines (
  id           BIGSERIAL PRIMARY KEY,
  receipt_id   TEXT NOT NULL REFERENCES public.receipts ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES public.menu_items,
  product_name TEXT,       -- snapshot in case menu item is later deleted
  qty_received INT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
--  FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Atomic stock decrement — skips items with stock IS NULL (unlimited)
CREATE OR REPLACE FUNCTION public.decrement_stock(item_id BIGINT, qty INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.menu_items
  SET    stock = GREATEST(0, stock - qty)
  WHERE  id = item_id
    AND  stock IS NOT NULL;
END;
$$;

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
--  ROW LEVEL SECURITY
--  MVP policy: open read/write through the anon key for the internal tool.
--  Tighten in production by restricting writes to authenticated admin users.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.menu_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_status  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;

-- menu_items: public read, open write (MVP; will lock down to admin role in Tier 2)
DROP POLICY IF EXISTS "menu_items_read"  ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_write" ON public.menu_items;
CREATE POLICY "menu_items_read"  ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_items_write" ON public.menu_items FOR ALL    USING (true) WITH CHECK (true);

-- store_status: public read, open write (MVP)
DROP POLICY IF EXISTS "store_status_read"  ON public.store_status;
DROP POLICY IF EXISTS "store_status_write" ON public.store_status;
CREATE POLICY "store_status_read"  ON public.store_status FOR SELECT USING (true);
CREATE POLICY "store_status_write" ON public.store_status FOR ALL    USING (true) WITH CHECK (true);

-- profiles: each user only sees and updates their own row
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_write" ON public.profiles;
CREATE POLICY "profiles_read"  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_write" ON public.profiles FOR ALL    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- orders: anyone can insert (guest checkout); auth users can read their own
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_read"   ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_read"   ON public.orders FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "orders_delete" ON public.orders FOR DELETE USING (true);

-- order_lines: tied to orders; open for MVP
DROP POLICY IF EXISTS "order_lines_insert" ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_read"   ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_delete" ON public.order_lines;
CREATE POLICY "order_lines_insert" ON public.order_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "order_lines_read"   ON public.order_lines FOR SELECT USING (true);
CREATE POLICY "order_lines_delete" ON public.order_lines FOR DELETE USING (true);

-- receipts and receipt_lines: open write (MVP; restrict to admin role later)
DROP POLICY IF EXISTS "receipts_all"      ON public.receipts;
DROP POLICY IF EXISTS "receipt_lines_all" ON public.receipt_lines;
CREATE POLICY "receipts_all"      ON public.receipts       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "receipt_lines_all" ON public.receipt_lines  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
--  REALTIME
--  Enable realtime for tables that need multi-device sync.
-- ─────────────────────────────────────────────────────────────

-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form, and errors
-- (42710) if the table is already a publication member — which aborts
-- the rest of this script on a re-run. Guard each one explicitly so the
-- whole file stays safe to run multiple times.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'menu_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
--  ADMIN AUTH (single shared PIN, verified server-side)
--
--  Replaces the old per-browser localStorage PIN, which let anyone who
--  opened admin.html with no locally-saved PIN self-provision themselves
--  as admin. Now there is exactly one PIN, stored (hashed) in this table,
--  and the table itself is not directly readable or writable by the anon
--  key — only through the two SECURITY DEFINER functions below, so the
--  hash is never exposed to the client and can't be overwritten directly
--  via the REST API either.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_auth (
  id       INT PRIMARY KEY DEFAULT 1,
  pin_hash TEXT NOT NULL
);

ALTER TABLE public.admin_auth ENABLE ROW LEVEL SECURITY;
-- Intentionally no SELECT/INSERT/UPDATE/DELETE policies: RLS + revoked
-- grants below mean nobody can touch this table directly, only via the
-- functions (which run as the function owner and bypass RLS).
REVOKE ALL ON public.admin_auth FROM anon, authenticated;

-- Seed a default PIN so the panel isn't locked out on first deploy.
-- Default PIN is "1234" — change it immediately from Admin → Settings
-- once you've logged in once.
INSERT INTO public.admin_auth (id, pin_hash)
VALUES (1, encode(digest('nnbc_admin_salt_v1:1234', 'sha256'), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Verify a PIN attempt. Returns true/false, never reveals the hash.
CREATE OR REPLACE FUNCTION public.verify_admin_pin(attempt TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT pin_hash INTO stored FROM public.admin_auth WHERE id = 1;
  IF stored IS NULL THEN
    RETURN false;
  END IF;
  RETURN stored = encode(digest('nnbc_admin_salt_v1:' || attempt, 'sha256'), 'hex');
END;
$$;

-- Change the PIN. Requires the current PIN to succeed; returns true/false.
CREATE OR REPLACE FUNCTION public.set_admin_pin(old_pin TEXT, new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin_pin(old_pin) THEN
    RETURN false;
  END IF;
  UPDATE public.admin_auth
  SET pin_hash = encode(digest('nnbc_admin_salt_v1:' || new_pin, 'sha256'), 'hex')
  WHERE id = 1;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_pin(TEXT)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(TEXT, TEXT)   TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
--  STORAGE BUCKETS
--  Create in Supabase Dashboard → Storage → New Bucket, or run:
--    INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
--    INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);
--  Then set bucket policies to allow authenticated uploads.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
--  SEED DEFAULT MENU ITEMS
--  Run this block once after creating the project to populate the menu.
--  Matches DEFAULT_PRODUCTS in the frontend.
-- ─────────────────────────────────────────────────────────────

-- Note: row 19 here is kept aligned with DEFAULT_PRODUCTS in index.html/
-- admin.html (Jersey Friday ticket item). If your live menu_items table
-- already has a different row 19 from an earlier seed, this INSERT won't
-- touch it (ON CONFLICT DO NOTHING) -- flip is_ticket on the real ticket
-- item from Admin instead.
INSERT INTO public.menu_items (id, name, emoji, price, category, subcategory, image_url, stock, nutrition, allergies, barcode, is_ticket)
VALUES
  (1,  'Chips',         '🥔', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL, false),
  (2,  'Pretzels',      '🥨', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL, false),
  (3,  'Granola Bar',   '🍫', 1.50, 'Snack', 'Health',  NULL, NULL, NULL, NULL, NULL, false),
  (4,  'Cookies',       '🍪', 1.00, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL, false),
  (5,  'Crackers',      '🫙', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL, false),
  (6,  'Fruit Snacks',  '🍬', 1.00, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL, false),
  (7,  'Popcorn',       '🍿', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL, false),
  (8,  'Candy Bar',     '🍫', 1.50, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL, false),
  (9,  'Water',         '💧', 1.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL, false),
  (10, 'Sports Drink',  '🥤', 2.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL, false),
  (11, 'Juice Box',     '🧃', 1.50, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL, false),
  (12, 'Soda',          '🥤', 1.50, 'Drink', 'Soda',    NULL, NULL, NULL, NULL, NULL, false),
  (13, 'Hot Chocolate', '☕', 2.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL, false),
  (14, 'Coffee',        '☕', 1.50, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL, false),
  (15, 'Sandwich',      '🥪', 4.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL, false),
  (16, 'Hot Dog',       '🌭', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL, false),
  (17, 'Nachos',        '🧀', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL, false),
  (18, 'Pizza Slice',   '🍕', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL, false),
  (19, 'Jersey Friday | Business Casual', '👕', 5.00, 'Other', NULL, NULL, NULL, NULL, NULL, NULL, true),
  (20, 'Miscellaneous', '🛍️',1.00, 'Other', NULL,      NULL, NULL, NULL, NULL, NULL, false)
ON CONFLICT (id) DO NOTHING;

-- If row 19 already exists from an earlier seed (e.g. as "Spirit Wear"),
-- this flips the ticket flag on whichever row is actually the Jersey
-- Friday item by name -- safe to run either way.
UPDATE public.menu_items
SET is_ticket = true
WHERE name ILIKE 'Jersey Friday%';
