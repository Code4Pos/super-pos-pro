/**
 * ข้อมูลสาขา (หลายสาขาใช้ฐานข้อมูลเดียวกัน) — ค่าตั้งร้าน `branches` ใช้ร่วมทุกเครื่อง
 * แต่ละสาขา: { code (5 หลัก), name, address, phone }
 * สำนักงานใหญ่ / รหัสสาขาของร้าน (`shopBranch`) ใช้ที่อยู่และเบอร์ของร้าน (shopAddress, shopPhone)
 */
import { normalizeBranchCode } from './docNumbers';

export const MAX_BRANCHES = 50;

export function normalizeBranches(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  list.forEach((b) => {
    const digits = String(b?.code ?? '').replace(/\D/g, '');
    if (!digits) return;
    const code = normalizeBranchCode(digits);
    if (seen.has(code)) return;
    seen.add(code);
    out.push({
      code,
      name: String(b.name || '').trim().slice(0, 80),
      address: String(b.address || '').trim().slice(0, 300),
      phone: String(b.phone || '').trim().slice(0, 40),
    });
  });
  return out.slice(0, MAX_BRANCHES);
}

// ข้อความสาขาตามแบบใบกำกับภาษี
export function formatBranchLabel(code) {
  const b = normalizeBranchCode(code);
  return b === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${b}`;
}

/**
 * หาข้อมูลสาขาที่ใช้พิมพ์บนเอกสาร
 * code ว่าง = รหัสสาขาของร้าน / สาขาที่ไม่ได้ตั้งที่อยู่ = ใช้ที่อยู่/เบอร์ของร้าน
 */
export function resolveBranch(settings = {}, code) {
  const branchCode = normalizeBranchCode(code || settings.shopBranch);
  const found = normalizeBranches(settings.branches).find((b) => b.code === branchCode);
  return {
    code: branchCode,
    label: formatBranchLabel(branchCode),
    name: found?.name || '',
    address: found?.address || settings.shopAddress || '',
    phone: found?.phone || settings.shopPhone || '',
    hasOwnInfo: Boolean(found),
  };
}
