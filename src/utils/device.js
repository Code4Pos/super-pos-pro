/**
 * ฟังก์ชันล้วนสำหรับรหัสเครื่อง เลขที่บิล และ id ฝั่งแอป (beta 0.3.6)
 * - เลขที่บิล: <รหัสเครื่อง>-YYMMDD-<เลขรันในเครื่อง 4 หลัก> ใช้วันที่ท้องถิ่น ไม่ชนกันข้ามเครื่องแม้ออฟไลน์
 * - id ของบิลสร้างในเครื่อง (UUID) ใช้เป็นกุญแจซิงค์ ส่งซ้ำได้โดยไม่เกิดบิลซ้ำ
 */

const DEVICE_CODE_MAX_LENGTH = 10;

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
 * คำนวณเลขที่บิลถัดไปของเครื่องนี้
 * ใช้ค่าที่มากกว่าระหว่างเลขรันที่จำไว้ กับเลขสูงสุดของบิลวันนี้ที่มีในเครื่อง (กันเลขซ้ำเมื่อค่าที่จำไว้หาย)
 * คืนค่า { orderNumber, device } โดย device คือค่าที่ต้องบันทึกกลับ
 */
export function nextOrderNumber(device, existingOrders = [], date = new Date()) {
  const code = sanitizeDeviceCode(device?.code) || generateDeviceCode();
  const dateCode = localDateCode(date);
  const prefix = `${code}-${dateCode}-`;
  const maxExisting = existingOrders.reduce((max, o) => {
    const num = String(o?.order_number || '');
    if (!num.startsWith(prefix)) return max;
    const seq = parseInt(num.slice(prefix.length), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  const remembered = device?.lastDate === dateCode ? Number(device.lastSeq) || 0 : 0;
  const seq = Math.max(remembered, maxExisting) + 1;
  return {
    orderNumber: `${prefix}${String(seq).padStart(4, '0')}`,
    device: { ...device, code, lastDate: dateCode, lastSeq: seq },
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
