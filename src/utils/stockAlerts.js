/**
 * จุดเตือนสต็อกต่ำของสินค้า
 * - สินค้าที่ตั้ง "สต็อกขั้นต่ำ" ไว้ ใช้ค่านั้น (0 = ไม่เตือน)
 * - ไม่ได้ตั้ง ใช้ค่าตั้งร้าน defaultMinStock (ตั้งค่า › การแจ้งเตือน & ค่าเริ่มต้น)
 * - สินค้าหมด (สต็อก 0 หรือติดลบ) นับเป็นใกล้หมดเสมอ
 */
export function getMinStock(product, defaultMinStock = 10) {
  const raw = product?.min_stock;
  if (raw === null || raw === undefined || raw === '') return Number(defaultMinStock) || 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number(defaultMinStock) || 0;
}

export function isLowStock(product, defaultMinStock = 10) {
  const stock = Number(product?.stock) || 0;
  if (stock <= 0) return true;
  const min = getMinStock(product, defaultMinStock);
  return min > 0 && stock <= min;
}

export function countLowStock(products = [], defaultMinStock = 10) {
  return products.reduce((count, p) => count + (isLowStock(p, defaultMinStock) ? 1 : 0), 0);
}
