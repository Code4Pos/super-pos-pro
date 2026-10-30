import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Check, RotateCcw, Calculator } from 'lucide-react';

/**
 * NumpadModal (version beta 0.1.2):
 * - ออกแบบสัดส่วนให้พอดีหน้าจอ (ไม่มีการเลื่อนขึ้นลง overflow-hidden)
 * - ปุ่มตัวเลขขนาดใหญ่พิเศษ กดง่ายสำหรับหน้าจอสัมผัสเครื่อง POS (เช่น Sunmi T2)
 * - เปิดเข้ามาจะแสดงค่าเดิม แต่เมื่อกดตัวเลขครั้งแรกจะรีเซ็ตค่าเดิมทันที
 */
export default function NumpadModal({
  isOpen,
  title = 'ระบุตัวเลข',
  subtitle = '',
  initialValue = 0,
  allowDecimal = true,
  min = 0,
  max = 9999999,
  unitLabel = '',
  presets = [],
  onConfirm,
  onClose,
}) {
  const [displayValue, setDisplayValue] = useState('0');
  const [isFresh, setIsFresh] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setDisplayValue(String(initialValue ?? 0));
      setIsFresh(true);
    }
  }, [isOpen, initialValue]);

  const handleDigit = useCallback(
    (digit) => {
      setDisplayValue((prev) => {
        if (isFresh) {
          setIsFresh(false);
          if (digit === '.') return '0.';
          if (digit === '00') return '0';
          return String(digit);
        }

        if (digit === '.') {
          if (!allowDecimal) return prev;
          if (prev.includes('.')) return prev;
          return prev + '.';
        }

        if (prev === '0') {
          if (digit === '0' || digit === '00') return '0';
          return String(digit);
        }

        const nextStr = prev + String(digit);
        if (Number(nextStr) > max) {
          return String(max);
        }
        return nextStr;
      });
    },
    [isFresh, allowDecimal, max]
  );

  const handleBackspace = useCallback(() => {
    setIsFresh(false);
    setDisplayValue((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setIsFresh(false);
    setDisplayValue('0');
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      if (e) e.preventDefault();
      let num = allowDecimal
        ? parseFloat(displayValue)
        : parseInt(displayValue, 10);
      if (isNaN(num)) num = 0;
      num = Math.max(min, Math.min(max, num));
      onConfirm(num);
      onClose();
    },
    [displayValue, allowDecimal, min, max, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.' && allowDecimal) {
        e.preventDefault();
        handleDigit('.');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, allowDecimal, handleDigit, handleBackspace, handleSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[96dvh]">
        {/* ส่วนหัวกระชับ */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-400 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base truncate">{title}</h3>
            </div>
            {subtitle && (
              <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* เนื้อหาหลัก พอดีจอ ไม่มีการเลื่อนขึ้นลง */}
        <div className="p-3.5 sm:p-4 space-y-2.5 overflow-hidden">
          {/* หน้าจอแสดงค่าตัวเลข */}
          <div className="px-4 py-2.5 rounded-2xl bg-slate-100 border-2 border-indigo-500/30 flex items-center justify-between gap-2">
            <div className="text-left">
              <div className="text-[11px] font-semibold text-slate-500">
                {isFresh ? 'ค่าเดิม (กดตัวเลขเพื่อเริ่มใหม่)' : 'ค่าใหม่'}
              </div>
              {unitLabel && (
                <div className="text-xs font-bold text-indigo-600">
                  {unitLabel}
                </div>
              )}
            </div>
            <div
              className={`text-3xl sm:text-4xl font-mono font-extrabold tracking-tight truncate ${
                isFresh
                  ? 'text-indigo-600 bg-indigo-100/90 px-2.5 py-0.5 rounded-xl'
                  : 'text-slate-900'
              }`}
            >
              {displayValue}
            </div>
          </div>

          {/* ปุ่มลัดค่าที่ใช้บ่อย */}
          {presets.length > 0 && (
            <div className="grid grid-flow-col auto-cols-fr gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setIsFresh(false);
                    setDisplayValue(String(p.value));
                  }}
                  className="py-2 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 text-xs font-extrabold truncate"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* แป้นตัวเลข Numpad ขนาดใหญ่ กดง่าย */}
          <div className="grid grid-cols-4 gap-2">
            {['7', '8', '9'].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigit(n)}
                className="h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl sm:text-3xl font-extrabold text-slate-800"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="h-14 sm:h-16 rounded-2xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-800 flex items-center justify-center"
              title="ลบทีละหลัก"
            >
              <Delete className="w-7 h-7" />
            </button>

            {['4', '5', '6'].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigit(n)}
                className="h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl sm:text-3xl font-extrabold text-slate-800"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 sm:h-16 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-300 text-rose-700 text-sm font-extrabold flex flex-col items-center justify-center"
              title="ล้างค่าเป็น 0"
            >
              <RotateCcw className="w-5 h-5" />
              <span>C (0)</span>
            </button>

            {['1', '2', '3'].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigit(n)}
                className="h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl sm:text-3xl font-extrabold text-slate-800"
              >
                {n}
              </button>
            ))}

            {/* ปุ่มตกลงขนาดใหญ่สูง 2 แถว */}
            <button
              type="button"
              onClick={handleSubmit}
              className="row-span-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-base sm:text-lg flex flex-col items-center justify-center gap-1 shadow-md"
            >
              <Check className="w-7 h-7 stroke-[3]" />
              <span>ตกลง</span>
            </button>

            <button
              type="button"
              onClick={() => handleDigit('0')}
              className={`${
                allowDecimal ? 'col-span-1' : 'col-span-2'
              } h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl sm:text-3xl font-extrabold text-slate-800`}
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleDigit('00')}
              className="h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
            >
              00
            </button>
            {allowDecimal && (
              <button
                type="button"
                onClick={() => handleDigit('.')}
                className="h-14 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl sm:text-3xl font-extrabold text-slate-800"
              >
                .
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
