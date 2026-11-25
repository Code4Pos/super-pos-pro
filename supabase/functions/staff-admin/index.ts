// SiamPOS Pro — Edge Function "staff-admin" (beta 0.5.0)
// จัดการบัญชีพนักงาน (Supabase Auth) ที่ต้องใช้สิทธิ์ service role: สร้างบัญชี / ตั้งรหัสผ่านใหม่ / ปิด-เปิดบัญชี / สังกัดสาขาและบทบาท
// - ตรวจสิทธิ์ผู้เรียกจากฟังก์ชัน siampos_my_access() (Migration beta 0.5.0) ด้วย token ของผู้เรียกเอง
// - Owner จัดการได้ทุกสาขา / ผู้ดูแลสาขา (admin) จัดการได้เฉพาะสาขาที่ดูแล / พนักงาน (staff) ทำอะไรไม่ได้
// - service role key อ่านจาก environment ของ Supabase เท่านั้น (SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติ) ห้ามใส่ในแอปหรือ repo
// Deploy: Supabase Dashboard > Edge Functions > Deploy a new function > ชื่อ staff-admin > วางไฟล์นี้ทั้งไฟล์
//   หรือ CLI: supabase functions deploy staff-admin

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MEMBER_ROLES = ['admin', 'staff'];
const MIN_PASSWORD_LENGTH = 8;
const BAN_FOREVER = '876000h';

export class StaffAdminError extends Error {}

function fail(message) {
  throw new StaffAdminError(message);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(5, '0').slice(-5) : '';
}

function checkPassword(password) {
  if (String(password || '').length < MIN_PASSWORD_LENGTH) {
    fail(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }
}

function checkRole(role) {
  if (!MEMBER_ROLES.includes(role)) fail('บทบาทไม่ถูกต้อง');
}

// บทบาทของผู้เรียกในแต่ละสาขา (จากผลของ siampos_my_access)
function callerRoleIn(access, branchCode) {
  if (access?.is_owner) return 'owner';
  const found = (access?.branches || []).find((b) => b.code === branchCode);
  return found?.role || null;
}

function canManageBranch(access, branchCode) {
  const role = callerRoleIn(access, branchCode);
  return role === 'owner' || role === 'admin';
}

/**
 * ผู้เรียกจัดการบัญชีนี้ (ตั้งรหัสผ่าน / ปิดบัญชี / แก้ชื่อ) ได้ไหม
 * Owner = ทุกบัญชียกเว้น Owner คนอื่น / ผู้ดูแลสาขา = บัญชีที่สังกัดเฉพาะสาขาที่ตัวเองดูแลทั้งหมด
 */
function assertCanManageUser(access, profile, memberships) {
  if (!profile) fail('ไม่พบบัญชีนี้');
  if (profile.user_id === access.user_id) fail('จัดการบัญชีของตัวเองที่หน้า "บัญชีของฉัน"');
  if (profile.is_owner) fail('จัดการบัญชีเจ้าของร้าน (Owner) ไม่ได้');
  if (access.is_owner) return;
  if (!memberships.length || !memberships.every((m) => canManageBranch(access, m.branch_code))) {
    fail('บัญชีนี้สังกัดสาขาที่คุณไม่ได้ดูแล ให้เจ้าของร้านเป็นผู้จัดการ');
  }
}

/**
 * ทำงานตามคำสั่ง (แยกจากการเชื่อมต่อจริงเพื่อทดสอบได้)
 * db = ตัวเชื่อมต่อแบบ service role: findProfileByEmail, findAuthUserByEmail, getProfile, getMemberships,
 *      branchExists, createAuthUser, updateAuthUser, insertProfile, updateProfile, upsertMember, deleteMember
 */
export async function handleStaffAdmin(body, { access, db }) {
  if (!access?.user_id) fail('ต้องล็อกอินก่อน');
  if (access.disabled) fail('บัญชีนี้ถูกปิดใช้งาน');
  const action = String(body?.action || '');
  const p = body?.payload || {};

  if (action === 'create_member') {
    const email = cleanEmail(p.email);
    const branchCode = cleanCode(p.branch_code);
    const role = String(p.role || 'staff');
    const displayName = String(p.display_name || '').trim().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('อีเมลไม่ถูกต้อง');
    checkRole(role);
    if (!branchCode || !(await db.branchExists(branchCode))) fail('ไม่พบสาขานี้');
    if (!canManageBranch(access, branchCode)) fail('คุณไม่มีสิทธิ์เพิ่มบัญชีในสาขานี้');

    let profile = await db.findProfileByEmail(email);
    let created = false;
    if (!profile) {
      // บัญชี Auth มีอยู่แล้วแต่ยังไม่มีโปรไฟล์ (เช่น บัญชีร้านเดิมของเครื่องอื่น) = ผูกโปรไฟล์ ไม่สร้างใหม่
      let authUser = await db.findAuthUserByEmail(email);
      if (!authUser) {
        checkPassword(p.password);
        authUser = await db.createAuthUser({ email, password: String(p.password), email_confirm: true });
        created = true;
      }
      profile = await db.insertProfile({ user_id: authUser.id, email, display_name: displayName || email.split('@')[0] });
    } else if (profile.is_owner) {
      fail('บัญชีนี้เป็นเจ้าของร้าน (Owner) เข้าได้ทุกสาขาอยู่แล้ว');
    } else if (profile.disabled) {
      fail('บัญชีนี้ถูกปิดใช้งานอยู่ ให้เปิดใช้งานก่อน');
    }
    await db.upsertMember({ user_id: profile.user_id, branch_code: branchCode, role });
    return { user_id: profile.user_id, created, linked_existing: !created };
  }

  if (action === 'set_member_role' || action === 'remove_member') {
    const userId = String(p.user_id || '');
    const branchCode = cleanCode(p.branch_code);
    if (!canManageBranch(access, branchCode)) fail('คุณไม่มีสิทธิ์จัดการบัญชีของสาขานี้');
    const profile = await db.getProfile(userId);
    if (!profile) fail('ไม่พบบัญชีนี้');
    if (profile.is_owner) fail('จัดการบัญชีเจ้าของร้าน (Owner) ไม่ได้');
    if (userId === access.user_id && !access.is_owner) fail('เปลี่ยนสิทธิ์ของตัวเองไม่ได้');
    const memberships = await db.getMemberships(userId);
    if (!memberships.some((m) => m.branch_code === branchCode)) fail('บัญชีนี้ไม่ได้สังกัดสาขานี้');
    if (action === 'set_member_role') {
      const role = String(p.role || '');
      checkRole(role);
      await db.upsertMember({ user_id: userId, branch_code: branchCode, role });
      return { user_id: userId, role };
    }
    await db.deleteMember(userId, branchCode);
    return { user_id: userId, removed: branchCode };
  }

  if (action === 'reset_password' || action === 'set_disabled' || action === 'update_profile') {
    const userId = String(p.user_id || '');
    const profile = await db.getProfile(userId);
    const memberships = profile ? await db.getMemberships(userId) : [];
    assertCanManageUser(access, profile, memberships);
    if (action === 'reset_password') {
      checkPassword(p.password);
      await db.updateAuthUser(userId, { password: String(p.password) });
      return { user_id: userId };
    }
    if (action === 'set_disabled') {
      const disabled = Boolean(p.disabled);
      await db.updateAuthUser(userId, { ban_duration: disabled ? BAN_FOREVER : 'none' });
      await db.updateProfile(userId, { disabled });
      return { user_id: userId, disabled };
    }
    const displayName = String(p.display_name || '').trim().slice(0, 80);
    if (!displayName) fail('กรุณาระบุชื่อ');
    await db.updateProfile(userId, { display_name: displayName });
    return { user_id: userId, display_name: displayName };
  }

  fail('ไม่รู้จักคำสั่งนี้');
}

// ---------------------------------------------------------------------
// ตัวเชื่อมต่อจริง (Deno บน Supabase Edge Functions)
// ---------------------------------------------------------------------
function createDb(admin) {
  const one = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  return {
    findProfileByEmail: async (email) =>
      (await one(admin.from('staff_profiles').select('*').ilike('email', email).limit(1)))[0] || null,
    getProfile: async (userId) =>
      (await one(admin.from('staff_profiles').select('*').eq('user_id', userId).limit(1)))[0] || null,
    getMemberships: async (userId) =>
      await one(admin.from('branch_members').select('branch_code, role').eq('user_id', userId)),
    branchExists: async (code) =>
      (await one(admin.from('branches').select('code').eq('code', code).limit(1))).length > 0,
    findAuthUserByEmail: async (email) => {
      // ร้านมีบัญชีไม่มาก: ไล่ทีละหน้า
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const users = data?.users || [];
        const found = users.find((u) => cleanEmail(u.email) === email);
        if (found) return found;
        if (users.length < 200) break;
      }
      return null;
    },
    createAuthUser: async (attrs) => {
      const { data, error } = await admin.auth.admin.createUser(attrs);
      if (error) throw error;
      return data.user;
    },
    updateAuthUser: async (userId, attrs) => {
      const { error } = await admin.auth.admin.updateUserById(userId, attrs);
      if (error) throw error;
    },
    insertProfile: async (row) => (await one(admin.from('staff_profiles').insert(row).select('*')))[0],
    updateProfile: async (userId, patch) =>
      one(admin.from('staff_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', userId)),
    upsertMember: async (row) =>
      one(admin.from('branch_members').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id,branch_code' })),
    deleteMember: async (userId, code) =>
      one(admin.from('branch_members').delete().eq('user_id', userId).eq('branch_code', code)),
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function serve(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const env = globalThis.Deno.env;
    const url = env.get('SUPABASE_URL');
    const anonKey = env.get('SUPABASE_ANON_KEY');
    const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') || env.get('SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return jsonResponse({ ok: false, error: 'Edge Function ยังตั้งค่าไม่ครบ' }, 500);
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: access, error: accessError } = await userClient.rpc('siampos_my_access');
    if (accessError || !access) return jsonResponse({ ok: false, error: 'ต้องล็อกอินก่อน' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const data = await handleStaffAdmin(body, { access, db: createDb(admin) });
    return jsonResponse({ ok: true, data });
  } catch (err) {
    if (err instanceof StaffAdminError) return jsonResponse({ ok: false, error: err.message });
    const message = String(err?.message || err || 'เกิดข้อผิดพลาด');
    const friendly = /already (been )?registered|already exists/i.test(message)
      ? 'อีเมลนี้มีบัญชีอยู่แล้ว'
      : /password/i.test(message)
      ? `รหัสผ่านไม่ผ่านเงื่อนไขของระบบ: ${message}`
      : message;
    return jsonResponse({ ok: false, error: friendly }, 500);
  }
}

if (typeof globalThis.Deno !== 'undefined' && typeof globalThis.Deno.serve === 'function') {
  globalThis.Deno.serve(serve);
}
