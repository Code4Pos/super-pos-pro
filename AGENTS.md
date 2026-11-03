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

- [2026-11-04] (Claude) beta 0.2.1: ใบนำเข้ามี `status` (`pending` > `in_transit` > `completed` หรือ `cancelled`) สต็อกเพิ่มเมื่อเป็น `completed` เท่านั้น ใช้ `createStockImport` / `updateStockImport` / `changeStockImportStatus` ใน POSContext หน้า UI อยู่ใน `src/components/stockImport/` และ Modal ผู้ผลิตใช้ร่วมกันที่ `src/components/inventory/SupplierModal.jsx` (suppliers และ stock imports ยังเก็บใน LocalStorage อย่างเดียว)
- [2026-11-04] (Claude) สร้าง AGENTS.md นี้ ข้อควรตรวจ: workflow deploy ฝัง Supabase publishable key ไว้เป็นค่าสำรอง ควรตรวจว่าเปิด RLS ในตาราง Supabase แล้ว
