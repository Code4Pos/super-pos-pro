import React from 'react';
import { X } from 'lucide-react';
import PrinterSettings from '../settings/PrinterSettings';

/**
 * Modal ตั้งค่าเครื่องพิมพ์ด่วน (เปิดจากหน้าใบเสร็จ)
 * การตั้งค่าอื่น (ร้าน, ภาษี, การชำระเงิน, ผู้ใช้งาน) อยู่ในเมนู "ตั้งค่า" ที่ Sidebar
 */
export default function PrinterSettingsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/75 select-none">
      <div className="w-full max-w-lg max-h-[95dvh] overflow-y-auto rounded-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900"
          title="ปิด"
        >
          <X className="w-5 h-5" />
        </button>
        <PrinterSettings onSaved={onClose} />
      </div>
    </div>
  );
}
