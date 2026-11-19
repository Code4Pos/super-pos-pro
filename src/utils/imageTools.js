/**
 * เตรียมรูปโลโก้สำหรับพิมพ์บนใบเสร็จความร้อน
 * - ย่อให้กว้างไม่เกิน maxWidth / สูงไม่เกิน maxHeight (พิกเซลของเครื่องพิมพ์ 58mm = 384)
 * - วางบนพื้นขาว แล้วแปลงเป็นขาวดำ (threshold) ให้พิมพ์คม
 * คืนค่า data URL แบบ PNG
 */
export function prepareReceiptLogo(file, { maxWidth = 320, maxHeight = 160, threshold = 170 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('กรุณาเลือกไฟล์รูปภาพ'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('เปิดไฟล์รูปไม่สำเร็จ'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const v = gray < threshold ? 0 : 255;
          px[i] = v;
          px[i + 1] = v;
          px[i + 2] = v;
          px[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// แคชรูปที่โหลดแล้ว (ใช้วาดลง Canvas ตอนพิมพ์ผ่านเครื่องพิมพ์ ESC/POS)
const imageCache = new Map();

/**
 * โหลด data URL เป็น HTMLImageElement (คืน null ถ้าไม่มีรูปหรือโหลดไม่ได้)
 */
export function loadImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(null);
  if (imageCache.has(dataUrl)) return imageCache.get(dataUrl);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
  imageCache.set(dataUrl, promise);
  return promise;
}
