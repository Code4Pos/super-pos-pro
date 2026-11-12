import { createClient } from '@supabase/supabase-js';

export const SERVER_CONFIG_STORAGE_KEY = 'siampos_server_config_v1';

function readCustomServerConfig() {
  try {
    const raw = localStorage.getItem(SERVER_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const url = String(parsed?.url || '').trim();
    const anonKey = String(parsed?.anonKey || '').trim();
    if (url && anonKey) return { url, anonKey };
  } catch {
    // ignore storage errors
  }
  return null;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const envAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
)?.trim();

const customConfig = readCustomServerConfig();
const supabaseUrl = customConfig?.url || envUrl;
const supabaseAnonKey = customConfig?.anonKey || envAnonKey;

// ตรวจสอบว่ามีการตั้งค่า Supabase / VPS จริงหรือยัง (ไม่ใช่ค่าว่างหรือค่าตัวอย่าง)
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-supabase-anon-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * อ่านค่าตั้งเซิร์ฟเวอร์ฐานข้อมูลปัจจุบัน (รองรับสลับระหว่าง Supabase Cloud และ VPS ของตัวเองโดยไม่ต้องลงแอป .apk ใหม่)
 */
export function getServerConfig() {
  const custom = readCustomServerConfig();
  return {
    customUrl: custom?.url || '',
    customAnonKey: custom?.anonKey || '',
    envUrl,
    hasEnvConfig: Boolean(
      envUrl &&
        envAnonKey &&
        envUrl.startsWith('http') &&
        !envUrl.includes('your-project-id')
    ),
    hasCustomConfig: Boolean(custom),
    activeUrl: supabaseUrl || '',
    isConfigured: isSupabaseConfigured,
  };
}

/**
 * บันทึก URL และ Anon Key ของเซิร์ฟเวอร์ฐานข้อมูล (เช่น เมื่อย้ายขึ้น VPS หรือตั้งค่าแอป .apk)
 */
export function saveServerConfig({ url, anonKey }) {
  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(anonKey || '').trim();
  if (!cleanUrl || !cleanKey) {
    throw new Error('กรุณาระบุทั้ง Server URL และ Anon Key ให้ครบถ้วน');
  }
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('Server URL ต้องขึ้นต้นด้วย https:// หรือ http://');
  }
  try {
    localStorage.setItem(
      SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({
        url: cleanUrl,
        anonKey: cleanKey,
        updated_at: new Date().toISOString(),
      })
    );
  } catch {
    throw new Error('ไม่สามารถบันทึกการตั้งค่าลงในเครื่องได้');
  }
}

/**
 * ล้างค่าเซิร์ฟเวอร์ที่ตั้งเอง เพื่อกลับไปใช้ค่าเริ่มต้นที่ฝังมากับแอป (.env)
 */
export function resetServerConfig() {
  try {
    localStorage.removeItem(SERVER_CONFIG_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}


