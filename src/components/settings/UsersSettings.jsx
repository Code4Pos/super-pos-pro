import React, { useState } from 'react';
import { Users, UserPlus, Edit3, ShieldCheck, AlertTriangle } from 'lucide-react';
import SettingsCard, { FieldLabel, inputClass } from './SettingsCard';
import { usePOS } from '../../context/POSContext';
import { ROLES, PERMISSION_LABELS } from '../../utils/rbac';

const EMPTY_FORM = { id: null, name: '', role: 'cashier', pin: '', is_active: true };

/**
 * จัดการผู้ใช้งานและสิทธิ์ (RBAC) — เฉพาะผู้ดูแลระบบ
 * ผู้ใช้คนแรกต้องเป็นผู้ดูแลระบบ และระบบจะเริ่มบังคับล็อกอินด้วย PIN ทันที
 */
export default function UsersSettings() {
  const { users, saveUser, authEnabled, currentUser } = usePOS();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const openNew = () =>
    setForm({ ...EMPTY_FORM, role: authEnabled ? 'cashier' : 'admin' });

  const openEdit = (u) => setForm({ id: u.id, name: u.name, role: u.role, pin: '', is_active: u.is_active });

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveUser(form);
      if (saved) setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const pinValid = form && (form.pin === '' ? Boolean(form.id) : /^\d{4,6}$/.test(form.pin));

  return (
    <div className="space-y-3.5">
      <SettingsCard
        icon={Users}
        title="ผู้ใช้งาน & สิทธิ์"
        description="พนักงานล็อกอินด้วย PIN และเห็นเฉพาะเมนูตามบทบาท"
        footer={
          <button
            type="button"
            onClick={openNew}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>{authEnabled ? 'เพิ่มผู้ใช้งาน' : 'สร้างผู้ดูแลระบบคนแรก'}</span>
          </button>
        }
      >
        {!authEnabled && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              ตอนนี้ยังไม่มีผู้ใช้งาน ทุกคนเข้าได้ทุกเมนูโดยไม่ต้องล็อกอิน เมื่อสร้างผู้ดูแลระบบคนแรก
              ระบบจะเริ่มให้ล็อกอินด้วย PIN ทันที
            </span>
          </div>
        )}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
          หมายเหตุ: สิทธิ์นี้จำกัดการใช้งานในตัวแอป (ซ่อนเมนูและปุ่ม) ยังไม่ใช่การล็อกสิทธิ์ระดับฐานข้อมูล
        </div>

        {users.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {users.map((u) => (
              <div key={u.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    {u.name}
                    {currentUser?.id === u.id && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px]">คุณ</span>
                    )}
                    {!u.is_active && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">ปิดใช้งาน</span>
                    )}
                  </div>
                  <div className="text-slate-500">{ROLES[u.role]?.label || u.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600"
                  title="แก้ไขผู้ใช้งาน"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {form && (
        <SettingsCard
          icon={UserPlus}
          title={form.id ? `แก้ไขผู้ใช้งาน: ${form.name}` : 'เพิ่มผู้ใช้งาน'}
          onSave={handleSave}
          canSave={!saving && form.name.trim() !== '' && pinValid}
          footer={
            <button
              type="button"
              onClick={() => setForm(null)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-700"
            >
              ยกเลิก
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>ชื่อผู้ใช้งาน *</FieldLabel>
              <input
                type="text"
                data-allow-scanner="false"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>PIN 4-6 หลัก {form.id ? '(เว้นว่าง = ใช้ PIN เดิม)' : '*'}</FieldLabel>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                data-allow-scanner="false"
                maxLength={6}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                className={`${inputClass} font-mono tracking-widest`}
              />
            </div>
          </div>
          <div>
            <FieldLabel>บทบาท</FieldLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(ROLES).map(([id, role]) => (
                <button
                  key={id}
                  type="button"
                  disabled={!authEnabled && id !== 'admin'}
                  onClick={() => setForm({ ...form, role: id })}
                  className={`p-2.5 rounded-xl border text-left disabled:opacity-40 ${
                    form.role === id ? 'border-indigo-600 bg-indigo-50/70' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">{role.label}</div>
                  <div className="text-[10px] text-slate-500">{role.description}</div>
                </button>
              ))}
            </div>
          </div>
          {form.id && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 accent-indigo-600"
              />
              เปิดใช้งานบัญชีนี้
            </label>
          )}
        </SettingsCard>
      )}

      {/* ตารางสิทธิ์ตามบทบาท */}
      <SettingsCard icon={ShieldCheck} title="สิทธิ์ตามบทบาท" description="อ้างอิงจากสเปก (Permission Matrix)">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="py-2 px-2 text-left">สิทธิ์</th>
                {Object.values(ROLES).map((r) => (
                  <th key={r.label} className="py-2 px-2 text-center">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(PERMISSION_LABELS).map(([perm, label]) => (
                <tr key={perm}>
                  <td className="py-1.5 px-2 font-semibold text-slate-700">{label}</td>
                  {Object.values(ROLES).map((r) => (
                    <td key={r.label} className="py-1.5 px-2 text-center">
                      {r.permissions === '*' || r.permissions.includes(perm) ? '✅' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </div>
  );
}
