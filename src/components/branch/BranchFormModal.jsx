import React, { useState } from 'react';
import { X, Building2, Loader2, UserPlus } from 'lucide-react';
import { branchService, MIN_ACCOUNT_PASSWORD } from '../../services/branchService';
import { formatBranchLabel } from '../../utils/branches';

/**
 * ฟอร์มสร้าง/แก้ไขสาขา (เจ้าของร้านเท่านั้น)
 * สร้างใหม่: ใส่ผู้ดูแลสาขาพร้อมกันได้ (อีเมลใหม่ = สร้างบัญชี, อีเมลที่มีบัญชีแล้ว = เพิ่มเข้าสาขา)
 */
export default function BranchFormModal({ branch = null, existingBranches = [], onClose, onSaved }) {
  const isNew = !branch;
  const [form, setForm] = useState(() => ({
    code: branch?.code || branchService.suggestNextCode(existingBranches),
    name: branch?.name || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
    is_active: branch ? branch.is_active !== false : true,
  }));
  const [admin, setAdmin] = useState({ email: '', display_name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const codeValid = /^\d{5}$/.test(form.code);
  const codeTaken = isNew && existingBranches.some((b) => b.code === form.code);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!codeValid) return setError('รหัสสาขาต้องเป็นตัวเลข 5 หลัก');
    if (codeTaken) return setError(`รหัสสาขา ${form.code} มีอยู่แล้ว`);
    if (!form.name.trim()) return setError('กรุณาระบุชื่อสาขา');
    const adminEmail = admin.email.trim();
    if (isNew && adminEmail && admin.password && admin.password.length < MIN_ACCOUNT_PASSWORD) {
      return setError(`รหัสผ่านผู้ดูแลต้องยาวอย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัวอักษร`);
    }
    setSaving(true);
    let saved;
    try {
      saved = await branchService.saveBranch(form, isNew);
    } catch (err) {
      setSaving(false);
      return setError(err.message);
    }
    let warning = '';
    if (isNew && adminEmail) {
      try {
        await branchService.staffAction('create_member', {
          email: adminEmail,
          display_name: admin.display_name,
          password: admin.password,
          branch_code: saved.code,
          role: 'admin',
        });
      } catch (err) {
        warning = `สร้างสาขาแล้ว แต่เพิ่มผู้ดูแลไม่สำเร็จ: ${err.message}`;
      }
    }
    setSaving(false);
    onSaved?.(saved, warning);
  };

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 flex items-center justify-center p-3">
      <form onSubmit={handleSubmit} className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-3xl text-slate-900">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-extrabold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" /> {isNew ? 'สร้างสาขาใหม่' : `แก้ไขสาขา ${branch.code}`}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="ปิด">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-600">รหัสสาขา</span>
              <input
                value={form.code}
                disabled={!isNew}
                inputMode="numeric"
                maxLength={5}
                onChange={(e) => set({ code: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                className={`${input} font-mono disabled:bg-slate-100`}
              />
            </label>
            <label className="block space-y-1 col-span-2">
              <span className="text-[11px] font-bold text-slate-600">ชื่อสาขา</span>
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={input} placeholder="เช่น สาขาบางนา" />
            </label>
          </div>
          {codeValid && <p className="text-[11px] text-slate-500 -mt-1">บนใบกำกับภาษีแสดงเป็น "{formatBranchLabel(form.code)}"</p>}
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-600">ที่อยู่ (ใช้บนใบเสร็จ/ใบกำกับภาษีของสาขา)</span>
            <textarea rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-600">เบอร์โทร</span>
            <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={input} />
          </label>
          {!isNew && !branch.is_headquarters && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="w-4 h-4" />
              เปิดใช้งานสาขานี้ (ปิด = พนักงานของสาขาเข้าไม่ได้)
            </label>
          )}

          {isNew && (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-extrabold flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-indigo-600" /> ผู้ดูแลสาขา (ไม่บังคับ เพิ่มทีหลังได้)
              </p>
              <input
                type="email"
                placeholder="อีเมล"
                value={admin.email}
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                className={input}
              />
              {admin.email.trim() && (
                <>
                  <input
                    placeholder="ชื่อที่แสดง"
                    value={admin.display_name}
                    onChange={(e) => setAdmin({ ...admin, display_name: e.target.value })}
                    className={input}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={`รหัสผ่าน (อย่างน้อย ${MIN_ACCOUNT_PASSWORD} ตัว) — เว้นว่างถ้าอีเมลนี้มีบัญชีแล้ว`}
                    value={admin.password}
                    onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                    className={input}
                  />
                </>
              )}
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-bold">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isNew ? 'สร้างสาขา' : 'บันทึก'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
