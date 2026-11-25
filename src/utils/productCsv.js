/**
 * นำเข้า / ส่งออกข้อมูลสินค้าด้วยไฟล์ CSV (beta 0.4.1) — ฟังก์ชันล้วน ไม่แตะ LocalStorage/ฐานข้อมูล
 * - ส่งออก: หัวตารางภาษาไทย + BOM ให้ Excel เปิดภาษาไทยได้
 * - นำเข้า: อ่านได้ทั้ง UTF-8 และ Windows-874 (CSV ที่ Excel ภาษาไทยบันทึกแบบเดิม)
 *   จับคู่สินค้าเดิมด้วย SKU (ไม่สนตัวพิมพ์เล็ก/ใหญ่) / ช่องว่าง = คงค่าเดิม / แถวที่ผิดถูกข้าม ไม่หยุดทั้งไฟล์
 * - ขอบเขต: ข้อมูลหลักของสินค้าเท่านั้น (ไม่รวมหน่วยขายหลายบาร์โค้ด และราคาขายส่งขั้นบันได)
 */

export const PRODUCT_CSV_COLUMNS = [
  { key: 'sku', label: 'SKU', aliases: ['รหัสสินค้า', 'รหัส'] },
  { key: 'barcode', label: 'บาร์โค้ด', aliases: ['barcode'] },
  { key: 'name', label: 'ชื่อสินค้า', aliases: ['ชื่อ', 'name'] },
  { key: 'category', label: 'หมวดหมู่', aliases: ['category'] },
  { key: 'unit', label: 'หน่วย', aliases: ['หน่วยนับ', 'unit'] },
  { key: 'cost_price', label: 'ราคาทุน', aliases: ['ต้นทุน', 'cost', 'cost_price'], type: 'number' },
  { key: 'retail_price', label: 'ราคาปลีก', aliases: ['ราคาขาย', 'retail_price', 'price'], type: 'number' },
  { key: 'is_wholesale_enabled', label: 'เปิดราคาส่ง', aliases: ['is_wholesale_enabled'], type: 'bool' },
  { key: 'wholesale_price', label: 'ราคาส่ง', aliases: ['wholesale_price'], type: 'number' },
  { key: 'wholesale_min_qty', label: 'ขั้นต่ำราคาส่ง', aliases: ['wholesale_min_qty'], type: 'number' },
  { key: 'stock', label: 'สต็อก', aliases: ['คงเหลือ', 'stock'], type: 'number' },
  { key: 'min_stock', label: 'จุดเตือนสต็อก', aliases: ['min_stock'], type: 'number' },
  { key: 'pack_size', label: 'ขนาดบรรจุ', aliases: ['pack_size'] },
  { key: 'is_active', label: 'เปิดขาย', aliases: ['is_active', 'สถานะ'], type: 'bool' },
  { key: 'linked_sku', label: 'สินค้าหลัก (SKU)', aliases: ['linked_sku', 'สินค้าหลัก'] },
  { key: 'linked_deduct_qty', label: 'จำนวนตัดต่อหน่วย', aliases: ['linked_deduct_qty'], type: 'number' },
];

export const DEFAULT_IMPORT_CATEGORY = 'อื่นๆ';
export const DEFAULT_IMPORT_UNIT = 'ชิ้น';
export const MAX_IMPORT_ROWS = 20000;

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const norm = (v) => String(v ?? '').trim().toLowerCase();

// ---------- อ่าน/เขียนไฟล์ ----------

/**
 * แปลงไฟล์เป็นข้อความ: ลอง UTF-8 แบบเข้มงวดก่อน ถ้าไม่ใช่ = Windows-874 (Excel ภาษาไทยแบบเดิม)
 */
export function decodeCsvBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder('windows-874').decode(bytes);
    } catch {
      text = new TextDecoder('utf-8').decode(bytes);
    }
  }
  return text.replace(/^﻿/, '');
}

// ตัวคั่นที่ใช้ในแถวหัวตาราง (Excel บางภาษาใช้ ; หรือ Tab)
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * แยก CSV เป็นแถว (รองรับค่าในเครื่องหมายคำพูดที่มีตัวคั่น ขึ้นบรรทัดใหม่ และ "" ข้างใน)
 * คืนค่า string[][] โดยตัดแถวว่างทิ้ง
 */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function escapeCsv(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvText(rows) {
  return '﻿' + rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
}

const boolText = (v) => (v ? 'ใช่' : 'ไม่');

/**
 * ข้อมูลสินค้า → ข้อความ CSV (สินค้าในถังขยะไม่ต้องส่งมา)
 */
export function buildProductCsv(products = [], categories = []) {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const skuById = new Map(products.map((p) => [p.id, p.sku]));
  const header = PRODUCT_CSV_COLUMNS.map((c) => c.label);
  const rows = products.map((p) => [
    p.sku || '',
    p.barcode || '',
    p.name || '',
    categoryName.get(p.category_id) || '',
    p.unit || '',
    round4(p.cost_price),
    round4(p.retail_price),
    boolText(p.is_wholesale_enabled),
    round4(p.wholesale_price),
    Number(p.wholesale_min_qty) || '',
    round4(p.stock),
    p.min_stock ?? '',
    p.pack_size || '',
    boolText(p.is_active !== false),
    p.linked_product_id ? skuById.get(p.linked_product_id) || '' : '',
    p.linked_product_id ? Number(p.linked_deduct_qty) || 1 : '',
  ]);
  return toCsvText([header, ...rows]);
}

/**
 * ไฟล์ตัวอย่างสำหรับกรอกข้อมูล
 */
export function buildProductCsvTemplate() {
  const header = PRODUCT_CSV_COLUMNS.map((c) => c.label);
  return toCsvText([
    header,
    ['DRK-001', '8850000000011', 'น้ำดื่ม 600 มล.', 'เครื่องดื่ม', 'ขวด', 5, 7, 'ใช่', 6.5, 12, 120, 24, '600 มล.', 'ใช่', '', ''],
    ['DRK-001-P', '8850000000028', 'น้ำดื่ม 600 มล. (แพ็ค 12)', 'เครื่องดื่ม', 'แพ็ค', 60, 79, 'ไม่', '', '', '', '', '12 ขวด', 'ใช่', 'DRK-001', 12],
  ]);
}

// ---------- ตีความค่าในเซลล์ ----------

function parseNumber(raw) {
  const s = String(raw).replace(/[,฿\s]/g, '');
  if (s === '') return { value: undefined };
  const n = Number(s);
  return Number.isFinite(n) ? { value: n } : { error: true };
}

const TRUE_WORDS = ['ใช่', 'เปิด', 'yes', 'y', 'true', '1', 'on', '✓'];
const FALSE_WORDS = ['ไม่', 'ไม่ใช่', 'ปิด', 'no', 'n', 'false', '0', 'off'];
function parseBool(raw) {
  const s = norm(raw);
  if (s === '') return { value: undefined };
  if (TRUE_WORDS.includes(s)) return { value: true };
  if (FALSE_WORDS.includes(s)) return { value: false };
  return { error: true };
}

/**
 * จับคู่หัวตารางกับคอลัมน์ (ชื่อภาษาไทย / ชื่อเดิม / คีย์ภาษาอังกฤษ)
 * คืนค่า { indexByKey, unknown: [หัวที่ไม่รู้จัก] }
 */
export function mapCsvHeader(headerRow = []) {
  const indexByKey = {};
  const unknown = [];
  headerRow.forEach((h, idx) => {
    const name = norm(h);
    const col = PRODUCT_CSV_COLUMNS.find(
      (c) => norm(c.label) === name || norm(c.key) === name || c.aliases.some((a) => norm(a) === name)
    );
    if (col && indexByKey[col.key] === undefined) indexByKey[col.key] = idx;
    else if (name) unknown.push(String(h).trim());
  });
  return { indexByKey, unknown };
}

function uniqueSku(taken) {
  for (let i = 0; i < 1000; i += 1) {
    const sku = `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!taken.has(norm(sku))) {
      taken.add(norm(sku));
      return sku;
    }
  }
  const sku = `SKU-${Date.now()}`;
  taken.add(norm(sku));
  return sku;
}

/**
 * ตรวจไฟล์และวางแผนการนำเข้า (ยังไม่บันทึกอะไร)
 * rows = ผลจาก parseCsv (แถวแรกเป็นหัวตาราง)
 * options.updateStock = บันทึกสต็อกตามไฟล์สำหรับสินค้าเดิม (สินค้าใหม่ใช้ยอดในไฟล์เสมอ)
 * คืนค่า {
 *   error?, rows: [{ line, action: 'create'|'update'|'unchanged'|'error', sku, name, errors, changes, stockFrom, stockTo, productId }],
 *   newCategories: [ชื่อ], newUnits: [ชื่อ], summary: { create, update, unchanged, error }, stockDecreases, unknownColumns
 * }
 */
export function planProductImport(rows, { products = [], trashedProducts = [], categories = [], units = [] } = {}, options = {}) {
  const empty = { rows: [], newCategories: [], newUnits: [], summary: { create: 0, update: 0, unchanged: 0, error: 0 }, stockDecreases: 0, unknownColumns: [] };
  if (!Array.isArray(rows) || rows.length < 2) return { ...empty, error: 'ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางและอย่างน้อย 1 แถว)' };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { ...empty, error: `ไฟล์มีมากกว่า ${MAX_IMPORT_ROWS.toLocaleString()} แถว กรุณาแบ่งไฟล์` };

  const { indexByKey, unknown } = mapCsvHeader(rows[0]);
  if (indexByKey.sku === undefined && indexByKey.name === undefined) {
    return { ...empty, error: 'ไม่พบคอลัมน์ "SKU" หรือ "ชื่อสินค้า" ในแถวแรก (ใช้ไฟล์ตัวอย่างเป็นแม่แบบได้)' };
  }

  const bySku = new Map(products.map((p) => [norm(p.sku), p]));
  const trashedSkus = new Set(trashedProducts.map((p) => norm(p.sku)));
  const categoryByName = new Map();
  categories.filter((c) => c.id !== 'all').forEach((c) => {
    categoryByName.set(norm(c.name), c.id);
    categoryByName.set(norm(c.id), c.id);
  });
  const unitNames = new Set(units.map((u) => norm(u.name)));
  products.forEach((p) => p.unit && unitNames.add(norm(p.unit)));

  // บาร์โค้ดที่ใช้อยู่ (รวมหน่วยขายหลายบาร์โค้ด) → id สินค้า
  const barcodeOwner = new Map();
  products.forEach((p) => {
    if (p.barcode) barcodeOwner.set(norm(p.barcode), p.id);
    (p.selling_units || []).forEach((su) => su?.barcode && barcodeOwner.set(norm(su.barcode), p.id));
  });

  const takenSkus = new Set([...bySku.keys(), ...trashedSkus]);
  const fileSkus = new Set();
  const fileBarcodes = new Map(); // barcode → line
  const newCategories = new Map(); // norm → ชื่อที่พิมพ์
  const newUnits = new Map();
  const planned = [];

  const cell = (row, key) => (indexByKey[key] === undefined ? '' : String(row[indexByKey[key]] ?? '').trim());

  rows.slice(1).forEach((row, i) => {
    const line = i + 2; // แถวในไฟล์ (นับหัวตารางเป็นแถว 1)
    const errors = [];
    const values = {};
    PRODUCT_CSV_COLUMNS.forEach((col) => {
      const raw = cell(row, col.key);
      if (col.type === 'number') {
        const r = parseNumber(raw);
        if (r.error) errors.push(`${col.label} "${raw}" ไม่ใช่ตัวเลข`);
        else values[col.key] = r.value;
      } else if (col.type === 'bool') {
        const r = parseBool(raw);
        if (r.error) errors.push(`${col.label} "${raw}" ต้องเป็น ใช่/ไม่`);
        else values[col.key] = r.value;
      } else {
        values[col.key] = raw === '' ? undefined : raw;
      }
    });
    ['cost_price', 'retail_price', 'wholesale_price', 'wholesale_min_qty', 'min_stock'].forEach((k) => {
      if (values[k] !== undefined && values[k] < 0) errors.push(`${PRODUCT_CSV_COLUMNS.find((c) => c.key === k).label} ติดลบไม่ได้`);
    });
    if (values.linked_deduct_qty !== undefined && values.linked_deduct_qty < 1) errors.push('จำนวนตัดต่อหน่วยต้องอย่างน้อย 1');

    const skuKey = norm(values.sku);
    const existing = skuKey ? bySku.get(skuKey) : null;
    if (skuKey) {
      if (fileSkus.has(skuKey)) errors.push(`SKU "${values.sku}" ซ้ำกับแถวก่อนหน้าในไฟล์`);
      fileSkus.add(skuKey);
      if (!existing && trashedSkus.has(skuKey)) errors.push(`SKU "${values.sku}" อยู่ในถังขยะ (กู้คืนก่อน หรือใช้ SKU อื่น)`);
    }
    if (!existing && !values.name) errors.push('สินค้าใหม่ต้องมีชื่อสินค้า');

    // บาร์โค้ดซ้ำกับสินค้าอื่น หรือซ้ำในไฟล์
    if (values.barcode) {
      const b = norm(values.barcode);
      const owner = barcodeOwner.get(b);
      if (owner && owner !== existing?.id) errors.push(`บาร์โค้ด ${values.barcode} ซ้ำกับสินค้าอื่นในระบบ`);
      if (fileBarcodes.has(b)) errors.push(`บาร์โค้ด ${values.barcode} ซ้ำกับแถว ${fileBarcodes.get(b)} ในไฟล์`);
      else fileBarcodes.set(b, line);
    }

    planned.push({ line, values, existing, errors });
  });

  // SKU ของสินค้าใหม่ที่ไม่ได้ระบุ = สร้างให้ / รายชื่อ SKU ที่จะมีหลังนำเข้า (ใช้ตรวจสินค้าหลัก)
  planned.forEach((p) => {
    if (!p.existing && p.errors.length === 0 && !p.values.sku) p.values.sku = uniqueSku(takenSkus);
  });
  const finalBySku = new Map(bySku);
  planned.forEach((p) => {
    if (!p.existing && p.errors.length === 0) finalBySku.set(norm(p.values.sku), { sku: p.values.sku, isNew: true, line: p.line });
  });
  const plannedBySku = new Map(planned.filter((p) => p.errors.length === 0).map((p) => [norm(p.values.sku), p]));

  // สินค้าหลักที่อ้างถึง: ต้องมีอยู่ ไม่ใช่ตัวเอง และไม่ใช่สินค้ารอง (หลังนำเข้า)
  const isLinkedAfter = (sku) => {
    const p = plannedBySku.get(norm(sku));
    if (p && p.values.linked_sku !== undefined) return Boolean(p.values.linked_sku);
    const prod = bySku.get(norm(sku));
    return Boolean(prod?.linked_product_id);
  };
  planned.forEach((p) => {
    if (p.errors.length > 0 || !p.values.linked_sku) return;
    const target = finalBySku.get(norm(p.values.linked_sku));
    if (!target) p.errors.push(`ไม่พบสินค้าหลัก SKU "${p.values.linked_sku}"`);
    else if (norm(p.values.linked_sku) === norm(p.values.sku)) p.errors.push('สินค้าหลักต้องไม่ใช่ตัวเอง');
    else if (isLinkedAfter(p.values.linked_sku)) p.errors.push(`สินค้าหลัก "${p.values.linked_sku}" เป็นสินค้ารองอยู่แล้ว`);
  });

  const result = { ...empty, rows: [], unknownColumns: unknown };
  planned.forEach(({ line, values, existing, errors }) => {
    const base = { line, sku: values.sku || existing?.sku || '', name: values.name || existing?.name || '', errors };
    if (errors.length > 0) {
      result.rows.push({ ...base, action: 'error' });
      result.summary.error += 1;
      return;
    }

    // หมวดหมู่/หน่วยที่ยังไม่มี = สร้างใหม่ (ชื่อตามที่พิมพ์ในไฟล์)
    let categoryRef;
    const categoryName = values.category || (existing ? undefined : DEFAULT_IMPORT_CATEGORY);
    if (categoryName !== undefined) {
      const id = categoryByName.get(norm(categoryName));
      if (id) categoryRef = { id };
      else {
        newCategories.set(norm(categoryName), newCategories.get(norm(categoryName)) || categoryName);
        categoryRef = { newName: newCategories.get(norm(categoryName)) };
      }
    }
    const unitName = values.unit || (existing ? undefined : DEFAULT_IMPORT_UNIT);
    if (unitName !== undefined && !unitNames.has(norm(unitName))) {
      newUnits.set(norm(unitName), newUnits.get(norm(unitName)) || unitName);
    }

    // ค่าที่จะเปลี่ยน (สินค้าเดิม: เฉพาะช่องที่กรอกและต่างจากเดิม)
    const changes = {};
    const setIf = (key, value, current) => {
      if (value === undefined) return;
      if (existing && String(value) === String(current ?? '')) return;
      changes[key] = value;
    };
    setIf('name', values.name, existing?.name);
    setIf('barcode', values.barcode, existing?.barcode);
    setIf('unit', unitName, existing?.unit);
    setIf('cost_price', values.cost_price, existing?.cost_price);
    setIf('retail_price', values.retail_price, existing?.retail_price);
    setIf('is_wholesale_enabled', values.is_wholesale_enabled, existing ? Boolean(existing.is_wholesale_enabled) : undefined);
    setIf('wholesale_price', values.wholesale_price, existing?.wholesale_price);
    setIf('wholesale_min_qty', values.wholesale_min_qty, existing?.wholesale_min_qty);
    setIf('min_stock', values.min_stock, existing?.min_stock);
    setIf('pack_size', values.pack_size, existing?.pack_size);
    setIf('is_active', values.is_active, existing ? existing.is_active !== false : undefined);
    if (categoryRef) {
      if (categoryRef.newName) changes.category_name = categoryRef.newName;
      else if (!existing || categoryRef.id !== existing.category_id) changes.category_id = categoryRef.id;
    }
    // สินค้าหลัก: ระบุ SKU = ผูก / ช่องว่าง = คงเดิม
    if (values.linked_sku !== undefined) {
      const currentLinkedSku = existing?.linked_product_id
        ? products.find((x) => x.id === existing.linked_product_id)?.sku
        : '';
      if (norm(values.linked_sku) !== norm(currentLinkedSku)) changes.linked_sku = finalBySku.get(norm(values.linked_sku)).sku;
    }
    if (values.linked_deduct_qty !== undefined && (values.linked_sku || existing?.linked_product_id)) {
      setIf('linked_deduct_qty', values.linked_deduct_qty, existing?.linked_deduct_qty);
    }
    // ราคาส่งในไฟล์แต่ไม่ได้ระบุสถานะ = เปิดราคาส่งให้ (สินค้าใหม่)
    if (!existing && changes.is_wholesale_enabled === undefined && values.wholesale_price > 0) changes.is_wholesale_enabled = true;

    // สต็อก: สินค้าใหม่ใช้ยอดในไฟล์ / สินค้าเดิมเฉพาะเมื่อเลือก "บันทึกสต็อกตามไฟล์" / สินค้ารองใช้สต็อกของสินค้าหลัก
    const willBeLinked = changes.linked_sku !== undefined ? Boolean(changes.linked_sku) : Boolean(existing?.linked_product_id);
    let stockFrom = null;
    let stockTo = null;
    if (!willBeLinked && values.stock !== undefined) {
      if (!existing) {
        stockTo = round4(values.stock);
      } else if (options.updateStock && round4(values.stock) !== round4(existing.stock)) {
        stockFrom = round4(existing.stock);
        stockTo = round4(values.stock);
        if (stockTo < stockFrom) result.stockDecreases += 1;
      }
    }

    let action = 'create';
    if (existing) action = Object.keys(changes).length > 0 || stockTo !== null ? 'update' : 'unchanged';
    result.rows.push({
      ...base,
      sku: existing ? existing.sku : values.sku,
      action,
      productId: existing?.id || null,
      changes,
      stockFrom,
      stockTo,
    });
    result.summary[action] += 1;
  });

  result.newCategories = [...newCategories.values()];
  result.newUnits = [...newUnits.values()];
  return result;
}
