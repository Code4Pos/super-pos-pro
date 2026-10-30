import React, { useState, useEffect } from 'react';
import {
  Printer,
  CheckCircle2,
  PlusCircle,
  FileText,
  ClipboardCheck,
  Settings,
  X,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import PrinterSettingsModal from './PrinterSettingsModal';
import { formatCurrency } from '../../utils/formatters';

/**
 * ReceiptModal (version beta 0.1.3):
 * - ไม่แสดงตัวอย่างใบเสร็จบนหน้าจอ เพื่อความรวดเร็วและกะทัดรัดบนหน้าจอ POS
 * - มี 3 เมนูหลัก:
 *   1. พิมพ์ใบเสร็จ (ความร้อน 58mm / 80mm)
 *   2. พิมพ์ใบเสร็จ A4 (ใบเสร็จรับเงิน/ใบส่งของ ขนาดกระดาษ A4 มาตรฐาน)
 *   3. พิมพ์ใบออร์เดอร์ (มีช่องเช็คลิสต์ด้านหน้า ชื่อสินค้า จำนวน หน่วย ไม่ระบุราคา)
 * - แสดงไอคอนเครื่องพิมพ์พร้อมจุดสีสถานะ (เขียว/ส้ม/แดง) โดยไม่มีตัวหนังสือกำกับจุดสี
 */
export default function ReceiptModal({ order, onClose }) {
  const { printerSettings, updatePrinterSettings, printerStatus } = usePOS();
  const [paperSize, setPaperSize] = useState(
    printerSettings?.paperSize || '80mm'
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (printerSettings?.paperSize) {
      setPaperSize(printerSettings.paperSize);
    }
  }, [printerSettings?.paperSize]);

  // พิมพ์ใบเสร็จความร้อนอัตโนมัติหากเปิดใช้งาน Auto Print
  useEffect(() => {
    if (order && printerSettings?.autoPrint) {
      const timer = setTimeout(() => {
        printerService.printThermalReceipt(order, paperSize);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [order, printerSettings?.autoPrint, paperSize]);

  if (!order) return null;

  const handleSelectPaperSize = (size) => {
    setPaperSize(size);
    updatePrinterSettings({ paperSize: size });
  };

  const dotColorClass =
    printerStatus === 'ready'
      ? 'bg-emerald-500'
      : printerStatus === 'warning'
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        {/* ส่วนหัว Modal */}
        <div className="px-5 py-3.5 bg-emerald-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">
                บันทึกบิลสำเร็จ ({order.order_number})
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* สลับขนาดกระดาษความร้อน 58mm / 80mm */}
            <div className="flex items-center bg-emerald-700/80 p-0.5 rounded-xl border border-emerald-500/40">
              {['58mm', '80mm'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleSelectPaperSize(size)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
                    paperSize === size
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-emerald-100 hover:text-white'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            {/* ปุ่มตั้งค่าเครื่องพิมพ์ พร้อมจุดสีสถานะ (เขียว/ส้ม/แดง ไม่มีตัวหนังสือ) */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="relative p-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white"
              title="ตั้งค่าเครื่องพิมพ์ความร้อน"
            >
              <Settings className="w-4 h-4" />
              <span
                className={`w-2.5 h-2.5 rounded-full ${dotColorClass} absolute top-1 right-1 border border-emerald-900`}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-emerald-700 text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* เนื้อหาหลัก: สรุปยอดชำระ/เงินทอนสั้นๆ และเมนูสั่งพิมพ์ 3 รูปแบบ (ไม่แสดงตัวอย่างใบเสร็จ) */}
        <div className="p-5 space-y-4">
          {/* กล่องสรุปยอดสุทธิและเงินทอน */}
          <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <div className="border-r border-slate-200 pr-2">
              <div className="text-xs font-bold text-slate-500">ยอดชำระสุทธิ</div>
              <div className="text-xl sm:text-2xl font-extrabold text-indigo-700 mt-0.5">
                {formatCurrency(order.grand_total)}
              </div>
            </div>
            <div className="pl-2">
              <div className="text-xs font-bold text-slate-500">เงินทอนลูกค้า</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-0.5">
                {formatCurrency(order.change_amount)}
              </div>
            </div>
          </div>

          {/* เมนูสั่งพิมพ์ 3 รูปแบบตามที่กำหนด */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              เลือกรูปแบบเอกสารที่ต้องการพิมพ์
            </div>

            {/* 1. พิมพ์ใบเสร็จ (เครื่องพิมพ์ความร้อน 58mm / 80mm) */}
            <button
              type="button"
              onClick={() => printerService.printThermalReceipt(order, paperSize)}
              className="w-full p-4 rounded-2xl border-2 border-indigo-600 bg-indigo-50 hover:bg-indigo-600 active:bg-indigo-700 group text-left flex items-center justify-between transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 group-hover:bg-white text-white group-hover:text-indigo-600 flex items-center justify-center shrink-0 transition-colors">
                  <Printer className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-extrabold text-indigo-950 group-hover:text-white">
                    พิมพ์ใบเสร็จ
                  </div>
                  <div className="text-xs text-indigo-700 group-hover:text-indigo-100">
                    สลิปความร้อนขนาด {paperSize} (ไม่มีแท็กราคาปลีก/ส่ง)
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-white/90 text-indigo-700 text-xs font-extrabold shrink-0">
                {paperSize}
              </span>
            </button>

            {/* 2. พิมพ์ใบเสร็จ A4 */}
            <button
              type="button"
              onClick={() => printerService.printA4Receipt(order)}
              className="w-full p-4 rounded-2xl border-2 border-blue-200 bg-blue-50/70 hover:bg-blue-600 active:bg-blue-700 group text-left flex items-center justify-between transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 group-hover:bg-white text-white group-hover:text-blue-600 flex items-center justify-center shrink-0 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-white">
                    พิมพ์ใบเสร็จ A4
                  </div>
                  <div className="text-xs text-slate-600 group-hover:text-blue-100">
                    ใบเสร็จรับเงิน / ใบส่งของเต็มรูปแบบขนาด A4
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-white/90 text-blue-700 text-xs font-extrabold shrink-0">
                A4
              </span>
            </button>

            {/* 3. พิมพ์ใบออร์เดอร์ (เช็คลิสต์จัดของ ไม่ระบุราคา) */}
            <button
              type="button"
              onClick={() => printerService.printOrderSlip(order, paperSize)}
              className="w-full p-4 rounded-2xl border-2 border-amber-200 bg-amber-50/80 hover:bg-amber-500 active:bg-amber-600 group text-left flex items-center justify-between transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 group-hover:bg-white text-white group-hover:text-amber-600 flex items-center justify-center shrink-0 transition-colors">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-white">
                    พิมพ์ใบออร์เดอร์
                  </div>
                  <div className="text-xs text-slate-600 group-hover:text-amber-50">
                    ช่องเช็คลิสต์ + ชื่อสินค้า + จำนวน + หน่วย (ไม่แสดงราคา)
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-white/90 text-amber-800 text-xs font-extrabold shrink-0">
                เช็คลิสต์
              </span>
            </button>
          </div>

          {/* ปุ่มเริ่มขายบิลถัดไป */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md mt-2"
          >
            <PlusCircle className="w-5 h-5" />
            <span>ขายบิลถัดไป</span>
          </button>
        </div>
      </div>

      <PrinterSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
