import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Pencil, Users, KeyRound, Loader2, UserPlus, Ban, CheckCircle2, Trash2, Info, Crown, RefreshCw,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useBranch } from '../../context/BranchContext';
import { branchService, MEMBER_ROLE_LABELS, MIN_ACCOUNT_PASSWORD } from '../../services/branchService';
import { formatBranchLabel } from '../../utils/branches';
import BranchFormModal from '../branch/BranchFormModal';

const card = 'bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3';
const input = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

/**
 * ตั้งค่า › สาขาและบัญชี (beta 0.5.0)
 * - บัญชีของฉัน: เปลี่ยนรหัสผ่าน
 * - สาขา (Owner): สร้าง / แก้ / ปิดใช้
 * - บัญชีผู้ใช้ (Owner = ทุกสาขา, ผู้ดูแลสาขา = สาขาที่ดูแล): สร้างบัญชี เพิ่มเข้าสาขา เปลี่ยนบทบาท ตั้งรหัสผ่านใหม่ ปิดบัญชี
 */
export default function BranchesSettings() {
  const branchCtx = useBranch();

  if (!branchCtx.enabled) {
    return (
      <div className={card}>
        <h2 className="font-extrabold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" /> สาขาและบัญชี
        </h2>
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
          <p className="font-bold">ระบบสาขายังไม่เปิดใช้งานในเครื่องนี้</p>
          {branchCtx.offline ? (
            <p>เครื่องออฟไลน์ เชื่อมต่ออินเทอร์เน็ตแล้วเปิดแอปใหม่</p>
          ) : (
            <SetupSteps />
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <MyAccountCard />
      {branchCtx.isOwner && <BranchListCard />}
      {branchCtx.canManageAccounts ? (
        <MembersCard />
      ) : (
        <div className={`${card} text-xs text-slate-600`}>
          จัดการบัญชีผู้ใช้ได้เฉพาะเจ้าของร้านและผู้ดูแลสาขา
        </div>
      )}
      {branchCtx.isOwner && !branchCtx.demo && (
        <div className={card}>
          <h3 className="text-sm font-extrabold flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-600" /> การติดตั้งบนฐานข้อมูล
          </h3>
          <div className="text-xs text-slate-600 leading-relaxed">
            <SetupSteps />
          </div>
        </div>
      )}
    </>
  );
}

function SetupSteps() {
  return (
    <ol className="list-decimal pl-4 space-y-1">
      <li>รัน <b>Migration beta 0.5.0</b> (ท้ายไฟล์ supabase/schema.sql) ใน Supabase SQL Editor</li>
      <li>
        Supabase › Edge Functions › Deploy a new function ชื่อ <b className="font-mono">staff-admin</b> แล้ววางโค้ดจาก
        <span className="font-mono"> supabase/functions/staff-admin/index.ts</span> (ใช้สร้างบัญชี/ตั้งรหัสผ่าน/ปิดบัญชี)
      </li>
      <li>เปิดแอปใหม่ บัญชีที่ล็อกอินอยู่กดยืนยันเป็นเจ้าของร้าน (Owner)</li>
    </ol>
  );
}

function RoleBadge({ role }) {
  const cls =
    role === 'owner' ? 'bg-amber-100 text-amber-800' : role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600';
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${cls}`}>{MEMBER_ROLE_LABELS[role] || role}</span>;
}

function MyAccountCard() {
  const { showToast } = usePOS();
  const { access, branch, demo } = useBranch();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = async (e) => {
    e.preventDefault();
    if (password !== confirm) return showToast('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'error');
    setSaving(true);
    try {
      await branchService.changeMyPassword(password);
      setPassword('');
      setConfirm('');
      showToast('เปลี่ยนรหัสผ่านแล้ว', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={card}>
      <h2 className="font-extrabold flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-indigo-600" /> บัญชีของฉัน
      </h2>
      <div className="text-sm space-y-0.5">
        <p className="font-bold text-slate-900">{access.display_name || access.email}</p>
        <p className="text-xs text-slate-500 break-all">{access.email}</p>
        <p className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
          สาขาที่ใช้อยู่: <b>{branch.name || branch.code}</b> <span className="font-mono">{branch.code}</span> <RoleBadge role={branch.role} />
        </p>
      </div>
      {!demo && (
        <form onSubmit={handleChange} className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={`รหัสผ่านใหม่ (อย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัว)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="ยืนยันรหัสผ่านใหม่"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
          />
          <button
            type="submit"
            disabled={saving || !password}
            className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} เปลี่ยนรหัสผ่าน
          </button>
        </form>
      )}
    </div>
  );
}

function BranchListCard() {
  const { showToast } = usePOS();
  const { branches, refresh } = useBranch();
  const [editing, setEditing] = useState(null); // null = ปิด, 'new' = สร้าง, object = แก้ไข

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-extrabold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" /> สาขา ({branches.length})
        </h2>
        <button
          onClick={() => setEditing('new')}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> สร้างสาขา
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        รอบนี้ทุกสาขายังใช้ข้อมูลสินค้า ลูกค้า และสต็อกชุดเดียวกัน (แยกข้อมูลตามสาขาในเวอร์ชันถัดไป) ที่อยู่ของสาขาใช้บนใบเสร็จและใบกำกับภาษี
      </p>
      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {branches.map((b) => (
          <div key={b.code} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                {b.name || formatBranchLabel(b.code)}
                {b.is_headquarters && <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[9px]">สำนักงานใหญ่</span>}
                {!b.is_active && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px]">ปิดใช้งาน</span>}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                <span className="font-mono">{b.code}</span>
                {b.address ? ` · ${b.address}` : ''}
                {b.phone ? ` · ${b.phone}` : ''}
              </p>
            </div>
            <button onClick={() => setEditing(b)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="แก้ไขสาขา">
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <BranchFormModal
          branch={editing === 'new' ? null : editing}
          existingBranches={branches}
          onClose={() => setEditing(null)}
          onSaved={async (saved, warning) => {
            setEditing(null);
            showToast(warning || `บันทึกสาขา ${saved.name} แล้ว`, warning ? 'warning' : 'success');
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function MembersCard() {
  const { showToast } = usePOS();
  const { access, branch, branches, isOwner } = useBranch();
  // สาขาที่จัดการบัญชีได้: Owner = ทุกสาขา / ผู้ดูแล = สาขาที่เป็น admin
  const manageable = useMemo(
    () => (isOwner ? branches : branches.filter((b) => b.role === 'admin')),
    [isOwner, branches]
  );
  const [filter, setFilter] = useState(() => (isOwner ? '' : branch.code));
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const branchName = (code) => branches.find((b) => b.code === code)?.name || code;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await branchService.listMembers(filter || null));
    } catch (err) {
      showToast(err.message, 'error');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  // โหลดใหม่เมื่อเปลี่ยนตัวกรอง หรือรายชื่อสาขาเปลี่ยน (สร้างสาขาพร้อมผู้ดูแล)
  useEffect(() => {
    load();
  }, [load, branches]);

  const run =async (key, action, payload, successText) => {
    setBusy(key);
    try {
      await branchService.staffAction(action, payload);
      showToast(successText, 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const canManageMember = (m) => {
    if (m.is_owner || m.user_id === access.user_id) return false;
    if (isOwner) return true;
    return m.memberships.length > 0 && m.memberships.every((x) => manageable.some((b) => b.code === x.branch_code));
  };

  const handleResetPassword = (m) => {
    const pwd = window.prompt(`ตั้งรหัสผ่านใหม่ให้ ${m.email} (อย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัวอักษร)`);
    if (pwd === null) return;
    run(`pwd-${m.user_id}`, 'reset_password', { user_id: m.user_id, password: pwd }, `ตั้งรหัสผ่านใหม่ให้ ${m.email} แล้ว`);
  };

  const handleRename = (m) => {
    const name = window.prompt('ชื่อที่แสดง', m.display_name || '');
    if (name === null || !name.trim()) return;
    run(`name-${m.user_id}`, 'update_profile', { user_id: m.user_id, display_name: name }, 'บันทึกชื่อแล้ว');
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" /> บัญชีผู้ใช้
        </h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
            {isOwner && <option value="">ทุกสาขา</option>}
            {manageable.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
          <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="โหลดใหม่">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
          >
            <UserPlus className="w-4 h-4" /> เพิ่มบัญชี
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        บัญชี (อีเมล/รหัสผ่าน) ใช้ล็อกอินเข้าเครื่องและเลือกสาขา ส่วนสิทธิ์ในแอป (เมนู ยกเลิกบิล อนุมัติ) ยังใช้ผู้ใช้ PIN ที่ ตั้งค่า › ผู้ใช้งาน & สิทธิ์ ตามเดิม
      </p>

      {showAdd && (
        <AddMemberForm
          manageable={manageable}
          defaultBranch={filter || branch.code}
          onDone={async (text) => {
            setShowAdd(false);
            showToast(text, 'success');
            await load();
          }}
        />
      )}

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {loading && members.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
          </div>
        )}
        {!loading && members.length === 0 && <div className="p-4 text-center text-xs text-slate-500">ยังไม่มีบัญชีในสาขานี้</div>}
        {members.map((m) => {
          const manage = canManageMember(m);
          const inFilter = filter ? m.memberships.find((x) => x.branch_code === filter) : null;
          return (
            <div key={m.user_id} className={`px-3 py-2.5 space-y-1.5 ${m.disabled ? 'bg-slate-50' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold truncate flex items-center gap-1.5 ${m.disabled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {m.is_owner && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {m.display_name || m.email}
                    {m.user_id === access.user_id && <span className="text-[10px] font-semibold text-indigo-600 no-underline">(คุณ)</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 break-all">{m.email}</p>
                </div>
                {m.disabled && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold shrink-0">ปิดใช้งาน</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {m.is_owner ? (
                  <RoleBadge role="owner" />
                ) : m.memberships.length === 0 ? (
                  <span className="text-[10px] text-slate-400">ไม่ได้สังกัดสาขา</span>
                ) : (
                  m.memberships.map((x) => (
                    <span key={x.branch_code} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
                      <span className="font-semibold text-slate-700">{branchName(x.branch_code)}</span>
                      <RoleBadge role={x.role} />
                    </span>
                  ))
                )}
              </div>
              {!m.is_owner && m.user_id !== access.user_id && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {inFilter && manageable.some((b) => b.code === filter) && (
                    <>
                      <select
                        value={inFilter.role}
                        disabled={Boolean(busy)}
                        onChange={(e) =>
                          run(`role-${m.user_id}`, 'set_member_role', { user_id: m.user_id, branch_code: filter, role: e.target.value }, 'เปลี่ยนบทบาทแล้ว')
                        }
                        className="px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-semibold"
                      >
                        <option value="staff">พนักงาน</option>
                        <option value="admin">ผู้ดูแลสาขา</option>
                      </select>
                      <SmallButton
                        icon={Trash2}
                        label="เอาออกจากสาขา"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (window.confirm(`เอา ${m.email} ออกจาก ${branchName(filter)}?`)) {
                            run(`rm-${m.user_id}`, 'remove_member', { user_id: m.user_id, branch_code: filter }, 'เอาออกจากสาขาแล้ว');
                          }
                        }}
                      />
                    </>
                  )}
                  {manage && (
                    <>
                      <SmallButton icon={Pencil} label="แก้ชื่อ" disabled={Boolean(busy)} onClick={() => handleRename(m)} />
                      <SmallButton icon={KeyRound} label="ตั้งรหัสผ่านใหม่" disabled={Boolean(busy)} onClick={() => handleResetPassword(m)} />
                      <SmallButton
                        icon={m.disabled ? CheckCircle2 : Ban}
                        label={m.disabled ? 'เปิดใช้งาน' : 'ปิดบัญชี'}
                        danger={!m.disabled}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (m.disabled || window.confirm(`ปิดบัญชี ${m.email}? บัญชีนี้จะล็อกอินไม่ได้จนกว่าจะเปิดใช้งาน`)) {
                            run(`dis-${m.user_id}`, 'set_disabled', { user_id: m.user_id, disabled: !m.disabled }, m.disabled ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดบัญชีแล้ว');
                          }
                        }}
                      />
                    </>
                  )}
                  {busy.endsWith(m.user_id) && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SmallButton({ icon: Icon, label, onClick, disabled, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 ${
        danger ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function AddMemberForm({ manageable, defaultBranch, onDone }) {
  const { showToast } = usePOS();
  const [form, setForm] = useState({
    email: '',
    display_name: '',
    password: '',
    role: 'staff',
    branch_code: manageable.some((b) => b.code === defaultBranch) ? defaultBranch : manageable[0]?.code || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await branchService.staffAction('create_member', form);
      const name = manageable.find((b) => b.code === form.branch_code)?.name || form.branch_code;
      await onDone(res?.created ? `สร้างบัญชี ${form.email} ใน ${name} แล้ว` : `เพิ่มบัญชีที่มีอยู่ ${form.email} เข้า ${name} แล้ว`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="email" required placeholder="อีเมล" value={form.email} onChange={(e) => set({ email: e.target.value })} className={input} />
      <input placeholder="ชื่อที่แสดง" value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} className={input} />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={`รหัสผ่าน (อย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัว) เว้นว่างถ้ามีบัญชีแล้ว`}
        value={form.password}
        onChange={(e) => set({ password: e.target.value })}
        className={`${input} sm:col-span-2`}
      />
      <select value={form.branch_code} onChange={(e) => set({ branch_code: e.target.value })} className={input}>
        {manageable.map((b) => (
          <option key={b.code} value={b.code}>
            {b.code} · {b.name}
          </option>
        ))}
      </select>
      <select value={form.role} onChange={(e) => set({ role: e.target.value })} className={input}>
        <option value="staff">พนักงาน</option>
        <option value="admin">ผู้ดูแลสาขา (จัดการบัญชีของสาขาได้)</option>
      </select>
      <button
        type="submit"
        disabled={saving}
        className="sm:col-span-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} บันทึกบัญชี
      </button>
    </form>
  );
}
