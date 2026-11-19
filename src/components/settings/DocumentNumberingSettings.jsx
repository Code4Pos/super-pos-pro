import React, { useEffect, useMemo, useState } from 'react';
import { Hash, RotateCcw } from 'lucide-react';
import SettingsCard from './SettingsCard';
import { usePOS } from '../../context/POSContext';
import { posService } from '../../services/posService';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TEMPLATE_TOKENS,
  describeResetPeriod,
  getDocumentTemplate,
  normalizeDocumentNumbering,
  previewDocumentNumber,
  validateDocumentTemplate,
} from '../../utils/docNumbers';

// ปุ่มเปลี่ยนรอบการนับใหม่: แทนที่ตัวแปรวันที่ในรูปแบบเดิม
const RESET_PRESETS = [
  { id: 'daily', label: 'รายวัน', date: '{YY}{MM}{DD}' },
  { id: 'monthly', label: 'รายเดือน', date: '{YYYY}{MM}' },
  { id: 'yearly', label: 'รายปี', date: '{YYYY}' },
  { id: 'never', label: 'ไม่เริ่มใหม่', date: '' },
];

function applyResetPreset(template, dateTokens) {
  const withoutDate = template.replace(/\{(YYYY|YY|BBBB|BB|MM|DD)\}/g, '');
  // วางวันที่ไว้หน้าเลขรัน (หรือหน้าขีดที่อยู่ก่อนเลขรัน)
  const replaced = withoutDate.replace(/(-?)(\{SEQ[3-6]?\})/, (_, dash, seq) =>
    dateTokens ? `${dateTokens}${dash || '-'}${seq}` : `${dash}${seq}`
  );
  return replaced.replace(/--+/g, '-');
}

/**
 * ตั้งรูปแบบเลขที่เอกสารแต่ละชนิด (ใช้ร่วมกันทุกเครื่อง) พร้อมตัวอย่างเลขที่ถัดไป
 */
export default function DocumentNumberingSettings() {
  const { printerSettings, updatePrinterSettings, showToast } = usePOS();
  const saved = useMemo(
    () => normalizeDocumentNumbering(printerSettings.documentNumbering),
    [printerSettings.documentNumbering]
  );
  const buildDraft = () =>
    Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.id, getDocumentTemplate(saved, t.id)]));
  const [draft, setDraft] = useState(buildDraft);
  const [focused, setFocused] = useState('order');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(buildDraft()), [saved]);

  const deviceCode = posService.getDeviceSettings?.()?.code || 'POS-01';
  const errors = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.id, validateDocumentTemplate(draft[t.id], t.id)]));
  const hasError = Object.values(errors).some(Boolean);
  const isDirty = JSON.stringify(normalizeDocumentNumbering(draft)) !== JSON.stringify(saved);

  const setTemplate = (id, value) => setDraft((prev) => ({ ...prev, [id]: value.toUpperCase().replace(/\s/g, '') }));

  const insertToken = (token) => {
    const current = draft[focused] || '';
    // ใส่เลขรันได้ตัวเดียว: ถ้ามีอยู่แล้วให้แทนที่
    const next = token.startsWith('{SEQ')
      ? current.replace(/\{SEQ[3-6]?\}/, '') + token
      : current + token;
    setTemplate(focused, next);
  };

  const handleSave = () => {
    if (hasError) {
      showToast('รูปแบบเลขที่บางรายการไม่ถูกต้อง', 'error');
      return;
    }
    updatePrinterSettings({ documentNumbering: normalizeDocumentNumbering(draft) });
    showToast('บันทึกรูปแบบเลขที่เอกสารเรียบร้อย', 'success');
  };

  return (
    <SettingsCard
      icon={Hash}
      title="เลขที่เอกสาร"
      description="กำหนดคำนำหน้าและรูปแบบเลขที่ของเอกสารแต่ละชนิด ใช้ร่วมกันทุกเครื่อง (มีผลกับเอกสารที่ออกใหม่เท่านั้น)"
      onSave={handleSave}
      canSave={isDirty && !hasError}
    >
      {/* ตัวแปรที่ใช้ได้ (กดเพื่อเพิ่มลงในช่องที่เลือกอยู่) */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div className="text-[11px] font-bold text-slate-600">
          กดตัวแปรเพื่อเพิ่มลงในช่องที่เลือก (ตอนนี้: {DOCUMENT_TYPES.find((t) => t.id === focused)?.label})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DOCUMENT_TEMPLATE_TOKENS.map((t) => (
            <button
              key={t.token}
              type="button"
              onClick={() => insertToken(t.token)}
              className="px-2 py-1 rounded-lg bg-white border border-slate-300 hover:border-indigo-400 text-[11px] font-mono font-bold text-indigo-700"
              title={t.label}
            >
              {t.token} <span className="font-sans font-normal text-slate-500">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          เลขรันเริ่มนับใหม่ตามวันที่ในรูปแบบ: มี {'{DD}'} = ทุกวัน, มี {'{MM}'} = ทุกเดือน, มีแค่ปี = ทุกปี
        </p>
      </div>

      <div className="space-y-2">
        {DOCUMENT_TYPES.map((type) => {
          const template = draft[type.id] || '';
          const error = errors[type.id];
          const isDefault = template === type.defaultTemplate;
          return (
            <div
              key={type.id}
              className={`p-2.5 rounded-xl border ${
                focused === type.id ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="md:w-44 shrink-0 text-xs font-extrabold text-slate-800">{type.label}</div>
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={template}
                  maxLength={40}
                  onFocus={() => setFocused(type.id)}
                  onChange={(e) => setTemplate(type.id, e.target.value)}
                  className={`flex-1 min-w-0 px-3 py-1.5 rounded-lg border bg-white font-mono text-xs ${
                    error ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                <div className="flex items-center gap-1 shrink-0">
                  {RESET_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFocused(type.id);
                        setTemplate(type.id, applyResetPreset(template, p.date));
                      }}
                      className="px-1.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-600"
                      title={`เริ่มนับใหม่${p.label}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isDefault}
                    onClick={() => setTemplate(type.id, type.defaultTemplate)}
                    className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-30"
                    title="คืนค่าเริ่มต้น"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-1 md:pl-[11.5rem] text-[11px]">
                {error ? (
                  <span className="font-bold text-rose-600">{error}</span>
                ) : (
                  <span className="text-slate-500">
                    ตัวอย่าง: <span className="font-mono font-bold text-slate-800">{previewDocumentNumber(template, { deviceCode })}</span>
                    {' • '}
                    {describeResetPeriod(template)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        บิลขายต้องมี {'{DEVICE}'} เพื่อให้เลขไม่ชนกันระหว่างเครื่องแม้ขายตอนออฟไลน์ / ใบกำกับภาษี ใบลดหนี้ ใบเพิ่มหนี้
        ใบรับชำระ และใบวางบิล ระบบตรวจเลขซ้ำกับฐานข้อมูลก่อนออกเลข / เปลี่ยนรูปแบบกลางรอบ เลขรันจะเริ่มที่ 1 ของรูปแบบใหม่
      </p>
    </SettingsCard>
  );
}
