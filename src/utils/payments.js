/**
 * วิธีชำระเงินที่ระบบรองรับ และฟังก์ชันช่วยสำหรับการแบ่งจ่ายหลายช่องทาง (Split Payment)
 */
export const PAYMENT_METHOD_LABELS = {
  cash: 'เงินสด',
  promptpay: 'QR PromptPay',
  transfer: 'โอนธนาคาร',
  credit: 'เครดิต/ค้างชำระ',
  split: 'แบ่งจ่ายหลายช่องทาง',
};

// วิธีชำระที่ใช้เป็นรายการย่อยในการแบ่งจ่ายได้
export const SPLIT_PAYMENT_METHODS = ['cash', 'promptpay', 'transfer', 'credit'];

/**
 * คืนรายการชำระเงินของบิลเป็นรูปแบบเดียวกันเสมอ [{ method, amount }]
 * บิลเก่าที่ไม่มี payments จะใช้ payment_method และยอดสุทธิของบิลแทน
 */
export function getOrderPayments(order) {
  if (!order) return [];
  if (Array.isArray(order.payments) && order.payments.length > 0) {
    return order.payments;
  }
  return [
    {
      method: order.payment_method || 'cash',
      amount: Number(order.grand_total) || 0,
    },
  ];
}

/**
 * ข้อความสรุปวิธีชำระเงินของบิล เช่น "เงินสด ฿200.00 + QR PromptPay ฿150.00"
 */
export function describeOrderPayments(order, formatAmount = (n) => String(n)) {
  const payments = getOrderPayments(order);
  if (payments.length === 1) {
    return PAYMENT_METHOD_LABELS[payments[0].method] || payments[0].method;
  }
  return payments
    .map((p) => `${PAYMENT_METHOD_LABELS[p.method] || p.method} ${formatAmount(p.amount)}`)
    .join(' + ');
}

/**
 * ตรวจและสรุปยอดการแบ่งจ่าย
 * - ยอดรวมทุกช่องทางต้องไม่น้อยกว่ายอดสุทธิ
 * - เงินทอนได้จากเงินสดเท่านั้น (ช่องทางอื่นรวมกันต้องไม่เกินยอดสุทธิ)
 */
export function summarizeSplitPayments(payments = [], grandTotal = 0) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const total = round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const cashTotal = round2(
    payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );
  const nonCashTotal = round2(total - cashTotal);
  const remaining = round2(Math.max(0, grandTotal - total));
  const change = round2(Math.max(0, total - grandTotal));
  const nonCashExceeds = nonCashTotal > round2(grandTotal);

  return {
    total,
    cashTotal,
    nonCashTotal,
    remaining,
    change,
    nonCashExceeds,
    isComplete: total >= round2(grandTotal) && !nonCashExceeds,
  };
}
