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
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Store status (replaces store-status.json)
CREATE TABLE IF NOT EXISTS public.store_status (
  id                 INT PRIMARY KEY DEFAULT 1,
  state              TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'ordered' | 'restocked'
  message            TEXT,
  ts                 TIMESTAMPTZ,
  checkout_required  BOOLEAN NOT NULL DEFAULT false,
  checkout_code_hash TEXT
);

-- Backward-compatible migration helpers for existing projects.
ALTER TABLE public.store_status
  ADD COLUMN IF NOT EXISTS checkout_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.store_status
  ADD COLUMN IF NOT EXISTS checkout_code_hash TEXT;

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

ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

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

INSERT INTO public.menu_items (id, name, emoji, price, category, subcategory, image_url, stock, nutrition, allergies, barcode)
VALUES
  (1,  'Chips',         '🥔', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL),
  (2,  'Pretzels',      '🥨', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL),
  (3,  'Granola Bar',   '🍫', 1.50, 'Snack', 'Health',  NULL, NULL, NULL, NULL, NULL),
  (4,  'Cookies',       '🍪', 1.00, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL),
  (5,  'Crackers',      '🫙', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL),
  (6,  'Fruit Snacks',  '🍬', 1.00, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL),
  (7,  'Popcorn',       '🍿', 1.00, 'Snack', 'Savory',  NULL, NULL, NULL, NULL, NULL),
  (8,  'Candy Bar',     '🍫', 1.50, 'Snack', 'Sweet',   NULL, NULL, NULL, NULL, NULL),
  (9,  'Water',         '💧', 1.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL),
  (10, 'Sports Drink',  '🥤', 2.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL),
  (11, 'Juice Box',     '🧃', 1.50, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL),
  (12, 'Soda',          '🥤', 1.50, 'Drink', 'Soda',    NULL, NULL, NULL, NULL, NULL),
  (13, 'Hot Chocolate', '☕', 2.00, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL),
  (14, 'Coffee',        '☕', 1.50, 'Drink', 'Other',   NULL, NULL, NULL, NULL, NULL),
  (15, 'Sandwich',      '🥪', 4.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL),
  (16, 'Hot Dog',       '🌭', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL),
  (17, 'Nachos',        '🧀', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL),
  (18, 'Pizza Slice',   '🍕', 3.00, 'Meal',  NULL,      NULL, NULL, NULL, NULL, NULL),
  (19, 'Spirit Wear',   '👕', 10.00,'Other', NULL,      NULL, NULL, NULL, NULL, NULL),
  (20, 'Miscellaneous', '🛍️',1.00, 'Other', NULL,      NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
