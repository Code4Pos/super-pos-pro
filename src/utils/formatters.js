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
 * คำนวณราคาต่อหน่วยของสินค้าตามโหมดการขาย จำนวนในตะกร้า
 * รองรับ:
 * 1. ราคาขายปลีกพื้นฐาน
 * 2. ราคาขายส่งพื้นฐานในตัวสินค้า
 * 3. ระบบราคาขายส่งหลายระดับ (สูงสุด 10 ขั้น ทั้งแบบเดี่ยวและแบบกลุ่ม)
 * 4. ระบบราคาพิเศษ (สูงสุด 10 ขั้น ทั้งแบบเดี่ยวและแบบกลุ่ม)
 * กฎสำคัญ: ถ้าราคามันทับซ้อนกันหลายอัน ให้เลือกราคาที่ถูกที่สุดเสมอ!
 */
export function calculateEffectiveUnitPrice(
  product,
  quantity,
  pricingMode = 'auto',
  wholesaleRules = [],
  specialRules = [],
  cart = []
) {
  const retailPrice = Number(product?.retail_price) || 0;
  const isWholesaleEnabled = product?.is_wholesale_enabled !== false;
  const basicWholesalePrice = isWholesaleEnabled
    ? Number(product?.wholesale_price) || retailPrice
    : retailPrice;
  const minWholesaleQty = Number(product?.wholesale_min_qty) || 999999;

  const candidates = [
    {
      price: retailPrice,
      source: 'retail',
      label: 'ราคาปลีก',
    },
  ];

  const nextUnlockDiffs = [];

  // 1. ตรวจสอบราคาขายส่งพื้นฐานของตัวสินค้า
  if (pricingMode !== 'retail' && isWholesaleEnabled && basicWholesalePrice > 0) {
    if (pricingMode === 'wholesale' || quantity >= minWholesaleQty) {
      candidates.push({
        price: basicWholesalePrice,
        source: 'wholesale',
        label: 'ราคาส่ง',
      });
    } else if (basicWholesalePrice < retailPrice && quantity < minWholesaleQty) {
      nextUnlockDiffs.push(minWholesaleQty - quantity);
    }
  }

  // ฟังก์ชันช่วยคำนวณจำนวนรวมในตะกร้ากรณีเป็นกฎแบบกลุ่ม (group)
  const getEffectiveRuleQty = (rule) => {
    if (rule.type === 'group' && Array.isArray(cart) && cart.length > 0) {
      const idSet = new Set(rule.product_ids || []);
      const groupSum = cart.reduce((sum, item) => {
        const pid = item.product?.id || item.product_id;
        return idSet.has(pid) ? sum + (Number(item.quantity) || 0) : sum;
      }, 0);
      return Math.max(quantity, groupSum);
    }
    return quantity;
  };

  // 2. ตรวจสอบระบบราคาขายส่งหลายระดับ (สูงสุด 10 ขั้น รองรับแบบเดี่ยวและแบบกลุ่ม)
  if (pricingMode !== 'retail' && Array.isArray(wholesaleRules)) {
    wholesaleRules.forEach((rule) => {
      if (
        !rule ||
        rule.is_active === false ||
        !Array.isArray(rule.product_ids) ||
        !rule.product_ids.includes(product?.id)
      ) {
        return;
      }
      const effQty = getEffectiveRuleQty(rule);
      (rule.tiers || []).forEach((tier, idx) => {
        const tierMin = Math.max(1, Number(tier.min_qty) || 1);
        const tierPrice = Number(tier.price) || 0;
        if (tierPrice <= 0) return;
        if (effQty >= tierMin || (pricingMode === 'wholesale' && idx === 0)) {
          candidates.push({
            price: tierPrice,
            source: 'multi_wholesale',
            label: `ราคาส่งขั้นที่ ${tier.level || idx + 1}`,
          });
        } else if (effQty < tierMin) {
          nextUnlockDiffs.push(tierMin - effQty);
        }
      });
    });
  }

  // 3. ตรวจสอบระบบราคาพิเศษ (สูงสุด 10 ขั้น รองรับแบบเดี่ยวและแบบกลุ่ม)
  if (Array.isArray(specialRules)) {
    specialRules.forEach((rule) => {
      if (
        !rule ||
        rule.is_active === false ||
        !Array.isArray(rule.product_ids) ||
        !rule.product_ids.includes(product?.id)
      ) {
        return;
      }
      const effQty = getEffectiveRuleQty(rule);
      (rule.tiers || []).forEach((tier, idx) => {
        const tierMin = Math.max(1, Number(tier.min_qty) || 1);
        const tierPrice = Number(tier.price) || 0;
        if (tierPrice <= 0) return;
        if (effQty >= tierMin) {
          candidates.push({
            price: tierPrice,
            source: 'special',
            label: `ราคาพิเศษขั้นที่ ${tier.level || idx + 1}`,
          });
        } else if (effQty < tierMin) {
          nextUnlockDiffs.push(tierMin - effQty);
        }
      });
    });
  }

  // กฎสำคัญ: ถ้าราคามันทับซ้อนหลายอัน ให้เลือกราคาที่ถูกที่สุดเสมอ!
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].price < best.price) {
      best = candidates[i];
    }
  }

  const isDiscounted = best.price < retailPrice && best.source !== 'retail';
  const minDiff =
    nextUnlockDiffs.length > 0 ? Math.min(...nextUnlockDiffs) : 0;

  return {
    unitPrice: best.price,
    isWholesale: isDiscounted,
    priceSource: best.source,
    priceLabel: best.label,
    savingsPerUnit: Math.max(0, retailPrice - best.price),
    qtyToUnlockWholesale: isDiscounted ? 0 : Math.max(0, minDiff),
  };
}
