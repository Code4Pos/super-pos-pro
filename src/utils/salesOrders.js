/**
 * ใบสั่งขายส่ง / ใบจองสินค้า (Sales Order) ตามสเปก Module 3 Stock Status Tracking
 * - Reserved Stock = ผลรวมจำนวนในใบสั่งขายที่ยังรอส่งของ (status 'reserved')
 * - Available to Promise (ATP) = Physical Stock - Reserved Stock
 * จำนวนจองเก็บเป็นหน่วยฐานของสินค้าหลัก (สินค้ารองที่เชื่อมสินค้าหลักจะคูณ linked_deduct_qty)
 */

export const SALES_ORDER_STATUS = {
  reserved: { label: 'จองแล้ว รอส่งของ', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  fulfilled: { label: 'เปิดบิลแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิก', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/**
 * แปลงจำนวนของสินค้า (ปลีกหรือสินค้ารอง) เป็น { masterId, baseQty } ของสินค้าหลัก
 */
export function toBaseQty(product, qty) {
  if (!product) return { masterId: null, baseQty: 0 };
  const mult = product.linked_product_id ? Math.max(1, Number(product.linked_deduct_qty) || 1) : 1;
  return { masterId: product.linked_product_id || product.id, baseQty: (Number(qty) || 0) * mult };
}

/**
 * ยอดจองต่อสินค้าหลัก { [masterProductId]: baseQty }
 * excludeOrderId: ไม่นับใบที่กำลังแก้ไข/กำลังเปิดบิล
 */
export function calculateReservedByProduct(salesOrders = [], excludeOrderId = null) {
  const reserved = {};
  salesOrders
    .filter((so) => so.status === 'reserved' && so.id !== excludeOrderId)
    .forEach((so) => {
      (so.items || []).forEach((item) => {
        const masterId = item.master_product_id || item.product_id;
        reserved[masterId] = (reserved[masterId] || 0) + (Number(item.base_qty) || 0);
      });
    });
  return reserved;
}

/**
 * ATP ของสินค้า (หน่วยของสินค้านั้นเอง) = (สต็อกสินค้าหลัก - ยอดจอง) / ตัวคูณ
 */
export function getAvailableToPromise(product, products = [], reservedByProduct = {}) {
  if (!product) return 0;
  const master = product.linked_product_id
    ? products.find((p) => p.id === product.linked_product_id) || product
    : product;
  const mult = product.linked_product_id ? Math.max(1, Number(product.linked_deduct_qty) || 1) : 1;
  const atpBase = (Number(master.stock) || 0) - (reservedByProduct[master.id] || 0);
  return Math.floor((atpBase / mult) * 10000) / 10000;
}

/**
 * ตรวจรายการในใบสั่งขาย: จำนวนต้องไม่เกิน ATP (รวมกรณีสั่งสินค้าหลักและสินค้ารองตัวเดียวกันในใบเดียว)
 * คืนค่าข้อความผิดพลาด หรือ null
 */
export function validateSalesOrderItems(items = [], products = [], reservedByProduct = {}) {
  const valid = items.filter((i) => Number(i.qty) > 0);
  if (valid.length === 0) return 'กรุณาเพิ่มสินค้าและระบุจำนวน';
  const needByMaster = {};
  for (const item of valid) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return 'ไม่พบสินค้าบางรายการ';
    const { masterId, baseQty } = toBaseQty(product, item.qty);
    needByMaster[masterId] = (needByMaster[masterId] || 0) + baseQty;
  }
  for (const [masterId, need] of Object.entries(needByMaster)) {
    const master = products.find((p) => p.id === masterId);
    const atp = (Number(master?.stock) || 0) - (reservedByProduct[masterId] || 0);
    if (need > atp) {
      return `${master?.name || 'สินค้า'} พร้อมขาย (ATP) เหลือ ${Math.max(0, atp)} ${master?.unit || ''}`.trim();
    }
  }
  return null;
}

/**
 * สร้างรายการในใบสั่งขาย พร้อมจำนวนหน่วยฐาน
 */
export function buildSalesOrderItems(items = [], products = []) {
  return items
    .filter((i) => Number(i.qty) > 0)
    .map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      const { masterId, baseQty } = toBaseQty(product, i.qty);
      return {
        product_id: i.product_id,
        master_product_id: masterId,
        product_name: product?.name || '',
        sku: product?.sku || '',
        unit: product?.unit || 'ชิ้น',
        qty: Number(i.qty),
        base_qty: baseQty,
      };
    });
}
