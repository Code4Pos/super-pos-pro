/**
 * ระบบสาขา รอบ 1 (beta 0.5.0): บัญชีรายคน + Owner + เลือกสาขา
 * - โหมดฐานข้อมูล: อ่านสิทธิ์ผ่าน RPC (Migration beta 0.5.0) และจัดการบัญชีผ่าน Edge Function `staff-admin`
 * - โหมดสาธิต: จำลองสาขาและบัญชีใน LocalStorage (ไม่มีการล็อกอิน ผู้ใช้เป็น Owner)
 * ข้อมูลร้าน (สินค้า บิล ฯลฯ) ยังใช้ร่วมกันทุกสาขาในรอบนี้ — แยกตามสาขาในรอบ 2
 */
import { supabase } from '../lib/supabase';
import { BRANCH_STORAGE_KEYS, isNetworkError, posService } from './posService';
import { printerService } from './printerService';
import { normalizeBranchCode } from '../utils/docNumbers';
import { normalizeBranches } from '../utils/branches';

export const MEMBER_ROLE_LABELS = {
  owner: 'เจ้าของร้าน',
  admin: 'ผู้ดูแลสาขา',
  staff: 'พนักงาน',
};

export const MIN_ACCOUNT_PASSWORD = 8;

const DEMO_USER_ID = 'demo-owner';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

// ฐานข้อมูลยังไม่มีฟังก์ชันของ Migration beta 0.5.0
function isMissingFunctionError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(msg);
}

function cleanBranch(b = {}) {
  return {
    code: normalizeBranchCode(b.code),
    name: String(b.name || '').trim(),
    address: String(b.address || '').trim(),
    phone: String(b.phone || '').trim(),
    is_headquarters: Boolean(b.is_headquarters),
    is_active: b.is_active !== false,
    role: b.role || null,
  };
}

function normalizeAccess(raw = {}) {
  return {
    user_id: raw.user_id || '',
    email: raw.email || '',
    display_name: raw.display_name || '',
    has_profile: Boolean(raw.has_profile),
    is_owner: Boolean(raw.is_owner),
    disabled: Boolean(raw.disabled),
    owner_exists: Boolean(raw.owner_exists),
    branches: (Array.isArray(raw.branches) ? raw.branches : []).map(cleanBranch),
  };
}

// ---------------------------------------------------------------------
// โหมดสาธิต: สาขาและบัญชีจำลองในเครื่อง
// ---------------------------------------------------------------------
function readDemoStore() {
  const store = readJson(BRANCH_STORAGE_KEYS.DEMO_BRANCHES, null);
  if (store && Array.isArray(store.branches) && store.branches.length) {
    return { branches: store.branches, members: Array.isArray(store.members) ? store.members : [] };
  }
  // ครั้งแรก: สำนักงานใหญ่จากข้อมูลร้าน + สาขาที่ตั้งไว้ในหน้าภาษี (beta 0.3.26)
  const settings = printerService.getSettings();
  const hqCode = normalizeBranchCode(settings.shopBranch);
  const branches = [
    cleanBranch({
      code: hqCode,
      name: settings.shopName || 'สำนักงานใหญ่',
      address: settings.shopAddress,
      phone: settings.shopPhone,
      is_headquarters: true,
    }),
    ...normalizeBranches(settings.branches)
      .filter((b) => b.code !== hqCode)
      .map((b) => cleanBranch({ ...b, name: b.name || `สาขา ${b.code}` })),
  ];
  const seeded = { branches, members: [] };
  writeJson(BRANCH_STORAGE_KEYS.DEMO_BRANCHES, seeded);
  return seeded;
}

function writeDemoStore(store) {
  writeJson(BRANCH_STORAGE_KEYS.DEMO_BRANCHES, store);
}

function demoAccess() {
  const { branches } = readDemoStore();
  return normalizeAccess({
    user_id: DEMO_USER_ID,
    email: 'demo@siampos.local',
    display_name: 'เจ้าของร้าน (โหมดสาธิต)',
    has_profile: true,
    is_owner: true,
    owner_exists: true,
    branches: branches
      .slice()
      .sort((a, b) => Number(b.is_headquarters) - Number(a.is_headquarters) || a.code.localeCompare(b.code))
      .map((b) => ({ ...b, role: 'owner' })),
  });
}

function demoStaffAction(action, p = {}) {
  const store = readDemoStore();
  const members = store.members.map((m) => ({ ...m, memberships: [...(m.memberships || [])] }));
  const find = (id) => members.find((m) => m.user_id === id);
  const save = (result) => {
    writeDemoStore({ ...store, members });
    return result;
  };
  if (action === 'create_member') {
    const email = String(p.email || '').trim().toLowerCase();
    const code = normalizeBranchCode(p.branch_code);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
    if (!store.branches.some((b) => b.code === code)) throw new Error('ไม่พบสาขานี้');
    let member = members.find((m) => m.email === email);
    const created = !member;
    if (!member) {
      if (String(p.password || '').length < MIN_ACCOUNT_PASSWORD) {
        throw new Error(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัวอักษร`);
      }
      member = {
        user_id: `demo-${Date.now().toString(36)}`,
        email,
        display_name: String(p.display_name || '').trim() || email.split('@')[0],
        is_owner: false,
        disabled: false,
        created_at: new Date().toISOString(),
        memberships: [],
      };
      members.push(member);
    }
    member.memberships = [
      ...member.memberships.filter((m) => m.branch_code !== code),
      { branch_code: code, role: p.role === 'admin' ? 'admin' : 'staff' },
    ];
    return save({ user_id: member.user_id, created, linked_existing: !created });
  }
  const member = find(String(p.user_id || ''));
  if (!member) throw new Error('ไม่พบบัญชีนี้');
  if (action === 'set_member_role') {
    member.memberships = member.memberships.map((m) =>
      m.branch_code === normalizeBranchCode(p.branch_code) ? { ...m, role: p.role === 'admin' ? 'admin' : 'staff' } : m
    );
    return save({ user_id: member.user_id });
  }
  if (action === 'remove_member') {
    member.memberships = member.memberships.filter((m) => m.branch_code !== normalizeBranchCode(p.branch_code));
    return save({ user_id: member.user_id });
  }
  if (action === 'set_disabled') {
    member.disabled = Boolean(p.disabled);
    return save({ user_id: member.user_id, disabled: member.disabled });
  }
  if (action === 'update_profile') {
    member.display_name = String(p.display_name || '').trim() || member.display_name;
    return save({ user_id: member.user_id });
  }
  if (action === 'reset_password') {
    if (String(p.password || '').length < MIN_ACCOUNT_PASSWORD) {
      throw new Error(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัวอักษร`);
    }
    return { user_id: member.user_id };
  }
  throw new Error('ไม่รู้จักคำสั่งนี้');
}

/**
 * คัดลอกชื่อ/ที่อยู่/เบอร์ของสาขา (ไม่ใช่สำนักงานใหญ่) ไปไว้ในค่าตั้งร้าน `branches` (beta 0.3.26)
 * เพื่อให้ใบเสร็จและใบกำกับภาษีทุกเครื่องพิมพ์ข้อมูลสาขาได้ (สำนักงานใหญ่ใช้ข้อมูลร้าน)
 */
function mirrorBranchToShopSettings(branch) {
  if (!branch?.code || branch.is_headquarters) return;
  try {
    const settings = printerService.getSettings();
    const list = normalizeBranches(settings.branches);
    const row = { code: branch.code, name: branch.name, address: branch.address, phone: branch.phone };
    const next = list.some((b) => b.code === row.code) ? list.map((b) => (b.code === row.code ? row : b)) : [...list, row];
    const updated = printerService.saveSettings({ branches: next });
    posService.saveShopSettings(updated, Boolean(supabase));
  } catch (err) {
    console.warn('mirror branch to shop settings failed', err);
  }
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
export const branchService = {
  isDemo() {
    return !supabase;
  },

  /**
   * โหลดสิทธิ์ของบัญชีที่ล็อกอิน
   * คืน { status: 'ok' | 'unsupported' | 'offline', access, offline? }
   * - unsupported = ยังไม่ได้รัน Migration beta 0.5.0 (ใช้งานแบบเดิม ไม่มีหน้าเลือกสาขา)
   * - ออฟไลน์ = ใช้สิทธิ์ล่าสุดที่เก็บในเครื่อง (ของบัญชีเดียวกัน) ไม่มี = status 'offline'
   */
  async loadAccess(userId = '') {
    if (!supabase) return { status: 'ok', access: demoAccess() };
    try {
      const { data, error } = await supabase.rpc('siampos_my_access');
      if (error) {
        if (isMissingFunctionError(error)) return { status: 'unsupported', access: null };
        throw error;
      }
      const access = normalizeAccess(data);
      writeJson(BRANCH_STORAGE_KEYS.BRANCH_ACCESS, { ...access, cached_at: new Date().toISOString() });
      return { status: 'ok', access };
    } catch (err) {
      const cached = readJson(BRANCH_STORAGE_KEYS.BRANCH_ACCESS, null);
      if (cached && (!userId || cached.user_id === userId)) {
        return { status: 'ok', access: normalizeAccess(cached), offline: true };
      }
      if (isNetworkError(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        return { status: 'offline', access: null };
      }
      throw err;
    }
  },

  // ตั้งบัญชีที่ล็อกอินเป็นเจ้าของร้าน (ร้านยังไม่มี Owner)
  async claimOwner(displayName = '') {
    const { data, error } = await supabase.rpc('siampos_claim_owner', { p_display_name: displayName });
    if (error) throw new Error(error.message);
    const access = normalizeAccess(data);
    writeJson(BRANCH_STORAGE_KEYS.BRANCH_ACCESS, { ...access, cached_at: new Date().toISOString() });
    return access;
  },

  getCurrentBranch() {
    const saved = readJson(BRANCH_STORAGE_KEYS.CURRENT_BRANCH, null);
    return saved?.code ? saved : null;
  },

  setCurrentBranch(branch, userId = '') {
    if (!branch?.code) {
      writeJson(BRANCH_STORAGE_KEYS.CURRENT_BRANCH, null);
      return null;
    }
    const saved = { ...cleanBranch(branch), user_id: userId, selected_at: new Date().toISOString() };
    writeJson(BRANCH_STORAGE_KEYS.CURRENT_BRANCH, saved);
    return saved;
  },

  clearCurrentBranch() {
    writeJson(BRANCH_STORAGE_KEYS.CURRENT_BRANCH, null);
  },

  // รหัสสาขาถัดไปที่ยังว่าง (เติมให้ในฟอร์มสร้างสาขา)
  suggestNextCode(branches = []) {
    const used = new Set(branches.map((b) => b.code));
    let n = 1;
    while (used.has(String(n).padStart(5, '0')) && n < 99999) n += 1;
    return String(n).padStart(5, '0');
  },

  // เพิ่ม/แก้สาขา (Owner เท่านั้น) isNew = สร้างใหม่ (รหัสซ้ำไม่ได้)
  async saveBranch(branch, isNew = false) {
    const payload = {
      code: normalizeBranchCode(branch.code),
      name: String(branch.name || '').trim(),
      address: String(branch.address || '').trim(),
      phone: String(branch.phone || '').trim(),
      is_active: branch.is_active !== false,
      is_new: isNew,
    };
    if (!/^\d{1,5}$/.test(String(branch.code || '').trim())) throw new Error('รหัสสาขาต้องเป็นตัวเลข 5 หลัก');
    if (!payload.name) throw new Error('กรุณาระบุชื่อสาขา');
    if (!supabase) {
      const store = readDemoStore();
      const exists = store.branches.find((b) => b.code === payload.code);
      if (isNew && exists) throw new Error(`รหัสสาขา ${payload.code} มีอยู่แล้ว`);
      if (exists?.is_headquarters && !payload.is_active) throw new Error('ปิดใช้สำนักงานใหญ่ไม่ได้');
      const row = cleanBranch({ ...exists, ...payload, is_headquarters: exists?.is_headquarters });
      writeDemoStore({
        ...store,
        branches: exists ? store.branches.map((b) => (b.code === row.code ? row : b)) : [...store.branches, row],
      });
      mirrorBranchToShopSettings(row);
      return row;
    }
    const { data, error } = await supabase.rpc('siampos_save_branch', { p_branch: payload });
    if (error) throw new Error(error.message);
    const saved = cleanBranch(data);
    mirrorBranchToShopSettings(saved);
    return saved;
  },

  // รายชื่อบัญชี (branchCode ว่าง = ทุกบัญชี เฉพาะ Owner)
  async listMembers(branchCode = null) {
    if (!supabase) {
      const { members } = readDemoStore();
      const code = branchCode ? normalizeBranchCode(branchCode) : null;
      const owner = {
        user_id: DEMO_USER_ID,
        email: 'demo@siampos.local',
        display_name: 'เจ้าของร้าน (โหมดสาธิต)',
        is_owner: true,
        disabled: false,
        memberships: [],
      };
      return [owner, ...members].filter((m) => !code || m.memberships.some((x) => x.branch_code === code));
    }
    const { data, error } = await supabase.rpc('siampos_list_members', {
      p_branch_code: branchCode ? normalizeBranchCode(branchCode) : null,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : [];
  },

  /**
   * คำสั่งจัดการบัญชีผ่าน Edge Function staff-admin
   * action: create_member | set_member_role | remove_member | reset_password | set_disabled | update_profile
   */
  async staffAction(action, payload = {}) {
    if (!supabase) return demoStaffAction(action, payload);
    let result;
    try {
      result = await supabase.functions.invoke('staff-admin', { body: { action, payload } });
    } catch (err) {
      throw new Error(err?.message || 'เรียก Edge Function ไม่สำเร็จ');
    }
    const { data, error } = result;
    if (data && typeof data === 'object' && 'ok' in data) {
      if (!data.ok) throw new Error(data.error || 'ทำรายการไม่สำเร็จ');
      return data.data;
    }
    if (error) {
      // FunctionsHttpError: อ่านข้อความจากเนื้อหาที่ฟังก์ชันตอบ
      try {
        const body = await error.context?.json?.();
        if (body?.error) throw new Error(body.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message && !/json/i.test(inner.message)) throw inner;
      }
      if (/not found|404|failed to send|relay/i.test(String(error.message || ''))) {
        throw new Error('ยังไม่ได้ติดตั้ง Edge Function "staff-admin" บน Supabase (ดูขั้นตอนในหน้าสาขาและบัญชี)');
      }
      throw new Error(error.message || 'ทำรายการไม่สำเร็จ');
    }
    throw new Error('ทำรายการไม่สำเร็จ');
  },

  // เปลี่ยนรหัสผ่านของบัญชีตัวเอง
  async changeMyPassword(newPassword) {
    if (String(newPassword || '').length < MIN_ACCOUNT_PASSWORD) {
      throw new Error(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัวอักษร`);
    }
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
};
