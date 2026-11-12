import { formatCurrency, formatDateTime } from '../utils/formatters';
import { PAYMENT_METHOD_LABELS, getOrderPayments } from '../utils/payments';
import { calculateOrderVat, bahtText } from '../utils/tax';

function formatBranch(branch) {
  const b = String(branch || '00000');
  return b === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${b}`;
}

const PRINTER_SETTINGS_KEY = 'siampos_printer_settings_v2';
const SHOP_SETTINGS_KEY = 'siampos_shop_settings_v1';

// ค่าตั้งข้อมูลร้าน ภาษี และพร้อมเพย์ ที่ใช้ร่วมกันทุกเครื่อง (ซิงค์กับตาราง shop_settings บนฐานข้อมูล)
export const SHARED_SHOP_SETTING_KEYS = [
  'shopName',
  'shopAddress',
  'shopPhone',
  'footerText',
  'promptpayId',
  'vatRegistered',
  'shopTaxId',
  'shopBranch',
  'vatMode',
];

const DEFAULT_SHOP_SETTINGS = {
  shopName: 'สยามค้าปลีก-ส่ง (SiamPOS Pro)',
  shopAddress: 'ศูนย์รวมสินค้าอุปโภคบริโภค ราคาปลีก-ส่ง มาตรฐานครบวงจร',
  shopPhone: '02-123-4567',
  footerText: 'ขอบคุณที่อุดหนุน สินค้าซื้อแล้วรับเปลี่ยนคืนภายใน 7 วัน',
  promptpayId: '', // เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก สำหรับสร้าง QR พร้อมเพย์
  vatRegistered: false, // ร้านจดทะเบียนภาษีมูลค่าเพิ่ม (ออกใบกำกับภาษีได้)
  shopTaxId: '', // เลขประจำตัวผู้เสียภาษี 13 หลักของร้าน
  shopBranch: '00000', // รหัสสาขา (00000 = สำนักงานใหญ่)
  vatMode: 'no_vat', // 'no_vat' | 'vat_in' | 'vat_out'
};

// ค่าตั้งเฉพาะเครื่องนี้ (ชนิดเครื่องพิมพ์ ขนาดกระดาษ ลิ้นชักเก็บเงิน — เก็บใน localStorage ของแต่ละเครื่อง ไม่ซิงค์ข้ามเครื่อง)
const DEFAULT_DEVICE_PRINTER_SETTINGS = {
  paperSize: '80mm', // '58mm' | '80mm'
  connectionType: 'system', // 'system' | 'webusb' | 'webserial' | 'rawbt'
  baudRate: 115200, // 9600 | 115200
  autoPrint: false,
  performanceMode: true,
  systemPrinterReady: true,
  cashDrawerEnabled: false, // เปิดลิ้นชักเก็บเงินอัตโนมัติเมื่อรับเงินสด
  cashDrawerPin: '2', // ขาสัญญาณลิ้นชัก '2' (Pin 2) | '5' (Pin 5)
};

const DEFAULT_PRINTER_SETTINGS = {
  ...DEFAULT_DEVICE_PRINTER_SETTINGS,
  ...DEFAULT_SHOP_SETTINGS,
};

function pickSharedShopFields(source = {}) {
  const picked = {};
  SHARED_SHOP_SETTING_KEYS.forEach((key) => {
    if (source[key] !== undefined) picked[key] = source[key];
  });
  return picked;
}

const PAYMENT_LABELS = {
  ...PAYMENT_METHOD_LABELS,
  cash: 'เงินสด (Cash)',
  transfer: 'โอนเงินธนาคาร',
};

// ข้อความวิธีชำระเงินบนใบเสร็จ (บิลแบ่งจ่ายจะแสดงยอดแยกแต่ละช่องทาง)
function getPaymentLines(order) {
  return getOrderPayments(order).map((p) => ({
    label: PAYMENT_LABELS[p.method] || p.method,
    amount: Number(p.amount) || 0,
  }));
}

/**
 * คำสั่ง ESC/POS เปิดลิ้นชักเก็บเงิน: ESC p m t1 t2
 * m = 0 (Pin 2) หรือ 1 (Pin 5), t1/t2 = ระยะเวลาพัลส์เปิด/ปิด (หน่วย 2ms)
 */
function buildCashDrawerKickBytes(pin = '2') {
  return new Uint8Array([0x1b, 0x70, pin === '5' ? 0x01 : 0x00, 0x19, 0xfa]);
}

let activeUsbDevice = null;
let activeUsbEndpoint = null;
let activeSerialPort = null;
let statusListeners = new Set();
let currentPrinterStatus = 'ready'; // 'ready' (เขียว) | 'warning' (ส้ม) | 'error' (แดง)
let currentStatusMessage = 'พร้อมใช้งาน (System Print / Iframe)';

function notifyStatusChange(status, message) {
  currentPrinterStatus = status;
  currentStatusMessage = message;
  statusListeners.forEach((cb) => {
    try {
      cb({ status, message });
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * แปลง HTML5 Canvas เป็นชุดคำสั่ง ESC/POS GS v 0 (Monochrome Raster Bit Image)
 * แบ่งเป็น Band ย่อยละ 256 แถว เพื่อป้องกัน Buffer เต็มในเครื่องพิมพ์ความร้อนทุกรุ่น
 */
function canvasToEscPosGSv0(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const bytesPerRow = Math.ceil(width / 8);
  const maxBandHeight = 256;
  const chunks = [];

  // ESC @ (Initialize printer)
  chunks.push(0x1b, 0x40);

  for (let startY = 0; startY < height; startY += maxBandHeight) {
    const bandHeight = Math.min(maxBandHeight, height - startY);
    const xL = bytesPerRow % 256;
    const xH = Math.floor(bytesPerRow / 256);
    const yL = bandHeight % 256;
    const yH = Math.floor(bandHeight / 256);

    // GS v 0 m xL xH yL yH
    chunks.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let y = startY; y < startY + bandHeight; y++) {
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIdx * 8 + bit;
          if (x < width) {
            const pIdx = (y * width + x) * 4;
            const r = pixels[pIdx];
            const g = pixels[pIdx + 1];
            const b = pixels[pIdx + 2];
            const a = pixels[pIdx + 3];
            const lum = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 150) {
              byteVal |= 1 << (7 - bit);
            }
          }
        }
        chunks.push(byteVal);
      }
    }
  }

  // Feed 4 lines + Partial Cut (GS V A 16)
  chunks.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x10);
  return new Uint8Array(chunks);
}

/**
 * วาดใบเสร็จความร้อน หรือ ใบออร์เดอร์ ลงบน HTML5 Canvas เพื่อส่งพิมพ์แบบภาพคมชัดภาษาไทยไม่เพี้ยน 100%
 */
function renderSlipToCanvas(order, settings, mode = 'receipt') {
  const is58mm = settings.paperSize === '58mm';
  const canvasWidth = is58mm ? 384 : 576;
  const padding = is58mm ? 12 : 20;
  const contentWidth = canvasWidth - padding * 2;
  const baseFontSize = is58mm ? 18 : 22;
  const smallFontSize = is58mm ? 15 : 18;
  const titleFontSize = is58mm ? 22 : 28;
  const lineHeight = is58mm ? 26 : 32;

  const items = order.items || [];
  const estimatedHeight = 480 + items.length * (lineHeight * 2.4);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = estimatedHeight;
  const ctx = tempCanvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, estimatedHeight);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = 16;

  const drawCentered = (text, font) => {
    ctx.font = font;
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(text, Math.max(padding, (canvasWidth - textWidth) / 2), y);
    y += lineHeight + 4;
  };

  const drawLeftRight = (left, right, font = `${baseFontSize}px Prompt, sans-serif`) => {
    ctx.font = font;
    ctx.fillText(left, padding, y);
    const rWidth = ctx.measureText(right).width;
    ctx.fillText(right, canvasWidth - padding - rWidth, y);
    y += lineHeight;
  };

  const drawDashedDivider = () => {
    y += 4;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvasWidth - padding, y);
    ctx.stroke();
    ctx.restore();
    y += 10;
  };

  if (mode === 'order') {
    // ================= ใบออร์เดอร์ / ใบจัดสินค้า (มีช่องเช็คลิสต์ ไม่แสดงราคา) =================
    drawCentered('ใบออร์เดอร์ / ใบจัดสินค้า', `bold ${titleFontSize}px Prompt, sans-serif`);
    drawCentered(settings.shopName, `${smallFontSize}px Prompt, sans-serif`);
    drawDashedDivider();

    drawLeftRight('เลขที่บิล:', order.order_number, `bold ${baseFontSize}px Prompt, sans-serif`);
    drawLeftRight('วันที่:', formatDateTime(order.created_at), `${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('ลูกค้า:', order.customer_name || 'ลูกค้าทั่วไป', `bold ${smallFontSize}px Prompt, sans-serif`);
    drawDashedDivider();

    drawLeftRight('☑ รายการสินค้า', 'จำนวน / หน่วย', `bold ${smallFontSize}px Prompt, sans-serif`);
    drawDashedDivider();

    let totalQty = 0;
    items.forEach((item) => {
      totalQty += Number(item.quantity) || 0;
      const boxSize = is58mm ? 18 : 22;
      ctx.lineWidth = 2;
      ctx.strokeRect(padding, y + 3, boxSize, boxSize);

      ctx.font = `bold ${baseFontSize}px Prompt, sans-serif`;
      const nameX = padding + boxSize + 10;
      const qtyText = `${item.quantity} ${item.unit}`;
      const qtyWidth = ctx.measureText(qtyText).width;

      const maxNameW = contentWidth - boxSize - qtyWidth - 20;
      let displayName = item.product_name || '';
      while (ctx.measureText(displayName).width > maxNameW && displayName.length > 4) {
        displayName = displayName.slice(0, -2) + '…';
      }

      ctx.fillText(displayName, nameX, y);
      ctx.fillText(qtyText, canvasWidth - padding - qtyWidth, y);
      y += lineHeight + 6;
    });

    drawDashedDivider();
    drawLeftRight(
      `รวม ${items.length} รายการ`,
      `รวมทั้งสิ้น ${totalQty} ชิ้น/หน่วย`,
      `bold ${baseFontSize}px Prompt, sans-serif`
    );

    if (order.note) {
      y += 6;
      ctx.font = `${smallFontSize}px Prompt, sans-serif`;
      ctx.fillText(`หมายเหตุ: ${order.note}`, padding, y);
      y += lineHeight;
    }

    y += 18;
    drawLeftRight('ผู้จัดสินค้า: ............................', 'ผู้ตรวจ: ......................', `${smallFontSize}px Prompt, sans-serif`);
  } else {
    // ================= ใบเสร็จรับเงินความร้อน (ไม่มีแท็กราคาปลีก/ส่ง) =================
    drawCentered(settings.shopName, `bold ${titleFontSize}px Prompt, sans-serif`);
    drawCentered(`โทร. ${settings.shopPhone}`, `${smallFontSize}px Prompt, sans-serif`);
    // ร้านจดทะเบียน VAT: ใบเสร็จนี้เป็นใบกำกับภาษีอย่างย่อ ต้องแสดงเลขผู้เสียภาษีของร้าน
    if (settings.vatRegistered) {
      drawCentered(
        `เลขประจำตัวผู้เสียภาษี ${settings.shopTaxId} (${formatBranch(settings.shopBranch)})`,
        `${smallFontSize - 2}px Prompt, sans-serif`
      );
      drawCentered('ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ', `bold ${smallFontSize}px Prompt, sans-serif`);
    }
    drawDashedDivider();

    drawLeftRight('เลขที่:', order.order_number, `bold ${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('วันที่:', formatDateTime(order.created_at), `${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('ลูกค้า:', order.customer_name || 'ลูกค้าทั่วไป', `${smallFontSize}px Prompt, sans-serif`);
    const paymentLines = getPaymentLines(order);
    if (paymentLines.length === 1) {
      drawLeftRight('ชำระโดย:', paymentLines[0].label, `${smallFontSize}px Prompt, sans-serif`);
    }
    drawDashedDivider();

    drawLeftRight('รายการสินค้า', 'รวม', `bold ${smallFontSize}px Prompt, sans-serif`);
    drawDashedDivider();

    items.forEach((item) => {
      drawLeftRight(
        item.product_name,
        formatCurrency(item.subtotal),
        `bold ${smallFontSize}px Prompt, sans-serif`
      );
      ctx.font = `${smallFontSize - 2}px Prompt, sans-serif`;
      ctx.fillText(
        `  ${item.quantity} ${item.unit} x ${formatCurrency(item.unit_price)}`,
        padding,
        y
      );
      y += lineHeight - 2;
    });

    drawDashedDivider();
    drawLeftRight('รวมเป็นเงิน', formatCurrency(order.subtotal), `${smallFontSize}px Prompt, sans-serif`);

    if (Number(order.bill_discount) > 0) {
      drawLeftRight('ส่วนลดท้ายบิล', `-${formatCurrency(order.bill_discount)}`, `${smallFontSize}px Prompt, sans-serif`);
    }

    if (order.vat_mode === 'vat_in' && Number(order.tax_amount) > 0) {
      drawLeftRight(
        'มูลค่าก่อน VAT',
        formatCurrency(
          order.net_before_vat ?? Number(order.grand_total) - Number(order.tax_amount)
        ),
        `${smallFontSize}px Prompt, sans-serif`
      );
      drawLeftRight('VAT 7% (รวมในสินค้า)', formatCurrency(order.tax_amount), `${smallFontSize}px Prompt, sans-serif`);
    } else if (
      (order.vat_mode === 'vat_out' || (!order.vat_mode && Number(order.tax_amount) > 0)) &&
      Number(order.tax_amount) > 0
    ) {
      drawLeftRight('VAT 7% (คิดแยกนอก)', `+${formatCurrency(order.tax_amount)}`, `${smallFontSize}px Prompt, sans-serif`);
    }

    drawDashedDivider();
    drawLeftRight('ยอดสุทธิ (TOTAL)', formatCurrency(order.grand_total), `bold ${titleFontSize}px Prompt, sans-serif`);
    if (settings.vatRegistered && !(Number(order.tax_amount) > 0)) {
      drawLeftRight(
        'ราคารวม VAT 7% แล้ว',
        formatCurrency(calculateOrderVat(order).vat),
        `${smallFontSize - 2}px Prompt, sans-serif`
      );
    }
    if (paymentLines.length > 1) {
      paymentLines.forEach((line) => {
        drawLeftRight(`ชำระ ${line.label}`, formatCurrency(line.amount), `${smallFontSize}px Prompt, sans-serif`);
      });
    }
    drawLeftRight('รับเงินมา', formatCurrency(order.cash_received), `${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('เงินทอน', formatCurrency(order.change_amount), `bold ${baseFontSize}px Prompt, sans-serif`);

    if (order.note) {
      y += 4;
      ctx.font = `${smallFontSize}px Prompt, sans-serif`;
      ctx.fillText(`หมายเหตุ: ${order.note}`, padding, y);
      y += lineHeight;
    }

    drawDashedDivider();
    drawCentered(settings.footerText, `${smallFontSize - 2}px Prompt, sans-serif`);
  }

  y += 20;

  // ตัดความสูง Canvas ให้พอดีกับเนื้อหาจริง
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = canvasWidth;
  finalCanvas.height = y;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(tempCanvas, 0, 0);
  return finalCanvas;
}

/**
 * สั่งพิมพ์ HTML ผ่านซ่อน Iframe แยกอิสระ (แก้ปัญหาหน้าขาว/ถูกตัดขอบจาก Modal 100%)
 */
function printHtmlViaHiddenIframe(htmlDocumentString) {
  let iframe = document.getElementById('siampos-dedicated-print-iframe');
  if (iframe) {
    document.body.removeChild(iframe);
  }

  iframe = document.createElement('iframe');
  iframe.id = 'siampos-dedicated-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(htmlDocumentString);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Iframe print failed:', e);
      window.print();
    }
  }, 220);
}

/**
 * สร้าง HTML สำหรับใบเสร็จความร้อน (58mm / 80mm)
 */
function buildThermalReceiptHtml(order, settings, paperSize) {
  const is58 = paperSize === '58mm';
  const widthCss = is58 ? '54mm' : '74mm';
  const fontSize = is58 ? '11px' : '12.5px';
  const items = order.items || [];

  const itemsHtml = items
    .map(
      (item) => `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-weight:700;">
          <span style="padding-right:6px;">${item.product_name}</span>
          <span>${formatCurrency(item.subtotal)}</span>
        </div>
        <div style="font-size:10.5px;color:#333;">
          ${item.quantity} ${item.unit} × ${formatCurrency(item.unit_price)}
        </div>
      </div>`
    )
    .join('');

  let vatHtml = '';
  if (order.vat_mode === 'vat_in' && Number(order.tax_amount) > 0) {
    const preVat =
      order.net_before_vat ?? Number(order.grand_total) - Number(order.tax_amount);
    vatHtml = `
      <div class="row"><span>มูลค่าก่อน VAT</span><span>${formatCurrency(preVat)}</span></div>
      <div class="row"><span>VAT 7% (รวมในสินค้า)</span><span>${formatCurrency(order.tax_amount)}</span></div>
    `;
  } else if (
    (order.vat_mode === 'vat_out' || (!order.vat_mode && Number(order.tax_amount) > 0)) &&
    Number(order.tax_amount) > 0
  ) {
    vatHtml = `
      <div class="row"><span>VAT 7% (คิดแยกนอก)</span><span>+${formatCurrency(order.tax_amount)}</span></div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบเสร็จ ${order.order_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: ${paperSize} auto; margin: 0mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 3mm 2mm;
      width: ${widthCss};
      font-family: 'Prompt', sans-serif;
      font-size: ${fontSize};
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .total { font-size: ${is58 ? '14px' : '16px'}; font-weight: 700; border-top: 1.5px solid #000; padding-top: 5px; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-size:${is58 ? '14px' : '16px'};font-weight:700;">${settings.shopName}</div>
    <div style="font-size:10.5px;">โทร. ${settings.shopPhone}</div>
    ${settings.vatRegistered ? `<div style="font-size:10px;">เลขประจำตัวผู้เสียภาษี ${escapeHtml(settings.shopTaxId)} (${formatBranch(settings.shopBranch)})</div><div style="font-size:11px;font-weight:700;">ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="row"><span>เลขที่:</span><strong>${order.order_number}</strong></div>
  <div class="row"><span>วันที่:</span><span>${formatDateTime(order.created_at)}</span></div>
  <div class="row"><span>ลูกค้า:</span><strong>${order.customer_name || 'ลูกค้าทั่วไป'}</strong></div>
  ${getPaymentLines(order).length === 1 ? `<div class="row"><span>ชำระโดย:</span><span>${getPaymentLines(order)[0].label}</span></div>` : ''}
  <div class="divider"></div>
  <div class="row" style="font-weight:700;font-size:10.5px;"><span>รายการสินค้า</span><span>รวม</span></div>
  <div class="divider"></div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="row"><span>รวมเป็นเงิน</span><span>${formatCurrency(order.subtotal)}</span></div>
  ${Number(order.bill_discount) > 0 ? `<div class="row"><span>ส่วนลดท้ายบิล</span><span>-${formatCurrency(order.bill_discount)}</span></div>` : ''}
  ${vatHtml}
  <div class="row total"><span>ยอดสุทธิ</span><span>${formatCurrency(order.grand_total)}</span></div>
  ${settings.vatRegistered && !(Number(order.tax_amount) > 0) ? `<div class="row" style="font-size:10px;"><span>ราคารวม VAT 7% แล้ว</span><span>${formatCurrency(calculateOrderVat(order).vat)}</span></div>` : ''}
  ${getPaymentLines(order).length > 1 ? getPaymentLines(order).map((line) => `<div class="row"><span>ชำระ ${line.label}</span><span>${formatCurrency(line.amount)}</span></div>`).join('') : ''}
  <div class="row"><span>รับเงินมา</span><span>${formatCurrency(order.cash_received)}</span></div>
  <div class="row" style="font-weight:700;"><span>เงินทอน</span><span>${formatCurrency(order.change_amount)}</span></div>
  ${order.note ? `<div style="margin-top:6px;font-size:10.5px;border:1px solid #000;padding:4px;">หมายเหตุ: ${order.note}</div>` : ''}
  <div class="divider"></div>
  <div class="center" style="font-size:10px;">${settings.footerText}</div>
</body>
</html>`;
}

/**
 * สร้าง HTML สำหรับใบเสร็จรับเงิน / ใบส่งของ ขนาดมาตรฐาน A4
 */
function buildA4ReceiptHtml(order, settings) {
  const items = order.items || [];
  const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  const rowsHtml = items
    .map(
      (item, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;">${item.sku || '-'}</td>
        <td>${item.product_name}</td>
        <td style="text-align:center;font-weight:600;">${item.quantity}</td>
        <td style="text-align:center;">${item.unit}</td>
        <td style="text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="text-align:right;font-weight:700;">${formatCurrency(item.subtotal)}</td>
      </tr>`
    )
    .join('');

  let vatRowsHtml = '';
  if (order.vat_mode === 'vat_in' && Number(order.tax_amount) > 0) {
    const preVat =
      order.net_before_vat ?? Number(order.grand_total) - Number(order.tax_amount);
    vatRowsHtml = `
      <tr>
        <td colspan="5" style="border:none;"></td>
        <td style="text-align:right;background:#f8fafc;">มูลค่าก่อนภาษี (Pre-VAT)</td>
        <td style="text-align:right;">${formatCurrency(preVat)}</td>
      </tr>
      <tr>
        <td colspan="5" style="border:none;"></td>
        <td style="text-align:right;background:#f8fafc;">ภาษีมูลค่าเพิ่ม 7% (รวมในสินค้า)</td>
        <td style="text-align:right;">${formatCurrency(order.tax_amount)}</td>
      </tr>`;
  } else if (
    (order.vat_mode === 'vat_out' || (!order.vat_mode && Number(order.tax_amount) > 0)) &&
    Number(order.tax_amount) > 0
  ) {
    vatRowsHtml = `
      <tr>
        <td colspan="5" style="border:none;"></td>
        <td style="text-align:right;background:#f8fafc;">ภาษีมูลค่าเพิ่ม 7% (VAT นอก)</td>
        <td style="text-align:right;">+${formatCurrency(order.tax_amount)}</td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบเสร็จรับเงิน A4 - ${order.order_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Prompt', sans-serif;
      font-size: 13px;
      color: #0f172a;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .shop-title { font-size: 20px; font-weight: 700; color: #0f172a; }
    .doc-box {
      text-align: right;
      border: 1.5px solid #1e293b;
      padding: 8px 14px;
      border-radius: 8px;
    }
    .doc-title { font-size: 16px; font-weight: 700; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th, td {
      border: 1px solid #94a3b8;
      padding: 7px 10px;
      font-size: 12.5px;
    }
    th {
      background: #1e293b;
      color: #ffffff;
      font-weight: 600;
      text-align: center;
    }
    .grand-row td {
      font-size: 15px;
      font-weight: 700;
      background: #eef2ff;
    }
    .sign-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-top: 36px;
      text-align: center;
    }
    .sign-box {
      border-top: 1px dashed #475569;
      padding-top: 8px;
      margin-top: 40px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="shop-title">${settings.shopName}</div>
      <div>${settings.shopAddress || 'ศูนย์รวมสินค้าอุปโภคบริโภค ราคาปลีก-ส่ง'}</div>
      <div>โทรศัพท์: ${settings.shopPhone}</div>
    </div>
    <div class="doc-box">
      <div class="doc-title">ใบเสร็จรับเงิน / ใบส่งของ</div>
      <div style="font-size:11px;color:#475569;">RECEIPT / DELIVERY INVOICE</div>
      <div style="margin-top:4px;font-weight:700;font-family:monospace;font-size:14px;">เลขที่: ${order.order_number}</div>
    </div>
  </div>

  <div class="info-grid">
    <div>
      <div><strong>ลูกค้า (Customer):</strong> ${order.customer_name || 'ลูกค้าทั่วไป'}</div>
      <div><strong>หมายเหตุ (Note):</strong> ${order.note || '-'}</div>
    </div>
    <div style="text-align:right;">
      <div><strong>วันที่/เวลา (Date):</strong> ${formatDateTime(order.created_at)}</div>
      <div><strong>วิธีชำระเงิน (Payment):</strong> ${getPaymentLines(order).map((line) => (getPaymentLines(order).length > 1 ? `${line.label} ${formatCurrency(line.amount)}` : line.label)).join(' + ')}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:45px;">ลำดับ</th>
        <th style="width:95px;">รหัสสินค้า</th>
        <th>รายการสินค้า (Description)</th>
        <th style="width:70px;">จำนวน</th>
        <th style="width:70px;">หน่วย</th>
        <th style="width:105px;">ราคา/หน่วย</th>
        <th style="width:115px;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr>
        <td colspan="3" style="text-align:right;font-weight:600;">รวมจำนวนสินค้าทั้งหมด</td>
        <td style="text-align:center;font-weight:700;">${totalQty}</td>
        <td style="text-align:center;">หน่วย</td>
        <td style="text-align:right;background:#f8fafc;font-weight:600;">รวมเป็นเงิน (Subtotal)</td>
        <td style="text-align:right;font-weight:700;">${formatCurrency(order.subtotal)}</td>
      </tr>
      ${
        Number(order.bill_discount) > 0
          ? `<tr>
              <td colspan="5" style="border:none;"></td>
              <td style="text-align:right;background:#f8fafc;color:#e11d48;">ส่วนลดท้ายบิล</td>
              <td style="text-align:right;color:#e11d48;">-${formatCurrency(order.bill_discount)}</td>
            </tr>`
          : ''
      }
      ${vatRowsHtml}
      <tr class="grand-row">
        <td colspan="5" style="border:none;background:#fff;text-align:left;font-size:12px;font-weight:400;">
          รับเงิน: ${formatCurrency(order.cash_received)} | เงินทอน: ${formatCurrency(order.change_amount)}
        </td>
        <td style="text-align:right;">ยอดชำระสุทธิ (Grand Total)</td>
        <td style="text-align:right;">${formatCurrency(order.grand_total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sign-grid">
    <div><div class="sign-box">ผู้รับสินค้า (Receiver)<br/>วันที่ ......../......../........</div></div>
    <div><div class="sign-box">ผู้จัดส่งสินค้า (Deliverer)<br/>วันที่ ......../......../........</div></div>
    <div><div class="sign-box">ผู้รับเงิน / พนักงานขาย (Cashier)<br/>วันที่ ......../......../........</div></div>
  </div>
</body>
</html>`;
}

/**
 * สร้าง HTML สำหรับใบออร์เดอร์ / ใบจัดสินค้า (มีช่องเช็คลิสต์ด้านหน้า ชื่อสินค้า จำนวน หน่วย และไม่มีราคา)
 */
function buildOrderSlipHtml(order, settings, paperSize = '80mm') {
  const is58 = paperSize === '58mm';
  const widthCss = is58 ? '54mm' : '74mm';
  const items = order.items || [];
  const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="width:26px;text-align:center;">
          <span style="display:inline-block;width:14px;height:14px;border:2px solid #000;border-radius:2px;"></span>
        </td>
        <td style="font-weight:700;padding:5px 4px;">${item.product_name}</td>
        <td style="text-align:right;font-weight:800;font-size:14px;white-space:nowrap;">${item.quantity}</td>
        <td style="text-align:left;padding-left:4px;white-space:nowrap;">${item.unit}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบออร์เดอร์ ${order.order_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: ${paperSize} auto; margin: 0mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 3mm 2mm;
      width: ${widthCss};
      font-family: 'Prompt', sans-serif;
      font-size: ${is58 ? '11.5px' : '13px'};
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .divider { border-top: 1.5px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px dotted #999; }
    th { text-align: left; font-size: 11px; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-size:${is58 ? '15px' : '17px'};font-weight:800;">ใบออร์เดอร์ / ใบจัดสินค้า</div>
    <div style="font-size:11px;">${settings.shopName}</div>
  </div>
  <div class="divider"></div>
  <div class="row"><span>เลขที่บิล:</span><strong>${order.order_number}</strong></div>
  <div class="row"><span>เวลา:</span><span>${formatDateTime(order.created_at)}</span></div>
  <div class="row"><span>ลูกค้า:</span><strong>${order.customer_name || 'ลูกค้าทั่วไป'}</strong></div>
  ${order.note ? `<div style="margin-top:4px;font-weight:700;">หมายเหตุ: ${order.note}</div>` : ''}
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th style="width:26px;text-align:center;">เช็ค</th>
        <th>ชื่อสินค้า</th>
        <th style="text-align:right;">จำนวน</th>
        <th style="padding-left:4px;">หน่วย</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="row" style="font-weight:800;font-size:13.5px;">
    <span>รวม ${items.length} รายการ</span>
    <span>รวม ${totalQty} ชิ้น/หน่วย</span>
  </div>
  <div style="margin-top:18px;font-size:11px;">
    ผู้จัดสินค้า: ................................................
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateOnly(dateInput) {
  if (!dateInput) return '-';
  return new Date(dateInput).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * ใบวางบิล / ใบแจ้งหนี้รวม (Billing Note) ขนาด A4
 */
function buildBillingNoteHtml(note, settings) {
  const rowsHtml = (note.bills || [])
    .map(
      (b, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;">${escapeHtml(b.order_number)}</td>
        <td style="text-align:center;">${formatDateOnly(b.order_date)}</td>
        <td style="text-align:center;">${formatDateOnly(b.due_date)}</td>
        <td style="text-align:right;font-weight:600;">${formatCurrency(b.amount)}</td>
      </tr>`
    )
    .join('');
  const branch = note.customer_branch && note.customer_branch !== '00000'
    ? `สาขาที่ ${escapeHtml(note.customer_branch)}`
    : 'สำนักงานใหญ่';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบวางบิล - ${escapeHtml(note.billing_number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Prompt', sans-serif; font-size: 13px; color: #0f172a; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 22px; font-weight: 700; text-align: right; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
    th { background: #f1f5f9; font-weight: 600; }
    .total td { font-weight: 700; font-size: 15px; background: #f8fafc; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; text-align: center; }
    .sign div { border-top: 1px dotted #475569; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.shopName)}</div>
      <div>${escapeHtml(settings.shopAddress)}</div>
      <div>โทร. ${escapeHtml(settings.shopPhone)}</div>
    </div>
    <div>
      <div class="title">ใบวางบิล / ใบแจ้งหนี้</div>
      <div style="text-align:right;">BILLING NOTE</div>
      <div style="text-align:right;margin-top:4px;font-family:monospace;font-weight:700;">เลขที่: ${escapeHtml(note.billing_number)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div><strong>ลูกค้า:</strong> ${escapeHtml(note.customer_name)}</div>
      ${note.customer_tax_id ? `<div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(note.customer_tax_id)} (${branch})</div>` : ''}
      ${note.customer_address ? `<div><strong>ที่อยู่:</strong> ${escapeHtml(note.customer_address)}</div>` : ''}
    </div>
    <div class="box">
      <div><strong>วันที่วางบิล:</strong> ${formatDateOnly(note.created_at)}</div>
      <div><strong>กำหนดชำระ:</strong> ${formatDateOnly(note.payment_due_date)}</div>
      <div><strong>จำนวนบิล:</strong> ${(note.bills || []).length} ฉบับ</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50px;">ลำดับ</th>
        <th>เลขที่บิล / ใบส่งของ</th>
        <th style="width:120px;">วันที่บิล</th>
        <th style="width:120px;">ครบกำหนด</th>
        <th style="width:140px;">ยอดค้างชำระ</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total">
        <td colspan="4" style="text-align:right;">รวมยอดที่ต้องชำระทั้งสิ้น</td>
        <td style="text-align:right;">${formatCurrency(note.total)}</td>
      </tr>
    </tbody>
  </table>

  ${note.note ? `<div class="box" style="margin-top:12px;"><strong>หมายเหตุ:</strong> ${escapeHtml(note.note)}</div>` : ''}

  <div class="sign">
    <div>ผู้วางบิล<br/>วันที่ ........../........../..........</div>
    <div>ผู้รับวางบิล<br/>วันที่ ........../........../..........</div>
  </div>
</body>
</html>`;
}

/**
 * ใบสั่งซื้อ (Purchase Order) ขนาด A4 จากใบนำเข้าสินค้า
 */
function buildPurchaseOrderHtml(importDoc, supplier, settings) {
  const rowsHtml = (importDoc.items || [])
    .map(
      (it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;">${escapeHtml(it.barcode_or_sku || it.sku)}</td>
        <td>${escapeHtml(it.product_name)}</td>
        <td style="text-align:center;font-weight:600;">${escapeHtml(it.quantity)}</td>
        <td style="text-align:center;">${escapeHtml(it.unit)}</td>
        <td style="text-align:right;">${formatCurrency(it.import_price)}</td>
        <td style="text-align:right;">${Number(it.total_discount) > 0 ? `-${formatCurrency(it.total_discount)}` : '-'}</td>
        <td style="text-align:right;font-weight:600;">${formatCurrency(it.line_total)}</td>
      </tr>`
    )
    .join('');
  const supplierAddress = supplier
    ? [
        supplier.address,
        supplier.tambon && `ต.${supplier.tambon}`,
        supplier.amphoe && `อ.${supplier.amphoe}`,
        supplier.province && `จ.${supplier.province}`,
        supplier.zipcode,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบสั่งซื้อ - ${escapeHtml(importDoc.import_number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Prompt', sans-serif; font-size: 13px; color: #0f172a; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 22px; font-weight: 700; text-align: right; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
    th { background: #f1f5f9; font-weight: 600; }
    .total td { font-weight: 700; font-size: 15px; background: #f8fafc; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; text-align: center; }
    .sign div { border-top: 1px dotted #475569; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.shopName)}</div>
      <div>${escapeHtml(settings.shopAddress)}</div>
      <div>โทร. ${escapeHtml(settings.shopPhone)}</div>
    </div>
    <div>
      <div class="title">ใบสั่งซื้อ</div>
      <div style="text-align:right;">PURCHASE ORDER</div>
      <div style="text-align:right;margin-top:4px;font-family:monospace;font-weight:700;">เลขที่: ${escapeHtml(importDoc.import_number)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div><strong>ผู้ขาย / ผู้ผลิต:</strong> ${escapeHtml(importDoc.supplier_name)}</div>
      ${supplierAddress ? `<div><strong>ที่อยู่:</strong> ${escapeHtml(supplierAddress)}</div>` : ''}
      ${importDoc.supplier_phone ? `<div><strong>โทร:</strong> ${escapeHtml(importDoc.supplier_phone)}</div>` : ''}
    </div>
    <div class="box">
      <div><strong>วันที่สั่งซื้อ:</strong> ${formatDateOnly(importDoc.created_at)}</div>
      <div><strong>จำนวนรายการ:</strong> ${(importDoc.items || []).length} รายการ</div>
      ${importDoc.note ? `<div><strong>หมายเหตุ:</strong> ${escapeHtml(importDoc.note)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:45px;">ลำดับ</th>
        <th style="width:120px;">รหัสสินค้า</th>
        <th>รายการสินค้า</th>
        <th style="width:70px;">จำนวน</th>
        <th style="width:60px;">หน่วย</th>
        <th style="width:95px;">ราคา/หน่วย</th>
        <th style="width:85px;">ส่วนลด</th>
        <th style="width:110px;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total">
        <td colspan="7" style="text-align:right;">รวมเป็นเงินทั้งสิ้น</td>
        <td style="text-align:right;">${formatCurrency(importDoc.grand_total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sign">
    <div>ผู้สั่งซื้อ<br/>วันที่ ........../........../..........</div>
    <div>ผู้อนุมัติ<br/>วันที่ ........../........../..........</div>
  </div>
</body>
</html>`;
}

/**
 * ใบกำกับภาษีเต็มรูปแบบ / ใบเสร็จรับเงิน ขนาด A4 (มาตรา 86/4 ประมวลรัษฎากร)
 */
function buildTaxInvoiceHtml(invoice, settings, copyLabel) {
  const rowsHtml = (invoice.items || [])
    .map(
      (it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(it.product_name)}</td>
        <td style="text-align:center;">${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}</td>
        <td style="text-align:right;">${formatCurrency(it.unit_price)}</td>
        <td style="text-align:right;">${formatCurrency(it.subtotal)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบกำกับภาษี - ${escapeHtml(invoice.invoice_number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Prompt', sans-serif; font-size: 13px; color: #0f172a; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 20px; font-weight: 700; text-align: right; }
    .copy { display: inline-block; border: 1.5px solid #0f172a; padding: 2px 10px; font-weight: 700; margin-top: 4px; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
    th { background: #f1f5f9; font-weight: 600; }
    .sum td { background: #f8fafc; }
    .total td { font-weight: 700; font-size: 15px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; text-align: center; }
    .sign div { border-top: 1px dotted #475569; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.shopName)}</div>
      <div>${escapeHtml(settings.shopAddress)}</div>
      <div>โทร. ${escapeHtml(settings.shopPhone)}</div>
      <div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(settings.shopTaxId)} (${formatBranch(settings.shopBranch)})</div>
    </div>
    <div style="text-align:right;">
      <div class="title">ใบกำกับภาษี / ใบเสร็จรับเงิน</div>
      <div>TAX INVOICE / RECEIPT</div>
      <div class="copy">${escapeHtml(copyLabel)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div><strong>ผู้ซื้อ:</strong> ${escapeHtml(invoice.buyer_name)}</div>
      <div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(invoice.buyer_tax_id || '-')} (${formatBranch(invoice.buyer_branch)})</div>
      <div><strong>ที่อยู่:</strong> ${escapeHtml(invoice.buyer_address || '-')}</div>
    </div>
    <div class="box">
      <div><strong>เลขที่:</strong> <span style="font-family:monospace;font-weight:700;">${escapeHtml(invoice.invoice_number)}</span></div>
      <div><strong>วันที่:</strong> ${formatDateOnly(invoice.created_at)}</div>
      <div><strong>อ้างอิงบิลขาย:</strong> ${escapeHtml(invoice.order_number)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:45px;">ลำดับ</th>
        <th>รายการ</th>
        <th style="width:110px;">จำนวน</th>
        <th style="width:110px;">ราคา/หน่วย</th>
        <th style="width:120px;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${Number(invoice.bill_discount) > 0 ? `<tr class="sum"><td colspan="4" style="text-align:right;">ส่วนลดท้ายบิล</td><td style="text-align:right;">-${formatCurrency(invoice.bill_discount)}</td></tr>` : ''}
      <tr class="sum"><td colspan="4" style="text-align:right;">มูลค่าสินค้า/บริการ (ไม่รวมภาษี)</td><td style="text-align:right;">${formatCurrency(invoice.base_amount)}</td></tr>
      <tr class="sum"><td colspan="4" style="text-align:right;">ภาษีมูลค่าเพิ่ม 7%</td><td style="text-align:right;">${formatCurrency(invoice.vat_amount)}</td></tr>
      <tr class="sum total">
        <td colspan="4" style="text-align:right;">จำนวนเงินรวมทั้งสิ้น <span style="font-weight:400;font-size:12px;">(${bahtText(invoice.total_amount)})</span></td>
        <td style="text-align:right;">${formatCurrency(invoice.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sign">
    <div>ผู้รับเงิน / ผู้ออกใบกำกับภาษี</div>
    <div>ผู้รับสินค้า / ผู้ซื้อ</div>
  </div>
</body>
</html>`;
}

/**
 * ใบลดหนี้ / ใบเพิ่มหนี้ ขนาด A4 (มาตรา 86/9 และ 86/10 ประมวลรัษฎากร)
 * แสดงใบกำกับเดิมที่อ้างอิง มูลค่าเดิม มูลค่าที่ถูกต้อง ผลต่าง ภาษีของผลต่าง และเหตุผล
 */
function buildTaxNoteHtml(note, settings, copyLabel) {
  const isCredit = note.note_type === 'credit';
  const original = Number(note.original_total) || 0;
  const correct = isCredit ? original - (Number(note.total_amount) || 0) : original + (Number(note.total_amount) || 0);
  const rowsHtml = (note.items || [])
    .map(
      (it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(it.product_name)}</td>
        <td style="text-align:center;">${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}</td>
        <td style="text-align:right;">${formatCurrency(it.unit_price)}</td>
        <td style="text-align:right;">${formatCurrency(it.subtotal)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>${isCredit ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'} - ${escapeHtml(note.note_number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Prompt', sans-serif; font-size: 13px; color: #0f172a; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 20px; font-weight: 700; text-align: right; }
    .copy { display: inline-block; border: 1.5px solid #0f172a; padding: 2px 10px; font-weight: 700; margin-top: 4px; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
    th { background: #f1f5f9; font-weight: 600; }
    .sum td { background: #f8fafc; }
    .total td { font-weight: 700; font-size: 15px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; text-align: center; }
    .sign div { border-top: 1px dotted #475569; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.shopName)}</div>
      <div>${escapeHtml(settings.shopAddress)}</div>
      <div>โทร. ${escapeHtml(settings.shopPhone)}</div>
      <div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(settings.shopTaxId)} (${formatBranch(settings.shopBranch)})</div>
    </div>
    <div style="text-align:right;">
      <div class="title">${isCredit ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'}</div>
      <div>${isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE'}</div>
      <div class="copy">${escapeHtml(copyLabel)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div><strong>ผู้ซื้อ:</strong> ${escapeHtml(note.buyer_name)}</div>
      <div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(note.buyer_tax_id || '-')} (${formatBranch(note.buyer_branch)})</div>
      <div><strong>ที่อยู่:</strong> ${escapeHtml(note.buyer_address || '-')}</div>
    </div>
    <div class="box">
      <div><strong>เลขที่:</strong> <span style="font-family:monospace;font-weight:700;">${escapeHtml(note.note_number)}</span></div>
      <div><strong>วันที่:</strong> ${formatDateOnly(note.created_at)}</div>
      <div><strong>อ้างอิงใบกำกับภาษี:</strong> ${escapeHtml(note.invoice_number)} (${formatDateOnly(note.invoice_date)})</div>
    </div>
  </div>

  <div class="box" style="margin-bottom:12px;"><strong>เหตุผล:</strong> ${escapeHtml(note.reason)}</div>

  <table>
    ${
      rowsHtml
        ? `<thead><tr><th style="width:45px;">ลำดับ</th><th>รายการ</th><th style="width:110px;">จำนวน</th><th style="width:110px;">ราคา/หน่วย</th><th style="width:120px;">จำนวนเงิน</th></tr></thead>`
        : ''
    }
    <tbody>
      ${rowsHtml}
      <tr class="sum"><td colspan="4" style="text-align:right;">มูลค่าตามใบกำกับภาษีเดิม</td><td style="text-align:right;">${formatCurrency(original)}</td></tr>
      <tr class="sum"><td colspan="4" style="text-align:right;">มูลค่าที่ถูกต้อง</td><td style="text-align:right;">${formatCurrency(correct)}</td></tr>
      <tr class="sum"><td colspan="4" style="text-align:right;">ผลต่าง (ไม่รวมภาษี)</td><td style="text-align:right;">${formatCurrency(note.base_amount)}</td></tr>
      <tr class="sum"><td colspan="4" style="text-align:right;">ภาษีมูลค่าเพิ่ม 7% ของผลต่าง</td><td style="text-align:right;">${formatCurrency(note.vat_amount)}</td></tr>
      <tr class="sum total">
        <td colspan="4" style="text-align:right;">${isCredit ? 'รวมยอดลดหนี้' : 'รวมยอดเพิ่มหนี้'} <span style="font-weight:400;font-size:12px;">(${bahtText(note.total_amount)})</span></td>
        <td style="text-align:right;">${formatCurrency(note.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sign">
    <div>ผู้ออกเอกสาร</div>
    <div>ผู้รับเอกสาร</div>
  </div>
</body>
</html>`;
}

/**
 * ใบเสร็จรับเงิน (รับชำระหนี้) ขนาด A4 พร้อมรายการบิลที่ถูกตัดชำระ
 */
function buildPaymentReceiptHtml(payment, customer, allocations, settings) {
  const methodLabel = PAYMENT_LABELS[payment.method] || payment.method;
  const rowsHtml = (allocations || [])
    .map(
      (a, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;">${escapeHtml(a.order_number)}</td>
        <td style="text-align:right;">${formatCurrency(a.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบเสร็จรับเงิน - ${escapeHtml(payment.receipt_number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Prompt', sans-serif; font-size: 13px; color: #0f172a; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 20px; font-weight: 700; text-align: right; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
    th { background: #f1f5f9; font-weight: 600; }
    .total td { font-weight: 700; font-size: 15px; background: #f8fafc; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; text-align: center; }
    .sign div { border-top: 1px dotted #475569; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.shopName)}</div>
      <div>${escapeHtml(settings.shopAddress)}</div>
      <div>โทร. ${escapeHtml(settings.shopPhone)}</div>
    </div>
    <div style="text-align:right;">
      <div class="title">ใบเสร็จรับเงิน</div>
      <div>RECEIPT (รับชำระหนี้)</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div><strong>ได้รับเงินจาก:</strong> ${escapeHtml(payment.customer_name || customer?.name || '-')}</div>
      ${customer?.tax_id ? `<div><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(customer.tax_id)} (${formatBranch(customer.branch_number)})</div>` : ''}
      ${customer?.address ? `<div><strong>ที่อยู่:</strong> ${escapeHtml(customer.address)}</div>` : ''}
    </div>
    <div class="box">
      <div><strong>เลขที่:</strong> <span style="font-family:monospace;font-weight:700;">${escapeHtml(payment.receipt_number)}</span></div>
      <div><strong>วันที่:</strong> ${formatDateOnly(payment.created_at)}</div>
      <div><strong>ชำระโดย:</strong> ${escapeHtml(methodLabel)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th style="width:60px;">ลำดับ</th><th>ชำระบิลเลขที่</th><th style="width:160px;">จำนวนเงิน</th></tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="3" style="text-align:center;color:#64748b;">ชำระล่วงหน้า / ไม่มีบิลค้าง</td></tr>'}
      <tr class="total">
        <td colspan="2" style="text-align:right;">รวมรับชำระ <span style="font-weight:400;font-size:12px;">(${bahtText(payment.amount)})</span></td>
        <td style="text-align:right;">${formatCurrency(payment.amount)}</td>
      </tr>
    </tbody>
  </table>
  ${payment.note ? `<div class="box" style="margin-top:12px;"><strong>หมายเหตุ:</strong> ${escapeHtml(payment.note)}</div>` : ''}

  <div class="sign">
    <div>ผู้รับเงิน</div>
    <div>ผู้จ่ายเงิน</div>
  </div>
</body>
</html>`;
}

export const printerService = {
  /**
   * พิมพ์ใบเสร็จรับชำระหนี้ ขนาด A4
   */
  printPaymentReceipt(payment, customer = null, allocations = []) {
    if (!payment) return false;
    printHtmlViaHiddenIframe(buildPaymentReceiptHtml(payment, customer, allocations, this.getSettings()));
    return true;
  },

  /**
   * พิมพ์ใบลดหนี้ / ใบเพิ่มหนี้ ขนาด A4
   */
  printTaxNote(note, copyLabel = 'ต้นฉบับ') {
    if (!note) return false;
    printHtmlViaHiddenIframe(buildTaxNoteHtml(note, this.getSettings(), copyLabel));
    return true;
  },

  /**
   * พิมพ์ใบกำกับภาษีเต็มรูปแบบ ขนาด A4 (copyLabel: 'ต้นฉบับ' หรือ 'สำเนา')
   */
  printTaxInvoice(invoice, copyLabel = 'ต้นฉบับ') {
    if (!invoice) return false;
    printHtmlViaHiddenIframe(buildTaxInvoiceHtml(invoice, this.getSettings(), copyLabel));
    return true;
  },

  /**
   * พิมพ์ใบสั่งซื้อ (Purchase Order) ขนาด A4
   */
  printPurchaseOrder(importDoc, supplier = null) {
    if (!importDoc) return false;
    printHtmlViaHiddenIframe(buildPurchaseOrderHtml(importDoc, supplier, this.getSettings()));
    return true;
  },

  /**
   * พิมพ์ใบวางบิล (Billing Note) ขนาด A4
   */
  printBillingNote(note) {
    if (!note) return false;
    printHtmlViaHiddenIframe(buildBillingNoteHtml(note, this.getSettings()));
    return true;
  },

  getLocalShopSettings() {
    try {
      const rawShop = localStorage.getItem(SHOP_SETTINGS_KEY);
      if (rawShop) {
        return { ...DEFAULT_SHOP_SETTINGS, ...JSON.parse(rawShop) };
      }
      const rawPrinter = localStorage.getItem(PRINTER_SETTINGS_KEY);
      if (rawPrinter) {
        return {
          ...DEFAULT_SHOP_SETTINGS,
          ...pickSharedShopFields(JSON.parse(rawPrinter)),
        };
      }
      return DEFAULT_SHOP_SETTINGS;
    } catch {
      return DEFAULT_SHOP_SETTINGS;
    }
  },

  getSettings() {
    try {
      const raw = localStorage.getItem(PRINTER_SETTINGS_KEY);
      const deviceSaved = raw ? JSON.parse(raw) : {};
      const shopSaved = this.getLocalShopSettings();
      const merged = { ...DEFAULT_PRINTER_SETTINGS, ...deviceSaved, ...shopSaved };
      delete merged.updated_at;
      return merged;
    } catch {
      return DEFAULT_PRINTER_SETTINGS;
    }
  },

  saveSettings(newSettings) {
    const merged = { ...this.getSettings(), ...newSettings };
    delete merged.updated_at;
    try {
      localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(merged));
      const hasShopChange = SHARED_SHOP_SETTING_KEYS.some((k) =>
        Object.prototype.hasOwnProperty.call(newSettings || {}, k)
      );
      if (hasShopChange || !localStorage.getItem(SHOP_SETTINGS_KEY)) {
        const prevShop = this.getLocalShopSettings();
        const nextShop = {
          ...prevShop,
          ...pickSharedShopFields(merged),
          updated_at: hasShopChange ? new Date().toISOString() : prevShop.updated_at || null,
        };
        localStorage.setItem(SHOP_SETTINGS_KEY, JSON.stringify(nextShop));
      }
    } catch (e) {
      console.error('Failed to save printer settings:', e);
    }
    this.checkPrinterStatus(merged);
    return merged;
  },

  /**
   * นำค่าตั้งร้านที่ใช้ร่วมกันจากฐานข้อมูล (shop_settings) มาอัปเดตในเครื่อง โดยไม่แตะต้องค่าตั้งเครื่องพิมพ์ของเครื่องนี้
   */
  applyRemoteShopSettings(remoteShop = {}) {
    try {
      const shopPayload = {
        ...DEFAULT_SHOP_SETTINGS,
        ...pickSharedShopFields(remoteShop),
        updated_at: remoteShop.updated_at || new Date().toISOString(),
      };
      localStorage.setItem(SHOP_SETTINGS_KEY, JSON.stringify(shopPayload));
      const raw = localStorage.getItem(PRINTER_SETTINGS_KEY);
      const current = raw ? JSON.parse(raw) : {};
      const nextPrinter = { ...DEFAULT_PRINTER_SETTINGS, ...current, ...pickSharedShopFields(shopPayload) };
      localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(nextPrinter));
      return nextPrinter;
    } catch (e) {
      console.error('Failed to apply remote shop settings:', e);
      return this.getSettings();
    }
  },

  subscribeStatus(callback) {
    statusListeners.add(callback);
    callback({ status: currentPrinterStatus, message: currentStatusMessage });
    return () => statusListeners.delete(callback);
  },

  getStatus() {
    return { status: currentPrinterStatus, message: currentStatusMessage };
  },

  /**
   * ตรวจสอบสถานะความพร้อมของเครื่องพิมพ์ 3 สถานะ:
   * - 'ready' (สีเขียว): พร้อมทำงานทันที
   * - 'warning' (สีส้ม): เชื่อมต่อแล้วแต่ยังมีปัญหา / ต้องกดยืนยันสิทธิ์อุปกรณ์
   * - 'error' (สีแดง): ไม่พร้อมใช้งาน / ยังไม่ได้เชื่อมต่ออุปกรณ์
   */
  async checkPrinterStatus(customSettings = null) {
    const settings = customSettings || this.getSettings();
    const conn = settings.connectionType;

    if (conn === 'webusb') {
      if (!('usb' in navigator)) {
        notifyStatusChange('error', 'เบราว์เซอร์ไม่รองรับ WebUSB');
        return 'error';
      }
      if (activeUsbDevice && activeUsbDevice.opened && activeUsbEndpoint) {
        notifyStatusChange('ready', `WebUSB พร้อมพิมพ์ (${activeUsbDevice.productName || 'USB Printer'})`);
        return 'ready';
      }
      try {
        const devices = await navigator.usb.getDevices();
        if (devices.length > 0) {
          // พยายามเปิดการเชื่อมต่ออัตโนมัติกับเครื่องพิมพ์ที่เคยอนุญาตไว้แล้ว
          const dev = devices[0];
          try {
            await this.openUsbDevice(dev);
            notifyStatusChange('ready', `เชื่อมต่อ ${dev.productName || 'USB Printer'} พร้อมใช้งาน`);
            return 'ready';
          } catch {
            notifyStatusChange('warning', 'พบเครื่องพิมพ์ USB แต่ต้องกดเชื่อมต่อใหม่หรือถูกใช้งานอยู่');
            return 'warning';
          }
        }
      } catch {
        // ignore
      }
      notifyStatusChange('error', 'ยังไม่ได้จับคู่เครื่องพิมพ์ USB');
      return 'error';
    }

    if (conn === 'webserial') {
      if (!('serial' in navigator)) {
        notifyStatusChange('error', 'เบราว์เซอร์ไม่รองรับ WebSerial');
        return 'error';
      }
      if (activeSerialPort && activeSerialPort.writable) {
        notifyStatusChange('ready', 'พอร์ต Serial/COM พร้อมพิมพ์ความร้อน');
        return 'ready';
      }
      try {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
          try {
            const port = ports[0];
            if (!port.writable) {
              await port.open({ baudRate: Number(settings.baudRate) || 115200 });
            }
            activeSerialPort = port;
            notifyStatusChange('ready', 'เชื่อมต่อพอร์ต Serial อัตโนมัติพร้อมใช้งาน');
            return 'ready';
          } catch {
            notifyStatusChange('warning', 'พบพอร์ตเครื่องพิมพ์แต่ยังเปิดใช้งานไม่ได้');
            return 'warning';
          }
        }
      } catch {
        // ignore
      }
      notifyStatusChange('error', 'ยังไม่ได้เชื่อมต่อพอร์ตเครื่องพิมพ์ Serial');
      return 'error';
    }

    if (conn === 'rawbt') {
      // ตรวจสอบว่ามี Sunmi Native Bridge หรือ RawBT WebSocket รันอยู่หรือไม่
      if (window.sunmi || window.SunmiInnerPrinter) {
        notifyStatusChange('ready', 'เชื่อมต่อ Sunmi InnerPrinter Bridge พร้อมใช้งาน');
        return 'ready';
      }
      try {
        const wsReady = await new Promise((resolve) => {
          const ws = new WebSocket('ws://127.0.0.1:40213');
          const timer = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 700);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.close();
            resolve(true);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
        });
        if (wsReady) {
          notifyStatusChange('ready', 'เชื่อมต่อบริการ RawBT Server พร้อมพิมพ์ไร้หน้าต่าง');
          return 'ready';
        }
        notifyStatusChange('warning', 'โหมด RawBT Intent (ยังไม่ได้เปิด WebSocket พื้นหลัง)');
        return 'warning';
      } catch {
        notifyStatusChange('warning', 'โหมด RawBT Intent');
        return 'warning';
      }
    }

    // โหมด 'system' (Dedicated Iframe Print สำหรับ Sunmi Print Service / ไดรเวอร์ระบบ)
    if (settings.systemPrinterReady === false) {
      notifyStatusChange('error', 'ปิดใช้งานเครื่องพิมพ์ระบบอยู่');
      return 'error';
    }
    notifyStatusChange('ready', `พร้อมสั่งพิมพ์ (${settings.paperSize})`);
    return 'ready';
  },

  async openUsbDevice(device) {
    if (!device.opened) {
      await device.open();
    }
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    let foundEndpoint = null;
    let foundInterfaceNum = 0;

    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const outEp = alt.endpoints.find((e) => e.direction === 'out');
        if (outEp) {
          foundEndpoint = outEp;
          foundInterfaceNum = iface.interfaceNumber;
          break;
        }
      }
      if (foundEndpoint) break;
    }

    await device.claimInterface(foundInterfaceNum);
    activeUsbDevice = device;
    activeUsbEndpoint = foundEndpoint;
    return true;
  },

  async connectWebUSB() {
    if (!('usb' in navigator)) {
      notifyStatusChange('error', 'เบราว์เซอร์ไม่รองรับ WebUSB');
      throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB API');
    }
    const device = await navigator.usb.requestDevice({ filters: [] });
    await this.openUsbDevice(device);
    notifyStatusChange('ready', `เชื่อมต่อ ${device.productName || 'USB Printer'} สำเร็จ`);
    return true;
  },

  async connectWebSerial(baudRate = 115200) {
    if (!('serial' in navigator)) {
      notifyStatusChange('error', 'เบราว์เซอร์ไม่รองรับ WebSerial');
      throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebSerial API');
    }
    const port = await navigator.serial.requestPort();
    if (!port.writable) {
      await port.open({ baudRate: Number(baudRate) || 115200 });
    }
    activeSerialPort = port;
    notifyStatusChange('ready', 'เชื่อมต่อพอร์ตเครื่องพิมพ์ความร้อนสำเร็จ');
    return true;
  },

  /**
   * ส่งข้อมูลภาพ Canvas ออกเครื่องพิมพ์ความร้อนผ่านฮาร์ดแวร์ตรง (WebUSB / WebSerial / RawBT)
   */
  async sendCanvasToHardwarePrinter(canvas, settings) {
    const rasterBytes = canvasToEscPosGSv0(canvas);
    const sent = await this.sendRawBytes(rasterBytes, settings);
    if (sent) return true;

    // RawBT: ส่งเป็น PNG Data URI ให้แอป RawBT พิมพ์ภาษาไทยคมชัด 100% เมื่อเชื่อม WebSocket ไม่ได้
    if (settings.connectionType === 'rawbt') {
      const dataUrl = canvas.toDataURL('image/png');
      window.location.href = `rawbt:${dataUrl}`;
      return true;
    }

    return false;
  },

  /**
   * ส่งคำสั่ง ESC/POS (ไบต์ดิบ) ออกเครื่องพิมพ์ผ่าน WebUSB / WebSerial / RawBT WebSocket
   * คืนค่า false ถ้าส่งไม่ได้ (เช่น ใช้ไดรเวอร์ระบบ หรือยังไม่ได้เชื่อมต่อ)
   */
  async sendRawBytes(rasterBytes, settings) {
    // 1. WebUSB
    if (settings.connectionType === 'webusb') {
      if (!activeUsbDevice || !activeUsbDevice.opened || !activeUsbEndpoint) {
        await this.checkPrinterStatus(settings);
      }
      if (activeUsbDevice && activeUsbDevice.opened && activeUsbEndpoint) {
        try {
          const chunkSize = 4096;
          for (let i = 0; i < rasterBytes.length; i += chunkSize) {
            const chunk = rasterBytes.slice(i, i + chunkSize);
            await activeUsbDevice.transferOut(activeUsbEndpoint.endpointNumber, chunk);
          }
          notifyStatusChange('ready', 'พิมพ์ผ่าน WebUSB สำเร็จ');
          return true;
        } catch (err) {
          notifyStatusChange('warning', 'การส่งข้อมูล WebUSB ขัดข้อง กำลังสลับใช้ไดรเวอร์ระบบ');
          throw err;
        }
      }
    }

    // 2. WebSerial
    if (settings.connectionType === 'webserial') {
      if (!activeSerialPort || !activeSerialPort.writable) {
        await this.checkPrinterStatus(settings);
      }
      if (activeSerialPort && activeSerialPort.writable) {
        try {
          const writer = activeSerialPort.writable.getWriter();
          await writer.write(rasterBytes);
          writer.releaseLock();
          notifyStatusChange('ready', 'พิมพ์ผ่าน WebSerial สำเร็จ');
          return true;
        } catch (err) {
          notifyStatusChange('warning', 'พอร์ต Serial ขัดข้อง กำลังสลับใช้ไดรเวอร์ระบบ');
          throw err;
        }
      }
    }

    // 3. RawBT / Sunmi Android
    if (settings.connectionType === 'rawbt') {
      const sentViaWs = await new Promise((resolve) => {
        try {
          const ws = new WebSocket('ws://127.0.0.1:40213');
          const timer = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 900);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.send(rasterBytes);
            ws.close();
            resolve(true);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      });

      if (sentViaWs) {
        notifyStatusChange('ready', 'ส่งพิมพ์ผ่าน RawBT Server สำเร็จ');
        return true;
      }
    }

    return false;
  },

  /**
   * สั่งเปิดลิ้นชักเก็บเงิน (Kick Cash Drawer) ผ่านเครื่องพิมพ์ความร้อน
   * ลิ้นชักต้องต่อสาย RJ11 เข้ากับเครื่องพิมพ์ และต้องเชื่อมแบบ WebUSB / WebSerial / RawBT
   */
  async openCashDrawer(customSettings = null) {
    const settings = customSettings || this.getSettings();
    if (settings.connectionType === 'system') {
      return {
        ok: false,
        message: 'โหมดไดรเวอร์ระบบ (System Print) สั่งเปิดลิ้นชักไม่ได้ กรุณาเชื่อมแบบ WebUSB / WebSerial',
      };
    }
    try {
      const ok = await this.sendRawBytes(
        buildCashDrawerKickBytes(settings.cashDrawerPin),
        settings
      );
      return ok
        ? { ok: true, message: 'ส่งคำสั่งเปิดลิ้นชักเก็บเงินแล้ว' }
        : { ok: false, message: 'ยังไม่ได้เชื่อมต่อเครื่องพิมพ์ จึงเปิดลิ้นชักไม่ได้' };
    } catch (err) {
      return { ok: false, message: `เปิดลิ้นชักไม่สำเร็จ: ${err.message}` };
    }
  },

  /**
   * 1. พิมพ์ใบเสร็จความร้อน (58mm / 80mm)
   */
  async printThermalReceipt(order, customPaperSize = null) {
    if (!order) return false;
    const settings = this.getSettings();
    const paperSize = customPaperSize || settings.paperSize || '80mm';
    const mergedSettings = { ...settings, paperSize };

    if (settings.connectionType !== 'system') {
      try {
        const canvas = renderSlipToCanvas(order, mergedSettings, 'receipt');
        const ok = await this.sendCanvasToHardwarePrinter(canvas, mergedSettings);
        if (ok) return true;
      } catch (e) {
        console.warn('Hardware thermal print failed, using dedicated iframe fallback:', e);
      }
    }

    // พิมพ์ผ่าน Dedicated Hidden Iframe (ไม่พึ่งพาตัวอย่างใบเสร็จบนหน้าจอ)
    const html = buildThermalReceiptHtml(order, mergedSettings, paperSize);
    printHtmlViaHiddenIframe(html);
    return true;
  },

  /**
   * 2. พิมพ์ใบเสร็จรับเงิน / ใบส่งของ ขนาด A4
   */
  async printA4Receipt(order) {
    if (!order) return false;
    const settings = this.getSettings();
    const html = buildA4ReceiptHtml(order, settings);
    printHtmlViaHiddenIframe(html);
    return true;
  },

  /**
   * 3. พิมพ์ใบออร์เดอร์ / ใบจัดสินค้า (มีช่องเช็คลิสต์ ชื่อสินค้า จำนวน หน่วย ไม่แสดงราคา)
   */
  async printOrderSlip(order, customPaperSize = null) {
    if (!order) return false;
    const settings = this.getSettings();
    const paperSize = customPaperSize || settings.paperSize || '80mm';
    const mergedSettings = { ...settings, paperSize };

    if (settings.connectionType !== 'system') {
      try {
        const canvas = renderSlipToCanvas(order, mergedSettings, 'order');
        const ok = await this.sendCanvasToHardwarePrinter(canvas, mergedSettings);
        if (ok) return true;
      } catch (e) {
        console.warn('Hardware order print failed, using dedicated iframe fallback:', e);
      }
    }

    const html = buildOrderSlipHtml(order, mergedSettings, paperSize);
    printHtmlViaHiddenIframe(html);
    return true;
  },
};

// ตรวจจับการเสียบ/ถอดสาย USB อัตโนมัติ
if (typeof navigator !== 'undefined' && 'usb' in navigator) {
  navigator.usb.addEventListener('disconnect', (event) => {
    if (activeUsbDevice && event.device === activeUsbDevice) {
      activeUsbDevice = null;
      activeUsbEndpoint = null;
      notifyStatusChange('error', 'สายเครื่องพิมพ์ USB หลุดการเชื่อมต่อ');
    }
  });
  navigator.usb.addEventListener('connect', () => {
    printerService.checkPrinterStatus();
  });
}
