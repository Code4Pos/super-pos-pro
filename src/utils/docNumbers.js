/**
 * รูปแบบเลขที่เอกสารที่ร้านกำหนดเองได้ (ตั้งที่ ตั้งค่า › เลขที่เอกสาร)
 *
 * รูปแบบเป็นข้อความที่มีตัวแปรในวงเล็บปีกกา เช่น "TX{YYYY}{MM}-{SEQ4}" → TX202611-0001
 *   {YYYY} ปี ค.ศ. 4 หลัก   {YY} ปี ค.ศ. 2 หลัก
 *   {BBBB} ปี พ.ศ. 4 หลัก   {BB} ปี พ.ศ. 2 หลัก
 *   {MM} เดือน   {DD} วัน   {DEVICE} รหัสเครื่อง
 *   {SEQ} เลขรัน (4 หลัก) หรือ {SEQ3} … {SEQ6} กำหนดจำนวนหลัก — ต้องมี 1 ตัวเสมอ
 *
 * เลขรันเริ่มนับใหม่เองเมื่อส่วนหน้า/หลังเลขรันเปลี่ยน ดังนั้น
 * มี {DD} = เริ่มใหม่ทุกวัน, มี {MM} = ทุกเดือน, มีแค่ปี = ทุกปี, ไม่มีวันที่ = นับต่อเนื่อง
 */

export const DOCUMENT_TYPES = [
  { id: 'order', label: 'บิลขาย / ใบเสร็จ', defaultTemplate: '{DEVICE}-{YY}{MM}{DD}-{SEQ4}', requireDevice: true },
  { id: 'taxInvoice', label: 'ใบกำกับภาษีเต็มรูป', defaultTemplate: 'TX{YYYY}{MM}-{SEQ4}' },
  { id: 'creditNote', label: 'ใบลดหนี้', defaultTemplate: 'CN{YYYY}{MM}-{SEQ4}' },
  { id: 'debitNote', label: 'ใบเพิ่มหนี้', defaultTemplate: 'DN{YYYY}{MM}-{SEQ4}' },
  { id: 'paymentReceipt', label: 'ใบรับชำระหนี้', defaultTemplate: 'RCV-{YY}{MM}{DD}-{SEQ3}' },
  { id: 'billingNote', label: 'ใบวางบิล', defaultTemplate: 'BN-{YY}{MM}{DD}-{SEQ3}' },
  { id: 'salesOrder', label: 'ใบสั่งขาย / จอง', defaultTemplate: 'SO-{YY}{MM}{DD}-{SEQ3}' },
  { id: 'stockImport', label: 'ใบนำเข้าสินค้า', defaultTemplate: 'IMP-{YY}{MM}{DD}-{SEQ3}' },
  { id: 'stockTransfer', label: 'ใบโอนสินค้า', defaultTemplate: 'TRF-{YY}{MM}{DD}-{SEQ3}' },
  { id: 'stockCount', label: 'ใบตรวจนับสต็อก', defaultTemplate: 'CC-{YY}{MM}{DD}-{SEQ3}' },
];

export const DOCUMENT_TYPE_MAP = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.id, t]));

export const DOCUMENT_TEMPLATE_TOKENS = [
  { token: '{YYYY}', label: 'ปี ค.ศ. 4 หลัก' },
  { token: '{YY}', label: 'ปี ค.ศ. 2 หลัก' },
  { token: '{BBBB}', label: 'ปี พ.ศ. 4 หลัก' },
  { token: '{BB}', label: 'ปี พ.ศ. 2 หลัก' },
  { token: '{MM}', label: 'เดือน' },
  { token: '{DD}', label: 'วัน' },
  { token: '{DEVICE}', label: 'รหัสเครื่อง' },
  { token: '{SEQ4}', label: 'เลขรัน (3-6 หลัก: SEQ3…SEQ6)' },
];

const SEQ_PATTERN = /\{SEQ([3-6])?\}/g;
const ALLOWED_TOKEN = /\{(YYYY|YY|BBBB|BB|MM|DD|DEVICE|SEQ[3-6]?)\}/g;
const MAX_TEMPLATE_LENGTH = 40;

/**
 * ตรวจรูปแบบเลขที่ คืนข้อความผิดพลาด หรือ '' ถ้าใช้ได้
 */
export function validateDocumentTemplate(template, typeId) {
  const t = String(template || '');
  if (!t.trim()) return 'กรุณาระบุรูปแบบเลขที่';
  if (t.length > MAX_TEMPLATE_LENGTH) return `รูปแบบยาวเกิน ${MAX_TEMPLATE_LENGTH} ตัวอักษร`;
  const seqCount = (t.match(SEQ_PATTERN) || []).length;
  if (seqCount !== 1) return 'ต้องมีเลขรัน {SEQ} หรือ {SEQ3}–{SEQ6} 1 ตัว';
  const leftover = t.replace(ALLOWED_TOKEN, '');
  if (/[{}]/.test(leftover)) return 'มีตัวแปรที่ไม่รู้จัก (ใช้ได้เฉพาะตัวแปรในรายการ)';
  if (/[%_\s,()]/.test(leftover)) return 'ห้ามมีช่องว่าง หรือเครื่องหมาย % _ , ( )';
  if (DOCUMENT_TYPE_MAP[typeId]?.requireDevice && !t.includes('{DEVICE}')) {
    return 'บิลขายต้องมี {DEVICE} เพื่อไม่ให้เลขชนกันระหว่างเครื่อง';
  }
  return '';
}

/**
 * ปรับค่าตั้งรูปแบบเลขที่ (ค่าที่ผิดรูปแบบ = ใช้ค่าเริ่มต้น) เก็บเฉพาะชนิดที่ต่างจากค่าเริ่มต้น
 */
export function normalizeDocumentNumbering(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  DOCUMENT_TYPES.forEach((type) => {
    const template = String(raw[type.id] || '').trim();
    if (template && template !== type.defaultTemplate && !validateDocumentTemplate(template, type.id)) {
      result[type.id] = template;
    }
  });
  return result;
}

export function getDocumentTemplate(config, typeId) {
  const custom = config?.[typeId];
  const type = DOCUMENT_TYPE_MAP[typeId];
  if (custom && !validateDocumentTemplate(custom, typeId)) return custom;
  return type?.defaultTemplate || '{SEQ4}';
}

// รอบการเริ่มนับใหม่ของรูปแบบ (ใช้แสดงในหน้าตั้งค่า)
export function describeResetPeriod(template) {
  const t = String(template || '');
  if (t.includes('{DD}')) return 'เริ่มนับใหม่ทุกวัน';
  if (t.includes('{MM}')) return 'เริ่มนับใหม่ทุกเดือน';
  if (/\{(YYYY|YY|BBBB|BB)\}/.test(t)) return 'เริ่มนับใหม่ทุกปี';
  return 'นับต่อเนื่อง ไม่เริ่มใหม่';
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * แยกรูปแบบเป็นส่วนหน้า/ส่วนหลังเลขรัน ณ วันที่และเครื่องที่กำหนด (ใช้วันที่ท้องถิ่น)
 */
export function resolveDocumentTemplate(template, { date = new Date(), deviceCode = '' } = {}) {
  const d = new Date(date);
  const ce = d.getFullYear();
  const be = ce + 543;
  let digits = 4;
  const rendered = String(template)
    .replace(/\{YYYY\}/g, String(ce))
    .replace(/\{YY\}/g, String(ce).slice(-2))
    .replace(/\{BBBB\}/g, String(be))
    .replace(/\{BB\}/g, String(be).slice(-2))
    .replace(/\{MM\}/g, pad2(d.getMonth() + 1))
    .replace(/\{DD\}/g, pad2(d.getDate()))
    .replace(/\{DEVICE\}/g, String(deviceCode || '').toUpperCase())
    .replace(SEQ_PATTERN, (_, n) => {
      digits = n ? Number(n) : 4;
      return '\u0000';
    });
  const [prefix, suffix = ''] = rendered.split('\u0000');
  return { prefix, suffix, digits };
}

/**
 * เลขที่ถัดไป: หาเลขรันสูงสุดของเลขที่เดิมที่มีส่วนหน้า/หลังตรงกัน แล้ว +1
 */
export function nextDocumentNumber(template, existingNumbers = [], options = {}) {
  const { prefix, suffix, digits } = resolveDocumentTemplate(template, options);
  const maxSeq = existingNumbers.reduce((max, raw) => {
    const num = String(raw || '');
    if (!num.startsWith(prefix) || !num.endsWith(suffix)) return max;
    const middle = num.slice(prefix.length, num.length - suffix.length);
    if (!/^\d+$/.test(middle)) return max;
    return Math.max(max, Number(middle));
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(digits, '0')}${suffix}`;
}

/**
 * ตัวอย่างเลขที่สำหรับแสดงในหน้าตั้งค่า
 */
export function previewDocumentNumber(template, options = {}) {
  return nextDocumentNumber(template, [], { deviceCode: 'POS-01', ...options });
}
