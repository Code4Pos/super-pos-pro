/**
 * สร้างข้อมูล Thai QR PromptPay ตามมาตรฐาน EMVCo (ใช้กับแอปธนาคารไทยทุกแห่ง)
 * รองรับพร้อมเพย์ 3 แบบ: เบอร์มือถือ 10 หลัก, เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก, e-Wallet 15 หลัก
 */

const PROMPTPAY_AID = 'A000000677010111';

// ประกอบข้อมูลแต่ละช่องเป็นรูปแบบ ID(2) + ความยาว(2) + ค่า
function tlv(id, value) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

// CRC16-CCITT (Polynomial 0x1021, ค่าเริ่มต้น 0xFFFF) ตามที่มาตรฐาน EMVCo กำหนด
function crc16(text) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * ตรวจและแยกประเภทหมายเลขพร้อมเพย์
 * คืนค่า { type: 'phone' | 'tax_id' | 'ewallet', value } หรือ null ถ้ารูปแบบไม่ถูกต้อง
 */
export function parsePromptPayId(rawId) {
  const digits = String(rawId || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return { type: 'phone', value: digits };
  }
  if (digits.length === 13) {
    return { type: 'tax_id', value: digits };
  }
  if (digits.length === 15) {
    return { type: 'ewallet', value: digits };
  }
  return null;
}

/**
 * สร้างข้อความสำหรับ QR พร้อมเพย์แบบระบุยอดเงิน (Dynamic QR)
 * ถ้าไม่ระบุยอดเงิน (amount <= 0) จะได้ QR แบบลูกค้ากรอกยอดเอง (Static QR)
 */
export function buildPromptPayPayload(rawId, amount = 0) {
  const parsed = parsePromptPayId(rawId);
  if (!parsed) return null;

  let accountField;
  if (parsed.type === 'phone') {
    // เบอร์มือถือ: ตัด 0 ด้านหน้าแล้วเติมรหัสประเทศ 66 รวมเป็น 13 หลัก (เช่น 0066812345678)
    accountField = tlv('01', `0066${parsed.value.slice(1)}`);
  } else if (parsed.type === 'tax_id') {
    accountField = tlv('02', parsed.value);
  } else {
    accountField = tlv('03', parsed.value);
  }

  const numericAmount = Math.round((Number(amount) || 0) * 100) / 100;
  const hasAmount = numericAmount > 0;

  const payload = [
    tlv('00', '01'),
    tlv('01', hasAmount ? '12' : '11'),
    tlv('29', tlv('00', PROMPTPAY_AID) + accountField),
    tlv('53', '764'), // สกุลเงินบาท (THB)
    hasAmount ? tlv('54', numericAmount.toFixed(2)) : '',
    tlv('58', 'TH'),
  ].join('');

  const withCrcHeader = `${payload}6304`;
  return withCrcHeader + crc16(withCrcHeader);
}

/**
 * ปิดบังหมายเลขพร้อมเพย์บางส่วนเพื่อแสดงบนหน้าจอ (เช่น 081-xxx-5678)
 */
export function maskPromptPayId(rawId) {
  const parsed = parsePromptPayId(rawId);
  if (!parsed) return '';
  const v = parsed.value;
  if (parsed.type === 'phone') return `${v.slice(0, 3)}-xxx-${v.slice(6)}`;
  return `${v.slice(0, 1)}-xxxx-xxxxx-${v.slice(-3)}`;
}
