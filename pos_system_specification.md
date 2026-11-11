# Software Requirements Specification (SRS)
## Hybrid Retail & Wholesale Web Application POS System

---

## 1. Project Overview & Objectives
ระบบ Web Application POS แบบผสมผสาน (Hybrid Retail-Wholesale) ออกแบบมาเพื่อรองรับธุรกิจที่ดำเนินการทั้งขายปลีกหน้าร้าน (B2C) ที่ต้องการความรวดเร็วในการออกบิล และขายส่งหลังร้าน (B2B) ที่ต้องการความยืดหยุ่นด้านหน่วยนับ (Multi-UOM), ลำดับราคาตามปริมาณ (Tiered Pricing), ระบบเครดิตเทอม (Credit Term), และการตัดสต็อกข้ามคลังสินค้า

### Core Engineering Objectives
1. **High Concurrency & Transactional Integrity:** ป้องกันปัญหาสต็อกติดลบ (Race Condition) จากการตัดสต็อกพร้อมกันระหว่างแคชเชียร์หน้าร้านและฝ่ายขายส่ง
2. **Offline-First Capability:** หน้าร้านขายปลีกต้องทำงานต่อได้แม้สัญญาณอินเทอร์เน็ตขาดหาย ด้วย PWA + Local Storage / IndexedDB
3. **Seamless Hardware Integration:** สั่งพิมพ์สลิปและเปิดลิ้นชักเก็บเงินผ่าน Web Browser โดยใช้ Web Serial / WebUSB API (ESC/POS Protocol) โดยไม่ต้องพึ่ง Native Driver เสริม
4. **Relational UOM Hierarchy:** หน่วยนับสินค้าต้องเชื่อมโยงและแปลงค่าอัตโนมัติ (เช่น 1 พาเลท = 40 ลัง = 960 ชิ้น)

---

## 2. User Roles & Permission Matrix (RBAC)

| Role | Permissions & Scope |
| :--- | :--- |
| **Cashier (แคชเชียร์)** | สแกนขายปลีก, พักบิล/เรียกคืนบิล, รับชำระเงิน, พิมพ์สลิปย่อ |
| **Wholesale Sales (พนักงานขายส่ง)** | ค้นหาลูกค้า B2B, เปิดใบเสนอราคา, จองสต็อก, ออกใบส่งของ/ใบกำกับภาษีเต็มรูป |
| **Warehouse Keeper (เจ้าหน้าที่คลัง)** | รับสินค้าเข้า (GR), ตรวจนับสต็อก (Cycle Count), โอนย้ายสินค้าระหว่างคลัง |
| **Cashier Supervisor / Manager** | สิทธิ์ Void บิล, อนุมัติส่วนลดพิเศษเกินเกณฑ์, เปิดลิ้นชักฉุกเฉิน, ปรับปรุงสต็อก |
| **Accountant (ฝ่ายบัญชี)** | บริหารจัดการลูกหนี้/เจ้าหนี้ (AR/AP), วางบิล, ออกรายงานภาษีขาย ภ.พ.30, e-Tax |
| **System Admin** | จัดการผู้ใช้งาน, กำหนดสิทธิ์, ตั้งค่าการเชื่อมต่อ Hardware, ดู Audit Logs |

---

## 3. Detailed Functional Modules

### Module 1: Point of Sale Terminal (Frontend POS)
- **Retail Cashier Mode:**
  - รองรับ Barcode Scanner (Keyboard Emulation / WebHID)
  - หน้าปุ่มสินค้าด่วน (Quick-Pick / Hotkeys) แบ่งตามหมวดหมู่
  - ฟังก์ชัน Hold Bill (พักบิล) ได้หลายบิลพร้อมกัน พร้อมระบบสลับบิลเร็ว
  - รองรับการชำระเงินแบบหลายช่องทาง (Split Payment): เช่น จ่ายเงินสดส่วนหนึ่ง + สแกน QR ส่วนที่เหลือ
  - Dynamic PromptPay QR Code Generation ตามยอดรวมสุทธิ
- **Wholesale Order Desk Mode:**
  - ค้นหาลูกค้าด้วยชื่อ, เบอร์โทร, หรือเลขประจำตัวผู้เสียภาษี
  - แสดงประวัติการสั่งซื้อและระดับราคาของลูกค้าอัตโนมัติ
  - เลือกหน่วยนับเป็น ลัง / โหล / พาเลท พร้อมคำนวณราคาตาม Volume Discount อัตโนมัติ
  - ระบบตรวจสอบวงเงินเครดิต (Credit Limit Check) ก่อนยืนยันการขาย
- **Hardware Integration:**
  - สั่งพิมพ์ Thermal Slip 58mm/80mm ผ่าน Web Serial API / WebUSB ด้วยมาตรฐาน ESC/POS
  - สั่งพัลส์ไฟฟ้าเปิดลิ้นชักเก็บเงิน (Kick Cash Drawer: Pin 2 / Pin 5)

---

### Module 2: Product & Multi-UOM Management
- **Hierarchical Unit of Measure (UOM):**
  - กำหนด Base Unit (หน่วยเล็กสุด เช่น ชิ้น)
  - กำหนดหน่วยรอง (Packaging Units) พร้อม Conversion Multiplier (เช่น 1 แพ็ค = 6 ชิ้น, 1 ลัง = 24 ชิ้น)
  - กำหนดบาร์โค้ดแยกตามแต่ละหน่วย (Barcode ต่อ UOM)
- **Multi-Dimensional Pricing Matrix:**
  - **Customer Tier Pricing:** ราคาปลีก (Retail), สมาชิก (Member), ตัวแทนจำหน่าย (Wholesale T1, T2, T3)
  - **Volume Break Pricing:** ซื้อ $\ge 10$ ลดเหลือ $X$ บาท, $\ge 50$ ลดเหลือ $Y$ บาท
  - **Special Custom Price:** ผูกราคาสินค้ารายตัวกับลูกค้ารายสัญญาเฉพาะ
- **Batch / Lot & Expiry Management:**
  - รองรับการระบุหมายเลข Lot และ Expiry Date
  - กลยุทธ์การตัดสต็อกอัตโนมัติ: FIFO (First-In, First-Out) หรือ FEFO (First-Expired, First-Out)

---

### Module 3: Inventory & Multi-Warehouse Management
- **Warehouse Architecture:**
  - หน้าร้าน (Storefront / Display Shelves)
  - คลังหลังร้าน (Backstore)
  - คลังสินค้าหลัก (Main Warehouse / Distribution Center)
- **Stock Status Tracking:**
  - `Physical Stock` (ยอดมีอยู่จริง)
  - `Reserved Stock` (ยอดที่ถูกจองจากใบสั่งขายส่งที่รอส่งของ)
  - `Available to Promise (ATP)` = Physical Stock - Reserved Stock
- **Stock Movement Operations:**
  - Goods Receipt (GR): รับสินค้าจากการสั่งซื้อ (PO)
  - Stock Transfer: โอนสินค้าระหว่างสาขา/คลัง พร้อมระบบยืนยันรับเข้า (Two-Step Transfer: In-Transit -> Received)
  - Stock Adjustment: ปรับยอดสินค้าสูญหาย/ชำรุด พร้อมบังคับระบุเหตุผลและบันทึกผู้มีอำนาจอนุมัติ
  - Cycle Counting: การตรวจนับสต็อกหมุนเวียนแบบ Blind Count (ไม่แสดงยอดให้ผู้ตรวจนับเห็น)

---

### Module 4: B2B CRM & Accounts Receivable (AR)
- **Customer Profile:**
  - เก็บข้อมูล Tax ID 13 หลัก, Headquarter/Branch ID (สำนักงานใหญ่/สาขา), พิกัดจัดส่ง
  - กำหนด Credit Term (เช่น 15, 30, 45, 60 วัน)
  - กำหนด Credit Limit (วงเงินสินเชื่อ) พร้อมการเตือนเมื่อเกินเพดาน
- **Billing & Collection Workflow:**
  - รวมรายการใบส่งของ (Delivery Orders) รายสัปดาห์/รายเดือน เพื่อออก **ใบวางบิล (Billing Note / Statement)**
  - ระบบรับชำระหนี้ (Payment Receipt / Voucher) รองรับการตัดชำระแบบเต็มบิลหรือทยอยชำระ
  - Aging Report: รายงานวิเคราะห์อายุลูกหนี้ (0-30 วัน, 31-60 วัน, 61-90 วัน, >90 วัน)

---

### Module 5: Purchasing & Accounts Payable (AP)
- คำนวณ Reorder Point อัตโนมัติ: $\text{ROP} = (\text{Daily Demand} \times \text{Lead Time}) + \text{Safety Stock}$
- ระบบออกใบสั่งซื้อ (Purchase Order - PO) ส่งออกเป็น PDF / Email อัตโนมัติ
- บันทึกต้นทุนสินค้าแบบ Moving Average Cost เพื่อนำไปคำนวณกำไรขั้นต้น (Gross Profit) อย่างแม่นยำ

---

### Module 6: Tax, Invoicing & Compliance
- รองรับประเภทเอกสารตามมาตรฐานสรรพากรไทย:
  - ใบกำกับภาษีอย่างย่อ (Abbreviated Tax Invoice)
  - ใบกำกับภาษีเต็มรูป / ใบเสร็จรับเงิน (Full Tax Invoice / Receipt)
  - ใบส่งของ / ใบแจ้งหนี้ (Delivery Order / Invoice)
  - ใบลดหนี้ (Credit Note) / ใบเพิ่มหนี้ (Debit Note)
- **e-Tax Invoice by Email / RD Ready:**
  - สถาปัตยกรรมข้อมูลรองรับการแปลงเอกสารเป็น XML ตามมาตรฐาน ETDA / สรรพากร
  - รองรับการลงลายมือชื่อดิจิทัล (Digital Signature via HSM หรือ Cloud PKI)
- รายงานสรุปภาษีซื้อ-ภาษีขาย พร้อมส่งออกเพื่อยื่น ภ.พ.30

---

## 4. Technical Architecture & Tech Stack

```
[ Client Browser (PWA) ]
  ├── React / Next.js (App Router) + Tailwind CSS + Shadcn UI
  ├── State Management: Zustand / TanStack Query
  ├── Offline Storage: IndexedDB (Dexie.js)
  └── Hardware Communication: Web Serial API (ESC/POS Driver)
          │
      (HTTPS / WSS)
          │
[ API Gateway / Load Balancer ]
          │
[ Backend Application Server ]
  ├── Language: Node.js (NestJS / TypeScript) หรือ Go / .NET 8
  ├── Authentication: JWT + RBAC Middleware
  ├── Document Generation: Puppeteer / Typst (PDF)
  └── Concurrency Lock: Redis Distributed Lock / DB Pessimistic Lock
          │
 ┌────────┴──────────────────────────┐
 │                                   │
[ Primary DB: PostgreSQL ]      [ In-Memory Cache: Redis ]
  - ACID Transactions             - Session Store
  - JSONB for Flexible Config     - Product Price Cache
  - Strict Foreign Keys           - Message Queue for Offline Sync
```

---

## 5. Database Schema Blueprint (PostgreSQL DDL Reference)

```sql
-- 1. Products & Units of Measure
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE product_uoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    uom_name VARCHAR(50) NOT NULL, -- e.g., 'Piece', 'Box', 'Carton'
    conversion_factor NUMERIC(10, 4) NOT NULL, -- 1 Carton = 24 Pieces -> factor = 24.0000
    barcode VARCHAR(100) UNIQUE,
    is_base_unit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Multi-tier Price Rules
CREATE TABLE price_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_uom_id UUID REFERENCES product_uoms(id) ON DELETE CASCADE,
    tier_name VARCHAR(50) NOT NULL, -- 'Retail', 'Wholesale_A', 'VIP'
    min_quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_product_tier_qty UNIQUE (product_uom_id, tier_name, min_quantity)
);

-- 3. Inventory Stock Balances (Per Warehouse)
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES warehouses(id),
    product_id UUID REFERENCES products(id),
    physical_qty NUMERIC(12, 4) NOT NULL DEFAULT 0, -- Stored in Base Unit
    reserved_qty NUMERIC(12, 4) NOT NULL DEFAULT 0, -- For pending wholesale deliveries
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_warehouse_product UNIQUE (warehouse_id, product_id)
);

-- 4. Customers (B2B & B2C)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(13),
    branch_number VARCHAR(10) DEFAULT '00000',
    customer_type VARCHAR(20) DEFAULT 'B2C', -- 'B2C', 'B2B'
    tier_name VARCHAR(50) DEFAULT 'Retail',
    credit_limit NUMERIC(12, 2) DEFAULT 0,
    credit_term_days INT DEFAULT 0,
    is_blocked BOOLEAN DEFAULT FALSE
);

-- 5. Orders & Transactions
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_type VARCHAR(20) NOT NULL, -- 'RETAIL', 'WHOLESALE'
    customer_id UUID REFERENCES customers(id),
    warehouse_id UUID REFERENCES warehouses(id),
    subtotal NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL,
    grand_total NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL, -- 'PAID', 'PENDING', 'PARTIAL', 'CREDIT'
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_uom_id UUID REFERENCES product_uoms(id),
    quantity NUMERIC(10, 4) NOT NULL,
    base_qty_deducted NUMERIC(10, 4) NOT NULL, -- qty * conversion_factor
    unit_price NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL
);
```

---

## 6. Critical Business Logic & Algorithms

### 6.1 Stock Concurrency & Deduction Logic
เมื่อทำรายการขาย ระบบต้องใช้ **Pessimistic Locking** บน Database เพื่อป้องกัน Race Condition:
```sql
BEGIN TRANSACTION;

-- 1. ล็อกแถวสต็อกของสินค้านั้นในคลังที่ระบุ
SELECT physical_qty, reserved_qty 
FROM inventory_balances
WHERE warehouse_id = $warehouse_id AND product_id = $product_id
FOR UPDATE;

-- 2. ตรวจสอบเงื่อนไขว่าสต็อกเพียงพอหรือไม่ (คำนวณเป็น Base Unit)
-- Available = physical_qty - reserved_qty
-- IF Available < required_base_qty THEN ROLLBACK & RAISE EXCEPTION;

-- 3. หักยอดสต็อกจริง
UPDATE inventory_balances
SET physical_qty = physical_qty - $required_base_qty,
    updated_at = NOW()
WHERE warehouse_id = $warehouse_id AND product_id = $product_id;

-- 4. บันทึก Stock Ledger (Movement Log)
INSERT INTO stock_ledger (warehouse_id, product_id, change_qty, reference_doc, movement_type)
VALUES ($warehouse_id, $product_id, -$required_base_qty, $order_number, 'SALES');

COMMIT;
```

### 6.2 Dynamic Price Resolution Engine
เมื่อผู้ใช้เลือกสินค้า `Product A` ใน UOM `ลัง` สำหรับลูกค้า `Customer X`:
1. ตรวจสอบว่ามีราคาเฉพาะรายสัญญา (Contract Price) หรือไม่ ถ้ามีให้ใช้ราคานั้น
2. ตรวจสอบระดับ Tier ของลูกค้า (เช่น ลูกค้าระดับ `Wholesale_A`)
3. ตรวจสอบปริมาณที่สั่งซื้อเพื่อเทียบ `min_quantity` ในตาราง `price_tiers`
4. หากไม่พบระดับ Tier ส่ง ให้ตกไปใช้ระดับ `Retail` (Default Fallback)

---

## 7. Step-by-Step Implementation Roadmap

### Phase 1: Database Setup & Foundation
- Setup PostgreSQL พร้อม Migration Script ตาม Schema ที่กำหนด
- Implement JWT Authentication และ RBAC Middleware
- CRUD สำหรับ Master Data: สินค้า, หน่วยนับ (UOM), แปลงหน่วย, และจัดการคลังสินค้า

### Phase 2: Price Resolution & Multi-UOM Logic
- สร้าง Price Calculation Engine (คำนวณตาม Tier + Volume)
- ระบบตัดสต็อกแบบ ACID Transaction และการสร้าง Stock Movement Ledger
- Unit Testing สำหรับกรณีการแปลงหน่วยนับและการล็อกสต็อก

### Phase 3: Retail POS & Hardware Integration
- พัฒนาหน้าจอ POS UI ด้วย Next.js และ Tailwind CSS (Mobile & Touch Responsive)
- เชื่อมต่อ Web Serial API สำหรับส่งคำสั่ง ESC/POS ไปยัง Thermal Printer
- พัฒนาระบบ Barcode Scanner Listener และระบบพักบิล (Hold Bill)

### Phase 4: Wholesale B2B & AR Management
- พัฒนาระบบใบสั่งขาย (Sale Order) และระบบจองสต็อก (Reserve Stock)
- ระบบตรวจสอบวงเงินเครดิต (Credit Limit) และจัดการลูกหนี้การค้า
- หน้าระบบรวมบิลและออกใบวางบิล (Billing Statement)

### Phase 5: Tax, e-Tax & Offline-First Sync
- ออกแบบ Template ใบกำกับภาษีอย่างย่อ (80mm Slip) และใบกำกับภาษีเต็มรูป (A4 PDF)
- วางระบบ IndexedDB + Background Sync Service Worker สำหรับ Offline Mode
- ระบบสรุปรายงานภาษีขายและรายงานวิเคราะห์ยอดขาย (Sales Analytics)