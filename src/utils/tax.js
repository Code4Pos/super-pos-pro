/**
 * ภาษีมูลค่าเพิ่ม และเอกสารภาษีตามมาตรฐานกรมสรรพากร (Module 6)
 */
export const VAT_RATE = 0.07;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * แยกมูลค่าก่อนภาษีและภาษีขายของบิล
 * - บิลที่มี tax_amount (VAT ใน/VAT นอก) ใช้ยอดภาษีจากบิล
 * - บิลที่ขายแบบไม่แยก VAT ถือว่าราคาขายรวม VAT แล้ว (ร้านจดทะเบียน VAT) ภาษี = ยอด x 7/107
 */
export function calculateOrderVat(order) {
  const total = round2(order?.grand_total);
  const taxAmount = round2(order?.tax_amount);
  const vat = taxAmount > 0 ? taxAmount : round2((total * VAT_RATE) / (1 + VAT_RATE));
  return { base: round2(total - vat), vat, total };
}

// เลขที่ใบกำกับภาษีเต็มรูปแบบเรียงต่อเนื่องรายเดือน เช่น TX202611-0001
export function getTaxInvoicePrefix(date = new Date()) {
  const d = new Date(date);
  return `TX${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
}

export function getNextTaxInvoiceNumber(existingNumbers = [], date = new Date()) {
  const prefix = getTaxInvoicePrefix(date);
  const maxSeq = existingNumbers
    .filter((n) => String(n || '').startsWith(prefix))
    .map((n) => Number(String(n).slice(prefix.length)) || 0)
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

const THAI_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// อ่านจำนวนเต็มไม่เกิน 6 หลักเป็นภาษาไทย (สิบเอ็ด, ยี่สิบ ฯลฯ)
// hasHigherPart = มีหลักล้านนำหน้า ทำให้เลข 1 ในหลักหน่วยอ่านว่า "เอ็ด" (เช่น หนึ่งล้านเอ็ด)
function readUnderMillion(num, hasHigherPart = false) {
  const digits = String(num).split('').map(Number);
  const len = digits.length;
  return digits
    .map((d, i) => {
      const pos = len - i - 1;
      if (d === 0) return '';
      if (pos === 0 && d === 1 && (len > 1 || hasHigherPart)) return 'เอ็ด';
      if (pos === 1 && d === 1) return 'สิบ';
      if (pos === 1 && d === 2) return 'ยี่สิบ';
      return THAI_DIGITS[d] + THAI_POSITIONS[pos];
    })
    .join('');
}

function readInteger(num) {
  if (num === 0) return 'ศูนย์';
  const millions = Math.floor(num / 1000000);
  const rest = num % 1000000;
  const head = millions > 0 ? `${readInteger(millions)}ล้าน` : '';
  return head + (rest > 0 ? readUnderMillion(rest, millions > 0) : '');
}

/**
 * แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย เช่น 1,250.50 = "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"
 */
export function bahtText(amount) {
  const value = round2(Math.abs(Number(amount) || 0));
  const baht = Math.floor(value);
  const satang = Math.round((value - baht) * 100);
  const bahtPart = `${readInteger(baht)}บาท`;
  if (satang === 0) return `${bahtPart}ถ้วน`;
  const satangPart = `${readUnderMillion(satang)}สตางค์`;
  return baht > 0 ? `${bahtPart}${satangPart}` : satangPart;
}

/**
 * รายงานภาษีขายประจำเดือน (สำหรับยื่น ภ.พ.30)
 * month รูปแบบ "YYYY-MM" / ใช้เฉพาะบิลที่ไม่ถูกยกเลิก
 */
export function buildSalesTaxReport(orders = [], taxInvoices = [], month) {
  const inMonth = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
  };
  const invoicedOrderNumbers = new Set(
    taxInvoices.filter((t) => t.status !== 'cancelled').map((t) => t.order_number)
  );
  const voidedOrderNumbers = new Set(
    orders.filter((o) => o.status === 'voided').map((o) => o.order_number)
  );

  const fullInvoices = taxInvoices
    .filter((t) => t.status !== 'cancelled' && inMonth(t.created_at))
    .sort((a, b) => String(a.invoice_number).localeCompare(String(b.invoice_number)))
    .map((t) => ({ ...t, orderVoided: voidedOrderNumbers.has(t.order_number) }));

  // บิลขายปลีกที่ไม่ได้ออกใบกำกับเต็มรูป = ใบกำกับภาษีอย่างย่อ
  const abbreviated = orders.filter(
    (o) => o.status !== 'voided' && inMonth(o.created_at) && !invoicedOrderNumbers.has(o.order_number)
  );

  const sum = (rows, pick) => round2(rows.reduce((s, r) => s + pick(r), 0));
  const abbreviatedVat = abbreviated.map(calculateOrderVat);
  const fullTotals = {
    count: fullInvoices.length,
    base: sum(fullInvoices, (t) => Number(t.base_amount) || 0),
    vat: sum(fullInvoices, (t) => Number(t.vat_amount) || 0),
    total: sum(fullInvoices, (t) => Number(t.total_amount) || 0),
  };
  const abbreviatedTotals = {
    count: abbreviated.length,
    base: sum(abbreviatedVat, (v) => v.base),
    vat: sum(abbreviatedVat, (v) => v.vat),
    total: sum(abbreviatedVat, (v) => v.total),
  };

  return {
    fullInvoices,
    fullTotals,
    abbreviatedTotals,
    grandTotals: {
      base: round2(fullTotals.base + abbreviatedTotals.base),
      vat: round2(fullTotals.vat + abbreviatedTotals.vat),
      total: round2(fullTotals.total + abbreviatedTotals.total),
    },
  };
}
