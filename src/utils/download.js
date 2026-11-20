/**
 * ดาวน์โหลดข้อมูลเป็นไฟล์ JSON (ใช้กับไฟล์สำรอง)
 * คืนค่า true ถ้าสั่งดาวน์โหลดได้ (แอป Android บางเครื่องอาจดาวน์โหลดจาก WebView ไม่ได้)
 */
export function downloadJsonFile(fileName, data) {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

/**
 * อ่านไฟล์ที่ผู้ใช้เลือกเป็นข้อความ
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsText(file);
  });
}

// ชื่อไฟล์สำรองข้อมูลทั้งร้าน
export function shopBackupFileName(shopName = '') {
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16);
  const safeName = String(shopName || 'shop').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30);
  return `siampos-backup-${safeName}-${stamp}.json`;
}
