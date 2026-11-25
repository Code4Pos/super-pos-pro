import React from 'react';
import { Percent, Check, Plus, Trash2, Store } from 'lucide-react';
import SettingsCard, { useSettingsForm, FieldLabel, inputClass } from './SettingsCard';
import { isValidThaiTaxId } from '../../utils/credit';
import { MAX_BRANCHES, formatBranchLabel } from '../../utils/branches';
import { useBranch } from '../../context/BranchContext';

// ตรวจรายการสาขา: รหัส 5 หลัก ไม่ซ้ำ และไม่ใช่ 00000 (สำนักงานใหญ่ใช้ข้อมูลร้าน)
function validateBranches(list = []) {
  const seen = new Set();
  for (const b of list) {
    const code = String(b.code || '');
    if (!/^\d{5}$/.test(code)) return 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก';
    if (code === '00000') return 'สาขา 00000 คือสำนักงานใหญ่ ใช้ที่อยู่ในหน้าข้อมูลร้าน';
    if (seen.has(code)) return `รหัสสาขา ${code} ซ้ำกัน`;
    seen.add(code);
  }
  return '';
}

const VAT_MODE_OPTIONS = [
  {
    id: 'no_vat',
    title: 'ไม่คิด VAT แยก (No VAT)',
    desc: 'ไม่แสดงยอดภาษีในบิล (ร้านจด VAT จะถือว่าราคาขายรวม VAT แล้วบนใบกำกับภาษี)',
  },
  {
    id: 'vat_in',
    title: 'VAT ใน (ราคารวมภาษีแล้ว)',
    desc: 'ราคาสินค้ารวม VAT 7% แล้ว ระบบแยกยอดภาษีออกมาแสดงในบิล',
  },
  {
    id: 'vat_out',
    title: 'VAT นอก (บวกภาษีเพิ่ม)',
    desc: 'บวก VAT 7% เพิ่มจากราคาสินค้า เหมาะกับการขายส่งให้นิติบุคคล',
  },
];

/**
 * ตั้งค่าภาษี: รูปแบบการคิด VAT ของหน้าขาย และข้อมูลผู้จดทะเบียนภาษีมูลค่าเพิ่ม
 */
export default function TaxSettings() {
  const branchCtx = useBranch();
  const { form, setForm, isDirty, save, error } = useSettingsForm((f) =>
    f.vatRegistered && !isValidThaiTaxId(f.shopTaxId)
      ? 'ร้านที่จด VAT ต้องระบุเลขผู้เสียภาษี 13 หลักที่ถูกต้อง'
      : validateBranches(f.branches)
  );
  const vatMode = form.vatMode || 'no_vat';
  const branches = Array.isArray(form.branches) ? form.branches : [];
  // แยกข้อความผิดพลาด: ช่องเลขผู้เสียภาษี กับ รายการสาขา
  const branchError = validateBranches(branches);
  const taxError = error && error !== branchError ? error : '';
  const setBranches = (next) => setForm({ ...form, branches: next });
  const updateBranch = (idx, patch) => setBranches(branches.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  const addBranch = () => {
    // รหัสถัดไป = รหัสสูงสุด + 1
    const maxCode = branches.reduce((m, b) => Math.max(m, Number(b.code) || 0), 0);
    setBranches([...branches, { code: String(maxCode + 1).padStart(5, '0'), name: '', address: '', phone: '' }]);
  };

  return (
    <SettingsCard
      icon={Percent}
      title="ภาษีมูลค่าเพิ่ม (VAT)"
      description="รูปแบบการคิด VAT ใช้กับทุกบิลในหน้าขาย"
      onSave={() => save('บันทึกการตั้งค่าภาษีเรียบร้อย')}
      canSave={isDirty && !error}
    >
      <div>
        <FieldLabel>รูปแบบการคิด VAT ในหน้าขาย</FieldLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {VAT_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setForm({ ...form, vatMode: opt.id })}
              className={`p-3 rounded-2xl border text-left ${
                vatMode === opt.id
                  ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-slate-900">{opt.title}</span>
                {vatMode === opt.id && <Check className="w-4 h-4 text-indigo-600 stroke-[3] shrink-0" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs sm:text-sm font-bold text-slate-800">
            ร้านจดทะเบียนภาษีมูลค่าเพิ่ม (ออกใบกำกับภาษีได้)
          </span>
          <input
            type="checkbox"
            checked={Boolean(form.vatRegistered)}
            onChange={(e) => setForm({ ...form, vatRegistered: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 rounded shrink-0"
          />
        </label>
        {form.vatRegistered && (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <FieldLabel>เลขประจำตัวผู้เสียภาษี 13 หลัก</FieldLabel>
              <input
                type="text"
                inputMode="numeric"
                data-allow-scanner="false"
                maxLength={13}
                value={form.shopTaxId || ''}
                onChange={(e) => setForm({ ...form, shopTaxId: e.target.value.replace(/\D/g, '') })}
                className={`${inputClass} font-mono ${taxError ? 'border-rose-400' : ''}`}
              />
            </div>
            <div>
              <FieldLabel>รหัสสาขา</FieldLabel>
              <input
                type="text"
                inputMode="numeric"
                data-allow-scanner="false"
                maxLength={5}
                value={form.shopBranch || '00000'}
                onChange={(e) => setForm({ ...form, shopBranch: e.target.value.replace(/\D/g, '') })}
                className={`${inputClass} font-mono`}
              />
            </div>
            {taxError && <p className="col-span-3 text-[11px] font-bold text-rose-600">{taxError}</p>}
            <p className="col-span-3 text-[11px] text-slate-500">
              ใบเสร็จความร้อนจะแสดงเป็น "ใบกำกับภาษีอย่างย่อ" อัตโนมัติ • สาขา 00000 = สำนักงานใหญ่
            </p>
          </div>
        )}
      </div>

      {/* ระบบสาขาเปิดแล้ว (beta 0.5.0): จัดการสาขาที่หน้าสาขาและบัญชี (คัดลอกชื่อ/ที่อยู่มาไว้ในค่าตั้งนี้ให้อัตโนมัติ) */}
      {branchCtx.enabled ? (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
          <Store className="w-4 h-4 text-indigo-600 shrink-0" />
          ชื่อ ที่อยู่ และเบอร์โทรของสาขา แก้ที่ ตั้งค่า › สาขาและบัญชี • สำนักงานใหญ่ใช้ข้อมูลในหน้าข้อมูลร้าน
        </div>
      ) : (
      // ข้อมูลสาขา: พิมพ์บนใบเสร็จ/ใบกำกับภาษีที่ออกจากเครื่องของสาขานั้น (รหัสสาขาของเครื่องตั้งในการ์ด "เครื่องนี้")
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-800">สาขา (ชื่อ ที่อยู่ เบอร์โทร ที่พิมพ์บนเอกสาร)</span>
          </div>
          <button
            type="button"
            disabled={branches.length >= MAX_BRANCHES}
            onClick={addBranch}
            className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-indigo-400 text-xs font-bold text-indigo-700 flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มสาขา
          </button>
        </div>
        {branches.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            ยังไม่มีสาขา — ทุกเอกสารใช้ที่อยู่และเบอร์โทรในหน้าข้อมูลร้าน
          </p>
        ) : (
          branches.map((b, idx) => (
            <div key={idx} className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="flex items-end gap-2">
                <div className="w-24 shrink-0">
                  <FieldLabel>รหัสสาขา</FieldLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    data-allow-scanner="false"
                    maxLength={5}
                    value={b.code || ''}
                    onChange={(e) => updateBranch(idx, { code: e.target.value.replace(/\D/g, '') })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <FieldLabel>ชื่อสาขา</FieldLabel>
                  <input
                    type="text"
                    data-allow-scanner="false"
                    maxLength={80}
                    value={b.name || ''}
                    placeholder={/^\d{5}$/.test(b.code || '') ? formatBranchLabel(b.code) : ''}
                    onChange={(e) => updateBranch(idx, { name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBranches(branches.filter((_, i) => i !== idx))}
                  className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 shrink-0"
                  title="ลบสาขา"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <FieldLabel>ที่อยู่ (ว่าง = ใช้ที่อยู่ร้าน)</FieldLabel>
                  <textarea
                    rows={2}
                    maxLength={300}
                    data-allow-scanner="false"
                    value={b.address || ''}
                    placeholder={form.shopAddress || ''}
                    onChange={(e) => updateBranch(idx, { address: e.target.value })}
                    className={`${inputClass} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>เบอร์โทร (ว่าง = ของร้าน)</FieldLabel>
                  <input
                    type="text"
                    data-allow-scanner="false"
                    maxLength={40}
                    value={b.phone || ''}
                    placeholder={form.shopPhone || ''}
                    onChange={(e) => updateBranch(idx, { phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))
        )}
        {branchError && <p className="text-[11px] font-bold text-rose-600">{branchError}</p>}
        <p className="text-[11px] text-slate-500">
          รหัสสาขาของแต่ละเครื่องตั้งในการ์ด "เครื่องนี้" (หน้าตั้งค่าเครื่องพิมพ์) • สำนักงานใหญ่ (00000) ใช้ข้อมูลในหน้าข้อมูลร้าน
        </p>
      </div>
      )}
    </SettingsCard>
  );
}
