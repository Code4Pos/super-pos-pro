import React, { useEffect } from 'react';
import { AlertOctagon, Volume2, Check } from 'lucide-react';
import { playBarcodeNotFoundAlarm } from '../../utils/soundAlert';

/**
 * BarcodeErrorModal (version beta 0.1.3):
 * - แสดงเนื้อหา “ไม่พบ (เลขบาร์โค้ด) นี้” พร้อมเสียงสัญญาณเตือน
 * - บล็อกการสแกนทั้งหมดจนกว่าผู้ใช้จะกดปุ่มปิด Popup Alert นี้ด้วยตัวเอง
 * - ป้องกันปุ่ม Enter จากเครื่องยิงบาร์โค้ดไม่ให้เผลอกดปิดหน้าต่างเองโดยไม่ตั้งใจ
 */
export default function BarcodeErrorModal({ barcode, onClose }) {
  // บล็อกปุ่มคีย์บอร์ดและเครื่องสแกนบาร์โค้ดทั้งหมดขณะ Popup เปิดอยู่ (ถ้ามีการยิงซ้ำจะดังเตือนซ้ำ)
  useEffect(() => {
    if (!barcode) return;

    const handleBlockScannerKeys = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Enter') {
        // หากพนักงานเผลอยิงบาร์โค้ดซ้ำโดยยังไม่กดปิด Popup ให้ส่งเสียงเตือนซ้ำทันที
        playBarcodeNotFoundAlarm();
      }
    };

    window.addEventListener('keydown', handleBlockScannerKeys, true);
    return () => {
      window.removeEventListener('keydown', handleBlockScannerKeys, true);
    };
  }, [barcode]);

  if (!barcode) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rose-950/85 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border-4 border-rose-600 overflow-hidden">
        <div className="bg-rose-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-7 h-7 stroke-[2.5] shrink-0" />
            <span className="font-extrabold text-base sm:text-lg">
              แจ้งเตือนการสแกนบาร์โค้ด
            </span>
          </div>
          <button
            type="button"
            onClick={() => playBarcodeNotFoundAlarm()}
            className="p-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white"
            title="ทดสอบเสียงเตือน"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
            <AlertOctagon className="w-10 h-10 stroke-[2.2]" />
          </div>

          <div className="space-y-2">
            {/* ข้อความตามที่ผู้ใช้กำหนด: “ไม่พบ (เลขบาร์โค้ด) นี้” */}
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 break-all leading-snug">
              ไม่พบ {barcode} นี้
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-rose-600 bg-rose-50 py-2 px-3 rounded-xl border border-rose-200">
              ระบบหยุดรับการสแกนชั่วคราว กรุณากดปุ่มด้านล่างเพื่อรับทราบก่อนสแกนสินค้าชิ้นถัดไป
            </p>
          </div>

          <button
            type="button"
            autoFocus={false}
            onKeyDown={(e) => {
              // ป้องกันปุ่ม Enter จากเครื่องยิงบาร์โค้ดไม่ให้กดปุ่มนี้โดยอัตโนมัติ
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => onClose()}
            className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-base sm:text-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-6 h-6 stroke-[3]" />
            <span>รับทราบ / ปิดแจ้งเตือนเพื่อสแกนต่อ</span>
          </button>
        </div>
      </div>
    </div>
  );
}

