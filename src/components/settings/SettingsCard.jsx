import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * ฟอร์มตั้งค่าที่ผูกกับ printerSettings (ค่าตั้งค่าระบบที่เก็บรวมกันในเครื่อง)
 * validate(form) คืนข้อความผิดพลาด หรือ '' ถ้าผ่าน
 */
export function useSettingsForm(validate = () => '') {
  const { printerSettings, updatePrinterSettings, showToast } = usePOS();
  const [form, setForm] = useState(printerSettings);

  useEffect(() => {
    setForm(printerSettings);
  }, [printerSettings]);

  const error = validate(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(printerSettings);

  const save = (successMessage = 'บันทึกการตั้งค่าเรียบร้อย') => {
    if (error) {
      showToast(error, 'error');
      return false;
    }
    updatePrinterSettings(form);
    showToast(successMessage, 'success');
    return true;
  };

  return { form, setForm, error, isDirty, save };
}

/**
 * กรอบหน้าตั้งค่าแต่ละเมนู พร้อมแถบปุ่มบันทึกด้านล่าง
 */
export default function SettingsCard({ icon: Icon, title, description, children, onSave, canSave = true, footer = null }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h1 className="text-sm sm:text-base font-extrabold text-slate-900">{title}</h1>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
      {(onSave || footer) && (
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
          {footer}
          {onSave && (
            <button
              type="button"
              disabled={!canSave}
              onClick={onSave}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-extrabold flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>บันทึกการตั้งค่า</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FieldLabel({ children }) {
  return <label className="block text-xs font-bold text-slate-700 mb-1">{children}</label>;
}

export const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
