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

// ช่วงอายุลูกหนี้ (Aging Buckets) นับจากวันที่ออกบิล
export const AGING_BUCKETS = [
  { id: 'd0_30', label: '0-30 วัน', min: 0, max: 30 },
  { id: 'd31_60', label: '31-60 วัน', min: 31, max: 60 },
  { id: 'd61_90', label: '61-90 วัน', min: 61, max: 90 },
  { id: 'd90_plus', label: 'เกิน 90 วัน', min: 91, max: Infinity },
];

export function getAgingBucketId(billDate, now = new Date()) {
  const ageDays = Math.max(0, Math.floor((now - new Date(billDate)) / 86400000));
  return AGING_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max).id;
}

/**
 * รายงานวิเคราะห์อายุลูกหนี้ (Aging Report) แยกตามลูกค้า
 * ใช้ยอดคงค้างของแต่ละบิลหลังตัดชำระแบบ FIFO แล้ว
 */
export function calculateAgingReport(customers = [], orders = [], customerPayments = [], now = new Date()) {
  const emptyBuckets = () => Object.fromEntries(AGING_BUCKETS.map((b) => [b.id, 0]));
  const round2 = (n) => Math.round(n * 100) / 100;
  const totals = { ...emptyBuckets(), total: 0, overdue: 0 };

  const rows = customers
    .map((customer) => {
      const credit = calculateCustomerCredit(customer, orders, customerPayments, now);
      const buckets = emptyBuckets();
      credit.openBills.forEach((bill) => {
        const bucketId = getAgingBucketId(bill.order.created_at, now);
        buckets[bucketId] = round2(buckets[bucketId] + bill.remaining);
      });
      return { customer, credit, buckets, total: credit.outstanding, overdue: credit.overdue };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  rows.forEach((row) => {
    AGING_BUCKETS.forEach((b) => {
      totals[b.id] = round2(totals[b.id] + row.buckets[b.id]);
    });
    totals.total = round2(totals.total + row.total);
    totals.overdue = round2(totals.overdue + row.overdue);
  });

  return { rows, totals };
}

/**
 * สถานะใบวางบิล: ชำระครบเมื่อทุกบิลในใบวางบิลไม่มียอดค้างแล้ว
 */
export function getBillingNoteStatus(note, customer, orders = [], customerPayments = [], now = new Date()) {
  if (!customer) return { paid: false, remaining: Number(note.total) || 0 };
  const credit = calculateCustomerCredit(customer, orders, customerPayments, now);
  const noteOrderIds = new Set(note.order_ids || []);
  const remaining = credit.openBills
    .filter((b) => noteOrderIds.has(b.order.id))
    .reduce((sum, b) => sum + b.remaining, 0);
  return { paid: remaining <= 0.001, remaining: Math.round(remaining * 100) / 100 };
}

/**
 * จับคู่ยอดรับชำระแต่ละครั้งกับบิลเครดิตที่ถูกตัดชำระ (FIFO: รับชำระก่อน ตัดบิลเก่าก่อน)
 * คืนค่า Map: paymentId => [{ order_number, amount }]
 */
export function allocatePaymentsToBills(customer, orders = [], customerPayments = []) {
  const allocation = new Map();
  if (!customer) return allocation;
  const bills = orders
    .filter((o) => o.customer_id === customer.id)
    .map((o) => ({ order_number: o.order_number, created_at: o.created_at, left: getOrderCreditAmount(o) }))
    .filter((b) => b.left > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const payments = customerPayments
    .filter((p) => p.customer_id === customer.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  let billIdx = 0;
  payments.forEach((p) => {
    let remaining = Number(p.amount) || 0;
    const parts = [];
    while (remaining > 0.001 && billIdx < bills.length) {
      const bill = bills[billIdx];
      const used = Math.min(bill.left, remaining);
      parts.push({ order_number: bill.order_number, amount: Math.round(used * 100) / 100 });
      bill.left -= used;
      remaining -= used;
      if (bill.left <= 0.001) billIdx += 1;
    }
    allocation.set(p.id, parts);
  });
  return allocation;
}
