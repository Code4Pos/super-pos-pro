# 🛒 SiamPOS Pro — ระบบ Web App ขายหน้าร้านปลีก-ส่ง & จัดการสต็อกอัจฉริยะ

ระบบ **Point of Sale (POS)** สำหรับร้านค้าขายปลีกและขายส่ง (มินิมาร์ท, ร้านค้าส่งยี่ปั๊ว, ร้านของชำขนาดกลาง-ใหญ่) พัฒนาด้วย **React (Vite) + Tailwind CSS + Supabase PostgreSQL** ออกแบบ UI/UX ให้ใช้งานง่าย รวดเร็ว และรองรับการแสดงผลแบบ **Responsive ทุกขนาดหน้าจอ** ทั้งบนคอมพิวเตอร์ตั้งโต๊ะ (Desktop), แท็บเล็ต (Tablet) และสมาร์ทโฟน (Smartphone)

---

## ✨ ฟีเจอร์หลักของระบบ (Key Features)

1. **ระบบคิดเงินหน้าร้านปลีก-ส่งอัตโนมัติ (Smart Retail & Wholesale POS)**
   - กำหนดโครงสร้างราคาสินค้าได้ทั้ง **ราคาปลีก (Retail)** และ **ราคาส่ง (Wholesale)** พร้อมระบุจำนวนขั้นต่ำที่ได้ราคาส่ง (เช่น ซื้อครบ 6 ชิ้น หรือ 12 ชิ้น ได้เรตราคาส่งอัตโนมัติ)
   - ปุ่มลัด **+1 ชิ้น** และ **+จำนวนขั้นต่ำขายส่ง** บนการ์ดสินค้า ช่วยให้คิดเงินลูกค้าที่ซื้อยกลัง/ยกแพ็คได้ในคลิกเดียว
   - แจ้งเตือนในตะกร้าอัตโนมัติเมื่อลูกค้าซื้อใกล้ครบจำนวนราคาส่ง พร้อมปุ่มปรับจำนวนด่วน
   - รองรับการสลับโหมดบิล: **ปลีก-ส่งอัตโนมัติ**, **ราคาส่งทั้งบิล (สำหรับลูกค้ายี่ปั๊ว)** และ **ราคาปลีกทั้งบิล**
   - ช่องค้นหาและรองรับเครื่องยิงบาร์โค้ด (**Barcode Scanner Ready** — ยิงบาร์โค้ดแล้วกด `Enter` สินค้าเข้าตะกร้าทันที)

2. **รองรับการชำระเงินหลากหลาย & พิมพ์ใบเสร็จ (Checkout & Thermal Receipt)**
   - รองรับ **เงินสด** (คำนวณเงินทอนอัตโนมัติพร้อมปุ่มธนบัตรด่วน), **QR PromptPay**, **โอนเงินธนาคาร** และ **เครดิต/ค้างชำระ**
   - ออกใบเสร็จรับเงินมาตรฐาน รองรับการสั่งพิมพ์ออกเครื่องพิมพ์สลิปความร้อนขนาด 80mm (`window.print()`)

3. **ระบบคลังสินค้าและแจ้งเตือนสต็อกต่ำ (Inventory & Low-Stock Alert)**
   - เพิ่ม/แก้ไข/ลบสินค้า กำหนดราคาทุน ราคาปลีก ราคาส่ง และจุดเตือนสต็อกต่ำ (`min_stock`)
   - ปุ่ม **เติมสต็อกด่วน (Quick Restock)** สำหรับรับสินค้าเข้าคลังโดยไม่ต้องเปิดฟอร์มแก้ไขเต็มรูปแบบ
   - ตัดสต็อกอัตโนมัติเมื่อขายสำเร็จ และคืนสต็อกอัตโนมัติเมื่อกดยกเลิกบิล (Void Order)

4. **ระบบฐานข้อมูลลูกค้า & ยี่ปั๊วขายส่ง (Customer & Wholesale Member CRM)**
   - แยกประเภท **ลูกค้าทั่วไป (Retail)** และ **ลูกค้าขายส่ง/ยี่ปั๊ว (Wholesale)**
   - เมื่อเลือกลูกค้าขายส่ง ระบบจะปรับเรตราคาในตะกร้าเป็น **ราคาส่งทั้งบิล** ให้อัตโนมัติ พร้อมเก็บสถิติยอดซื้อสะสม จำนวนบิล และแต้มสะสม

5. **แดชบอร์ดสรุปยอดขายและกำไรขั้นต้น (Analytics Dashboard)**
   - สรุปยอดขายสุทธิ, กำไรขั้นต้นโดยประมาณ (Gross Profit & Margin %), ส่วนลดราคาส่งสะสม, 5 อันดับสินค้าขายดี และสัดส่วนช่องทางการชำระเงิน

---

## 📁 โครงสร้างการจัดระเบียบไฟล์ (Project Structure)

```text
POS system/
├── supabase/
│   └── schema.sql                     # สคริปต์ SQL สร้างตารางฐานข้อมูล Supabase + ข้อมูลเริ่มต้น
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx            # เมนูแถบซ้ายสำหรับหน้าจอ Desktop
│   │   │   ├── Header.jsx             # แถบด้านบนแสดงยอดขายวันนี้ แจ้งเตือนสต็อก และสถานะ DB
│   │   │   └── MobileNav.jsx          # แถบเมนูด้านล่างสำหรับ Smartphone / Tablet
│   │   ├── pos/
│   │   │   ├── ProductCard.jsx        # การ์ดแสดงสินค้าพร้อมป้ายราคาปลีก-ส่ง
│   │   │   ├── CartPanel.jsx          # ตะกร้าสินค้า (Desktop Panel & Mobile Drawer)
│   │   │   ├── CheckoutModal.jsx      # หน้าต่างรับชำระเงินและคำนวณเงินทอน
│   │   │   └── ReceiptModal.jsx       # หน้าต่างใบเสร็จรับเงินพร้อมระบบสั่งพิมพ์
│   │   └── inventory/
│   │       ├── ProductModal.jsx       # หน้าต่างเพิ่ม/แก้ไขสินค้าและโครงสร้างราคา
│   │       └── StockModal.jsx         # หน้าต่างรับของเข้า/ปรับสต็อกด่วน
│   ├── context/
│   │   └── POSContext.jsx             # Global State จัดการข้อมูลตะกร้า สินค้า ออเดอร์ และลูกค้า
│   ├── data/
│   │   └── mockData.js                # ข้อมูลตัวอย่างเริ่มต้นสำหรับโหมดสาธิต (Demo Mode)
│   ├── lib/
│   │   └── supabase.js                # ตั้งค่าการเชื่อมต่อ Supabase Client
│   ├── pages/
│   │   ├── POSPage.jsx                # หน้าขายหน้าร้าน (Point of Sale)
│   │   ├── InventoryPage.jsx          # หน้าจัดการคลังสินค้าและหมวดหมู่
│   │   ├── OrdersPage.jsx             # หน้าประวัติบิลขายและดูใบเสร็จย้อนหลัง
│   │   ├── CustomersPage.jsx          # หน้าจัดการข้อมูลลูกค้าและยี่ปั๊ว
│   │   └── DashboardPage.jsx          # หน้าแดชบอร์ดวิเคราะห์ยอดขายและกำไร
│   ├── services/
│   │   └── posService.js              # ชั้นจัดการข้อมูล (รองรับทั้ง Supabase จริง และ LocalStorage)
│   ├── utils/
│   │   └── formatters.js              # ฟังก์ชันคำนวณราคาปลีก-ส่ง และจัดรูปแบบเงินบาท/เวลา
│   ├── App.jsx                        # โครงสร้างหน้าจอหลักและการสลับหน้า
│   ├── main.jsx                       # จุดเริ่มต้นของ React App
│   └── index.css                      # ตั้งค่า Tailwind CSS และ Print Stylesheet
├── .env.example                       # ตัวอย่างไฟล์ตั้งค่าการเชื่อมต่อ Supabase
├── index.html                         # ไฟล์ HTML หลักและฟอนต์ภาษาไทย (Prompt)
├── package.json                       # รายการไลบรารีและคำสั่งรันโปรเจค
├── tailwind.config.js                 # ตั้งค่าธีมของ Tailwind CSS
└── vite.config.js                     # ตั้งค่า Vite Bundler
```

---

## 🚀 วิธีติดตั้งและรันโปรเจค (How to Run)

### 1. สิ่งที่ต้องมีในเครื่อง (Prerequisites)
- ติดตั้ง [Node.js](https://nodejs.org/) (แนะนำเวอร์ชัน 18 ขึ้นไป)

### 2. ติดตั้งแพ็กเกจ (Install Dependencies)
เปิด Terminal หรือ PowerShell ที่โฟลเดอร์โปรเจค (`POS system`) แล้วรันคำสั่ง:

```bash
npm install
```

> **💡 ทิปสำหรับผู้ใช้ Windows PowerShell:**
> หากพบข้อความแจ้งเตือนเกี่ยวกับ `Execution_Policies` ที่บล็อก `npm.ps1` ให้ใช้คำสั่ง `npm.cmd` แทน เช่น:
> ```powershell
> npm.cmd install
> npm.cmd run dev
> ```
> หรือรันคำสั่งปลดล็อกชั่วคราวในหน้าต่าง PowerShell นั้น:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

### 3. เริ่มรันเซิร์ฟเวอร์พัฒนา (Start Development Server)

```bash
npm run dev
```
*(หรือ `npm.cmd run dev` บน PowerShell)*

จากนั้นเปิดเบราว์เซอร์ไปที่ลิงก์:
👉 **`http://localhost:5173`**

*(หมายเหตุ: คุณสามารถรันทดสอบใช้งานทุกฟีเจอร์ได้ทันทีโดยไม่ต้องตั้งค่าฐานข้อมูล เพราะระบบมี **Demo Mode** ที่บันทึกข้อมูลลง LocalStorage ให้อัตโนมัติ)*

---

## 🗄️ วิธีเชื่อมต่อฐานข้อมูล Supabase (Supabase Setup)

หากต้องการใช้งานร่วมกับฐานข้อมูล **Supabase PostgreSQL** บนคลาวด์จริง สามารถทำตามขั้นตอนง่ายๆ ดังนี้:

1. สมัครและสร้างโปรเจคใหม่ที่ [https://supabase.com](https://supabase.com)
2. ไปที่เมนู **SQL Editor** ในหน้า Dashboard ของ Supabase
3. เปิดไฟล์ [`supabase/schema.sql`](./supabase/schema.sql) ในโปรเจคนี้ คัดลอกโค้ด SQL ทั้งหมดไปวางใน SQL Editor แล้วกดปุ่ม **Run** (ระบบจะสร้างตาราง `categories`, `products`, `customers`, `orders`, `order_items` พร้อมข้อมูลสินค้าเริ่มต้นให้ทันที)
4. คัดลอกไฟล์ `.env.example` แล้วเปลี่ยนชื่อเป็น `.env` ในโฟลเดอร์หลักของโปรเจค:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   *(นำค่า Project URL และ `anon` `public` key มาจากเมนู **Project Settings -> API** บน Supabase)*
5. รีสตาร์ทคำสั่ง `npm run dev` ใหม่ ป้ายสถานะมุมซ้ายล่างของแอปจะเปลี่ยนเป็นสีเขียว **`Supabase Cloud`** โดยอัตโนมัติ!

---

## 📦 คำสั่งสำหรับ Build ขึ้นใช้งานจริง (Production Build)

```bash
npm run build
npm run preview
```

