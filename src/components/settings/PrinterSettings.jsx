import React, { useState, useEffect } from 'react';
import { Printer, Check, Zap, Usb, Smartphone, FileText, Cable, RefreshCw, Bluetooth, Loader2 } from 'lucide-react';
import SettingsCard, { useSettingsForm } from './SettingsCard';
import { printerService } from '../../services/printerService';
import { isNativePrinterAvailable, listBluetoothPrinters, bluetoothDisconnect } from '../../services/nativePrinter';
import { usePOS } from '../../context/POSContext';

const PAPER_OPTIONS = [
  { id: '80mm', title: 'ขนาด 80 mm (576px)', desc: 'มาตรฐานเครื่อง Sunmi T2 และเครื่องพิมพ์ตั้งโต๊ะ' },
  { id: '58mm', title: 'ขนาด 58 mm (384px)', desc: 'สำหรับสลิปขนาดเล็กหรือเครื่องพิมพ์ 2 นิ้ว' },
];

// แอป Android: WebView ไม่รองรับ WebUSB / WebSerial แต่มี Bluetooth และระบบพิมพ์ของ Android ผ่านปลั๊กอินในแอป
const IS_NATIVE_APP = isNativePrinterAvailable();
const NATIVE_ONLY = ['bluetooth'];
const WEB_ONLY = ['webusb', 'webserial'];

const CONNECTION_OPTIONS_ALL = [
  {
    id: 'bluetooth',
    icon: Bluetooth,
    title: 'เครื่องพิมพ์ Bluetooth (ESC/POS)',
    desc: 'เครื่องพิมพ์ความร้อนพกพา/ตั้งโต๊ะที่จับคู่ไว้แล้ว รวมถึง InnerPrinter ในตัวเครื่อง Sunmi',
  },
  {
    id: 'system',
    icon: FileText,
    title: 'ไดรเวอร์ระบบ / Sunmi Print Service',
    desc: 'สั่งพิมพ์แยกหน้าอิสระ รองรับทั้งสลิปความร้อนและ A4',
  },
  {
    id: 'rawbt',
    icon: Smartphone,
    title: 'RawBT / Sunmi Built-in Printer (Android)',
    desc: 'ส่งภาพใบเสร็จเข้าหัวพิมพ์ในตัวเครื่อง Sunmi T2 ผ่าน RawBT',
  },
  {
    id: 'webusb',
    icon: Usb,
    title: 'สาย USB ตรง (WebUSB ESC/POS)',
    desc: 'ส่งคำสั่งภาพบิตแมปและตัดกระดาษผ่านสาย USB โดยตรง',
  },
  {
    id: 'webserial',
    icon: Cable,
    title: 'พอร์ต COM / Serial (WebSerial ESC/POS)',
    desc: 'ส่งคำสั่งภาพบิตแมปและตัดกระดาษผ่านพอร์ต Serial',
  },
];

const CONNECTION_OPTIONS = CONNECTION_OPTIONS_ALL.filter((opt) =>
  IS_NATIVE_APP ? !WEB_ONLY.includes(opt.id) : !NATIVE_ONLY.includes(opt.id)
).map((opt) =>
  IS_NATIVE_APP && opt.id === 'system'
    ? { ...opt, title: 'ระบบพิมพ์ของ Android', desc: 'เปิดหน้าต่างพิมพ์ของเครื่อง เลือกเครื่องพิมพ์ / Sunmi Print Service หรือบันทึก PDF' }
    : opt
);

const SAMPLE_ORDER = {
  order_number: 'TEST-PRINT-001',
  customer_name: 'ลูกค้าทดสอบระบบพิมพ์',
  payment_method: 'cash',
  subtotal: 100,
  bill_discount: 0,
  tax_amount: 0,
  grand_total: 100,
  cash_received: 100,
  change_amount: 0,
  note: 'ทดสอบความคมชัดภาษาไทย 58mm / 80mm',
  items: [
    { sku: 'TEST-01', product_name: 'สินค้าทดสอบพิมพ์สลิปความร้อน', quantity: 2, unit: 'ชิ้น', unit_price: 50, subtotal: 100 },
  ],
};

/**
 * ตั้งค่าเครื่องพิมพ์ความร้อน: ขนาดกระดาษ ช่องทางเชื่อมต่อ และการพิมพ์อัตโนมัติ
 * ใช้ทั้งในหน้าตั้งค่า และใน Modal ตั้งค่าด่วนจากหน้าใบเสร็จ (onSaved)
 */
export default function PrinterSettings({ onSaved = null }) {
  const { showToast, printerStatus, refreshPrinterStatus, updatePrinterSettings } = usePOS();
  const { form, setForm, isDirty, save } = useSettingsForm();
  const [testing, setTesting] = useState(false);
  const [btDevices, setBtDevices] = useState(null); // null = ยังไม่ได้ค้นหา
  const [btLoading, setBtLoading] = useState(false);

  useEffect(() => {
    refreshPrinterStatus();
  }, [refreshPrinterStatus]);

  const dotColorClass =
    printerStatus === 'ready' ? 'bg-emerald-500' : printerStatus === 'warning' ? 'bg-amber-500' : 'bg-rose-500';

  // จับคู่อุปกรณ์แล้วบันทึกช่องทางทันที เพราะเบราว์เซอร์ต้องได้รับอนุญาตจากผู้ใช้ตอนกดปุ่ม
  const pairDevice = async (connectFn, connectionType, successMessage) => {
    try {
      await connectFn();
      const next = { ...form, connectionType };
      setForm(next);
      updatePrinterSettings(next);
      showToast(successMessage, 'success');
    } catch (err) {
      showToast(err.message || 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ได้', 'warning');
    }
  };

  // รายชื่อเครื่องที่จับคู่ไว้ในตั้งค่า Bluetooth ของเครื่อง (Android 12+ จะถามสิทธิ์ "อุปกรณ์ใกล้เคียง" ครั้งแรก)
  const loadBluetoothDevices = async () => {
    setBtLoading(true);
    try {
      const result = await listBluetoothPrinters();
      if (!result.enabled) {
        showToast('Bluetooth ของเครื่องปิดอยู่ กรุณาเปิด Bluetooth ก่อน', 'warning');
      }
      setBtDevices(result.devices || []);
    } catch (err) {
      showToast(err?.message || 'ค้นหาเครื่องพิมพ์ Bluetooth ไม่สำเร็จ', 'warning');
    } finally {
      setBtLoading(false);
    }
  };

  const selectBluetoothDevice = async (device) => {
    await bluetoothDisconnect();
    const next = { ...form, connectionType: 'bluetooth', bluetoothAddress: device.address, bluetoothName: device.name };
    setForm(next);
    updatePrinterSettings(next);
    showToast(`เลือกเครื่องพิมพ์ ${device.name} แล้ว`, 'success');
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      updatePrinterSettings(form);
      await printerService.printThermalReceipt(
        { ...SAMPLE_ORDER, created_at: new Date().toISOString() },
        form.paperSize
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard
      icon={Printer}
      title="เครื่องพิมพ์ความร้อน"
      description="รองรับพิมพ์ภาษาไทยคมชัด 58mm / 80mm และเอกสาร A4"
      onSave={() => {
        if (save('บันทึกการตั้งค่าเครื่องพิมพ์เรียบร้อย')) onSaved?.();
      }}
      canSave={isDirty}
      footer={
        <button
          type="button"
          disabled={testing}
          onClick={handleTestPrint}
          className="px-4 py-2.5 rounded-xl border-2 border-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs sm:text-sm font-extrabold flex items-center gap-1.5"
        >
          <Printer className="w-4 h-4" />
          <span>ทดสอบพิมพ์สลิป</span>
        </button>
      }
    >
      <div>
        <div className="text-xs font-bold text-slate-700 mb-2">ขนาดหน้ากว้างกระดาษ</div>
        <div className="grid grid-cols-2 gap-2.5">
          {PAPER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setForm({ ...form, paperSize: opt.id })}
              className={`p-3 rounded-2xl border text-left ${
                form.paperSize === opt.id
                  ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-slate-900">{opt.title}</span>
                {form.paperSize === opt.id && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${dotColorClass}`} />
            ช่องทางการเชื่อมต่อเครื่องพิมพ์
          </div>
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
          {CONNECTION_OPTIONS.map((conn) => {
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
                className={`p-3 rounded-2xl border cursor-pointer flex items-start gap-3 ${
                  active ? 'border-indigo-600 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-slate-900">{conn.title}</div>
                  <div className="text-[11px] text-slate-500">{conn.desc}</div>

                  {conn.id === 'bluetooth' && active && (
                    <div onClick={(e) => e.stopPropagation()} className="mt-2 space-y-2">
                      <div className="text-[11px] text-slate-600">
                        เครื่องที่เลือก:{' '}
                        <span className="font-bold text-slate-900">
                          {form.bluetoothAddress ? `${form.bluetoothName || '-'} (${form.bluetoothAddress})` : 'ยังไม่ได้เลือก'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={btLoading}
                        onClick={loadBluetoothDevices}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        {btLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                        ค้นหาเครื่องพิมพ์ที่จับคู่แล้ว
                      </button>
                      {btDevices && btDevices.length === 0 && (
                        <div className="text-[11px] text-amber-700">
                          ไม่พบเครื่องที่จับคู่ไว้ กรุณาจับคู่เครื่องพิมพ์ในตั้งค่า Bluetooth ของเครื่องก่อน แล้วกดค้นหาอีกครั้ง
                        </div>
                      )}
                      {btDevices && btDevices.length > 0 && (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                          {btDevices.map((d) => {
                            const selected = d.address === form.bluetoothAddress;
                            return (
                              <button
                                key={d.address}
                                type="button"
                                onClick={() => selectBluetoothDevice(d)}
                                className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 ${selected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-bold text-slate-900 truncate">{d.name}</span>
                                  <span className="block text-[10px] font-mono text-slate-500">{d.address}</span>
                                </span>
                                {selected && <Check className="w-4 h-4 text-indigo-600 stroke-[3] shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-500">
                        เครื่อง Sunmi ให้เลือก "InnerPrinter" เพื่อพิมพ์ออกหัวพิมพ์ในตัวเครื่อง / ลิ้นชักเก็บเงินที่ต่อกับเครื่องพิมพ์สั่งเปิดผ่าน Bluetooth ได้
                      </p>
                    </div>
                  )}

                  {conn.id === 'webusb' && active && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pairDevice(() => printerService.connectWebUSB(), 'webusb', 'เชื่อมต่อเครื่องพิมพ์ USB สำเร็จ!');
                      }}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                    >
                      จับคู่เครื่องพิมพ์ USB
                    </button>
                  )}

                  {conn.id === 'webserial' && active && (
                    <div onClick={(e) => e.stopPropagation()} className="mt-2 flex items-center gap-2 flex-wrap">
                      <select
                        value={form.baudRate || 115200}
                        onChange={(e) => setForm({ ...form, baudRate: Number(e.target.value) })}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      >
                        <option value={115200}>115200 bps (Sunmi/Fast)</option>
                        <option value={9600}>9600 bps (Standard)</option>
                        <option value={19200}>19200 bps</option>
                        <option value={38400}>38400 bps</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          pairDevice(
                            () => printerService.connectWebSerial(form.baudRate || 115200),
                            'webserial',
                            'เชื่อมต่อพอร์ตเครื่องพิมพ์ Serial สำเร็จ!'
                          )
                        }
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

      <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-slate-800">พิมพ์ใบเสร็จอัตโนมัติทันทีหลังชำระเงิน</div>
            <div className="text-[11px] text-slate-500">พิมพ์สลิปทันทีที่กดยืนยันชำระเงิน</div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={Boolean(form.autoPrint)}
          onChange={(e) => setForm({ ...form, autoPrint: e.target.checked })}
          className="w-5 h-5 accent-indigo-600 rounded"
        />
      </label>
    </SettingsCard>
  );
}
