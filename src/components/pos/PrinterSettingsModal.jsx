import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  Check,
  Zap,
  Usb,
  Smartphone,
  FileText,
  Gauge,
  Cable,
  RefreshCw,
} from 'lucide-react';
import { printerService } from '../../services/printerService';
import { usePOS } from '../../context/POSContext';

export default function PrinterSettingsModal({ isOpen, onClose }) {
  const {
    showToast,
    printerSettings,
    updatePrinterSettings,
    printerStatus,
    refreshPrinterStatus,
  } = usePOS();

  const [form, setForm] = useState(printerSettings);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(printerSettings);
      refreshPrinterStatus();
    }
  }, [isOpen, printerSettings, refreshPrinterStatus]);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    updatePrinterSettings(form);
    showToast('บันทึกการตั้งค่าเครื่องพิมพ์ความร้อนเรียบร้อย', 'success');
    onClose();
  };

  const handleConnectUSB = async () => {
    try {
      await printerService.connectWebUSB();
      const next = { ...form, connectionType: 'webusb' };
      setForm(next);
      updatePrinterSettings(next);
      showToast('เชื่อมต่อเครื่องพิมพ์ USB สำเร็จ!', 'success');
    } catch (err) {
      showToast(err.message || 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ USB ได้', 'warning');
    }
  };

  const handleConnectSerial = async () => {
    try {
      await printerService.connectWebSerial(form.baudRate || 115200);
      const next = { ...form, connectionType: 'webserial' };
      setForm(next);
      updatePrinterSettings(next);
      showToast('เชื่อมต่อพอร์ตเครื่องพิมพ์ Serial สำเร็จ!', 'success');
    } catch (err) {
      showToast(err.message || 'ไม่สามารถเชื่อมต่อพอร์ต Serial ได้', 'warning');
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      updatePrinterSettings(form);
      const sampleOrder = {
        order_number: 'TEST-PRINT-001',
        created_at: new Date().toISOString(),
        customer_name: 'ลูกค้าทดสอบระบบพิมพ์',
        payment_method: 'cash',
        subtotal: 100,
        bill_discount: 0,
        vat_mode: 'no_vat',
        tax_amount: 0,
        grand_total: 100,
        cash_received: 100,
        change_amount: 0,
        note: 'ทดสอบความคมชัดภาษาไทย 58mm / 80mm',
        items: [
          {
            sku: 'TEST-01',
            product_name: 'สินค้าทดสอบพิมพ์สลิปความร้อน',
            quantity: 2,
            unit: 'ชิ้น',
            unit_price: 50,
            subtotal: 100,
          },
        ],
      };
      await printerService.printThermalReceipt(sampleOrder, form.paperSize);
    } finally {
      setTesting(false);
    }
  };

  const dotColorClass =
    printerStatus === 'ready'
      ? 'bg-emerald-500'
      : printerStatus === 'warning'
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[95dvh]">
        {/* ส่วนหัว */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Printer className="w-5 h-5 text-indigo-400" />
              <span
                className={`w-2.5 h-2.5 rounded-full ${dotColorClass} absolute -top-1 -right-1 border border-slate-900`}
              />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                ตั้งค่าเครื่องพิมพ์ความร้อน (Sunmi T2 / POS)
              </h3>
              <p className="text-[11px] text-slate-400">
                รองรับพิมพ์ภาพความร้อนภาษาไทยคมชัด 58mm / 80mm และใบเสร็จ A4
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* 1. ขนาดหน้ากว้างกระดาษความร้อน 58mm / 80mm */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. ขนาดหน้ากว้างกระดาษความร้อน (Thermal Paper Width)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: '80mm',
                  title: 'ขนาด 80 mm (576px)',
                  desc: 'มาตรฐานเครื่อง Sunmi T2 และเครื่องพิมพ์ตั้งโต๊ะ',
                },
                {
                  id: '58mm',
                  title: 'ขนาด 58 mm (384px)',
                  desc: 'สำหรับสลิปขนาดเล็กหรือเครื่องพิมพ์ 2 นิ้ว',
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm({ ...form, paperSize: opt.id })}
                  className={`p-3 rounded-2xl border text-left transition-colors ${
                    form.paperSize === opt.id
                      ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-slate-900">
                      {opt.title}
                    </span>
                    {form.paperSize === opt.id && (
                      <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. รูปแบบการเชื่อมต่อเครื่องพิมพ์ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. ช่องทางการเชื่อมต่อเครื่องพิมพ์ (Connection Mode)
              </label>
              <button
                type="button"
                onClick={() => refreshPrinterStatus(form)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>เช็คสถานะ</span>
              </button>
            </div>

            <div className="space-y-2">
              {[
                {
                  id: 'system',
                  icon: FileText,
                  title: 'ไดรเวอร์ระบบ / Sunmi Print Service (Dedicated Iframe)',
                  desc: 'สั่งพิมพ์แยกหน้าอิสระ แก้ปัญหาหน้าขาว/ตัดขอบ รองรับทั้งสลิปความร้อนและ A4',
                },
                {
                  id: 'rawbt',
                  icon: Smartphone,
                  title: 'RawBT / Sunmi Built-in Printer (สำหรับ Android Sunmi T2)',
                  desc: 'ส่งภาพใบเสร็จความร้อนเข้าหัวพิมพ์ในตัวเครื่อง Sunmi T2 ผ่าน RawBT ภาษาไทยไม่เพี้ยน 100%',
                },
                {
                  id: 'webusb',
                  icon: Usb,
                  title: 'เชื่อมต่อสาย USB ตรง (WebUSB ESC/POS Raster)',
                  desc: 'ส่งคำสั่งภาพบิตแมป GS v 0 และตัดกระดาษอัตโนมัติผ่านสาย USB โดยตรง',
                },
                {
                  id: 'webserial',
                  icon: Cable,
                  title: 'เชื่อมต่อพอร์ต COM / Serial ตรง (WebSerial ESC/POS)',
                  desc: 'ส่งคำสั่งภาพบิตแมป GS v 0 และตัดกระดาษผ่านพอร์ต Serial ของเครื่อง POS',
                },
              ].map((conn) => {
                const Icon = conn.icon;
                const active = form.connectionType === conn.id;
                return (
                  <div
                    key={conn.id}
                    onClick={() => {
                      const next = { ...form, connectionType: conn.id };
                      setForm(next);
                      refreshPrinterStatus(next);
                    }}
                    className={`p-3 rounded-2xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/60'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900">
                        {conn.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {conn.desc}
                      </div>

                      {conn.id === 'webusb' && active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectUSB();
                          }}
                          className="mt-2 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                        >
                          กดเพื่อจับคู่เครื่องพิมพ์ USB (Pair USB Printer)
                        </button>
                      )}

                      {conn.id === 'webserial' && active && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 flex items-center gap-2 flex-wrap"
                        >
                          <select
                            value={form.baudRate || 115200}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                baudRate: Number(e.target.value),
                              })
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                          >
                            <option value={115200}>115200 bps (Sunmi/Fast)</option>
                            <option value={9600}>9600 bps (Standard)</option>
                            <option value={19200}>19200 bps</option>
                            <option value={38400}>38400 bps</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleConnectSerial}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                          >
                            เลือกพอร์ต COM/Serial
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ตัวเลือกพิมพ์อัตโนมัติ */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800">
                    สั่งพิมพ์ใบเสร็จความร้อนอัตโนมัติทันทีหลังชำระเงิน
                  </div>
                  <div className="text-[11px] text-slate-500">
                    พิมพ์สลิปทันทีที่กดยืนยันชำระเงินโดยไม่ต้องกดซ้ำ
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(form.autoPrint)}
                onChange={(e) =>
                  setForm({ ...form, autoPrint: e.target.checked })
                }
                className="w-5 h-5 accent-indigo-600 rounded"
              />
            </label>
          </div>

          {/* ปุ่มทดสอบพิมพ์ และ ปุ่มบันทึก */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestPrint}
              className="py-2.5 px-4 rounded-xl border-2 border-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs sm:text-sm font-extrabold flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>ทดสอบพิมพ์สลิป</span>
            </button>

            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-md"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
