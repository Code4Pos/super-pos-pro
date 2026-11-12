# แผนการพัฒนาขั้นต่อไป (Phase 2): การทำเป็น Application และการย้ายฐานข้อมูลขึ้น VPS (Self-Hosted)

เอกสารนี้สรุปสถานะปัจจุบันของ **SiamPOS Pro (`version beta 0.3.5`)** และแนวทางสถาปัตยกรรมสำหรับก้าวต่อไป เพื่อให้ **Claude** และ **Gemini** ใช้พิจารณาวางแผนร่วมกัน

---

## 1. สถานะปัจจุบันของระบบ (`version beta 0.3.5`)

1. **แยก Multi-Page Application (2 Entry `.html`) เรียบร้อยแล้ว:**
   - **หน้าร้าน (`index.html` → `src/main.jsx` → `src/PosApp.jsx`):**
     - ไม่มี `Sidebar` และ `MobileNav` เพื่อแสดงหน้าขายเต็มจอ 100%
     - โหลดเฉพาะโค้ดหน้าขาย (~91 kB) และเรียก `posService.fetchPOSData()` (ไม่โหลดข้อมูลหลังร้านที่ไม่จำเป็น เช่น `billing_notes`, `stock_ledger`, `tax_invoices`, `tax_notes`, `stock_counts`, `warehouses`, `inventory_balances`, `stock_transfers`, `suppliers`, `stock_imports`, `trashedProducts`)
   - **หลังร้าน (`admin.html` → `src/main-admin.jsx` → `src/AdminApp.jsx`):**
     - เอาเมนูขายหน้าร้านออกจาก `Sidebar` และ `MobileNav`
     - โหลดข้อมูลครบทุกตารางผ่าน `posService.fetchAllData()`
     - ปรับปรุง UX/UI มินิมอลและรองรับจอมือถือ (เพิ่ม Mobile Card View สำหรับหน้าสินค้าและประวัติบิล + ปุ่ม "เมนูทั้งหมด" ใน `MobileNav` ที่เปิด Bottom Sheet เข้าถึงทุกเมนูหลังร้านบนมือถือ)
   - **หน้าเลือกโหมด (`src/components/layout/ModeSelectorScreen.jsx`):**
     - ให้ผู้ใช้เลือกระหว่างเข้า "หน้าร้าน (POS)" หรือ "หลังร้าน (Admin)" พร้อมตรวจสอบสิทธิ์ RBAC

2. **ช่องว่างของชั้นข้อมูลปัจจุบัน (Data Layer Gaps) ที่ต้องแก้ไขก่อนใช้งานหลายเครื่องจริง:**
   - ข้อมูลบางส่วนยังเก็บอยู่ใน **`localStorage` ของแต่ละเครื่องเท่านั้น** ยังไม่มีตารางใน `supabase/schema.sql`:
     - `suppliers` (รายชื่อผู้ผลิต)
     - `stock_imports` (ใบนำเข้าสินค้า / PO)
     - `wholesale_rules` (กฎราคาขายส่งหลายระดับ 1–10 ขั้น)
     - `special_rules` (กฎราคาพิเศษตามขั้นสิทธิของลูกค้า 1–10 ขั้น)
     - `printerSettings` (ข้อมูลร้าน, เลขผู้เสียภาษีร้าน, รูปแบบ VAT `no_vat`/`vat_in`/`vat_out`, PromptPay ID) — ตอนนี้เก็บใน `localStorage` ทำให้ตั้งค่าจากเครื่องหลังร้านแล้วเครื่องหน้าร้านไม่เปลี่ยนตาม
   - ระบบล็อกอินและสิทธิ์ (RBAC) ปัจจุบันตรวจสอบด้วย PIN ฝั่ง Client (ยังไม่ได้ล็อกด้วย JWT / RLS ตามบทบาทบน Server)
   - การตัดสต็อก (`products.stock`) ยังเป็นการคำนวณยอดใหม่ฝั่ง Client แล้วสั่ง `update` ซึ่งถ้ามีเครื่องขายหน้าร้านหลายเครื่องกดคิดเงินพร้อมกันในเสี้ยววินาทีเดียวกัน อาจเกิด Race Condition ได้
   - **(เพิ่มโดย Claude)** การบันทึกบิล ตัดสต็อก ตัดล็อต บันทึก Ledger และปิดใบสั่งขาย เป็นคำสั่งแยกกันหลายครั้ง ถ้าเน็ตหลุดกลางทางข้อมูลจะไม่ครบ และสต็อกถูกปัดเป็น 0 ด้วย `Math.max(0, …)` ทำให้ Ledger ไม่ตรงกับสต็อก
   - **(เพิ่มโดย Claude)** เลขบิล `INV-YYMMDD-<สุ่ม 3 หลัก>` มีแค่ 900 เลขต่อวัน ขายวันละ ~35 บิลก็มีโอกาสชนราว 50% และใช้วันที่ UTC (บิล 00:00–07:00 ได้วันที่เมื่อวาน) ส่วน `voidOrder` อ้างอิงบิลด้วยเลขนี้
   - **(เพิ่มโดย Claude)** RLS ทุกนโยบายใน `schema.sql` เป็น `USING (true)` และ key ถูกฝังในเว็บที่ deploy ใครเปิดเว็บก็อ่าน/แก้/ลบข้อมูลได้
   - **(เพิ่มโดย Claude)** ข้อมูลในเครื่องที่ยังไม่อยู่ในรายการข้างบน: `LOT_CONSUMPTIONS` (ทำให้ยกเลิกบิลข้ามเครื่องแล้วล็อตคืนผิด), `PRODUCT_META`, `CUSTOMER_META`

---

## 2. เป้าหมายของผู้ใช้ใน Phase 2

1. **ทำเป็น Application (ติดตั้งลงอุปกรณ์ใช้งานจริง ไม่ต้องรันผ่าน Browser ปกติ)**
2. **ย้ายฐานข้อมูลไปไว้บน VPS Server ของตัวเอง (Self-Hosted)** เพื่อควบคุมค่าใช้จ่าย ความเร็ว และความเป็นส่วนตัวของข้อมูล 100%

---

## 3. ทางเลือกสถาปัตยกรรมฝั่ง Server & Database บน VPS

### ทางเลือก A: รัน Self-Hosted Supabase บน VPS (Docker Compose)
- **แนวคิด:** ใช้ Docker Compose มาตรฐานของ Supabase รันบน VPS (Ubuntu 22.04/24.04) แล้วรัน `supabase/schema.sql`
- **ข้อดี:**
  - **ไม่ต้องรื้อโค้ด `src/services/posService.js` ที่เขียนไว้แล้วกว่า 3,200 บรรทัด** เพียงแค่เปลี่ยน `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน `.env` ให้ชี้ไปที่โดเมน VPS ของตัวเอง
  - ระบบ Offline Queue (`flushOfflineQueue`) และการ Merge ข้อมูลที่มีอยู่ทำงานต่อได้ทันที
- **ข้อจำกัด:**
  - Supabase Docker stack ใช้ RAM พอสมควร แนะนำ VPS อย่างน้อย **4 GB RAM / 2 vCPU** (ถ้าต้องการประหยัด RAM สามารถตัด Container ที่ไม่ได้ใช้ออก เช่น Studio, Analytics/Logflare, Vector, Edge Functions เหลือเฉพาะ `postgres`, `postgrest`, `kong`, `gotrue`)

### ทางเลือก B: รัน PostgreSQL + Lightweight Node.js API (Fastify / Hono / Express) บน VPS
- **แนวคิด:** รันเฉพาะ PostgreSQL 16 + Backend API เล็กๆ ของเราเองบน VPS (ใช้คู่กับ Caddy หรือ Nginx ทำ Auto HTTPS)
- **ข้อดี:**
  - **กินทรัพยากรต่ำมาก** (VPS 1–2 GB RAM รันได้สบายและเร็วมาก)
  - ย้าย Logic สำคัญไปทำเป็น **Database Transaction (`BEGIN ... COMMIT`)** บน Server ได้ 100% เช่น:
    - บันทึกบิลขาย + ตัดสต็อก (`stock = stock - qty`) + ตัดล็อต FEFO + บันทึก `stock_ledger` + ปิด `sales_order` ใน Transaction เดียวกัน ป้องกันสต็อกเพี้ยนเวลาขายพร้อมกันหลายเครื่อง
    - ระบบ Auth ด้วย PIN ออกเป็น JWT Token จริง ป้องกันการแก้สิทธิ์ผ่าน DevTools
- **ข้อจำกัด:**
  - ต้องสร้างโฟลเดอร์ `server/` และปรับ `src/services/posService.js` ให้เรียก REST API ของเราแทน `supabase.from(...)` (หรือทำ Adapter เล็กๆ ที่มีรูปแบบคำสั่งคล้ายเดิม)

---

## 4. ทางเลือกการทำเป็น Application (Native / Desktop Packaging)

เนื่องจากโปรเจคแยก `index.html` (หน้าร้าน) และ `admin.html` (หลังร้าน) ออกจากกันแล้ว จึงสามารถแปลงเป็นแอปติดตั้งลงเครื่องได้โดยไม่ต้องเขียน UI ใหม่:

### 4.1 สำหรับเครื่อง Android POS (Sunmi T2), แท็บเล็ต และมือถือ → **Capacitor (`.apk`)**
- ใช้ **Capacitor** ห่อ Build ของ Vite (`dist/`) ออกมาเป็นไฟล์ `.apk` สำหรับติดตั้งบน Android
- **จุดเด่นเมื่อเป็นแอป Android:**
  - เปิดแบบ Fullscreen Kiosk ทันทีเมื่อเปิดเครื่อง Sunmi T2
  - เชื่อมต่อเครื่องพิมพ์ความร้อนในตัว Sunmi, เครื่องพิมพ์ Bluetooth/USB/LAN และสั่งเตะลิ้นชักเก็บเงิน (`ESC/POS`) ได้โดยตรงผ่าน Native Plugin โดยไม่ต้องผ่านหน้าต่าง Print Preview ของเบราว์เซอร์
  - สามารถตั้งค่าให้เลือกโหมดเริ่มต้นได้ว่าจะให้เครื่องนี้เปิดเข้า `index.html` (เครื่องแคชเชียร์) หรือ `admin.html` (มือถือผู้จัดการ)

### 4.2 สำหรับเครื่องคอมพิวเตอร์ Windows PC / Notebook → **Tauri v2 หรือ Electron (`.exe`)**
- **Tauri v2 (แนะนำ):** ไฟล์ติดตั้งเล็กมาก (~10 MB) กิน RAM น้อย เปิดเร็ว และสั่ง Silent Print ออกเครื่องพิมพ์ USB/LAN ใน Windows ได้ทันที
- **Electron:** เสถียรและมีไลบรารีสำหรับพิมพ์ใบเสร็จ ESC/POS บน Windows เยอะ แต่ไฟล์ใหญ่และกิน RAM มากกว่า

---

## 5. แผนงานที่ปรับแล้ว (Action Plan — ปรับปรุงร่วมกับ Claude, 2026-11-12)

> หลักการ: **ขั้นที่ 0 และ 1 ทำบน Supabase cloud ตัวปัจจุบันได้ทันที** ไม่ต้องรอ VPS เพราะได้ประโยชน์เลยและลดความเสี่ยงตอนย้าย
> เมื่อทุกอย่างอยู่บน Postgres + RPC แล้ว การย้ายขึ้น VPS (ขั้นที่ 2) จะเหลือแค่ย้ายข้อมูลและเปลี่ยน URL

### ขั้นที่ 0: ปิดช่องโหว่และความเสี่ยงข้อมูล (ต้องทำก่อนใช้หลายเครื่องจริง)
> **สถานะ: Claude ทำเสร็จแล้วใน beta 0.3.6** (รายละเอียดใน Handoff Notes ของ AGENTS.md) — ยังไม่ได้ทำ: ปิดใบสั่งขายภายใน `create_order` (ยังปิดแยกผ่าน `saveSalesOrder`), แจ้งเตือนสินค้าสต็อกติดลบในหลังร้าน

1. **เลขบิลไม่ซ้ำ + id ฝั่งเครื่อง**
   - เลิกใช้ `INV-YYMMDD-<สุ่ม 3 หลัก>` (`posService.createOrder`) ที่ชนกันง่ายและใช้วันที่ UTC
   - รูปแบบใหม่: `<รหัสเครื่อง>-YYMMDD-<เลขรันในเครื่อง 4 หลัก>` เช่น `POS1-261112-0042` ใช้วันที่ท้องถิ่น
   - ตั้งรหัสเครื่องในค่าตั้งของเครื่อง (เก็บใน localStorage ของเครื่องนั้น)
   - บิลมี `id` (UUID) ที่เครื่องสร้างเอง ใช้เป็นกุญแจซิงค์และอ้างอิงตอนยกเลิกบิล แทนการค้นด้วย `order_number`
2. **RPC ใน transaction เดียว** (plpgsql เรียกผ่าน `supabase.rpc()`)
   - `create_order(payload)`: บันทึกบิลและรายการ + ตัดสต็อกแบบ `stock = stock - qty` + ตัดล็อต FEFO/FIFO + บันทึก `stock_ledger` + ปิด `sales_orders` ที่ผูกไว้
   - ใช้ `ON CONFLICT (id) DO NOTHING` ให้ซิงค์ซ้ำได้โดยไม่เกิดบิลซ้ำ (idempotent)
   - **ยอมให้สต็อกติดลบ** (เลิก `Math.max(0, …)`) เพื่อให้ Ledger ตรงกับสต็อกเสมอ แล้วแจ้งเตือนสินค้าติดลบในหน้าหลังร้าน
   - `void_order(order_id)`: คืนสต็อก คืนล็อตเดิม และบันทึก Ledger ในขั้นตอนเดียว เฉพาะบิลที่ยัง `completed`
   - Demo Mode (LocalStorage) ยังใช้โค้ดเดิมฝั่ง Client
3. **ล็อกอินและ RLS**
   - ตอนนี้ RLS ทุกนโยบายเป็น `USING (true)` และ key ถูกฝังอยู่ในเว็บ ใครก็อ่าน แก้ หรือลบข้อมูลได้
   - เปิด Supabase Auth: ให้แต่ละเครื่องหรือร้านล็อกอินด้วยบัญชีร้าน (ครั้งแรกครั้งเดียว) แล้วเปลี่ยน RLS เป็น `TO authenticated`
   - PIN พนักงานและ RBAC ในแอปใช้แบบเดิม (ระยะถัดไปค่อยผูกบทบาทกับ JWT claims)

### ขั้นที่ 1: ย้ายข้อมูลที่ยังอยู่ในเครื่องขึ้นฐานข้อมูล
> **สถานะ: Gemini ทำเสร็จแล้วใน beta 0.3.7** (รายละเอียดใน Handoff Notes ของ AGENTS.md)

1. ตารางใหม่ใน `supabase/schema.sql` (+ `src/data/mockData.js`):
   - `suppliers`, `stock_imports`, `wholesale_rules`, `special_rules`
   - `shop_settings` (แถวเดียว)
   - `lot_consumptions` (แทน `LOT_CONSUMPTIONS` ที่เก็บในเครื่อง เพื่อให้ยกเลิกบิลจากเครื่องไหนก็คืนล็อตได้ถูก)
   - ย้ายค่าที่ซ่อนอยู่ใน `PRODUCT_META` / `CUSTOMER_META` ขึ้นเป็นคอลัมน์จริง
2. **แยกค่าตั้งเป็น 2 ส่วน** (`printerSettings` เดิม):
   - ใช้ร่วมกันทุกเครื่อง → `shop_settings`: ชื่อร้าน ที่อยู่ เลขผู้เสียภาษี สาขา `vatRegistered` `vatMode` PromptPay ID
   - เฉพาะเครื่อง → localStorage เหมือนเดิม: ชนิดเครื่องพิมพ์ ขนาดกระดาษ การเชื่อมต่อ USB/Serial รหัสเครื่อง
3. **เครื่องมือย้ายข้อมูลเดิม** ปุ่มในหลังร้าน "อัปโหลดข้อมูลจากเครื่องนี้" ส่งผู้ผลิต ใบนำเข้า และกฎราคา จาก localStorage ของเครื่องหลักขึ้นฐานข้อมูลครั้งเดียว (upsert ตาม id กันซ้ำ)
4. ทุกตารางใหม่ซิงค์ด้วย `loadRemoteWithLocal` + แคช offline เหมือนตารางอื่น

### ขั้นที่ 2: ย้ายขึ้น VPS (Self-Hosted Supabase แบบ minimal)
1. `docker-compose.yml`: `postgres` + `postgrest` + `kong` + **`gotrue`** (ต้องเก็บไว้ใช้ล็อกอินจากขั้นที่ 0) ตัด Studio/Analytics/Realtime/Storage/Edge Functions ออก
2. Caddy ทำ HTTPS อัตโนมัติ และ serve ไฟล์ `dist/` (เลิกพึ่ง GitHub Pages ได้)
3. สำรองข้อมูล: `pg_dump` ทุกวัน **ส่งสำเนาไปเก็บนอก VPS** และทดสอบกู้คืนจริงอย่างน้อย 1 ครั้งก่อนใช้งาน
4. ย้ายข้อมูลจาก Supabase cloud ด้วย `pg_dump`/`pg_restore` แล้วเปลี่ยน `VITE_SUPABASE_URL` / key
5. หมายเหตุค่าใช้จ่าย: VPS 4 GB ถูกกว่า Supabase Pro ไม่มาก แต่ต้องดูแลอัปเดต ความปลอดภัย และ monitoring เอง

### ขั้นที่ 3: ทำเป็นแอป
1. **Android / Sunmi T2 → Capacitor (`.apk`)**: เปิดเต็มจอ เลือกโหมดเริ่มต้นต่อเครื่อง (หน้าร้าน/หลังร้าน) และใช้ plugin เครื่องพิมพ์ในตัวของ Sunmi
   - ต้องเลือก: bundle `dist/` ในแอป (อัปเดตต้องลง apk ใหม่) หรือโหลดจาก server (อัปเดตทันที ใช้ service worker ที่มีทำ offline)
2. **Windows → PWA ที่มีอยู่** ติดตั้งผ่าน Chrome/Edge + flag `--kiosk-printing` พิมพ์ไม่ต้องกดยืนยัน และใช้ ESC/POS ผ่าน WebUSB/Web Serial ที่มีใน `printerService.js` อยู่แล้ว
   - ทำ Tauri ภายหลังเฉพาะเมื่อเจอข้อจำกัดจริง
3. iOS: ยังไม่ทำจนกว่าจะมีอุปกรณ์ที่ต้องใช้จริง

---

## 6. สิ่งที่ผู้ใช้ต้องตัดสินใจก่อนเริ่มแต่ละขั้น

| ขั้น | คำถาม |
|---|---|
| 0 | มีเครื่องหน้าร้านกี่เครื่อง และอยากตั้งรหัสเครื่องแบบไหน (เช่น `POS1`, `POS2`) |
| 0 | ยอมให้สต็อกติดลบได้ (แนะนำ) หรือต้องบล็อกการขายเมื่อสต็อกไม่พอ |
| 0 | บัญชีล็อกอิน: 1 บัญชีต่อร้าน หรือ 1 บัญชีต่อเครื่อง |
| 2 | จะย้ายขึ้น VPS จริง หรือใช้ Supabase cloud ต่อหลังทำขั้น 0–1 เสร็จ (มี VPS/โดเมนแล้วหรือยัง) |
| 3 | อุปกรณ์ที่ใช้จริง: Sunmi T2 กี่เครื่อง, Windows PC, มือถือผู้จัดการ (Android/iOS) |
| 3 | แอป Android จะ bundle ไฟล์ในแอป หรือโหลดจาก server |

---

## 7. คำตอบของ Claude ต่อคำถามเดิม (จากหัวข้อ 6 ฉบับแรกของ Gemini)

### 7.1 Backend บน VPS → เลือกทางเลือก A (Supabase แบบ minimal) + Postgres RPC
- ส่วนที่ต้องทำใน transaction เดียว (บิล + ตัดสต็อก + ล็อต + Ledger + ปิดใบสั่งขาย) เขียนเป็นฟังก์ชัน plpgsql แล้วเรียกผ่าน `supabase.rpc()` ได้ความปลอดภัยเท่าทางเลือก B โดยไม่ต้องเขียน Node API ใหม่และไม่ต้องรื้อ `posService.js`
- ทำบน Supabase cloud ตอนนี้ได้เลย ย้าย VPS ทีหลังก็แค่เปลี่ยน URL
- ถ้าตัด container ให้เก็บ `gotrue` ไว้ เพราะต้องใช้ล็อกอินเพื่อปิด RLS แบบ `USING (true)`
- ทางเลือก B คุ้มเมื่อมี logic ที่ต้องเรียกบริการภายนอก (เช่น ส่งอีเมล PO, e-Tax) ซึ่งตอนนี้ยังไม่มี

### 7.2 Application
- **Sunmi T2 / Android:** Capacitor ตามแผน จุดคุ้มหลักคือสั่งเครื่องพิมพ์ในตัว Sunmi ได้ตรง
- **Windows:** PWA ที่มีอยู่ + Chrome/Edge flag `--kiosk-printing` (พิมพ์ไม่ต้องกดยืนยัน) และ ESC/POS ผ่าน WebUSB/Web Serial ที่มีใน `printerService.js` แล้ว — ยังไม่ต้องทำ Tauri/Electron
- เลี่ยงการดูแลแอปหลายแบบพร้อมกัน (Capacitor + Tauri + Electron)
- iOS ข้ามไปก่อน

### 7.3 Offline-first หลายเครื่อง
- เครื่องสร้าง `id` (UUID) ของบิลเอง → RPC `create_order` ใช้ `ON CONFLICT (id) DO NOTHING` ซิงค์ซ้ำกี่รอบก็ไม่ซ้ำ
- เลขบิลมีรหัสเครื่อง + เลขรันในเครื่อง (`POS1-261112-0042`) ไม่ชนกันแม้ออฟไลน์
- ตัดสต็อกแบบ delta จากยอดบนฐานข้อมูล (`stock = stock - qty`) และยอมติดลบ เพื่อให้เห็นการขายเกินสต็อก แล้วแจ้งเตือนให้ปรับยอด
- ตัดล็อต FEFO/FIFO ฝั่งฐานข้อมูลตอนซิงค์ และเก็บประวัติตัดล็อตในตาราง `lot_consumptions` เพื่อให้ยกเลิกบิลจากเครื่องไหนก็คืนล็อตถูก

---

## 8. หมายเหตุสำหรับ Gemini ก่อนเริ่มทำ
- ทำตามลำดับขั้นที่ 0 → 1 → 2 → 3 และรอผู้ใช้ตอบตารางหัวข้อ 6 ของขั้นนั้นก่อน (ถ้าไม่ระบุ ค่าแนะนำคือ รหัสเครื่อง `POS1`/`POS2`, ยอมสต็อกติดลบ, 1 บัญชีล็อกอินต่อร้าน)
- ทุกการเปลี่ยนโครงสร้างต้องเพิ่ม Migration ใน `supabase/schema.sql` + `mockData.js` และ Demo Mode (LocalStorage) ต้องยังใช้งานได้
- จุดที่ต้องแก้ในโค้ดปัจจุบัน:
  - เลขบิล: `posService.createOrder` (`INV-YYMMDD-<สุ่ม>`)
  - ตัดสต็อกตอนขาย/ซิงค์คิว: `pushOrderToSupabase` (อ่านแล้วเขียน + `Math.max(0, …)`)
  - ยกเลิกบิล: `voidOrder` (ค้นด้วย `order_number`)
  - ล็อต: `syncLotsWithMovements` + `LOT_CONSUMPTIONS` ใน `src/utils/lots.js`
  - ปิดใบสั่งขาย: `checkoutOrder` ใน `POSContext.jsx` (`activeSalesOrder`)
- ทดสอบ RPC กับ Supabase โปรเจคทดสอบก่อน ห้ามรัน Migration ทดลองบนฐานข้อมูลจริงของร้าน

---

## 9. ความคืบหน้าการดำเนินการ (Implementation Status)

- **[เสร็จแล้ว] ขั้นที่ 0 (`version beta 0.3.6` โดย Claude):**
  - เลขบิลแบบ `<รหัสเครื่อง>-YYMMDD-<เลขรัน 4 หลัก>` + UUID ฝั่งเครื่อง
  - RPC `create_order` และ `void_order` ทำงานใน Transaction เดียว
  - ล็อกอินบัญชีร้าน `ShopAuthGate.jsx` + สคริปต์ปิด RLS สาธารณะ `supabase/lockdown-rls.sql`
- **[เสร็จแล้ว] ขั้นที่ 1 (`version beta 0.3.7` โดย Gemini):**
  - ย้ายข้อมูลที่ยังอยู่ในเครื่องขึ้นฐานข้อมูลครบทุกตาราง (`suppliers`, `stock_imports`, `wholesale_rules`, `special_rules`, `shop_settings`, `lot_consumptions` และคอลัมน์เสริมของ `products` / `customers`)
  - แยกตั้งค่าร้านค้าที่ใช้ร่วมกันทุกเครื่อง (`siampos_shop_settings_v1`) ออกจากตั้งค่าเครื่องพิมพ์เฉพาะเครื่อง (`siampos_printer_settings_v2`)
  - เพิ่มปุ่ม **"อัปโหลดข้อมูลจากเครื่องนี้ขึ้นฐานข้อมูล"** ในการ์ด "เครื่องนี้" (`DeviceSettings.jsx`)
- **[เสร็จแล้ว] ขั้นที่ 3 (`version beta 0.3.8` โดย Gemini — ทำเป็น Application ก่อนย้ายขึ้น VPS):**
  - ติดตั้ง **Capacitor Android** (`capacitor.config.json`, โฟลเดอร์ `android/`) สำหรับแพ็กเกจแอปเป็น `.apk` ลงเครื่อง Sunmi T2 / แท็บเล็ต / มือถือ Android
  - เพิ่ม GitHub Actions `.github/workflows/build-apk.yml` สร้างไฟล์ `.apk` อัตโนมัติบนคลาวด์โดยไม่ต้องลง Android Studio ในคอม
  - เพิ่มการตั้งค่า **"โหมดเริ่มต้นเมื่อเปิดแอปในเครื่องนี้"** (`ถามทุกครั้ง` | `ขายหน้าร้านทันที` | `จัดการหลังร้านทันที`)
  - เพิ่มการตั้งค่า **Server URL & Anon Key ผ่านหน้าแอป** (`siampos_server_config_v1`) เพื่อให้สลับไปชี้ VPS ของตัวเองในอนาคตได้ทันทีโดยไม่ต้องสร้างไฟล์ `.apk` ใหม่
  - เพิ่ม PWA Shortcuts และสคริปต์เปิดโหมด Kiosk บน Windows (`scripts/start-pos-kiosk.bat`, `scripts/start-admin-app.bat`) พร้อม `--kiosk-printing`
- **[ขั้นถัดไปเมื่อพร้อม] ขั้นที่ 2 (ติดตั้ง Self-Hosted Supabase บน VPS ของตัวเอง):**
  - เช่า VPS Ubuntu 24.04 LTS -> รัน Docker Compose ของ Supabase -> รัน `supabase/schema.sql` และ `supabase/lockdown-rls.sql` -> กรอก URL ของ VPS ในหน้าตั้งค่าแอปได้ทันที

