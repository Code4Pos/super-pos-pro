// สร้าง dist/app-update.json สำหรับระบบอัปเดตแอป Android แบบ OTA (src/services/appUpdater.js)
// ต้องรันหลัง build และหลังสร้าง dist/app-bundle.zip แล้ว (ดู .github/workflows/deploy.yml)
import fs from 'node:fs';
import crypto from 'node:crypto';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const { nativeApi } = JSON.parse(fs.readFileSync('native-version.json', 'utf8'));
const zip = fs.readFileSync('dist/app-bundle.zip');

const manifest = {
  // buildId ต้องตรงกับ VITE_BUILD_ID ที่ฝังในโค้ดของ bundle นี้ (แอปเทียบกับ BUILD_ID ของตัวเอง)
  buildId: process.env.VITE_BUILD_ID || 'dev',
  version: pkg.version,
  // bundle นี้ต้องใช้กับแอปที่มีโค้ด native ระดับนี้ขึ้นไป ถ้าแอปเก่ากว่าต้องลง APK ใหม่
  nativeApi: Number(nativeApi) || 1,
  bundle: 'app-bundle.zip',
  checksum: crypto.createHash('sha256').update(zip).digest('hex'),
  size: zip.length,
  createdAt: new Date().toISOString(),
};

fs.writeFileSync('dist/app-update.json', JSON.stringify(manifest, null, 2));
console.log(`app-update.json: ${manifest.version} (${manifest.buildId.slice(0, 7)}) nativeApi=${manifest.nativeApi}`);
