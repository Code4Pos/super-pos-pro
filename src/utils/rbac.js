/**
 * สิทธิ์ผู้ใช้งานตามบทบาท (RBAC) ตามสเปกหัวข้อ 2
 * หมายเหตุ: เป็นการจำกัดสิทธิ์ในตัวแอป (ซ่อนเมนู/ปุ่ม) ไม่ใช่ความปลอดภัยระดับฐานข้อมูล
 */

const SETTINGS_TABS = ['settings-shop', 'settings-tax', 'settings-payment', 'settings-printer', 'settings-users'];

export const ROLES = {
  admin: {
    label: 'ผู้ดูแลระบบ',
    description: 'จัดการผู้ใช้ สิทธิ์ และการตั้งค่าทั้งหมด',
    tabs: '*',
    permissions: '*',
  },
  manager: {
    label: 'ผู้จัดการ / หัวหน้าแคชเชียร์',
    description: 'ยกเลิกบิล อนุมัติปรับสต็อก อนุมัติใบนำเข้า เปิดลิ้นชักฉุกเฉิน',
    tabs: [
      'pos', 'orders', 'dashboard', 'sales-tax', 'customers', 'receivables',
      'inventory', 'stock-import', 'stock-ledger', 'stock-count', 'lots', 'reorder', 'wholesale-pricing', 'special-pricing',
      'suppliers', 'settings-printer', 'settings-payment',
    ],
    permissions: [
      'void_order', 'adjust_stock', 'approve_stock', 'approve_import', 'open_drawer',
      'issue_tax_invoice', 'receive_payment', 'billing_note', 'credit_sale',
    ],
  },
  cashier: {
    label: 'แคชเชียร์',
    description: 'ขายปลีก พักบิล รับชำระเงิน พิมพ์สลิป',
    tabs: ['pos', 'orders', 'settings-printer'],
    permissions: [],
  },
  wholesale: {
    label: 'พนักงานขายส่ง',
    description: 'ขายให้ลูกค้า B2B ขายเชื่อ ออกใบกำกับภาษีเต็มรูป',
    tabs: ['pos', 'orders', 'customers', 'settings-printer'],
    permissions: ['issue_tax_invoice', 'credit_sale'],
  },
  warehouse: {
    label: 'เจ้าหน้าที่คลังสินค้า',
    description: 'รับสินค้าเข้า ตรวจนับ ปรับสต็อก (ลด/กำหนดยอดต้องมีผู้อนุมัติ)',
    tabs: ['inventory', 'stock-import', 'stock-ledger', 'stock-count', 'lots', 'reorder', 'suppliers'],
    permissions: ['adjust_stock'],
  },
  accountant: {
    label: 'ฝ่ายบัญชี',
    description: 'ลูกหนี้ ใบวางบิล รับชำระหนี้ ใบกำกับภาษี รายงานภาษีขาย',
    tabs: ['orders', 'dashboard', 'sales-tax', 'customers', 'receivables', 'settings-tax'],
    permissions: ['issue_tax_invoice', 'receive_payment', 'billing_note'],
  },
};

export const PERMISSION_LABELS = {
  void_order: 'ยกเลิกบิล',
  adjust_stock: 'ปรับสต็อก',
  approve_stock: 'อนุมัติลด/กำหนดยอดสต็อก',
  approve_import: 'อนุมัติ/รับสินค้าในใบนำเข้า',
  open_drawer: 'เปิดลิ้นชักฉุกเฉิน',
  issue_tax_invoice: 'ออกใบกำกับภาษีเต็มรูป',
  receive_payment: 'รับชำระหนี้',
  billing_note: 'ออกใบวางบิล',
  credit_sale: 'ขายเชื่อ',
};

export function canAccessTab(user, tab) {
  if (!user) return true; // ยังไม่ได้ตั้งผู้ใช้ = เปิดใช้งานทุกเมนู (โหมดเดิม)
  const role = ROLES[user.role];
  if (!role) return false;
  return role.tabs === '*' || role.tabs.includes(tab);
}

export function hasPermission(user, permission) {
  if (!user) return true;
  const role = ROLES[user.role];
  if (!role) return false;
  return role.permissions === '*' || role.permissions.includes(permission);
}

export function getAllowedTabs(user, allTabs = []) {
  return allTabs.filter((tab) => canAccessTab(user, tab));
}

export { SETTINGS_TABS };

/**
 * SHA-256 (เขียนเองเพื่อใช้ได้ทั้ง https และ http ในวง LAN ที่ไม่มี crypto.subtle)
 */
export function sha256(message) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = Array.from(new TextEncoder().encode(String(message)));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i -= 1) bytes.push(Math.floor(bitLength / 2 ** (i * 8)) & 0xff);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export function hashPin(pin, salt) {
  return sha256(`${salt}:${pin}`);
}

export function generateSalt() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
