# AGENTS.md — กติกากลางสำหรับ AI Agents (Claude & Gemini)

ไฟล์นี้คือกติกาที่ **Claude Code** และ **Gemini (Antigravity)** ใช้ร่วมกันเมื่อพัฒนา SiamPOS Pro
ทั้งสอง agent ทำงานในโฟลเดอร์เดียวกันและบน branch `main` เดียวกัน จึงต้องระวังไม่ให้งานทับกัน

---

## 1. ภาพรวมโปรเจค

- **Stack:** React 18 + Vite 5 + Tailwind CSS 3 + Supabase (JavaScript/JSX ล้วน ไม่มี TypeScript)
- **ไม่มี router:** สลับหน้าด้วย `activeTab` ใน `src/App.jsx`
- **Global state:** `src/context/POSContext.jsx` (context เดียว ใช้ผ่าน `usePOS()`)
- **ชั้นข้อมูล:** `src/services/posService.js` — ใช้ Supabase เมื่อตั้งค่า `.env` แล้ว ถ้าไม่ได้ตั้งค่าจะ fallback ไป LocalStorage (Demo Mode)
- **Schema:** `supabase/schema.sql` มีเฉพาะ `categories`, `units`, `products`, `customers`, `orders`, `order_items`
  ข้อมูล suppliers, stock imports, wholesale rules และ special rules ยังอยู่ใน LocalStorage เท่านั้น
- **Deploy:** push ขึ้น `main` แล้ว GitHub Actions จะ build และ deploy ไป GitHub Pages อัตโนมัติ

## 2. คำสั่งที่ใช้บ่อย

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # ต้องผ่านก่อน commit ทุกครั้ง
```

บน Windows PowerShell ถ้า `npm.ps1` ถูกบล็อก ให้ใช้ `npm.cmd` แทน

ยังไม่มี test และ linter ดังนั้น `npm run build` คือการตรวจขั้นต่ำ ถ้าแก้ UI ควรเปิดดูในเบราว์เซอร์ด้วย

## 3. สไตล์โค้ด

- **Comment เป็นภาษาไทย** ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ ข้อความใน UI เป็นภาษาไทย
- ใช้ Tailwind utility class ไม่เพิ่มไฟล์ CSS ใหม่ (ยกเว้น print styles ใน `src/index.css`)
- ใช้ไอคอนจาก `lucide-react`
- **เน้นความลื่นบนเครื่อง Sunmi T2:** หลีกเลี่ยง animation, blur และ shadow หนักๆ
- ต้องรองรับ Responsive ทั้ง Desktop, Tablet และ Smartphone
- LocalStorage key ใช้รูปแบบ `siampos_<name>_v1` และเพิ่มไว้ใน `STORAGE_KEYS` ของ `posService.js`
- ห่อการอ่าน/เขียน LocalStorage ด้วย `try/catch` เสมอ
- ฟังก์ชันใน `posService` ที่เขียนข้อมูลจะรับพารามิเตอร์ `isSupabaseActive` และต้องทำงานได้ทั้งสองโหมด (Supabase และ LocalStorage)
- ฟังก์ชันคำนวณราคาและจัดรูปแบบเงิน/เวลาอยู่ใน `src/utils/formatters.js` ห้ามคำนวณราคาซ้ำในที่อื่น

## 4. การเพิ่มหน้าใหม่ (Tab)

ต้องแก้ให้ครบทุกที่:

1. `src/pages/<Name>Page.jsx`
2. `src/App.jsx` — เพิ่มใน `VALID_TABS` และใน `<main>`
3. `src/components/layout/Sidebar.jsx` — เมนู
4. `src/components/layout/Header.jsx` — ชื่อหัวข้อของหน้า
5. `src/components/layout/MobileNav.jsx` — ถ้าต้องแสดงบนมือถือ

## 5. เวอร์ชัน

เมื่อปล่อยฟีเจอร์ ให้เพิ่มเวอร์ชันใน **3 ที่พร้อมกัน**:

| ไฟล์ | รูปแบบ |
|---|---|
| `package.json` | `"version": "0.1.9-beta"` |
| `index.html` | `<title>SiamPOS Pro (version beta 0.1.9) — ...` |
| `src/context/POSContext.jsx` | `export const APP_VERSION = 'version beta 0.1.9';` |

ถ้า agent อีกตัวเพิ่งเพิ่มเวอร์ชันไปใน commit ที่ยังไม่ได้ push ให้ใช้เวอร์ชันนั้นต่อ ไม่ต้องเพิ่มซ้ำ

## 6. กติกาการทำงานร่วมกัน (สำคัญที่สุด)

1. **เช็คก่อนแก้ทุกครั้ง:** รัน `git status` และ `git log -5` ถ้ามีไฟล์ที่ยังไม่ได้ commit ซึ่งเราไม่ได้แก้เอง ถือว่าเป็นงานของ agent อีกตัวหรือของผู้ใช้ **ห้าม revert, stash, checkout หรือเขียนทับ**
2. **ห้ามแก้ไฟล์เดียวกันพร้อมกัน** โดยเฉพาะไฟล์ใหญ่ที่ชนกันบ่อย:
   - `src/context/POSContext.jsx`
   - `src/services/posService.js`
   - `src/components/inventory/ProductModal.jsx`
   - `src/pages/InventoryPage.jsx`, `PricingTierPage.jsx`, `StockImportPage.jsx`
   ถ้าจำเป็นต้องแก้ไฟล์ที่มีงานค้างอยู่ ให้แจ้งผู้ใช้ก่อน
3. **Commit เล็กและชัดเจน** ใช้ Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`) โดย 1 commit = 1 เรื่อง
4. **Commit/push เฉพาะเมื่อผู้ใช้สั่ง** เพราะ push ขึ้น `main` จะ deploy ขึ้นเว็บทันที
5. **ห้ามใช้คำสั่งทำลายประวัติ** (`git push --force`, `git reset --hard`, `git rebase` บน `main`) ถ้าผู้ใช้ไม่ได้สั่ง
6. **ห้าม commit `.env`** และห้ามใส่ secret ใหม่ลงในโค้ดหรือ workflow
7. **ถ้าเปลี่ยนโครงสร้างข้อมูล** (field ใหม่ หรือตารางใหม่) ให้อัปเดต `supabase/schema.sql` และ `src/data/mockData.js` ไปพร้อมกัน แล้วสรุปให้ผู้ใช้ทราบ
8. **บันทึกงานที่ยังทำไม่เสร็จ** ไว้ใน "Handoff Notes" ด้านล่าง เพื่อให้ agent อีกตัวทำต่อได้

## 7. Handoff Notes

> ให้ agent เขียนสั้นๆ เมื่อจบงานที่ยังไม่เสร็จ หรือเมื่อมีเรื่องที่อีกฝ่ายต้องรู้ (ลบรายการที่เสร็จแล้วทิ้ง)
> รูปแบบ: `- [YYYY-MM-DD] (Claude|Gemini) สิ่งที่ทำ / สิ่งที่ค้าง / ไฟล์ที่เกี่ยวข้อง`

- [2026-11-12] (Claude) beta 0.3.1 (Module 2 Lot/วันหมดอายุ): เปิดรายสินค้าหลักด้วย `track_lots` + `lot_strategy` ('FEFO'|'FIFO') ผ่าน `updateLotSettings` (เก็บใน PRODUCT_META ด้วย, `upsertProduct` คงค่าไว้) / ล็อตเป็นบัญชีย่อยของสต็อก (`productLots`, ตาราง `product_lots` id ฝั่งแอป) / **ทุกการเคลื่อนไหวสต็อกปรับล็อตอัตโนมัติใน `recordStockMovements` → `syncLotsWithMovements`**: ลด = ตัดตามกลยุทธ์ (จำประวัติตัดตามเลขเอกสารใน `LOT_CONSUMPTIONS` เฉพาะในเครื่อง), VOID = คืนล็อตเดิม, IMPORT = สร้างล็อตจาก `lot_number`/`expiry_date` ในแถวใบนำเข้า (ส่งผ่าน `meta.lotInfos`), เพิ่มอื่นๆ = "ไม่ระบุล็อต" / ฟังก์ชันล้วนอยู่ใน `src/utils/lots.js` / หน้า `lots` (`LotsPage.jsx`) เตือนหมดอายุ/ใกล้หมดอายุ 30 วัน, แก้เลขล็อต, ปรับยอดล็อตให้ตรงสต็อก / ข้อจำกัด: ยกเลิกบิลจากเครื่องอื่นจะคืนเข้า "ไม่ระบุล็อต" เพราะประวัติการตัดเก็บแค่ในเครื่อง, หน้าขายยังไม่เตือนตอนขายสินค้าหมดอายุ
- [2026-11-12] (Claude) beta 0.3.0 (Blind Count + ประวัติรับชำระหนี้): หน้า `stock-count` (`StockCountPage.jsx`) สถานะ `counting` > `submitted` > `approved`/`cancelled` / หน้านับไม่แสดงยอดในระบบ, `system_qty` ถูกบันทึกตอนส่งผลนับ (`submitStockCount`) และตอนอนุมัติปรับสต็อกแบบ "ยอดปัจจุบัน + ผลต่าง" (`applyStockCountAdjustments`) เพื่อไม่ทับยอดขายระหว่างรออนุมัติ / นับได้ = `adjust_stock`, อนุมัติ = `approve_stock` / ตาราง `stock_counts` (id ฝั่งแอป, upsert) / หน้าลูกหนี้มีแท็บ "ประวัติรับชำระ" (`PaymentHistoryView.jsx`) แสดงบิลที่ตัดชำระด้วย `allocatePaymentsToBills` (FIFO) พิมพ์ใบเสร็จรับเงิน A4 `printPaymentReceipt` และ CSV / helper `mergeByLatestUpdate` (เปลี่ยนชื่อจาก mergeUsersById)
- [2026-11-11] (Claude) beta 0.2.9 (Module 6 ใบลดหนี้/ใบเพิ่มหนี้): `taxNotes` / `createTaxNote` อ้างอิงใบกำกับเต็มรูป เลขที่ `CNYYYYMM-0001` / `DNYYYYMM-0001` ผ่าน `insertWithRunningNumber` (ใช้ร่วมกับใบกำกับ) / คำนวณด้วย `calculateCreditNote` (เฉลี่ยตามส่วนลดท้ายบิล, ใช้สัดส่วน VAT ของใบเดิม) และ `calculateDebitNote` ใน `tax.js` / ลดหนี้แบบคืนสินค้าบวกสต็อกกลับและบันทึก Ledger ประเภท `RETURN` / ใบกำกับใหม่เก็บ `product_id` ในรายการแล้ว (ใบเก่าหาจากบิลขาย) / รายงานภาษีขายหักใบลดหนี้ บวกใบเพิ่มหนี้ / UI อยู่ใน `TaxInvoiceModal` → `TaxNoteModal` / ยังไม่ทำ: e-Tax XML + ลายเซ็นดิจิทัล
- [2026-11-11] (Claude) beta 0.2.8 (RBAC + จัดหน้าตั้งค่าใหม่): ตั้งค่าแยกเป็นหน้า `settings-shop/tax/payment/printer/users` (`src/components/settings/`, `SettingsPage.jsx`) อยู่ในกลุ่ม "ตั้งค่า" ที่ Sidebar ค่าทั้งหมดยังเก็บใน `printerSettings` (key เดิม) / ปุ่มฟันเฟืองที่ Header ไปหน้าตั้งค่าเครื่องพิมพ์ / **รูปแบบ VAT ย้ายจากหน้าขายไป `printerSettings.vatMode`** (context `vatMode` อ่านจากค่านี้) / RBAC: บทบาทและสิทธิ์อยู่ใน `src/utils/rbac.js` ใช้ `can(permission)` และ `canTab(tab)` จาก context ถ้าเพิ่มหน้าใหม่ต้องใส่ tab ใน `ROLES` ด้วย / ยังไม่มีผู้ใช้ = เปิดทุกเมนูแบบเดิม สร้างผู้ใช้คนแรก (ต้องเป็น admin) แล้วจะเริ่มบังคับล็อกอินด้วย PIN / PIN เก็บเป็น SHA-256+salt ในตาราง `app_users` / ลดสต็อกต้องให้ผู้จัดการยืนยันด้วย PIN (`verifyApprover`) / บิลบันทึก `created_by_name` / **ข้อจำกัด: จำกัดสิทธิ์แค่ในแอป ยังไม่ใช่ RLS ตามผู้ใช้ (ต้องย้ายไป Supabase Auth)**
- [2026-11-11] (Claude) beta 0.2.7 (Module 6 ส่วนแรก): ตั้งค่าร้าน `vatRegistered`, `shopTaxId`, `shopBranch` ใน printerSettings (ใบเสร็จความร้อนแสดงเป็นใบกำกับภาษีอย่างย่อ) / ใบกำกับภาษีเต็มรูป `taxInvoices` / `createTaxInvoice` เลขที่ `TXYYYYMM-0001` เรียงรายเดือน ห้ามซ้ำ (ลองเลขถัดไปเมื่อชน unique ใน Supabase) 1 บิล = 1 ฉบับ ออกจากปุ่มในหน้าประวัติบิล (`TaxInvoiceModal`) / VAT ของบิลคำนวณด้วย `calculateOrderVat` ใน `src/utils/tax.js` (ใช้ tax_amount ถ้ามี ไม่งั้นถือว่าราคารวม VAT = x7/107) เพราะบิลไม่ได้เก็บ vat_mode ลงฐานข้อมูล / หน้า `sales-tax` รายงานภาษีขาย + CSV / ยังไม่ทำ: ใบลดหนี้/ใบเพิ่มหนี้, ใบส่งของ, e-Tax XML + ลายเซ็นดิจิทัล / ข้อจำกัด: โหมด Supabase รายงานคำนวณจากบิลล่าสุด 200 ใบ
- [2026-11-11] (Claude) beta 0.2.6 (Module 5): หน้า `reorder` (`ReorderPage.jsx`) คำนวณ ROP ด้วย `calculateReorderSuggestions` ใน `src/utils/reorder.js` (ยอดขายเฉลี่ย 30 วัน, แปลงสินค้ารองไปสินค้าหลัก) / สินค้ามี `lead_time_days`, `safety_stock` (null = ค่าเริ่มต้น 7 วัน / min_stock) ตั้งผ่าน `updateReorderSettings` และเก็บสำรองใน PRODUCT_META / `upsertProduct` คงค่า 2 ช่องนี้ไว้ / ใบสั่งซื้อ (PO) = ใบนำเข้าสถานะ pending (ไม่มีตาราง PO แยก) พิมพ์ด้วย `printerService.printPurchaseOrder()` จากปุ่มใน `ImportDetailModal` / ยังไม่ทำ: ส่ง PO ทางอีเมล (ต้องมี Backend)
- [2026-11-11] (Claude) beta 0.2.5 (Module 3 ส่วนแรก + Moving Average Cost จาก Module 5): ทุกจุดที่สต็อกเปลี่ยน (`createOrder`, `voidOrder`, `updateStock`, `upsertProduct`, `applyImportItemsToStock`) เรียก `recordStockMovements(before, after, meta)` ใน `posService.js` ซึ่งเทียบสต็อกก่อน-หลังแล้วบันทึกลง `stockLedger` (ถ้าเพิ่มจุดแก้สต็อกใหม่ ต้องเรียกด้วย) / ต้นทุนรับเข้าใช้ `calculateMovingAverageCost` (คิดจาก line_total หลังส่วนลด) / ปรับสต็อกใน `StockModal` บังคับเหตุผล และบังคับผู้อนุมัติเมื่อลด/กำหนดยอดใหม่ / หน้า `stock-ledger` / ต้องรัน Migration `stock_ledger` + เปลี่ยน `products.cost_price` เป็น 4 ทศนิยม / `voidOrder` ยกเลิกบิลใน Supabase ด้วย `order_number` เฉพาะบิลที่ยัง completed และคืนสต็อกจากค่าล่าสุดในฐานข้อมูล (กันคืนซ้ำข้ามเครื่อง) / ยังไม่ทำ: Multi-warehouse, Reserved stock/ATP, Stock transfer, Blind cycle count, Lot/Expiry
- [2026-11-11] (Claude) beta 0.2.4 (Module 4 ส่วนที่เหลือ): หน้า `receivables` (`AccountsReceivablePage.jsx`) มี Aging Report นับอายุจากวันที่ออกบิล (`calculateAgingReport` ใน `credit.js`) และใบวางบิล `billingNotes` / `createBillingNote` (สถานะชำระครบคำนวณจากยอดค้างของบิลในใบ ไม่ได้เก็บในฐานข้อมูล) / พิมพ์ A4 ด้วย `printerService.printBillingNote()` / ต้องรัน Migration ตาราง `billing_notes` / ยังไม่ทำใน Module 4: ใบกำกับภาษีเต็มรูป (อยู่ใน Module 6)
- [2026-11-11] (Claude) beta 0.2.3 (Module 4 ส่วนแรก): ลูกค้ามี `tax_id`, `branch_number`, `credit_limit` (0 = ไม่จำกัด), `credit_term_days`, `is_blocked` / ยอดค้าง = ยอด credit ในบิล - `customerPayments` คำนวณด้วย `getCustomerCredit()` (ตัดชำระแบบ FIFO) ใน `src/utils/credit.js` / ตรวจวงเงินทั้งใน CheckoutModal และ `checkoutOrder` / รับชำระหนี้ที่ `CustomerPaymentModal` / ต้องรัน Migration beta 0.2.3 ใน `schema.sql` / ยังไม่ทำ: ใบวางบิล, Aging Report, ใบกำกับภาษีเต็มรูป / ข้อจำกัด: โหมด Supabase โหลดบิลล่าสุด 200 ใบ ยอดค้างของบิลเก่ากว่านั้นจะไม่ถูกนับ
- [2026-11-11] (Claude) beta 0.2.2 (หน้าชำระเงินตาม `pos_system_specification.md` Module 1): บิลมี `payments` [{method, amount}] = ยอดที่ชำระจริงต่อช่องทาง (เงินสดหักเงินทอนแล้ว) และ `payment_method: 'split'` เมื่อแบ่งจ่าย ให้อ่านผ่าน `getOrderPayments()` ใน `src/utils/payments.js` เสมอ (บิลเก่าไม่มี payments) / QR พร้อมเพย์จริงอยู่ที่ `src/utils/promptpay.js` + `PromptPayQR.jsx` ใช้ `printerSettings.promptpayId` / ลิ้นชักใช้ `printerService.openCashDrawer()` / **ต้องรัน Migration ใน `supabase/schema.sql` บน Supabase จริง** ไม่งั้นบิลแบ่งจ่ายจะถูกบันทึกเป็นช่องทางหลักช่องทางเดียว / ส่วนอื่นของสเปก (RBAC, B2B credit, multi-warehouse, AR/AP, e-Tax, offline) ยังไม่ได้ทำ
- [2026-11-04] (Claude) beta 0.2.1: ใบนำเข้ามี `status` (`pending` > `in_transit` > `completed` หรือ `cancelled`) สต็อกเพิ่มเมื่อเป็น `completed` เท่านั้น ใช้ `createStockImport` / `updateStockImport` / `changeStockImportStatus` ใน POSContext หน้า UI อยู่ใน `src/components/stockImport/` และ Modal ผู้ผลิตใช้ร่วมกันที่ `src/components/inventory/SupplierModal.jsx` (suppliers และ stock imports ยังเก็บใน LocalStorage อย่างเดียว)
- [2026-11-04] (Claude) สร้าง AGENTS.md นี้ ข้อควรตรวจ: workflow deploy ฝัง Supabase publishable key ไว้เป็นค่าสำรอง ควรตรวจว่าเปิด RLS ในตาราง Supabase แล้ว
