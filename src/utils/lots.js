/**
 * Lot / วันหมดอายุ (Module 2) — ล็อตเป็นบัญชีย่อยของสต็อกสินค้าหลัก
 * - เปิดใช้เฉพาะสินค้าที่ตั้ง track_lots = true
 * - ตัดสต็อกตามกลยุทธ์: FEFO (หมดอายุก่อน ออกก่อน) หรือ FIFO (รับเข้าก่อน ออกก่อน)
 * - จำนวนในล็อตเป็นหน่วยฐานของสินค้าหลัก (สินค้ารองที่เชื่อมกันแปลงไปที่สินค้าหลักแล้ว)
 */
export const LOT_STRATEGIES = {
  FEFO: 'FEFO — หมดอายุก่อน ออกก่อน',
  FIFO: 'FIFO — รับเข้าก่อน ออกก่อน',
};

// ล็อตสำหรับสต็อกที่ไม่ทราบล็อต (ยอดยกมา, คืนสินค้า, ปรับสต็อก) ไม่มีวันหมดอายุ
export const UNASSIGNED_LOT_NUMBER = 'ไม่ระบุล็อต';

export const NEAR_EXPIRY_DAYS = 30;

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

function newLotId() {
  return `lot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * เรียงล็อตตามลำดับการตัดสต็อก
 * FEFO: วันหมดอายุเร็วสุดก่อน (ล็อตที่ไม่มีวันหมดอายุไว้ท้ายสุด) แล้วจึงดูวันที่รับเข้า
 * FIFO: วันที่รับเข้าเก่าสุดก่อน
 */
export function sortLotsForConsumption(lots = [], strategy = 'FEFO') {
  const received = (l) => new Date(l.received_at || 0).getTime();
  return [...lots].sort((a, b) => {
    if (strategy === 'FEFO') {
      const ea = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const eb = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      if (ea !== eb) return ea - eb;
    }
    return received(a) - received(b);
  });
}

/**
 * ตัดสต็อกออกจากล็อตของสินค้า คืนค่า { lots, consumed: [{ lot_id, qty }], shortage }
 * shortage = จำนวนที่ล็อตไม่พอให้ตัด (สต็อกรวมกับล็อตไม่ตรงกัน)
 */
export function consumeLots(lots, productId, qty, strategy, nowIso = new Date().toISOString()) {
  let remaining = round4(qty);
  const consumed = [];
  const available = sortLotsForConsumption(
    lots.filter((l) => l.product_id === productId && l.remaining_qty > 0),
    strategy
  );
  const usedById = new Map();
  for (const lot of available) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remaining_qty, remaining);
    usedById.set(lot.id, take);
    consumed.push({ lot_id: lot.id, qty: round4(take) });
    remaining = round4(remaining - take);
  }
  const updated = lots.map((l) =>
    usedById.has(l.id)
      ? { ...l, remaining_qty: round4(l.remaining_qty - usedById.get(l.id)), updated_at: nowIso }
      : l
  );
  return { lots: updated, consumed, shortage: Math.max(0, remaining) };
}

/**
 * เพิ่มสต็อกเข้าล็อต
 * - lotInfo มีเลขล็อต: รวมเข้าล็อตเดิมที่เลขและวันหมดอายุตรงกัน หรือสร้างล็อตใหม่
 * - ไม่มีข้อมูลล็อต: รวมเข้า "ไม่ระบุล็อต" ของสินค้านั้น
 */
export function addToLots(lots, product, qty, lotInfo = null, meta = {}, nowIso = new Date().toISOString()) {
  const amount = round4(qty);
  if (amount <= 0) return lots;
  const lotNumber = String(lotInfo?.lot_number || '').trim() || UNASSIGNED_LOT_NUMBER;
  const expiry = lotInfo?.expiry_date || null;
  const existing = lots.find(
    (l) => l.product_id === product.id && l.lot_number === lotNumber && (l.expiry_date || null) === expiry
  );
  if (existing) {
    return lots.map((l) =>
      l.id === existing.id
        ? {
            ...l,
            received_qty: round4(l.received_qty + amount),
            remaining_qty: round4(l.remaining_qty + amount),
            updated_at: nowIso,
          }
        : l
    );
  }
  return [
    {
      id: newLotId(),
      product_id: product.id,
      product_name: product.name,
      lot_number: lotNumber,
      expiry_date: expiry,
      received_qty: amount,
      remaining_qty: amount,
      cost_price: Number(lotInfo?.cost_price ?? product.cost_price) || 0,
      received_at: nowIso,
      reference_doc: meta.reference_doc || '',
      updated_at: nowIso,
    },
    ...lots,
  ];
}

/**
 * คืนสต็อกกลับเข้าล็อตเดิมตามประวัติการตัด (เช่น ยกเลิกบิล)
 * ล็อตที่ถูกลบไปแล้วจะคืนเข้า "ไม่ระบุล็อต"
 */
export function restoreToLots(lots, product, consumedList = [], qty, meta = {}, nowIso = new Date().toISOString()) {
  let remaining = round4(qty);
  let updated = lots;
  for (const c of consumedList) {
    if (remaining <= 0) break;
    const back = Math.min(c.qty, remaining);
    if (updated.some((l) => l.id === c.lot_id)) {
      updated = updated.map((l) =>
        l.id === c.lot_id ? { ...l, remaining_qty: round4(l.remaining_qty + back), updated_at: nowIso } : l
      );
      remaining = round4(remaining - back);
    }
  }
  return remaining > 0 ? addToLots(updated, product, remaining, null, meta, nowIso) : updated;
}

/**
 * สถานะวันหมดอายุของล็อต: 'expired' | 'near' | 'ok' | 'none'
 */
export function getExpiryStatus(lot, now = new Date(), nearDays = NEAR_EXPIRY_DAYS) {
  if (!lot?.expiry_date) return 'none';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exp = new Date(`${lot.expiry_date}T00:00:00`).getTime();
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return 'expired';
  if (days <= nearDays) return 'near';
  return 'ok';
}

export function daysUntilExpiry(lot, now = new Date()) {
  if (!lot?.expiry_date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(`${lot.expiry_date}T00:00:00`).getTime() - today) / 86400000);
}

/**
 * ผลรวมล็อตคงเหลือต่อสินค้า เทียบกับสต็อกรวม (ใช้หาสินค้าที่ยอดไม่ตรง)
 */
export function summarizeLotsByProduct(lots = []) {
  const map = new Map();
  lots.forEach((l) => {
    map.set(l.product_id, round4((map.get(l.product_id) || 0) + (Number(l.remaining_qty) || 0)));
  });
  return map;
}

/**
 * จำลองการตัดล็อตของสินค้าในตะกร้า แล้วหาว่ารายการไหนจะถูกตัดจากล็อตที่หมดอายุแล้ว
 * - สินค้ารองที่ผูกกับสินค้าหลักแปลงเป็นหน่วยฐานของสินค้าหลัก (quantity x linked_deduct_qty)
 * - ใช้กลยุทธ์เดียวกับตอนตัดสต็อกจริง (FEFO/FIFO) และนับรวมทุกรายการของสินค้าหลักเดียวกัน
 * คืนค่า Map: product_id ของรายการในตะกร้า → { expiredQty (หน่วยฐาน), expiryDate (ล็อตหมดอายุเก่าสุด) }
 */
export function findExpiredLotsInCart(cart = [], products = [], lots = [], now = new Date()) {
  const result = new Map();
  if (!cart.length || !lots.length) return result;
  const productMap = new Map(products.map((p) => [p.id, p]));

  // รวมจำนวนในตะกร้าต่อสินค้าหลัก (เรียงตามลำดับรายการ)
  const byMaster = new Map();
  cart.forEach((item) => {
    const product = productMap.get(item.product?.id) || item.product;
    if (!product) return;
    const master = product.linked_product_id ? productMap.get(product.linked_product_id) : product;
    if (!master?.track_lots) return;
    const factor = product.linked_product_id ? Number(product.linked_deduct_qty) || 1 : 1;
    const baseQty = round4((Number(item.quantity) || 0) * factor);
    if (baseQty <= 0) return;
    if (!byMaster.has(master.id)) byMaster.set(master.id, { master, items: [] });
    byMaster.get(master.id).items.push({ itemId: product.id, baseQty });
  });

  byMaster.forEach(({ master, items }) => {
    const totalQty = items.reduce((sum, i) => sum + i.baseQty, 0);
    const ordered = sortLotsForConsumption(
      lots.filter((l) => l.product_id === master.id && Number(l.remaining_qty) > 0),
      master.lot_strategy || 'FEFO'
    );
    let remaining = totalQty;
    let expiredQty = 0;
    let expiryDate = null;
    for (const lot of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(Number(lot.remaining_qty) || 0, remaining);
      if (getExpiryStatus(lot, now) === 'expired') {
        expiredQty = round4(expiredQty + take);
        if (!expiryDate || lot.expiry_date < expiryDate) expiryDate = lot.expiry_date;
      }
      remaining = round4(remaining - take);
    }
    if (expiredQty > 0) {
      items.forEach((i) => result.set(i.itemId, { expiredQty, expiryDate, masterId: master.id, masterUnit: master.unit }));
    }
  });
  return result;
}
