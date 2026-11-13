import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * ตัวเชื่อมปลั๊กอินเครื่องพิมพ์ในแอป Android (android/.../SiamPrinterPlugin.java)
 * ใช้ได้เฉพาะตอนรันเป็นแอป Capacitor บน Android บนเว็บทุกฟังก์ชันจะไม่ทำงาน (isNativePrinterAvailable = false)
 */
const SiamPrinter = registerPlugin('SiamPrinter');

export function isNativePrinterAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

// แปลง Uint8Array เป็น base64 ทีละช่วง (กัน call stack เต็มเมื่อภาพใบเสร็จยาว)
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * สั่งพิมพ์ HTML ผ่านระบบพิมพ์ของ Android (แทน window.print() ที่ WebView ไม่รองรับ)
 */
export async function nativePrintHtml(html, jobName = 'SiamPOS') {
  await SiamPrinter.printHtml({ html, jobName });
}

/**
 * รายชื่อเครื่อง Bluetooth ที่จับคู่ไว้แล้ว คืนค่า { enabled, devices: [{ name, address }] }
 * Android 12+ จะเด้งถามสิทธิ์ "อุปกรณ์ใกล้เคียง" ครั้งแรก
 */
export async function listBluetoothPrinters() {
  return SiamPrinter.listBluetoothDevices();
}

/**
 * ส่งไบต์ ESC/POS ไปเครื่องพิมพ์ Bluetooth (เชื่อมต่ออัตโนมัติ / ต่อใหม่เมื่อหลุด)
 */
export async function bluetoothWrite(address, bytes) {
  const data = bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  await SiamPrinter.bluetoothWrite({ address, data });
}

/**
 * สถานะ { permission, available, enabled, bonded, connected }
 */
export async function bluetoothStatus(address) {
  return SiamPrinter.bluetoothStatus({ address: address || '' });
}

export async function bluetoothDisconnect() {
  try {
    await SiamPrinter.bluetoothDisconnect();
  } catch {
    // ไม่มีการเชื่อมต่อค้างอยู่
  }
}
