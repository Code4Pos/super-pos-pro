-- =================================================================================
-- SiamPOS Pro (version beta 0.1.6): โครงสร้างฐานข้อมูลระบบขายหน้าร้านปลีก-ส่ง
-- วิธีใช้งาน: คัดลอกโค้ดทั้งหมดนี้ไปวางในเมนู SQL Editor บน Supabase แล้วกดปุ่ม "Run"
--
-- หมายเหตุสำคัญ:
-- เมื่อกด Run แล้วหน้าเว็บขึ้นข้อความ "Success. No rows returned"
-- นั่นหมายถึง "คำสั่ง SQL ทำงานสำเร็จเรียบร้อย 100%!" (ไม่ใช่ข้อผิดพลาด)
-- เนื่องจากคำสั่ง CREATE TABLE / ALTER TABLE เป็นคำสั่งโครงสร้าง จึงไม่มีแถวข้อมูล (Rows) ส่งกลับมา
-- ให้ไปที่เมนู "Table Editor" (รูปตารางซ้ายมือ) จะเห็นตารางทั้งหมดปรากฏขึ้นทันที
-- =================================================================================

-- 0. เปิดใช้งาน UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ตารางหมวดหมู่สินค้า (Categories)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'Package',
  color TEXT DEFAULT 'indigo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางหน่วยนับสินค้า (Units)
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตารางสินค้า (Products) - รองรับราคาขายส่ง, สินค้าสัมพันธ์, หลายหน่วยนับ, ถังขยะ
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  retail_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wholesale_min_qty INTEGER NOT NULL DEFAULT 6,
  is_wholesale_enabled BOOLEAN DEFAULT TRUE,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 10,
  pack_size TEXT DEFAULT '1 ชิ้น',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  selling_units JSONB DEFAULT '[]'::jsonb,
  linked_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  linked_deduct_qty NUMERIC(10, 2) DEFAULT 1,
  is_trashed BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่มคอลัมน์ใหม่สำหรับผู้ที่มีตาราง products เดิมอยู่แล้ว (Safe Migration)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_wholesale_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_units JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS linked_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS linked_deduct_qty NUMERIC(10, 2) DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. ตารางลูกค้า / สมาชิก / ยี่ปั๊ว (Customers)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesale')),
  shop_name TEXT,
  address TEXT,
  total_spent NUMERIC(12, 2) DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ตารางบิลขาย / ออเดอร์ (Orders)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT DEFAULT 'ลูกค้าทั่วไป',
  pricing_mode TEXT NOT NULL DEFAULT 'auto' CHECK (pricing_mode IN ('auto', 'retail', 'wholesale')),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wholesale_savings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bill_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'promptpay', 'transfer', 'credit', 'split')),
  cash_received NUMERIC(12, 2) DEFAULT 0,
  change_amount NUMERIC(12, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  note TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- beta 0.2.2: แบ่งจ่ายหลายช่องทาง (Split Payment)
-- payments เก็บยอดที่ชำระจริงต่อช่องทาง เช่น [{"method":"cash","amount":200},{"method":"promptpay","amount":150}]
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'promptpay', 'transfer', 'credit', 'split'));

-- beta 0.2.3: ลูกค้า B2B และระบบเครดิต (Credit Limit / Credit Term)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS special_price_tier INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(13);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_number VARCHAR(5) DEFAULT '00000';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_term_days INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_due_date TIMESTAMPTZ;

-- การรับชำระหนี้จากลูกค้าเครดิต (Payment Receipt)
CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'promptpay', 'transfer')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- beta 0.2.4: ใบวางบิล (Billing Note) รวมบิลเครดิตค้างชำระของลูกค้า
-- bills เก็บรายการบิลและยอดค้าง ณ วันที่วางบิล [{order_id, order_number, order_date, due_date, amount}]
CREATE TABLE IF NOT EXISTS billing_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_tax_id VARCHAR(13),
  customer_branch VARCHAR(5) DEFAULT '00000',
  customer_address TEXT,
  order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  bills JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_due_date TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- beta 0.2.5: บันทึกความเคลื่อนไหวสต็อก (Stock Ledger) ทุกครั้งที่สต็อกเปลี่ยน
-- id สร้างจากฝั่งแอป เพื่อรวมข้อมูลกับในเครื่องได้โดยไม่ซ้ำ / change_qty และ balance_after เป็นหน่วยฐานของสินค้าหลัก
CREATE TABLE IF NOT EXISTS stock_ledger (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT,
  sku TEXT,
  unit TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('SALE', 'VOID', 'IMPORT', 'ADJUST', 'EDIT', 'OPENING', 'RETURN')),
  change_qty NUMERIC(12, 4) NOT NULL,
  balance_after NUMERIC(12, 4) NOT NULL,
  reference_doc TEXT,
  reason TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON stock_ledger (product_id, created_at DESC);

-- ต้นทุนแบบเฉลี่ยเคลื่อนที่ต้องการทศนิยมมากกว่า 2 ตำแหน่ง
ALTER TABLE products ALTER COLUMN cost_price TYPE NUMERIC(12, 4);

-- beta 0.2.6: จุดสั่งซื้อซ้ำ (Reorder Point) ต่อสินค้า (NULL = ใช้ค่าเริ่มต้น: รอสินค้า 7 วัน / สต็อกสำรอง = min_stock)
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_stock NUMERIC(12, 2);

-- beta 0.2.7: ใบกำกับภาษีเต็มรูปแบบ (Full Tax Invoice) เลขที่เรียงต่อเนื่องรายเดือน ห้ามซ้ำ
CREATE TABLE IF NOT EXISTS tax_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL,
  order_id TEXT,
  order_number TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_tax_id VARCHAR(13),
  buyer_branch VARCHAR(5) DEFAULT '00000',
  buyer_address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  bill_discount NUMERIC(12, 2) DEFAULT 0,
  base_amount NUMERIC(12, 2) NOT NULL,
  vat_amount NUMERIC(12, 2) NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 1 บิลขายออกใบกำกับเต็มรูปที่ใช้งานได้ 1 ฉบับ
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_invoices_active_order
  ON tax_invoices (order_number) WHERE status = 'active';

-- beta 0.2.8: ผู้ใช้งานและบทบาท (RBAC) — เก็บ PIN เป็น SHA-256 + salt เท่านั้น
-- หมายเหตุ: เป็นการจำกัดสิทธิ์ในตัวแอป ตารางนี้ยังอ่านได้ด้วย anon key จนกว่าจะเปลี่ยนไปใช้ Supabase Auth
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'wholesale', 'warehouse', 'accountant')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- beta 0.2.9: ใบลดหนี้ (CN) / ใบเพิ่มหนี้ (DN) อ้างอิงใบกำกับภาษีเต็มรูป เลขที่เรียงต่อเนื่องรายเดือน ห้ามซ้ำ
CREATE TABLE IF NOT EXISTS tax_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_number TEXT UNIQUE NOT NULL,
  note_type TEXT NOT NULL CHECK (note_type IN ('credit', 'debit')),
  invoice_number TEXT NOT NULL,
  invoice_date TIMESTAMPTZ,
  order_number TEXT,
  buyer_name TEXT,
  buyer_tax_id VARCHAR(13),
  buyer_branch VARCHAR(5) DEFAULT '00000',
  buyer_address TEXT,
  reason TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_total NUMERIC(12, 2) NOT NULL,
  base_amount NUMERIC(12, 2) NOT NULL,
  vat_amount NUMERIC(12, 2) NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  restocked BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- beta 0.3.0: ใบตรวจนับสต็อกแบบ Blind Count (id สร้างจากฝั่งแอปเพื่อ upsert ได้)
-- items: [{product_id, product_name, sku, barcode, unit, cost_price, counted_qty, system_qty}]
CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  count_number TEXT UNIQUE NOT NULL,
  scope_label TEXT,
  status TEXT NOT NULL DEFAULT 'counting' CHECK (status IN ('counting', 'submitted', 'approved', 'cancelled')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- beta 0.3.1: Lot / วันหมดอายุ (FEFO/FIFO) ล็อตเป็นบัญชีย่อยของสต็อกสินค้าหลักที่เปิด track_lots
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_lots BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lot_strategy TEXT DEFAULT 'FEFO' CHECK (lot_strategy IN ('FEFO', 'FIFO'));
CREATE TABLE IF NOT EXISTS product_lots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT,
  lot_number TEXT NOT NULL,
  expiry_date DATE,
  received_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
  remaining_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12, 4) DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  reference_doc TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots (product_id, expiry_date);

-- beta 0.3.3: หลายคลัง + ใบโอนสต็อก 2 ขั้น (In-Transit -> Received)
-- สต็อกรวมยังอยู่ที่ products.stock / inventory_balances เก็บเฉพาะคลังที่ไม่ใช่หน้าร้าน + ยอดระหว่างโอน (warehouse_id = 'wh-transit')
-- ยอดหน้าร้าน = products.stock - ผลรวม inventory_balances ของสินค้านั้น (ทุก id เป็น id ฝั่งแอป ใช้ upsert)
CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory_balances (
  id TEXT PRIMARY KEY, -- '<warehouse_id>:<product_id>'
  warehouse_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  physical_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_product ON inventory_balances (product_id);
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  transfer_number TEXT NOT NULL,
  from_warehouse_id TEXT NOT NULL,
  to_warehouse_id TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit', 'received', 'cancelled')),
  note TEXT,
  created_by_name TEXT,
  received_by_name TEXT,
  received_at TIMESTAMPTZ,
  cancelled_by_name TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- beta 0.3.4: ใบสั่งขายส่ง / จองสินค้า (Reserved Stock) ATP = products.stock - ผลรวม base_qty ของใบที่ status = 'reserved'
-- items: [{ product_id, master_product_id, product_name, sku, unit, qty, base_qty }]
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  so_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_date DATE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'fulfilled', 'cancelled')),
  order_number TEXT,
  created_by_name TEXT,
  fulfilled_by_name TEXT,
  fulfilled_at TIMESTAMPTZ,
  cancelled_by_name TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders (status);

-- รับคืนสินค้าจากใบลดหนี้บันทึกใน Stock Ledger เป็นประเภท RETURN
ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_movement_type_check;
ALTER TABLE stock_ledger ADD CONSTRAINT stock_ledger_movement_type_check
  CHECK (movement_type IN ('SALE', 'VOID', 'IMPORT', 'ADJUST', 'EDIT', 'OPENING', 'RETURN'));

-- 6. ตารางรายการสินค้าในบิล (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  original_retail_price NUMERIC(12, 2) NOT NULL,
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_wholesale_applied BOOLEAN DEFAULT FALSE,
  subtotal NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- สร้าง Indexes เพื่อความรวดเร็วในการค้นหาบาร์โค้ดและประวัติการขาย
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_linked ON products(linked_product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- =================================================================================
-- การตั้งค่า Row Level Security (RLS) เพื่ออนุญาตการอ่าน-เขียนข้อมูล
-- =================================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access to sales_orders" ON sales_orders;
CREATE POLICY "Allow public access to sales_orders" ON sales_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to warehouses" ON warehouses;
CREATE POLICY "Allow public access to warehouses" ON warehouses FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public access to inventory_balances" ON inventory_balances;
CREATE POLICY "Allow public access to inventory_balances" ON inventory_balances FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public access to stock_transfers" ON stock_transfers;
CREATE POLICY "Allow public access to stock_transfers" ON stock_transfers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to product_lots" ON product_lots;
CREATE POLICY "Allow public access to product_lots" ON product_lots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to stock_counts" ON stock_counts;
CREATE POLICY "Allow public access to stock_counts" ON stock_counts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to tax_notes" ON tax_notes;
CREATE POLICY "Allow public access to tax_notes" ON tax_notes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to app_users" ON app_users;
CREATE POLICY "Allow public access to app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to tax_invoices" ON tax_invoices;
CREATE POLICY "Allow public access to tax_invoices" ON tax_invoices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to stock_ledger" ON stock_ledger;
CREATE POLICY "Allow public access to stock_ledger" ON stock_ledger FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to billing_notes" ON billing_notes;
CREATE POLICY "Allow public access to billing_notes" ON billing_notes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to customer_payments" ON customer_payments;
CREATE POLICY "Allow public access to customer_payments" ON customer_payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to categories" ON categories;
CREATE POLICY "Allow public access to categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to units" ON units;
CREATE POLICY "Allow public access to units" ON units FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to products" ON products;
CREATE POLICY "Allow public access to products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to customers" ON customers;
CREATE POLICY "Allow public access to customers" ON customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to orders" ON orders;
CREATE POLICY "Allow public access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to order_items" ON order_items;
CREATE POLICY "Allow public access to order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- ข้อมูลตัวอย่างเริ่มต้น (Seed Data)
-- =================================================================================
INSERT INTO categories (id, name, icon, color) VALUES
  ('beverages', 'เครื่องดื่ม & น้ำอัดลม', 'CupSoda', 'blue'),
  ('dry-food', 'อาหารแห้ง & บะหมี่', 'Soup', 'amber'),
  ('seasoning', 'เครื่องปรุง & น้ำมันพืช', 'Flame', 'rose'),
  ('snacks', 'ขนมขบเคี้ยว & นม', 'Cookie', 'purple'),
  ('household', 'ของใช้ในครัวเรือน', 'Sparkles', 'emerald'),
  ('packaging', 'ถุงพลาสติก & บรรจุภัณฑ์', 'ShoppingBag', 'slate')
ON CONFLICT (id) DO NOTHING;

INSERT INTO units (id, name) VALUES
  ('unit-1', 'ชิ้น'),
  ('unit-2', 'แพ็ค'),
  ('unit-3', 'ลัง'),
  ('unit-4', 'ขวด'),
  ('unit-5', 'กระป๋อง'),
  ('unit-6', 'ซอง'),
  ('unit-7', 'ถุง'),
  ('unit-8', 'โหล')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (sku, barcode, name, category_id, unit, cost_price, retail_price, wholesale_price, wholesale_min_qty, is_wholesale_enabled, stock, min_stock, pack_size, image_url) VALUES
  ('BEV-001', '8851959132012', 'น้ำดื่มคริสตัล 600 มล. (แพ็ค 12 ขวด)', 'beverages', 'แพ็ค', 44.00, 58.00, 50.00, 5, true, 85, 15, '12 ขวด/แพ็ค', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=400&q=80'),
  ('BEV-002', '8851959141014', 'โค้ก รสออริจินัล 325 มล.', 'beverages', 'กระป๋อง', 11.50, 16.00, 13.50, 6, true, 140, 24, '6 กระป๋องได้ราคาส่ง', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'),
  ('BEV-003', '8850228000109', 'เอ็ม-150 เครื่องดื่มชูกำลัง', 'beverages', 'ขวด', 8.50, 12.00, 10.00, 10, true, 200, 30, '10 ขวด (ยกกล่อง)', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80'),
  ('DRY-001', '8850987101083', 'มาม่าต้มยำกุ้งน้ำข้น 55 กรัม', 'dry-food', 'ซอง', 5.20, 7.00, 6.00, 10, true, 320, 50, '10 ซอง / 30 ซอง(กล่อง)', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=400&q=80'),
  ('DRY-002', '8850124003850', 'ปลากระป๋องโรซ่า ซอสมะเขือเทศ 155 กรัม', 'dry-food', 'กระป๋อง', 16.00, 22.00, 19.00, 10, true, 95, 20, '10 กระป๋อง (แพ็ค)', 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=400&q=80'),
  ('DRY-003', '8852011100055', 'ข้าวหอมมะลิแท้ 100% ถุง 5 กก.', 'dry-food', 'ถุง', 138.00, 179.00, 162.00, 3, true, 42, 10, '5 กก./ถุง', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80'),
  ('SEA-001', '8850210000117', 'น้ำมันถั่วเหลือง องุ่น 1 ลิตร', 'seasoning', 'ขวด', 47.00, 62.00, 55.00, 12, true, 64, 12, '12 ขวด (ยกลัง)', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80'),
  ('SEA-002', '8850206001012', 'น้ำปลาแท้ตราชั่งทอง 700 มล.', 'seasoning', 'ขวด', 25.00, 35.00, 30.00, 6, true, 48, 12, '6 ขวด / 12 ขวด', 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80'),
  ('SEA-003', '8850029010116', 'น้ำตาลทรายขาว มิตรผล 1 กก.', 'seasoning', 'ถุง', 22.50, 28.00, 25.50, 10, true, 110, 20, '10 ถุงขึ้นไปได้ราคาส่ง', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=400&q=80'),
  ('SNK-001', '8850188260114', 'นมกล่อง UHT โฟร์โมสต์ รสจืด 225 มล. (แพ็ค 6)', 'snacks', 'แพ็ค', 59.00, 75.00, 68.00, 6, true, 54, 12, '6 แพ็ค (1 ลัง = 36 กล่อง)', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80'),
  ('SNK-002', '8850718801015', 'มันฝรั่งทอดกรอบ เลย์ รสมันฝรั่งแท้ 48 กรัม', 'snacks', 'ซอง', 15.00, 20.00, 17.50, 6, true, 72, 15, '6 ซองขึ้นไปราคาส่ง', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=400&q=80'),
  ('HOU-001', '8851932150125', 'น้ำยาล้างจาน ซันไลต์ เลมอนเทอร์โบ 500 มล.', 'household', 'ถุงเติม', 23.00, 32.00, 27.50, 6, true, 8, 15, 'ถุงเติม 500 มล.', 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=400&q=80'),
  ('HOU-002', '8850007210118', 'ผงซักฟอก บรีส เอกเซล 1,500 กรัม', 'household', 'ถุง', 98.00, 135.00, 118.00, 4, true, 6, 10, '1.5 กก./ถุง', 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=400&q=80'),
  ('PKG-001', '8859001102011', 'ถุงหูหิ้วใส เกรด A ขนาด 8x16 นิ้ว (ครึ่งกิโล)', 'packaging', 'ห่อ', 32.00, 45.00, 38.00, 5, true, 65, 10, '500 กรัม/ห่อ', 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=400&q=80')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO customers (code, name, phone, customer_type, shop_name, address, total_spent, order_count, points) VALUES
  ('CUS-001', 'เจ๊พร มินิมาร์ท (ลูกค้ายี่ปั๊ว)', '081-234-5678', 'wholesale', 'ร้านเจ๊พร ของชำปากซอย 5', '128/4 ซอยสุขุมวิท 55', 28450.00, 18, 284),
  ('CUS-002', 'เฮียชัย ร้านอาหารตามสั่ง', '089-876-5432', 'wholesale', 'ครัวเฮียชัย โต้รุ่ง', '45 ถ.พระราม 4', 15900.00, 12, 159),
  ('CUS-003', 'คุณสมชาย ใจดี', '086-111-2233', 'retail', '-', 'หมู่บ้านสุขสันต์ ซอย 2', 2450.00, 7, 24),
  ('CUS-004', 'ร้านกาแฟโบราณ น้องเมย์', '092-345-6789', 'wholesale', 'เมย์ คอฟฟี่ & ชานม', 'หน้าตลาดสดเทศบาล', 9820.00, 9, 98)
ON CONFLICT (code) DO NOTHING;

-- =================================================================================
-- beta 0.3.6 (ส่วน A): บิลขาย / ยกเลิกบิล แบบ Transaction เดียวบนฐานข้อมูล (RPC)
-- รันได้ทันที แอปเวอร์ชันเก่ายังใช้งานได้ / แอปตั้งแต่ beta 0.3.6 จะเรียกฟังก์ชันนี้แทนการส่งหลายคำสั่ง
-- - create_order: บันทึกบิล + ตัดสต็อกแบบ stock = stock - qty (ยอมติดลบ) + Stock Ledger + ล็อต
--   id ของบิลสร้างจากฝั่งแอป ส่งซ้ำได้ (id เดิม = ไม่บันทึกซ้ำ) / เลขที่บิลชนกับบิลอื่น = ต่อท้ายให้ไม่ซ้ำ
-- - void_order: ยกเลิกเฉพาะบิลที่ยัง completed + คืนสต็อก + Ledger + คืนล็อต
-- - p_lots: [{ row: {...product_lots}, delta }] บวก/ลบยอดคงเหลือของล็อตบนฐานข้อมูล (ไม่เขียนทับยอดของเครื่องอื่น)
-- =================================================================================

CREATE OR REPLACE FUNCTION siampos_apply_lot_deltas(p_lots JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  l JSONB;
  r JSONB;
BEGIN
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_lots, '[]'::jsonb)) LOOP
    r := l->'row';
    UPDATE product_lots
      SET remaining_qty = remaining_qty + COALESCE((l->>'delta')::numeric, 0),
          lot_number = COALESCE(r->>'lot_number', lot_number),
          expiry_date = COALESCE(NULLIF(r->>'expiry_date', '')::date, expiry_date),
          updated_at = NOW()
      WHERE id = r->>'id';
    IF NOT FOUND THEN
      INSERT INTO product_lots (id, product_id, product_name, lot_number, expiry_date, received_qty, remaining_qty, cost_price, received_at, reference_doc, updated_at)
      VALUES (
        r->>'id', r->>'product_id', r->>'product_name', COALESCE(r->>'lot_number', '-'),
        NULLIF(r->>'expiry_date', '')::date,
        COALESCE((r->>'received_qty')::numeric, 0), COALESCE((r->>'remaining_qty')::numeric, 0),
        COALESCE((r->>'cost_price')::numeric, 0), COALESCE((r->>'received_at')::timestamptz, NOW()),
        r->>'reference_doc', NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- บันทึก Ledger โดยใช้ยอดคงเหลือจริงหลังตัด/คืนสต็อกบนฐานข้อมูล (p_balances: { product_id: stock })
CREATE OR REPLACE FUNCTION siampos_insert_ledger(p_ledger JSONB, p_balances JSONB, p_reference TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_ledger (id, product_id, product_name, sku, unit, movement_type, change_qty, balance_after, reference_doc, reason, approved_by, created_at)
  SELECT
    e->>'id', e->>'product_id', e->>'product_name', e->>'sku', e->>'unit', e->>'movement_type',
    COALESCE((e->>'change_qty')::numeric, 0),
    COALESCE((p_balances->>(e->>'product_id'))::numeric, (e->>'balance_after')::numeric, 0),
    COALESCE(p_reference, e->>'reference_doc'), e->>'reason', e->>'approved_by',
    COALESCE((e->>'created_at')::timestamptz, NOW())
  FROM jsonb_array_elements(COALESCE(p_ledger, '[]'::jsonb)) e
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION create_order(
  p_order JSONB,
  p_deductions JSONB DEFAULT '[]'::jsonb,
  p_ledger JSONB DEFAULT '[]'::jsonb,
  p_lots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID := (p_order->>'id')::uuid;
  v_number TEXT := p_order->>'order_number';
  v_customer UUID;
  v_inserted UUID;
  v_existing TEXT;
  v_stock NUMERIC;
  v_balances JSONB := '{}'::jsonb;
  d JSONB;
BEGIN
  -- ส่งซ้ำ (ซิงค์คิวซ้ำ): ไม่ทำอะไรเพิ่ม
  SELECT order_number INTO v_existing FROM orders WHERE id = v_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'order_number', v_existing);
  END IF;

  -- เลขที่บิลชนกับบิลอื่น (เช่น ล้างข้อมูลเครื่องแล้วเลขรันเริ่มใหม่): ต่อท้ายด้วยส่วนหนึ่งของ id
  IF EXISTS (SELECT 1 FROM orders WHERE order_number = v_number) THEN
    v_number := v_number || '-' || UPPER(SUBSTR(REPLACE(v_id::text, '-', ''), 1, 4));
  END IF;

  SELECT id INTO v_customer FROM customers WHERE id::text = p_order->>'customer_id';

  INSERT INTO orders (
    id, order_number, customer_id, customer_name, pricing_mode, subtotal, wholesale_savings, bill_discount,
    tax_amount, grand_total, total_cost, payment_method, payments, cash_received, change_amount, status,
    note, items, credit_due_date, created_by_name, created_at
  ) VALUES (
    v_id, v_number, v_customer, COALESCE(p_order->>'customer_name', 'ลูกค้าทั่วไป'),
    COALESCE(p_order->>'pricing_mode', 'auto'),
    COALESCE((p_order->>'subtotal')::numeric, 0), COALESCE((p_order->>'wholesale_savings')::numeric, 0),
    COALESCE((p_order->>'bill_discount')::numeric, 0), COALESCE((p_order->>'tax_amount')::numeric, 0),
    COALESCE((p_order->>'grand_total')::numeric, 0), COALESCE((p_order->>'total_cost')::numeric, 0),
    COALESCE(p_order->>'payment_method', 'cash'), COALESCE(p_order->'payments', '[]'::jsonb),
    COALESCE((p_order->>'cash_received')::numeric, 0), COALESCE((p_order->>'change_amount')::numeric, 0),
    'completed', p_order->>'note', COALESCE(p_order->'items', '[]'::jsonb),
    NULLIF(p_order->>'credit_due_date', '')::timestamptz, p_order->>'created_by_name',
    COALESCE((p_order->>'created_at')::timestamptz, NOW())
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'order_number', v_number);
  END IF;

  -- ตัดสต็อกจากยอดบนฐานข้อมูล (ไม่ใช้ยอดที่แคชในเครื่อง) ยอมให้ติดลบ
  FOR d IN SELECT * FROM jsonb_array_elements(COALESCE(p_deductions, '[]'::jsonb)) LOOP
    UPDATE products
      SET stock = stock - COALESCE((d->>'qty')::numeric, 0), updated_at = NOW()
      WHERE id::text = d->>'product_id'
      RETURNING stock INTO v_stock;
    IF FOUND THEN
      v_balances := v_balances || jsonb_build_object(d->>'product_id', v_stock);
    END IF;
  END LOOP;

  PERFORM siampos_insert_ledger(p_ledger, v_balances, v_number);
  PERFORM siampos_apply_lot_deltas(p_lots);

  RETURN jsonb_build_object('status', 'created', 'order_number', v_number, 'balances', v_balances);
END;
$$;

CREATE OR REPLACE FUNCTION void_order(
  p_order_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL,
  p_restores JSONB DEFAULT '[]'::jsonb,
  p_ledger JSONB DEFAULT '[]'::jsonb,
  p_lots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_order RECORD;
  v_stock NUMERIC;
  v_balances JSONB := '{}'::jsonb;
  d JSONB;
BEGIN
  -- ล็อกแถวบิลไว้ กันสองเครื่องยกเลิกบิลเดียวกันพร้อมกันแล้วคืนสต็อกซ้ำ
  IF p_order_id IS NOT NULL THEN
    SELECT id, order_number, status INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  ELSE
    SELECT id, order_number, status INTO v_order FROM orders WHERE order_number = p_order_number LIMIT 1 FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('status', 'already_voided', 'order_number', v_order.order_number);
  END IF;

  UPDATE orders SET status = 'voided' WHERE id = v_order.id;

  FOR d IN SELECT * FROM jsonb_array_elements(COALESCE(p_restores, '[]'::jsonb)) LOOP
    UPDATE products
      SET stock = stock + COALESCE((d->>'qty')::numeric, 0), updated_at = NOW()
      WHERE id::text = d->>'product_id'
      RETURNING stock INTO v_stock;
    IF FOUND THEN
      v_balances := v_balances || jsonb_build_object(d->>'product_id', v_stock);
    END IF;
  END LOOP;

  PERFORM siampos_insert_ledger(p_ledger, v_balances, v_order.order_number);
  PERFORM siampos_apply_lot_deltas(p_lots);

  RETURN jsonb_build_object('status', 'voided', 'order_number', v_order.order_number, 'balances', v_balances);
END;
$$;

-- ให้ PostgREST รู้จักฟังก์ชันใหม่ทันที
NOTIFY pgrst, 'reload schema';


-- beta 0.3.6 (ส่วน B): ปิดการเข้าถึงแบบสาธารณะ (RLS ต้องล็อกอิน) แยกไว้ในไฟล์ supabase/lockdown-rls.sql
-- ห้ามรันก่อนสร้างบัญชีร้านและ deploy แอป beta 0.3.6 (ดูขั้นตอนในไฟล์นั้น)
