/**
 * ประเภทการเคลื่อนไหวสต็อก (Stock Ledger) และเหตุผลการปรับสต็อก
 */
export const MOVEMENT_TYPE_META = {
  SALE: { label: 'ขาย', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  VOID: { label: 'ยกเลิกบิล (คืนสต็อก)', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  IMPORT: { label: 'รับสินค้าเข้า', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ADJUST: { label: 'ปรับสต็อก', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  EDIT: { label: 'แก้ไขข้อมูลสินค้า', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  OPENING: { label: 'ยอดยกมา (สินค้าใหม่)', className: 'bg-violet-50 text-violet-700 border-violet-200' },
};

// เหตุผลการปรับสต็อกตามโหมด (บังคับเลือกทุกครั้ง)
export const ADJUST_REASONS = {
  add: ['รับสินค้าเข้า (ไม่ผ่านใบนำเข้า)', 'ลูกค้าคืนสินค้า', 'ตรวจนับพบสินค้าเกิน', 'อื่นๆ'],
  reduce: [
    'สินค้าชำรุด/เสียหาย',
    'สินค้าสูญหาย',
    'สินค้าหมดอายุ',
    'เบิกใช้ภายในร้าน',
    'ตรวจนับพบสินค้าขาด',
    'อื่นๆ',
  ],
  set: ['ตรวจนับสต็อก (Cycle Count)', 'แก้ไขยอดที่บันทึกผิด', 'อื่นๆ'],
};

// การลดสต็อกและการกำหนดยอดใหม่ ต้องระบุผู้อนุมัติ
export function requiresApprover(mode) {
  return mode === 'reduce' || mode === 'set';
}
