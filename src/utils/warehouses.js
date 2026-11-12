/**
 * ระบบหลายคลัง (Multi-Warehouse) ตามสเปก Module 3
 *
 * หลักการ: สต็อกรวมของสินค้ายังอยู่ที่ products.stock เหมือนเดิม (การขาย/นำเข้า/ปรับสต็อกไม่ต้องแก้)
 * ยอดแยกตามคลังเป็น "บัญชีย่อย" เก็บเฉพาะคลังที่ไม่ใช่คลังขาย + ยอดระหว่างโอน
 * ยอดของคลังขาย (หน้าร้าน) = สต็อกรวม - ยอดคลังอื่นทั้งหมด
 * ดังนั้นการขายและการปรับสต็อกทั่วไปจะมีผลกับคลังหน้าร้านอัตโนมัติ
 */

export const SALES_WAREHOUSE_ID = 'wh-front';
export const TRANSIT_WAREHOUSE_ID = 'wh-transit';

export const WAREHOUSE_TYPES = {
  storefront: 'หน้าร้าน',
  backstore: 'คลังหลังร้าน',
  main: 'คลังสินค้าหลัก',
  other: 'อื่นๆ',
};

export const DEFAULT_WAREHOUSES = [
  { id: SALES_WAREHOUSE_ID, code: 'FRONT', name: 'หน้าร้าน', type: 'storefront', is_active: true },
  { id: 'wh-back', code: 'BACK', name: 'คลังหลังร้าน', type: 'backstore', is_active: true },
  { id: 'wh-main', code: 'MAIN', name: 'คลังสินค้าหลัก', type: 'main', is_active: true },
];

export const TRANSFER_STATUS = {
  in_transit: { label: 'ระหว่างโอน', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  received: { label: 'รับเข้าแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิก', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/**
 * รวมคลังเริ่มต้นกับคลังที่ผู้ใช้เพิ่ม (คลังหน้าร้านต้องมีเสมอ)
 */
export function normalizeWarehouses(saved = []) {
  const byId = new Map(DEFAULT_WAREHOUSES.map((w) => [w.id, w]));
  (Array.isArray(saved) ? saved : []).forEach((w) => {
    if (w?.id && w.id !== TRANSIT_WAREHOUSE_ID) byId.set(w.id, { ...byId.get(w.id), ...w });
  });
  const front = byId.get(SALES_WAREHOUSE_ID);
  byId.set(SALES_WAREHOUSE_ID, { ...front, type: 'storefront', is_active: true });
  return [...byId.values()];
}

export function balanceId(warehouseId, productId) {
  return `${warehouseId}:${productId}`;
}

function storedQty(balances, warehouseId, productId) {
  const row = balances.find((b) => b.warehouse_id === warehouseId && b.product_id === productId);
  return Number(row?.physical_qty) || 0;
}

/**
 * ยอดของสินค้าหนึ่งตัวแยกตามคลัง { [warehouseId]: qty } รวมยอดระหว่างโอน
 */
export function getProductWarehouseQty(product, balances = [], warehouses = []) {
  const result = {};
  let others = 0;
  warehouses.forEach((w) => {
    if (w.id === SALES_WAREHOUSE_ID) return;
    const qty = storedQty(balances, w.id, product.id);
    result[w.id] = qty;
    others += qty;
  });
  const transit = storedQty(balances, TRANSIT_WAREHOUSE_ID, product.id);
  result[TRANSIT_WAREHOUSE_ID] = transit;
  result[SALES_WAREHOUSE_ID] = (Number(product.stock) || 0) - others - transit;
  return result;
}

/**
 * ยอดคงเหลือของคลังหนึ่ง (ใช้ตรวจก่อนโอนออก)
 */
export function getWarehouseQty(product, warehouseId, balances = [], warehouses = []) {
  return getProductWarehouseQty(product, balances, warehouses)[warehouseId] || 0;
}

/**
 * ปรับยอดบัญชีย่อยของคลัง (คลังหน้าร้านไม่ต้องเก็บ เพราะคำนวณจากสต็อกรวม)
 */
export function applyBalanceDelta(balances, warehouseId, productId, delta, nowIso = new Date().toISOString()) {
  if (warehouseId === SALES_WAREHOUSE_ID || !delta) return balances;
  const id = balanceId(warehouseId, productId);
  const exists = balances.some((b) => b.id === id);
  if (!exists) {
    return [
      ...balances,
      { id, warehouse_id: warehouseId, product_id: productId, physical_qty: delta, created_at: nowIso, updated_at: nowIso },
    ];
  }
  return balances.map((b) =>
    b.id === id
      ? { ...b, physical_qty: Math.round(((Number(b.physical_qty) || 0) + delta) * 10000) / 10000, updated_at: nowIso }
      : b
  );
}

/**
 * ตรวจรายการโอน: จำนวนต้องมากกว่า 0 และไม่เกินยอดในคลังต้นทาง
 * คืนค่า ข้อความผิดพลาด หรือ null
 */
export function validateTransfer({ fromId, toId, items }, products = [], balances = [], warehouses = []) {
  if (!fromId || !toId) return 'กรุณาเลือกคลังต้นทางและปลายทาง';
  if (fromId === toId) return 'คลังต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน';
  const valid = (items || []).filter((i) => Number(i.qty) > 0);
  if (valid.length === 0) return 'กรุณาระบุสินค้าและจำนวนที่จะโอน';
  for (const item of valid) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return 'ไม่พบสินค้าบางรายการ';
    const available = getWarehouseQty(product, fromId, balances, warehouses);
    if (Number(item.qty) > available) {
      return `${product.name} ในคลังต้นทางมีเพียง ${available} ${product.unit || ''}`.trim();
    }
  }
  return null;
}

/**
 * ผลรวมมูลค่า/จำนวนรายการต่อคลัง สำหรับการ์ดสรุป
 */
export function summarizeWarehouses(products = [], balances = [], warehouses = []) {
  const summary = {};
  [...warehouses, { id: TRANSIT_WAREHOUSE_ID }].forEach((w) => {
    summary[w.id] = { skuCount: 0, qty: 0, value: 0, negativeCount: 0 };
  });
  products
    .filter((p) => !p.linked_product_id)
    .forEach((p) => {
      const qtyMap = getProductWarehouseQty(p, balances, warehouses);
      Object.entries(qtyMap).forEach(([whId, qty]) => {
        const s = summary[whId];
        if (!s) return;
        if (qty !== 0) s.skuCount += 1;
        if (qty < 0) s.negativeCount += 1;
        s.qty += qty;
        s.value += qty * (Number(p.cost_price) || 0);
      });
    });
  return summary;
}
