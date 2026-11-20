/**
 * ฟังก์ชันล้วนสำหรับรหัสเครื่อง เลขที่บิล และ id ฝั่งแอป (beta 0.3.6)
 * - เลขที่บิล: <รหัสเครื่อง>-YYMMDD-<เลขรันในเครื่อง 4 หลัก> ใช้วันที่ท้องถิ่น ไม่ชนกันข้ามเครื่องแม้ออฟไลน์
 * - id ของบิลสร้างในเครื่อง (UUID) ใช้เป็นกุญแจซิงค์ ส่งซ้ำได้โดยไม่เกิดบิลซ้ำ
 */

import { resolveDocumentTemplate, DOCUMENT_TYPE_MAP } from './docNumbers';

const DEVICE_CODE_MAX_LENGTH = 10;
const DEFAULT_ORDER_TEMPLATE = DOCUMENT_TYPE_MAP.order.defaultTemplate;

// รหัสเครื่องใช้ได้เฉพาะ A-Z 0-9 และขีด (ไม่เกิน 10 ตัว)
export function sanitizeDeviceCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, DEVICE_CODE_MAX_LENGTH);
}

// รหัสเริ่มต้นแบบสุ่ม เพื่อให้เครื่องที่ยังไม่ได้ตั้งรหัสไม่ชนกัน เช่น POS-K7Q
export function generateDeviceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `POS-${suffix}`;
}

// วันที่ท้องถิ่นแบบ YYMMDD (ไม่ใช้ UTC กันบิลช่วง 00:00-07:00 ได้วันที่ของเมื่อวาน)
export function localDateCode(date = new Date()) {
  return date.toLocaleDateString('sv-SE').slice(2).replace(/-/g, '');
}

/**
 * คำนวณเลขที่บิลถัดไปของเครื่องนี้ ตามรูปแบบเลขที่ (ค่าตั้ง ตั้งค่า › เลขที่เอกสาร ต้องมี {DEVICE})
 * ใช้ค่าที่มากกว่าระหว่างเลขรันที่จำไว้ กับเลขสูงสุดของบิลในรอบเดียวกันที่มีในเครื่อง (กันเลขซ้ำเมื่อค่าที่จำไว้หาย)
 * คืนค่า { orderNumber, device } โดย device คือค่าที่ต้องบันทึกกลับ
 */
export function nextOrderNumber(device, existingOrders = [], date = new Date(), template = DEFAULT_ORDER_TEMPLATE, branchCode = '00000') {
  const code = sanitizeDeviceCode(device?.code) || generateDeviceCode();
  const { prefix, suffix, digits } = resolveDocumentTemplate(template, { date, deviceCode: code, branchCode });
  // รอบของเลขรัน = ส่วนหน้า|ส่วนหลังเลขรัน (เปลี่ยนวัน/เดือน/รูปแบบ = เริ่มนับใหม่)
  const periodKey = `${prefix}|${suffix}`;
  const maxExisting = existingOrders.reduce((max, o) => {
    const num = String(o?.order_number || '');
    if (!num.startsWith(prefix) || !num.endsWith(suffix)) return max;
    const middle = num.slice(prefix.length, num.length - suffix.length);
    if (!/^\d+$/.test(middle)) return max;
    return Math.max(max, Number(middle));
  }, 0);
  // เครื่องที่อัปเดตจากเวอร์ชันก่อน 0.3.15 จำเลขรันด้วย lastDate (รูปแบบเริ่มต้น)
  const legacyKey =
    device?.lastDate && !device?.lastKey ? `${code}-${device.lastDate}-|` : null;
  const remembered =
    device?.lastKey === periodKey || legacyKey === periodKey ? Number(device.lastSeq) || 0 : 0;
  const seq = Math.max(remembered, maxExisting) + 1;
  return {
    orderNumber: `${prefix}${String(seq).padStart(digits, '0')}${suffix}`,
    device: { ...device, code, lastKey: periodKey, lastDate: localDateCode(date), lastSeq: seq },
  };
}

// UUID v4 (ใช้ crypto.randomUUID ถ้ามี)
export function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}
