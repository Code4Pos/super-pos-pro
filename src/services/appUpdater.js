import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * ระบบอัปเดตแอป Android (beta 0.3.11)
 * 1) OTA: แก้โค้ดเว็บ (หน้าจอ/การคำนวณ/การพิมพ์ฝั่ง JS) → ดาวน์โหลด app-bundle.zip จากเว็บ GitHub Pages เบื้องหลัง
 *    แล้วใช้ตัวใหม่ตอนเปิดแอปครั้งถัดไป หรือกด "อัปเดตตอนนี้" (ถ้าตัวใหม่เปิดไม่ขึ้น Capgo ย้อนกลับตัวเดิมให้เอง)
 * 2) APK: แก้โค้ดใน android/ (nativeApi ใน native-version.json เพิ่มขึ้น) → ขึ้นปุ่ม "อัปเดตแอป" ดาวน์โหลด APK
 *    จาก GitHub Release (tag android-latest) แล้วเปิดหน้าติดตั้งของ Android
 * บนเว็บทุกฟังก์ชันไม่ทำงาน (เว็บอัปเดตเองทุกครั้งที่ deploy อยู่แล้ว)
 */

const SiamApp = registerPlugin('SiamApp');

// buildId ของโค้ดที่กำลังรันอยู่ (commit SHA จาก GitHub Actions) ใช้เทียบกับ app-update.json
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
// ระดับโค้ด native ที่ bundle นี้ต้องการ (native-version.json)
export const REQUIRED_NATIVE_API = typeof __SIAMPOS_NATIVE_API__ !== 'undefined' ? __SIAMPOS_NATIVE_API__ : 1;

const UPDATE_BASE_URL = (import.meta.env.VITE_UPDATE_BASE_URL || 'https://code4pos.github.io/super-pos-pro/').replace(/\/?$/, '/');
const APK_RELEASE_API =
  import.meta.env.VITE_APK_RELEASE_API || 'https://api.github.com/repos/Code4Pos/super-pos-pro/releases/tags/android-latest';
const APK_ASSET_NAME = 'SiamPOS-Pro.apk';
// ตรวจซ้ำทุก 30 นาที และตอนกลับมาเปิดแอป (ไม่ถี่กว่า 5 นาที กันเรียก GitHub API เกินโควตา)
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_RECHECK_MS = 5 * 60 * 1000;

export function isUpdaterAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// สถานะที่แชร์ให้ Header / หน้าตั้งค่า (subscribe)
// status: 'idle' | 'checking' | 'downloading' | 'bundle-ready' | 'apk-available' | 'installing' | 'up-to-date' | 'error'
// ---------------------------------------------------------------------------
let state = { status: 'idle', message: '', bundle: null, apk: null, native: null, checkedAt: null };
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      // ไม่ให้ตัวฟังที่พังกระทบตัวอื่น
    }
  });
}

export function getUpdateState() {
  return state;
}

export function subscribeUpdateState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------

export async function getNativeInfo() {
  if (!isUpdaterAvailable()) return null;
  try {
    return await SiamApp.getInfo();
  } catch {
    // APK รุ่นก่อน beta 0.3.11 ไม่มีปลั๊กอินนี้
    return { versionCode: 0, versionName: '', nativeApi: 0, canInstallPackages: false };
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ข้อมูล APK ล่าสุดจาก GitHub Release (body เป็น JSON จาก build-apk.yml)
async function fetchLatestApk() {
  const release = await fetchJson(APK_RELEASE_API);
  let info = {};
  try {
    info = JSON.parse(release.body || '{}');
  } catch {
    info = {};
  }
  const asset = (release.assets || []).find((a) => a.name === APK_ASSET_NAME);
  if (!asset) return null;
  return {
    url: asset.browser_download_url,
    versionCode: Number(info.versionCode) || 0,
    versionName: info.versionName || '',
    nativeApi: Number(info.nativeApi) || 0,
  };
}

/**
 * ต้องเรียกทุกครั้งที่แอปเปิดขึ้นมาสำเร็จ ไม่งั้น Capgo จะถือว่า bundle ใหม่พังแล้วย้อนกลับตัวเดิม
 */
export async function markAppReady() {
  if (!isUpdaterAvailable()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('notifyAppReady failed:', err);
  }
}

let checking = null;

/**
 * ตรวจหาอัปเดต: ถ้าเป็น OTA จะดาวน์โหลดและตั้งให้ใช้ตอนเปิดแอปครั้งถัดไป
 * manual = true เมื่อผู้ใช้กดตรวจเอง (แสดงข้อความ "เป็นเวอร์ชันล่าสุดแล้ว")
 */
export async function checkForUpdates({ manual = false } = {}) {
  if (!isUpdaterAvailable()) return state;
  if (checking) return checking;
  if (!manual && state.checkedAt && Date.now() - state.checkedAt < MIN_RECHECK_MS) return state;
  // มีอัปเดตรอผู้ใช้กดอยู่แล้ว ไม่ต้องตรวจซ้ำอัตโนมัติ
  if (!manual && ['bundle-ready', 'apk-available', 'installing'].includes(state.status)) return state;

  checking = (async () => {
    setState({ status: 'checking', message: '' });
    try {
      const native = await getNativeInfo();
      const manifest = await fetchJson(`${UPDATE_BASE_URL}app-update.json?t=${Date.now()}`);
      setState({ native, checkedAt: Date.now() });

      // เว็บเวอร์ชันใหม่ต้องใช้โค้ด native ใหม่กว่าที่ติดตั้งอยู่ → ต้องลง APK
      if ((Number(manifest.nativeApi) || 1) > (Number(native?.nativeApi) || 0)) {
        const apk = await fetchLatestApk();
        if (apk && apk.nativeApi >= (Number(manifest.nativeApi) || 1)) {
          setState({ status: 'apk-available', apk, message: `มีแอปเวอร์ชันใหม่ ${apk.versionName}` });
        } else {
          setState({ status: 'up-to-date', message: 'กำลังเตรียมแอปเวอร์ชันใหม่ ลองตรวจอีกครั้งภายหลัง' });
        }
        return state;
      }

      if (!manifest.buildId || manifest.buildId === BUILD_ID) {
        setState({ status: 'up-to-date', message: 'เป็นเวอร์ชันล่าสุดแล้ว' });
        return state;
      }

      // ดาวน์โหลดแล้วแต่ยังไม่ได้ใช้ (เช่น ตรวจซ้ำ) ไม่ต้องโหลดใหม่
      const { bundles = [] } = await CapacitorUpdater.list();
      let bundle = bundles.find((b) => b.version === manifest.buildId && b.status !== 'error');
      if (!bundle) {
        setState({ status: 'downloading', message: `กำลังดาวน์โหลดเวอร์ชัน ${manifest.version}` });
        bundle = await CapacitorUpdater.download({
          url: new URL(manifest.bundle || 'app-bundle.zip', UPDATE_BASE_URL).toString(),
          version: manifest.buildId,
          checksum: manifest.checksum,
        });
      }
      // ใช้ตัวใหม่เมื่อแอปถูกพับ/ปิดแล้วเปิดใหม่
      await CapacitorUpdater.next({ id: bundle.id });
      setState({
        status: 'bundle-ready',
        bundle: { id: bundle.id, version: manifest.version, buildId: manifest.buildId },
        message: `อัปเดต ${manifest.version} พร้อมใช้งาน`,
      });
    } catch (err) {
      console.warn('Update check failed:', err);
      setState({
        status: 'error',
        checkedAt: Date.now(),
        message: manual ? `ตรวจหาอัปเดตไม่สำเร็จ: ${err?.message || err}` : '',
      });
    }
    return state;
  })();

  try {
    return await checking;
  } finally {
    checking = null;
  }
}

/**
 * ใช้ bundle ใหม่ทันที (แอปจะโหลดหน้าใหม่) — ควรเรียกตอนไม่มีบิลค้างในตะกร้า
 */
export async function applyUpdateNow() {
  if (!isUpdaterAvailable() || !state.bundle?.id) return;
  await CapacitorUpdater.set({ id: state.bundle.id });
}

/**
 * ดาวน์โหลด APK ใหม่แล้วเปิดหน้าติดตั้ง (ผู้ใช้กด "ติดตั้ง" เอง)
 */
export async function installApkUpdate() {
  if (!isUpdaterAvailable() || !state.apk?.url) return;
  setState({ status: 'installing', message: 'กำลังดาวน์โหลดแอปเวอร์ชันใหม่...' });
  try {
    await SiamApp.installApk({ url: state.apk.url });
    setState({ status: 'apk-available', message: 'กด "ติดตั้ง" ในหน้าต่างของ Android เพื่ออัปเดต' });
  } catch (err) {
    setState({ status: 'apk-available', message: err?.message || 'ติดตั้งอัปเดตไม่สำเร็จ' });
    throw err;
  }
}

let started = false;

/**
 * เริ่มระบบอัปเดต (เรียกครั้งเดียวตอนเปิดแอป จาก main.jsx / main-admin.jsx)
 */
export function initAppUpdater() {
  if (started || !isUpdaterAvailable()) return;
  started = true;
  markAppReady();
  // รอให้หน้าขายโหลดเสร็จก่อนค่อยตรวจ ไม่ให้แย่งเน็ตตอนเปิดแอป
  setTimeout(() => checkForUpdates(), 8000);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
}
