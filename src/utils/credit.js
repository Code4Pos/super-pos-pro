import { getOrderPayments } from './payments';

/**
 * ข้อมูลลูกค้า B2B (นิติบุคคล) และระบบเครดิต
 * ยอดค้างชำระ = ยอดขายเชื่อ (ช่องทาง credit ในบิลที่ไม่ถูกยกเลิก) - ยอดรับชำระหนี้
 */
export const B2B_CUSTOMER_DEFAULTS = {
  tax_id: '',
  branch_number: '00000', // 00000 = สำนักงานใหญ่
  credit_limit: 0, // 0 = ไม่จำกัดวงเงิน
  credit_term_days: 0,
  is_blocked: false,
};

export const CREDIT_TERM_OPTIONS = [0, 7, 15, 30, 45, 60, 90];

/**
 * ปรับข้อมูล B2B ให้เป็นชนิดข้อมูลที่ถูกต้อง
 */
export function normalizeB2BFields(source = {}) {
  return {
    tax_id: String(source.tax_id || '').replace(/\D/g, '').slice(0, 13),
    branch_number:
      String(source.branch_number || '').replace(/\D/g, '').padStart(5, '0').slice(-5) ||
      '00000',
    credit_limit: Math.max(0, Number(source.credit_limit) || 0),
    credit_term_days: Math.max(0, Math.floor(Number(source.credit_term_days) || 0)),
    is_blocked: Boolean(source.is_blocked),
  };
}

/**
 * ตรวจเลขประจำตัวผู้เสียภาษี 13 หลัก (หลักสุดท้ายเป็น Check Digit ตามสูตรกรมสรรพากร)
 */
export function isValidThaiTaxId(rawTaxId) {
  const digits = String(rawTaxId || '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (13 - i);
  }
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}

export function formatBranchLabel(branchNumber) {
  const branch = String(branchNumber || '00000');
  return branch === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${branch}`;
}

// ยอดขายเชื่อของบิล (รองรับบิลแบ่งจ่ายที่มีบางส่วนเป็นเครดิต)
export function getOrderCreditAmount(order) {
  if (!order || order.status === 'voided') return 0;
  return getOrderPayments(order)
    .filter((p) => p.method === 'credit')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

// วันครบกำหนดชำระของบิลเครดิต
export function getCreditDueDate(order, creditTermDays = 0) {
  if (order?.credit_due_date) return new Date(order.credit_due_date);
  const due = new Date(order?.created_at || Date.now());
  due.setDate(due.getDate() + (Number(creditTermDays) || 0));
  return due;
}

/**
 * สรุปสถานะเครดิตของลูกค้า
 * ตัดชำระแบบ FIFO: ยอดรับชำระจะหักบิลเครดิตที่เก่าที่สุดก่อน เพื่อหายอดเกินกำหนดชำระ
 */
export function calculateCustomerCredit(customer, orders = [], customerPayments = [], now = new Date()) {
  const round2 = (n) => Math.round(n * 100) / 100;
  if (!customer) {
    return { creditSales: 0, paid: 0, outstanding: 0, available: Infinity, overdue: 0, openBills: [] };
  }

  const creditBills = orders
    .filter((o) => o.customer_id === customer.id)
    .map((o) => ({
      order: o,
      amount: getOrderCreditAmount(o),
      dueDate: getCreditDueDate(o, customer.credit_term_days),
    }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => new Date(a.order.created_at) - new Date(b.order.created_at));

  const creditSales = round2(creditBills.reduce((sum, b) => sum + b.amount, 0));
  const paid = round2(
    customerPayments
      .filter((p) => p.customer_id === customer.id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );

  let paymentPool = paid;
  const openBills = [];
  creditBills.forEach((bill) => {
    const settled = Math.min(bill.amount, paymentPool);
    paymentPool -= settled;
    const remaining = round2(bill.amount - settled);
    if (remaining > 0) openBills.push({ ...bill, remaining });
  });

  const outstanding = round2(Math.max(0, creditSales - paid));
  const overdue = round2(
    openBills.filter((b) => b.dueDate < now).reduce((sum, b) => sum + b.remaining, 0)
  );
  const limit = Number(customer.credit_limit) || 0;

  return {
    creditSales,
    paid,
    outstanding,
    available: limit > 0 ? round2(Math.max(0, limit - outstanding)) : Infinity,
    overdue,
    openBills,
  };
}

/**
 * ตรวจสอบก่อนขายเชื่อ (Credit Limit Check)
 * คืนค่า { ok, message }
 */
export function checkCreditSale(customer, creditAmount, creditSummary) {
  if (!(creditAmount > 0)) return { ok: true, message: '' };
  if (!customer) {
    return { ok: false, message: 'กรุณาเลือกลูกค้าก่อนขายเชื่อ' };
  }
  if (customer.is_blocked) {
    return { ok: false, message: `ลูกค้า "${customer.name}" ถูกระงับการขายเชื่อ` };
  }
  const limit = Number(customer.credit_limit) || 0;
  if (limit > 0 && creditSummary.outstanding + creditAmount > limit + 0.001) {
    return {
      ok: false,
      message: `เกินวงเงินเครดิต: ใช้ได้อีก ${creditSummary.available.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
      })} บาท`,
    };
  }
  return { ok: true, message: '' };
}
