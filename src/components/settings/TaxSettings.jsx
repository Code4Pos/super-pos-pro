import React from 'react';
import { Percent, Check } from 'lucide-react';
import SettingsCard, { useSettingsForm, FieldLabel, inputClass } from './SettingsCard';
import { isValidThaiTaxId } from '../../utils/credit';

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
  const { form, setForm, isDirty, save, error } = useSettingsForm((f) =>
    f.vatRegistered && !isValidThaiTaxId(f.shopTaxId)
      ? 'ร้านที่จด VAT ต้องระบุเลขผู้เสียภาษี 13 หลักที่ถูกต้อง'
      : ''
  );
  const vatMode = form.vatMode || 'no_vat';

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
                className={`${inputClass} font-mono ${error ? 'border-rose-400' : ''}`}
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
            {error && <p className="col-span-3 text-[11px] font-bold text-rose-600">{error}</p>}
            <p className="col-span-3 text-[11px] text-slate-500">
              ใบเสร็จความร้อนจะแสดงเป็น "ใบกำกับภาษีอย่างย่อ" อัตโนมัติ • สาขา 00000 = สำนักงานใหญ่
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
