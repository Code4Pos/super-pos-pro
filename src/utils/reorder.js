/**
 * จุดสั่งซื้อซ้ำ (Reorder Point) ตามสเปก Module 5
 * ROP = (ยอดขายเฉลี่ยต่อวัน x ระยะเวลารอสินค้า) + สต็อกสำรอง
 * คิดเป็นหน่วยฐานของสินค้าหลัก (สินค้ารองที่เชื่อมกันจะถูกแปลงไปรวมที่สินค้าหลัก)
 */
export const REORDER_DEFAULTS = {
  demandDays: 30, // ใช้ยอดขายย้อนหลังกี่วันในการหาค่าเฉลี่ย
  leadTimeDays: 7, // ระยะเวลารอสินค้าจากผู้ผลิต (ค่าเริ่มต้น)
};

/**
 * ยอดขายเฉลี่ยต่อวันของสินค้าหลักแต่ละตัว จากบิลที่ไม่ถูกยกเลิกในช่วง demandDays วันล่าสุด
 */
export function calculateDailyDemand(orders = [], products = [], demandDays = REORDER_DEFAULTS.demandDays, now = new Date()) {
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const since = now.getTime() - demandDays * 86400000;
  const soldByMaster = new Map();

  orders.forEach((order) => {
    if (order.status === 'voided') return;
    if (new Date(order.created_at).getTime() < since) return;
    (order.items || []).forEach((item) => {
      const soldProd = prodMap.get(item.product_id);
      const masterId = soldProd?.linked_product_id || item.product_id;
      const multiplier = soldProd?.linked_product_id
        ? Math.max(1, Number(soldProd.linked_deduct_qty) || 1)
        : 1;
      soldByMaster.set(
        masterId,
        (soldByMaster.get(masterId) || 0) + (Number(item.quantity) || 0) * multiplier
      );
    });
  });

  const demand = new Map();
  soldByMaster.forEach((qty, id) => demand.set(id, qty / demandDays));
  return demand;
}

/**
 * คำนวณจุดสั่งซื้อและจำนวนแนะนำให้สั่งของสินค้าหลักทุกตัว
 * - สต็อกสำรอง (safety_stock) ถ้าไม่ได้ตั้ง ใช้จุดเตือนสต็อกต่ำ (min_stock)
 * - จำนวนแนะนำ = เติมให้ถึงระดับ ROP + ยอดขายช่วงรอสินค้าอีก 1 รอบ เมื่อสต็อก <= ROP
 */
export function calculateReorderSuggestions(products = [], orders = [], options = {}) {
  const demandDays = options.demandDays || REORDER_DEFAULTS.demandDays;
  const demand = calculateDailyDemand(orders, products, demandDays, options.now || new Date());

  return products
    .filter((p) => !p.linked_product_id)
    .map((p) => {
      const dailyDemand = demand.get(p.id) || 0;
      const leadTimeDays = Math.max(
        0,
        Number(p.lead_time_days ?? REORDER_DEFAULTS.leadTimeDays) || 0
      );
      const safetyStock = Math.max(
        0,
        Number(p.safety_stock ?? p.min_stock ?? 0) || 0
      );
      const stock = Number(p.stock) || 0;
      const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + safetyStock);
      const targetLevel = reorderPoint + Math.ceil(dailyDemand * leadTimeDays);
      const needsReorder = stock <= reorderPoint;
      const suggestedQty = needsReorder ? Math.max(1, Math.ceil(targetLevel - stock)) : 0;
      const daysOfStock = dailyDemand > 0 ? stock / dailyDemand : Infinity;

      let status = 'ok';
      if (needsReorder) status = 'reorder';
      else if (stock <= reorderPoint * 1.25) status = 'near';

      return {
        product: p,
        dailyDemand,
        leadTimeDays,
        safetyStock,
        stock,
        reorderPoint,
        suggestedQty,
        daysOfStock,
        status,
      };
    })
    .sort((a, b) => {
      const rank = { reorder: 0, near: 1, ok: 2 };
      return rank[a.status] - rank[b.status] || a.daysOfStock - b.daysOfStock;
    });
}
