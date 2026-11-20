/**
 * สำรอง / ย้าย / คืนค่าเริ่มต้น ค่าตั้งร้าน (ตั้งค่า › สำรอง & ย้ายค่าตั้ง)
 *
 * ไฟล์สำรองเป็น JSON:
 * { type: 'siampos-settings', formatVersion: 1, appVersion, exportedAt, shop: {...}, device?: {...} }
 * - shop  = ค่าตั้งร้านที่ใช้ร่วมทุกเครื่อง (SHARED_SHOP_SETTING_KEYS)
 * - device = ค่าตั้งเฉพาะเครื่อง (เครื่องพิมพ์ ลิ้นชัก) ใส่เมื่อเลือกเท่านั้น ไม่รวมรหัสเครื่อง
 */
import { SHOP_CONFIG_FIELDS } from './shopConfig';

export const BACKUP_FILE_TYPE = 'siampos-settings';
export const BACKUP_FORMAT_VERSION = 1;

const registryKeys = (group) => SHOP_CONFIG_FIELDS.filter((f) => f.group === group).map((f) => f.key);

// หมวดค่าตั้งร้าน (ใช้ทั้งเลือกนำเข้า และคืนค่าเริ่มต้นทีละหมวด)
export const SETTINGS_GROUPS = [
  { id: 'shop', label: 'ข้อมูลร้าน', keys: ['shopName', 'shopAddress', 'shopPhone', 'footerText'] },
  { id: 'payment', label: 'พร้อมเพย์', keys: ['promptpayId'] },
  { id: 'tax', label: 'ภาษี (VAT)', keys: ['vatRegistered', 'shopTaxId', 'shopBranch', 'vatMode', 'branches'] },
  { id: 'receipt', label: 'ใบเสร็จ', keys: registryKeys('receipt') },
  { id: 'sales', label: 'กติกาการขาย', keys: registryKeys('sales') },
  { id: 'defaults', label: 'การแจ้งเตือน & ค่าเริ่มต้น', keys: registryKeys('defaults') },
  { id: 'documents', label: 'เลขที่เอกสาร', keys: registryKeys('documents') },
  { id: 'roles', label: 'สิทธิ์ตามบทบาท', keys: registryKeys('roles') },
];

export const DEVICE_GROUP = { id: 'device', label: 'ค่าตั้งเครื่องนี้ (เครื่องพิมพ์ / ลิ้นชัก)' };

function pick(source = {}, keys = []) {
  const out = {};
  keys.forEach((k) => {
    if (source[k] !== undefined) out[k] = source[k];
  });
  return out;
}

/**
 * สร้างข้อมูลสำรอง
 * settings = printerSettings ทั้งหมด, sharedKeys = SHARED_SHOP_SETTING_KEYS, deviceKeys = คีย์ค่าตั้งเฉพาะเครื่อง
 */
export function buildSettingsBackup(settings, { sharedKeys = [], deviceKeys = [], includeDevice = false, appVersion = '' } = {}) {
  const backup = {
    type: BACKUP_FILE_TYPE,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    shop: pick(settings, sharedKeys),
  };
  if (includeDevice) backup.device = pick(settings, deviceKeys);
  return backup;
}

export function backupFileName(shopName = '') {
  const date = new Date().toLocaleDateString('sv-SE');
  const safeName = String(shopName || 'shop')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 30);
  return `siampos-settings-${safeName}-${date}.json`;
}

/**
 * อ่านไฟล์/ข้อความสำรอง คืนค่า { ok, error, backup, groups }
 * groups = หมวดที่มีข้อมูลในไฟล์ (ใช้แสดงให้เลือกนำเข้า)
 */
export function parseSettingsBackup(text, { sharedKeys = [], deviceKeys = [] } = {}) {
  let data;
  try {
    data = JSON.parse(String(text || '').trim());
  } catch {
    return { ok: false, error: 'ไฟล์ไม่ใช่ JSON หรือข้อความไม่ครบ' };
  }
  if (!data || data.type !== BACKUP_FILE_TYPE || typeof data.shop !== 'object' || data.shop === null) {
    return { ok: false, error: 'ไม่ใช่ไฟล์สำรองค่าตั้งของ SiamPOS Pro' };
  }
  if (Number(data.formatVersion) > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'ไฟล์นี้มาจากแอปเวอร์ชันใหม่กว่า กรุณาอัปเดตแอปก่อนนำเข้า' };
  }
  const shop = pick(data.shop, sharedKeys);
  const device = data.device && typeof data.device === 'object' ? pick(data.device, deviceKeys) : null;
  const groups = SETTINGS_GROUPS.filter((g) => g.keys.some((k) => shop[k] !== undefined)).map((g) => g.id);
  if (device && Object.keys(device).length > 0) groups.push(DEVICE_GROUP.id);
  if (groups.length === 0) return { ok: false, error: 'ไม่พบค่าตั้งที่นำเข้าได้ในไฟล์นี้' };
  return {
    ok: true,
    backup: { ...data, shop, device },
    groups,
  };
}

/**
 * ค่าตั้งที่จะนำเข้าตามหมวดที่เลือก คืนค่า { shopChanges, deviceChanges }
 */
export function selectBackupChanges(backup, selectedGroupIds = []) {
  const shopChanges = {};
  SETTINGS_GROUPS.filter((g) => selectedGroupIds.includes(g.id)).forEach((g) => {
    Object.assign(shopChanges, pick(backup.shop, g.keys));
  });
  const deviceChanges = selectedGroupIds.includes(DEVICE_GROUP.id) && backup.device ? { ...backup.device } : {};
  return { shopChanges, deviceChanges };
}

/**
 * ค่าเริ่มต้นของหมวด (สำหรับปุ่มคืนค่าเริ่มต้น)
 */
export function getGroupDefaults(groupId, defaultShopSettings = {}) {
  const group = SETTINGS_GROUPS.find((g) => g.id === groupId);
  if (!group) return {};
  const out = {};
  group.keys.forEach((k) => {
    const v = defaultShopSettings[k];
    out[k] = Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...v } : v;
  });
  return out;
}
