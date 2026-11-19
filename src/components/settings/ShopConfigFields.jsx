import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { getShopConfigFields, normalizeShopConfigValue } from '../../utils/shopConfig';
import { prepareReceiptLogo } from '../../utils/imageTools';
import { FieldLabel, inputClass } from './SettingsCard';

// ขนาดโลโก้สูงสุดที่ยอมให้เก็บ (เก็บเป็น data URL ในค่าตั้งร้าน ซิงค์ทุกเครื่อง)
const MAX_LOGO_BYTES = 80 * 1024;

function Hint({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{children}</p>;
}

// ช่องตัวเลขหลายค่าแบบคั่นด้วยจุลภาค: เก็บข้อความที่พิมพ์ไว้ แล้วแปลงเป็นตัวเลขตอนออกจากช่อง
function NumberListInput({ field, value, onChange }) {
  const [text, setText] = useState((value || []).join(', '));
  useEffect(() => setText((value || []).join(', ')), [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      data-allow-scanner="false"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(normalizeShopConfigValue(field, text))}
      className={inputClass}
    />
  );
}

function ImageInput({ value, onChange, onError }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepareReceiptLogo(file);
      if (dataUrl.length > MAX_LOGO_BYTES * 1.37) {
        onError?.('รูปโลโก้ใหญ่เกินไป กรุณาใช้รูปที่เรียบง่ายกว่านี้');
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 h-20 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="โลโก้ร้าน" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-[11px] text-slate-400">ยังไม่มีโลโก้</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-60"
        >
          <ImagePlus className="w-3.5 h-3.5" /> {busy ? 'กำลังแปลงรูป...' : value ? 'เปลี่ยนรูป' : 'เลือกรูป'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> ลบโลโก้
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ช่องกรอกที่สร้างอัตโนมัติจากรายการค่าตั้งร้าน (src/utils/shopConfig.js) ตามหมวด group
 * form / setForm มาจาก useSettingsForm
 */
export default function ShopConfigFields({ group, form, setForm, onError, exclude = [] }) {
  const fields = getShopConfigFields(group).filter((f) => !exclude.includes(f.key));
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const booleans = fields.filter((f) => f.type === 'boolean');
  const others = fields.filter((f) => f.type !== 'boolean');

  return (
    <div className="space-y-4">
      {others.map((field) => {
        const value = form[field.key];
        let input = null;
        switch (field.type) {
          case 'image':
            input = <ImageInput value={value} onChange={(v) => update(field.key, v)} onError={onError} />;
            break;
          case 'text':
            input = (
              <input
                type="text"
                data-allow-scanner="false"
                maxLength={field.maxLength}
                value={value ?? ''}
                onChange={(e) => update(field.key, e.target.value)}
                className={inputClass}
              />
            );
            break;
          case 'number':
            input = (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={field.min}
                  max={field.max}
                  step={field.step || 'any'}
                  value={value ?? ''}
                  onChange={(e) => update(field.key, e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={() => update(field.key, normalizeShopConfigValue(field, value))}
                  className={`${inputClass} max-w-[8rem]`}
                />
                {field.suffix && <span className="text-xs font-semibold text-slate-600">{field.suffix}</span>}
              </div>
            );
            break;
          case 'select':
            input = (
              <select
                value={String(value)}
                onChange={(e) => update(field.key, normalizeShopConfigValue(field, e.target.value))}
                className={inputClass}
              >
                {field.options.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
            break;
          case 'numberList':
            input = <NumberListInput field={field} value={value} onChange={(v) => update(field.key, v)} />;
            break;
          case 'multiSelect':
            input = (
              <div className="flex flex-wrap gap-2">
                {field.options.map((o) => {
                  const checked = (value || []).includes(o.value);
                  const locked = (field.required || []).includes(o.value);
                  return (
                    <label
                      key={o.value}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                        checked ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-slate-300 text-slate-600'
                      } ${locked ? 'opacity-70' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...(value || []), o.value]
                            : (value || []).filter((v) => v !== o.value);
                          update(field.key, normalizeShopConfigValue(field, next));
                        }}
                        className="accent-indigo-600"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            );
            break;
          default:
            input = null;
        }
        return (
          <div key={field.key}>
            <FieldLabel>{field.label}</FieldLabel>
            {input}
            <Hint>{field.hint}</Hint>
          </div>
        );
      })}

      {booleans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {booleans.map((field) => (
            <label
              key={field.key}
              className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(form[field.key])}
                onChange={(e) => update(field.key, e.target.checked)}
                className="mt-0.5 accent-indigo-600"
              />
              <span className="text-xs font-semibold text-slate-700 leading-snug">
                {field.label}
                {field.hint && <span className="block text-[11px] font-normal text-slate-500">{field.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
