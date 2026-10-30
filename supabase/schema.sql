-- =================================================================================
-- SiamPOS Pro: โครงสร้างฐานข้อมูลสำหรับระบบขายหน้าร้านปลีก-ส่ง (Supabase PostgreSQL)
-- วิธีใช้งาน: คัดลอกโค้ดทั้งหมดนี้ไปวางในเมนู SQL Editor บนหน้าเว็บ Supabase แล้วกด Run
-- =================================================================================

-- เปิดใช้งาน UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ตารางหมวดหมู่สินค้า (Categories)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'Package',
  color TEXT DEFAULT 'indigo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางสินค้า (Products) - รองรับทั้งราคาขายปลีกและราคาขายส่ง
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
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 10,
  pack_size TEXT DEFAULT '1 ชิ้น',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตารางลูกค้า / สมาชิก / ยี่ปั๊ว (Customers)
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

-- 4. ตารางบิลขาย / ออเดอร์ (Orders)
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
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'promptpay', 'transfer', 'credit')),
  cash_received NUMERIC(12, 2) DEFAULT 0,
  change_amount NUMERIC(12, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  note TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ตารางรายการสินค้าในบิล (Order Items - สำหรับทำรายงานเชิงลึก)
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
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- =================================================================================
-- การตั้งค่า Row Level Security (RLS) สำหรับการเข้าถึงผ่าน Supabase Client
-- =================================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- เปิด Policy ให้สามารถอ่าน-เขียนข้อมูลได้สะดวกสำหรับระบบ POS ภายในร้าน
DROP POLICY IF EXISTS "Allow public access to categories" ON categories;
CREATE POLICY "Allow public access to categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to products" ON products;
CREATE POLICY "Allow public access to products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to customers" ON customers;
CREATE POLICY "Allow public access to customers" ON customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to orders" ON orders;
CREATE POLICY "Allow public access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to order_items" ON order_items;
CREATE POLICY "Allow public access to order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- ข้อมูลตัวอย่างเริ่มต้น (Seed Data) สำหรับร้านค้าปลีก-ส่ง
-- =================================================================================
INSERT INTO categories (id, name, icon, color) VALUES
  ('beverages', 'เครื่องดื่ม & น้ำอัดลม', 'CupSoda', 'blue'),
  ('dry-food', 'อาหารแห้ง & บะหมี่', 'Soup', 'amber'),
  ('seasoning', 'เครื่องปรุง & น้ำมันพืช', 'Flame', 'rose'),
  ('snacks', 'ขนมขบเคี้ยว & นม', 'Cookie', 'purple'),
  ('household', 'ของใช้ในครัวเรือน', 'Sparkles', 'emerald'),
  ('packaging', 'ถุงพลาสติก & บรรจุภัณฑ์', 'ShoppingBag', 'slate')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (sku, barcode, name, category_id, unit, cost_price, retail_price, wholesale_price, wholesale_min_qty, stock, min_stock, pack_size, image_url) VALUES
  ('BEV-001', '8851959132012', 'น้ำดื่มคริสตัล 600 มล. (แพ็ค 12 ขวด)', 'beverages', 'แพ็ค', 44.00, 58.00, 50.00, 5, 85, 15, '12 ขวด/แพ็ค', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=400&q=80'),
  ('BEV-002', '8851959141014', 'โค้ก รสออริจินัล 325 มล.', 'beverages', 'กระป๋อง', 11.50, 16.00, 13.50, 6, 140, 24, '6 กระป๋องได้ราคาส่ง', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'),
  ('BEV-003', '8850228000109', 'เอ็ม-150 เครื่องดื่มชูกำลัง', 'beverages', 'ขวด', 8.50, 12.00, 10.00, 10, 200, 30, '10 ขวด (ยกกล่อง)', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80'),
  ('DRY-001', '8850987101083', 'มาม่าต้มยำกุ้งน้ำข้น 55 กรัม', 'dry-food', 'ซอง', 5.20, 7.00, 6.00, 10, 320, 50, '10 ซอง / 30 ซอง(กล่อง)', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=400&q=80'),
  ('DRY-002', '8850124003850', 'ปลากระป๋องโรซ่า ซอสมะเขือเทศ 155 กรัม', 'dry-food', 'กระป๋อง', 16.00, 22.00, 19.00, 10, 95, 20, '10 กระป๋อง (แพ็ค)', 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=400&q=80'),
  ('DRY-003', '8852011100055', 'ข้าวหอมมะลิแท้ 100% ถุง 5 กก.', 'dry-food', 'ถุง', 138.00, 179.00, 162.00, 3, 42, 10, '5 กก./ถุง', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80'),
  ('SEA-001', '8850210000117', 'น้ำมันถั่วเหลือง องุ่น 1 ลิตร', 'seasoning', 'ขวด', 47.00, 62.00, 55.00, 12, 64, 12, '12 ขวด (ยกลัง)', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80'),
  ('SEA-002', '8850206001012', 'น้ำปลาแท้ตราชั่งทอง 700 มล.', 'seasoning', 'ขวด', 25.00, 35.00, 30.00, 6, 48, 12, '6 ขวด / 12 ขวด', 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80'),
  ('SEA-003', '8850029010116', 'น้ำตาลทรายขาว มิตรผล 1 กก.', 'seasoning', 'ถุง', 22.50, 28.00, 25.50, 10, 110, 20, '10 ถุงขึ้นไปได้ราคาส่ง', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=400&q=80'),
  ('SNK-001', '8850188260114', 'นมกล่อง UHT โฟร์โมสต์ รสจืด 225 มล. (แพ็ค 6)', 'snacks', 'แพ็ค', 59.00, 75.00, 68.00, 6, 54, 12, '6 แพ็ค (1 ลัง = 36 กล่อง)', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80'),
  ('SNK-002', '8850718801015', 'มันฝรั่งทอดกรอบ เลย์ รสมันฝรั่งแท้ 48 กรัม', 'snacks', 'ซอง', 15.00, 20.00, 17.50, 6, 72, 15, '6 ซองขึ้นไปราคาส่ง', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=400&q=80'),
  ('HOU-001', '8851932150125', 'น้ำยาล้างจาน ซันไลต์ เลมอนเทอร์โบ 500 มล.', 'household', 'ถุงเติม', 23.00, 32.00, 27.50, 6, 8, 15, 'ถุงเติม 500 มล.', 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=400&q=80'),
  ('HOU-002', '8850007210118', 'ผงซักฟอก บรีส เอกเซล 1,500 กรัม', 'household', 'ถุง', 98.00, 135.00, 118.00, 4, 6, 10, '1.5 กก./ถุง', 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=400&q=80'),
  ('PKG-001', '8859001102011', 'ถุงหูหิ้วใส เกรด A ขนาด 8x16 นิ้ว (ครึ่งกิโล)', 'packaging', 'ห่อ', 32.00, 45.00, 38.00, 5, 65, 10, '500 กรัม/ห่อ', 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=400&q=80')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO customers (code, name, phone, customer_type, shop_name, address, total_spent, order_count, points) VALUES
  ('CUS-001', 'เจ๊พร มินิมาร์ท (ลูกค้ายี่ปั๊ว)', '081-234-5678', 'wholesale', 'ร้านเจ๊พร ของชำปากซอย 5', '128/4 ซอยสุขุมวิท 55', 28450.00, 18, 284),
  ('CUS-002', 'เฮียชัย ร้านอาหารตามสั่ง', '089-876-5432', 'wholesale', 'ครัวเฮียชัย โต้รุ่ง', '45 ถ.พระราม 4', 15900.00, 12, 159),
  ('CUS-003', 'คุณสมชาย ใจดี', '086-111-2233', 'retail', '-', 'หมู่บ้านสุขสันต์ ซอย 2', 2450.00, 7, 24),
  ('CUS-004', 'ร้านกาแฟโบราณ น้องเมย์', '092-345-6789', 'wholesale', 'เมย์ คอฟฟี่ & ชานม', 'หน้าตลาดสดเทศบาล', 9820.00, 9, 98)
ON CONFLICT (code) DO NOTHING;

