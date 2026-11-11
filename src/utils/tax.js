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

// เลขที่เอกสารภาษีเรียงต่อเนื่องรายเดือน: TX = ใบกำกับภาษี, CN = ใบลดหนี้, DN = ใบเพิ่มหนี้ เช่น TX202611-0001
export function getTaxInvoicePrefix(date = new Date(), code = 'TX') {
  const d = new Date(date);
  return `${code}${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
}

export function getNextTaxInvoiceNumber(existingNumbers = [], date = new Date(), code = 'TX') {
  const prefix = getTaxInvoicePrefix(date, code);
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
export function buildSalesTaxReport(orders = [], taxInvoices = [], month, taxNotes = []) {
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

  // ใบลดหนี้ลดภาษีขาย / ใบเพิ่มหนี้เพิ่มภาษีขาย ในเดือนที่ออกเอกสาร
  const notes = taxNotes
    .filter((n) => n.status !== 'cancelled' && inMonth(n.created_at))
    .sort((a, b) => String(a.note_number).localeCompare(String(b.note_number)));
  const noteTotals = (type) => {
    const rows = notes.filter((n) => n.note_type === type);
    return {
      count: rows.length,
      base: sum(rows, (n) => Number(n.base_amount) || 0),
      vat: sum(rows, (n) => Number(n.vat_amount) || 0),
      total: sum(rows, (n) => Number(n.total_amount) || 0),
    };
  };
  const creditTotals = noteTotals('credit');
  const debitTotals = noteTotals('debit');
  const net = (key) =>
    round2(fullTotals[key] + abbreviatedTotals[key] - creditTotals[key] + debitTotals[key]);

  return {
    fullInvoices,
    fullTotals,
    abbreviatedTotals,
    notes,
    creditTotals,
    debitTotals,
    grandTotals: { base: net('base'), vat: net('vat'), total: net('total') },
  };
}

export const CREDIT_NOTE_REASONS = [
  'ลูกค้าคืนสินค้า',
  'สินค้าชำรุดเสียหาย',
  'ลดราคาสินค้าหลังขาย',
  'ยกเลิกการขาย',
  'คิดราคาสูงกว่าที่ตกลง',
];

export const DEBIT_NOTE_REASONS = ['คิดราคาต่ำกว่าที่ตกลง', 'ส่งสินค้าเกินจำนวน', 'ปรับราคาเพิ่มตามสัญญา'];

// สัดส่วนภาษีของใบกำกับต้นทาง (ใช้แยก VAT ของยอดลด/เพิ่มหนี้ให้สอดคล้องกับใบเดิม)
function vatRatioOf(invoice) {
  const total = Number(invoice?.total_amount) || 0;
  return total > 0 ? (Number(invoice.vat_amount) || 0) / total : VAT_RATE / (1 + VAT_RATE);
}

/**
 * จำนวนที่ลดหนี้ไปแล้วต่อรายการ (index ในใบกำกับ) และยอดลดหนี้สะสมของใบกำกับ
 */
export function getCreditedSummary(invoice, notes = []) {
  const creditedQty = {};
  let creditedTotal = 0;
  notes
    .filter((n) => n.note_type === 'credit' && n.status !== 'cancelled' && n.invoice_number === invoice?.invoice_number)
    .forEach((n) => {
      creditedTotal += Number(n.total_amount) || 0;
      (n.items || []).forEach((it) => {
        creditedQty[it.index] = (creditedQty[it.index] || 0) + (Number(it.quantity) || 0);
      });
    });
  return { creditedQty, creditedTotal: round2(creditedTotal) };
}

/**
 * คำนวณใบลดหนี้จากจำนวนสินค้าที่คืน/ลดราคา
 * ยอดจะปรับตามส่วนลดท้ายบิลของใบกำกับเดิม (สัดส่วนยอดสุทธิ / ยอดรวมรายการ)
 * lines: [{ index, quantity }] และ extraAmount = ยอดลดราคาเพิ่มเติม (รวม VAT) ที่ไม่ผูกกับรายการสินค้า
 */
export function calculateCreditNote(invoice, lines = [], extraAmount = 0) {
  const items = invoice?.items || [];
  const itemsGross = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const scale = itemsGross > 0 ? (Number(invoice.total_amount) || 0) / itemsGross : 1;

  const noteItems = lines
    .filter((l) => Number(l.quantity) > 0 && items[l.index])
    .map((l) => {
      const src = items[l.index];
      const qty = Number(l.quantity) || 0;
      return {
        index: l.index,
        product_id: src.product_id || null,
        sku: src.sku || '',
        product_name: src.product_name,
        unit: src.unit || '',
        quantity: qty,
        unit_price: Number(src.unit_price) || 0,
        subtotal: round2(qty * (Number(src.unit_price) || 0) * scale),
      };
    });

  const total = round2(noteItems.reduce((s, it) => s + it.subtotal, 0) + (Number(extraAmount) || 0));
  const vat = round2(total * vatRatioOf(invoice));
  return { items: noteItems, base: round2(total - vat), vat, total };
}

/**
 * คำนวณใบเพิ่มหนี้จากยอดที่ต้องเรียกเก็บเพิ่ม (รวม VAT)
 */
export function calculateDebitNote(invoice, amount) {
  const total = round2(Math.max(0, Number(amount) || 0));
  const vat = round2(total * vatRatioOf(invoice));
  return { base: round2(total - vat), vat, total };
}
