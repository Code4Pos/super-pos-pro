import { formatCurrency, formatDateTime } from '../utils/formatters';

const PRINTER_SETTINGS_KEY = 'siampos_printer_settings_v2';

const DEFAULT_PRINTER_SETTINGS = {
  paperSize: '80mm', // '58mm' | '80mm'
  connectionType: 'system', // 'system' | 'webusb' | 'webserial' | 'rawbt'
  baudRate: 115200, // 9600 | 115200
  autoPrint: false,
  shopName: 'สยามค้าปลีก-ส่ง (SiamPOS Pro)',
  shopAddress: 'ศูนย์รวมสินค้าอุปโภคบริโภค ราคาปลีก-ส่ง มาตรฐานครบวงจร',
  shopPhone: '02-123-4567',
  footerText: 'ขอบคุณที่อุดหนุน สินค้าซื้อแล้วรับเปลี่ยนคืนภายใน 7 วัน',
  performanceMode: true,
  systemPrinterReady: true,
};

const PAYMENT_LABELS = {
  cash: 'เงินสด (Cash)',
  promptpay: 'QR PromptPay',
  transfer: 'โอนเงินธนาคาร',
  credit: 'เครดิต/ค้างชำระ',
};

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
    drawDashedDivider();

    drawLeftRight('เลขที่:', order.order_number, `bold ${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('วันที่:', formatDateTime(order.created_at), `${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight('ลูกค้า:', order.customer_name || 'ลูกค้าทั่วไป', `${smallFontSize}px Prompt, sans-serif`);
    drawLeftRight(
      'ชำระโดย:',
      PAYMENT_LABELS[order.payment_method] || order.payment_method,
      `${smallFontSize}px Prompt, sans-serif`
    );
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
  </div>
  <div class="divider"></div>
  <div class="row"><span>เลขที่:</span><strong>${order.order_number}</strong></div>
  <div class="row"><span>วันที่:</span><span>${formatDateTime(order.created_at)}</span></div>
  <div class="row"><span>ลูกค้า:</span><strong>${order.customer_name || 'ลูกค้าทั่วไป'}</strong></div>
  <div class="row"><span>ชำระโดย:</span><span>${PAYMENT_LABELS[order.payment_method] || order.payment_method}</span></div>
  <div class="divider"></div>
  <div class="row" style="font-weight:700;font-size:10.5px;"><span>รายการสินค้า</span><span>รวม</span></div>
  <div class="divider"></div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="row"><span>รวมเป็นเงิน</span><span>${formatCurrency(order.subtotal)}</span></div>
  ${Number(order.bill_discount) > 0 ? `<div class="row"><span>ส่วนลดท้ายบิล</span><span>-${formatCurrency(order.bill_discount)}</span></div>` : ''}
  ${vatHtml}
  <div class="row total"><span>ยอดสุทธิ</span><span>${formatCurrency(order.grand_total)}</span></div>
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
      <div><strong>วิธีชำระเงิน (Payment):</strong> ${PAYMENT_LABELS[order.payment_method] || order.payment_method}</div>
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

export const printerService = {
  getSettings() {
    try {
      const raw = localStorage.getItem(PRINTER_SETTINGS_KEY);
      if (!raw) return DEFAULT_PRINTER_SETTINGS;
      return { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_PRINTER_SETTINGS;
    }
  },

  saveSettings(newSettings) {
    const merged = { ...this.getSettings(), ...newSettings };
    try {
      localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error('Failed to save printer settings:', e);
    }
    this.checkPrinterStatus(merged);
    return merged;
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

      // Fallback ส่งเป็น PNG Data URI ให้แอป RawBT พิมพ์ภาษาไทยคมชัด 100%
      const dataUrl = canvas.toDataURL('image/png');
      window.location.href = `rawbt:${dataUrl}`;
      return true;
    }

    return false;
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
