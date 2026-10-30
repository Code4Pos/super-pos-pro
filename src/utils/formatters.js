/**
 * จัดรูปแบบตัวเลขเป็นสกุลเงินบาทไทย (฿)
 */
export function formatCurrency(amount, showDecimals = true) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: showDecimals ? (num % 1 === 0 ? 0 : 2) : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * จัดรูปแบบตัวเลขทั่วไปใส่ลูกน้ำ (,)
 */
export function formatNumber(num) {
  return new Intl.NumberFormat('th-TH').format(Number(num) || 0);
}

/**
 * จัดรูปแบบวันที่และเวลาภาษาไทยอ่านง่าย
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * คำนวณราคาต่อหน่วยของสินค้าตามโหมดการขายและจำนวนในตะกร้า
 * - pricingMode = 'auto': ถ้าซื้อถึงจำนวนขั้นต่ำ (wholesale_min_qty) จะได้ราคาส่งอัตโนมัติ
 * - pricingMode = 'wholesale': ได้ราคาส่งทันทีทุกจำนวน (เช่น ลูกค้ายี่ปั๊ว/ขายส่งยกบิล)
 * - pricingMode = 'retail': คิดราคาปลีกเสมอ
 */
export function calculateEffectiveUnitPrice(product, quantity, pricingMode = 'auto') {
  const retailPrice = Number(product.retail_price) || 0;
  const isWholesaleEnabled = product.is_wholesale_enabled !== false;
  const wholesalePrice = isWholesaleEnabled
    ? Number(product.wholesale_price) || retailPrice
    : retailPrice;
  const minWholesaleQty = Number(product.wholesale_min_qty) || 999999;

  if (!isWholesaleEnabled) {
    return {
      unitPrice: retailPrice,
      isWholesale: false,
      savingsPerUnit: 0,
      qtyToUnlockWholesale: 0,
    };
  }

  if (pricingMode === 'wholesale') {
    return {
      unitPrice: wholesalePrice,
      isWholesale: wholesalePrice < retailPrice,
      savingsPerUnit: Math.max(0, retailPrice - wholesalePrice),
      qtyToUnlockWholesale: 0,
    };
  }

  if (pricingMode === 'retail') {
    return {
      unitPrice: retailPrice,
      isWholesale: false,
      savingsPerUnit: 0,
      qtyToUnlockWholesale: Math.max(0, minWholesaleQty - quantity),
    };
  }

  // โหมด 'auto' (ค่าเริ่มต้น): ปลดล็อกราคาส่งเมื่อซื้อครบจำนวนขั้นต่ำ
  const qualifiesForWholesale = quantity >= minWholesaleQty && wholesalePrice < retailPrice;
  return {
    unitPrice: qualifiesForWholesale ? wholesalePrice : retailPrice,
    isWholesale: qualifiesForWholesale,
    savingsPerUnit: qualifiesForWholesale ? Math.max(0, retailPrice - wholesalePrice) : 0,
    qtyToUnlockWholesale: qualifiesForWholesale ? 0 : Math.max(0, minWholesaleQty - quantity),
  };
}

