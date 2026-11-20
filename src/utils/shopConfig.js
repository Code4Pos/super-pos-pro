/**
 * รายการค่าตั้งร้านแบบรวมศูนย์ (Shop Config Registry)
 *
 * - ค่าตั้งทุกตัวในนี้ "ใช้ร่วมกันทุกเครื่อง" เก็บรวมเป็น JSON ในคอลัมน์ shop_settings.config
 *   (ในเครื่องเก็บรวมกับค่าตั้งร้านอื่นๆ ใน printerSettings / siampos_shop_settings_v1)
 * - เพิ่มค่าตั้งใหม่: เพิ่มรายการใน SHOP_CONFIG_FIELDS ที่เดียว ไม่ต้องแก้ฐานข้อมูล
 *   หน้าตั้งค่าจะสร้างช่องกรอกให้อัตโนมัติจาก type (ดู components/settings/ShopConfigFields.jsx)
 * - type: 'boolean' | 'number' | 'select' | 'text' | 'image' | 'numberList' | 'multiSelect'
 *   | 'json' (ค่าซับซ้อนที่มีหน้าตั้งค่าของตัวเอง ใช้ field.normalize ปรับรูปแบบ)
 */
import { normalizeRoleConfig, OPTIONAL_MODULES } from './rbac';
import { CREDIT_TERM_OPTIONS } from './credit';
import { normalizeDocumentNumbering } from './docNumbers';

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'promptpay', label: 'QR PromptPay' },
  { value: 'transfer', label: 'โอนธนาคาร' },
  { value: 'credit', label: 'เครดิต (ขายเชื่อ)' },
  { value: 'split', label: 'แบ่งจ่าย' },
];

export const SHOP_CONFIG_FIELDS = [
  // ===================== ใบเสร็จ (receipt) =====================
  {
    key: 'receiptLogo',
    group: 'receipt',
    type: 'image',
    default: '',
    label: 'โลโก้ร้านบนหัวใบเสร็จ',
    hint: 'แนะนำรูปพื้นขาว ระบบย่อและแปลงเป็นขาวดำให้อัตโนมัติ',
  },
  {
    key: 'receiptHeaderText',
    group: 'receipt',
    type: 'text',
    default: '',
    maxLength: 120,
    label: 'ข้อความใต้ชื่อร้าน',
    hint: 'เช่น LINE: @myshop หรือ เปิด 07:00-20:00',
  },
  { key: 'receiptShowPhone', group: 'receipt', type: 'boolean', default: true, label: 'แสดงเบอร์โทรร้าน' },
  { key: 'receiptShowCustomer', group: 'receipt', type: 'boolean', default: true, label: 'แสดงชื่อลูกค้า' },
  { key: 'receiptShowCashier', group: 'receipt', type: 'boolean', default: false, label: 'แสดงชื่อพนักงานขาย' },
  {
    key: 'receiptShowUnitPrice',
    group: 'receipt',
    type: 'boolean',
    default: true,
    label: 'แสดงจำนวน × ราคาต่อหน่วย ใต้ชื่อสินค้า',
  },
  {
    key: 'receiptShowSavings',
    group: 'receipt',
    type: 'boolean',
    default: false,
    label: 'แสดงยอดประหยัดจากราคาส่ง',
  },
  {
    key: 'receiptFontSize',
    group: 'receipt',
    type: 'select',
    default: 'normal',
    label: 'ขนาดตัวอักษร',
    options: [
      { value: 'small', label: 'เล็ก' },
      { value: 'normal', label: 'ปกติ' },
      { value: 'large', label: 'ใหญ่' },
    ],
  },
  {
    key: 'receiptCopies',
    group: 'receipt',
    type: 'number',
    default: 1,
    min: 1,
    max: 3,
    step: 1,
    label: 'จำนวนใบที่พิมพ์ต่อบิล (ใบเสร็จความร้อน)',
  },

  // ===================== กติกาการขาย (sales) =====================
  {
    key: 'cashShortcuts',
    group: 'sales',
    type: 'numberList',
    default: [100, 500, 1000],
    min: 1,
    max: 100000,
    maxItems: 4,
    label: 'ปุ่มลัดธนบัตรในหน้าคิดเงิน',
    hint: 'ใส่ได้สูงสุด 4 ปุ่ม คั่นด้วยจุลภาค เช่น 20, 100, 500, 1000 (กดซ้ำ = บวกเพิ่ม)',
  },
  {
    key: 'roundingStep',
    group: 'sales',
    type: 'select',
    default: 0,
    numeric: true,
    label: 'ปัดเศษยอดสุทธิ (ปัดลง)',
    hint: 'ส่วนที่ปัดทิ้งบันทึกเป็นส่วนลดในบิล ไม่ใช้กับ VAT แบบคิดแยกนอก',
    options: [
      { value: 0, label: 'ไม่ปัดเศษ' },
      { value: 0.25, label: 'ปัดลงทีละ 0.25 บาท' },
      { value: 0.5, label: 'ปัดลงทีละ 0.50 บาท' },
      { value: 1, label: 'ปัดเศษสตางค์ทิ้ง (เต็มบาท)' },
    ],
  },
  {
    key: 'stockPolicy',
    group: 'sales',
    type: 'select',
    default: 'block',
    label: 'เมื่อขายเกินสต็อกที่มี',
    options: [
      { value: 'block', label: 'ห้ามขายเกินสต็อก' },
      { value: 'warn', label: 'ขายได้ แต่แจ้งเตือน' },
      { value: 'allow', label: 'ขายได้ ไม่ต้องเตือน' },
    ],
  },
  {
    key: 'maxCashierDiscountPercent',
    group: 'sales',
    type: 'number',
    default: 100,
    min: 0,
    max: 100,
    step: 1,
    suffix: '%',
    label: 'ส่วนลดท้ายบิลสูงสุดที่ให้ได้เอง (% ของยอดรวม)',
    hint: 'เกินกว่านี้ต้องใช้ PIN ผู้จัดการ/ผู้ดูแลระบบ (100 = ไม่จำกัด)',
  },
  {
    key: 'bahtPerPoint',
    group: 'sales',
    type: 'number',
    default: 100,
    min: 0,
    max: 100000,
    step: 1,
    suffix: 'บาท = 1 แต้ม',
    label: 'อัตราสะสมแต้มลูกค้า',
    hint: '0 = ไม่สะสมแต้ม (คิดจากยอดซื้อสะสมทั้งหมดของลูกค้า)',
  },
  {
    key: 'enabledPaymentMethods',
    group: 'sales',
    type: 'multiSelect',
    default: PAYMENT_METHOD_OPTIONS.map((o) => o.value),
    required: ['cash'],
    options: PAYMENT_METHOD_OPTIONS,
    label: 'ช่องทางชำระเงินที่เปิดใช้',
    hint: 'เงินสดเปิดเสมอ',
  },

  // ===================== การแจ้งเตือน & ค่าเริ่มต้น (defaults) =====================
  {
    key: 'defaultMinStock',
    group: 'defaults',
    type: 'number',
    default: 10,
    min: 0,
    max: 100000,
    step: 1,
    suffix: 'หน่วย',
    label: 'จุดเตือนสต็อกต่ำเริ่มต้น',
    hint: 'ใช้กับสินค้าที่ไม่ได้กำหนด "สต็อกขั้นต่ำ" และเป็นค่าเริ่มต้นของสินค้าใหม่',
  },
  {
    key: 'nearExpiryDays',
    group: 'defaults',
    type: 'number',
    default: 30,
    min: 1,
    max: 365,
    step: 1,
    suffix: 'วัน',
    label: 'เตือนล็อตใกล้หมดอายุล่วงหน้า',
  },
  {
    key: 'defaultLeadTimeDays',
    group: 'defaults',
    type: 'number',
    default: 7,
    min: 0,
    max: 365,
    step: 1,
    suffix: 'วัน',
    label: 'ระยะเวลารอสินค้าจากผู้ผลิตเริ่มต้น (แนะนำสั่งซื้อ)',
    hint: 'ใช้กับสินค้าที่ไม่ได้กำหนด Lead time เอง',
  },
  {
    key: 'reorderDemandDays',
    group: 'defaults',
    type: 'number',
    default: 30,
    min: 7,
    max: 365,
    step: 1,
    suffix: 'วัน',
    label: 'คิดยอดขายเฉลี่ยย้อนหลัง (แนะนำสั่งซื้อ)',
  },
  {
    key: 'defaultCreditTermDays',
    group: 'defaults',
    type: 'select',
    default: 0,
    numeric: true,
    label: 'เครดิตเทอมเริ่มต้นของลูกค้าใหม่',
    options: CREDIT_TERM_OPTIONS.map((d) => ({ value: d, label: d === 0 ? 'ไม่มีเครดิตเทอม (0 วัน)' : `${d} วัน` })),
  },
  {
    key: 'defaultCreditLimit',
    group: 'defaults',
    type: 'number',
    default: 0,
    min: 0,
    max: 100000000,
    step: 1,
    suffix: 'บาท',
    label: 'วงเงินเครดิตเริ่มต้นของลูกค้าใหม่',
    hint: '0 = ไม่จำกัดวงเงิน',
  },
  {
    key: 'showLowStockBadge',
    group: 'defaults',
    type: 'boolean',
    default: true,
    label: 'แสดงป้ายเตือนสินค้าใกล้หมดบนแถบเมนูและ Header',
  },
  {
    key: 'disabledModules',
    group: 'defaults',
    type: 'multiSelect',
    default: [],
    options: OPTIONAL_MODULES.map((m) => ({ value: m.id, label: m.label })),
    label: 'ปิดเมนูที่ร้านไม่ได้ใช้',
    hint: 'เมนูที่ติ๊กจะถูกซ่อนจากทุกคน (รวมผู้ดูแลระบบ) ข้อมูลเดิมยังอยู่ เปิดกลับได้ทุกเมื่อ',
  },

  // ===================== ระบบ (system) — ไม่แสดงในฟอร์ม ตั้งโดยการรีเซ็ต/สร้างร้านเท่านั้น =====================
  {
    key: 'shopResetId',
    group: 'system',
    type: 'text',
    default: '',
    maxLength: 64,
    label: 'รหัสการรีเซ็ตร้านล่าสุด (เครื่องที่เห็นรหัสใหม่จะล้างแคชของตัวเอง)',
  },
  {
    key: 'shopResetAt',
    group: 'system',
    type: 'text',
    default: '',
    maxLength: 40,
    label: 'เวลารีเซ็ตร้านล่าสุด',
  },
  {
    key: 'setupRequired',
    group: 'system',
    type: 'boolean',
    default: false,
    label: 'ร้านถูกรีเซ็ตค่าโรงงาน รอสร้างร้านใหม่',
  },

  // ===================== สิทธิ์ผู้ใช้ (roles) — แก้ที่หน้า ตั้งค่า › ผู้ใช้งาน & สิทธิ์ =====================
  {
    key: 'rolePermissions',
    group: 'roles',
    type: 'json',
    default: {},
    normalize: normalizeRoleConfig,
    label: 'สิทธิ์ตามบทบาท (ปรับทับค่าเริ่มต้น / บทบาทที่ร้านสร้างเอง)',
  },

  // ===================== เลขที่เอกสาร (documents) — แก้ที่หน้า ตั้งค่า › เลขที่เอกสาร =====================
  {
    key: 'documentNumbering',
    group: 'documents',
    type: 'json',
    default: {},
    normalize: normalizeDocumentNumbering,
    label: 'รูปแบบเลขที่เอกสาร (เก็บเฉพาะชนิดที่ต่างจากค่าเริ่มต้น)',
  },
];

export const SHOP_CONFIG_KEYS = SHOP_CONFIG_FIELDS.map((f) => f.key);

const cloneDefault = (value) =>
  Array.isArray(value) ? [...value] : value && typeof value === 'object' ? { ...value } : value;

export const SHOP_CONFIG_DEFAULTS = Object.fromEntries(
  SHOP_CONFIG_FIELDS.map((f) => [f.key, cloneDefault(f.default)])
);

export function getShopConfigFields(group) {
  return SHOP_CONFIG_FIELDS.filter((f) => f.group === group);
}

const clampNumber = (value, field) => {
  let n = Number(value);
  if (!Number.isFinite(n)) n = field.default;
  if (field.min !== undefined) n = Math.max(field.min, n);
  if (field.max !== undefined) n = Math.min(field.max, n);
  if (field.step === 1) n = Math.round(n);
  return n;
};

/**
 * ปรับค่าตั้งหนึ่งค่าให้ถูกชนิดตาม registry (ค่าผิดรูปแบบ = ค่าเริ่มต้น)
 */
export function normalizeShopConfigValue(field, value) {
  if (value === undefined || value === null) {
    return cloneDefault(field.default);
  }
  switch (field.type) {
    case 'boolean':
      return Boolean(value);
    case 'number':
      return clampNumber(value, field);
    case 'select': {
      const match = field.options.find((o) => String(o.value) === String(value));
      return match ? match.value : field.default;
    }
    case 'text':
      return String(value).slice(0, field.maxLength || 500);
    case 'image':
      return typeof value === 'string' && (value === '' || value.startsWith('data:image/')) ? value : '';
    case 'numberList': {
      const list = (Array.isArray(value) ? value : String(value).split(','))
        .map((v) => Number(String(v).trim()))
        .filter((n) => Number.isFinite(n) && n >= (field.min ?? 0) && n <= (field.max ?? Infinity));
      const unique = [...new Set(list)].slice(0, field.maxItems || 10);
      return unique.length > 0 ? unique : [...field.default];
    }
    case 'multiSelect': {
      const allowed = new Set(field.options.map((o) => o.value));
      const picked = (Array.isArray(value) ? value : []).filter((v) => allowed.has(v));
      (field.required || []).forEach((v) => {
        if (!picked.includes(v)) picked.unshift(v);
      });
      return field.options.map((o) => o.value).filter((v) => picked.includes(v));
    }
    case 'json':
      return field.normalize ? field.normalize(value) : value;
    default:
      return value;
  }
}

/**
 * เลือกเฉพาะค่าตั้งใน registry จาก object ใดๆ และปรับชนิดให้ถูกต้อง (คีย์ที่ไม่มี = ค่าเริ่มต้น)
 */
export function normalizeShopConfig(source = {}) {
  const result = {};
  SHOP_CONFIG_FIELDS.forEach((field) => {
    result[field.key] = normalizeShopConfigValue(field, source?.[field.key]);
  });
  return result;
}
