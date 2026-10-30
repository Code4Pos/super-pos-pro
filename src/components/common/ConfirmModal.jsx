import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  title = 'ยืนยันการทำรายการ',
  message = 'คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้?',
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-6 text-center space-y-4">
          <div
            className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
              isDanger
                ? 'bg-rose-100 text-rose-600'
                : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-7 h-7" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {message}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
              }}
              className={`py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-sm active:scale-[0.98] ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
