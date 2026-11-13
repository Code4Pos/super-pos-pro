import React from 'react';
import { Wallet, QrCode, Inbox } from 'lucide-react';
import SettingsCard, { useSettingsForm, FieldLabel, inputClass } from './SettingsCard';
import { printerService, CASH_DRAWER_COMMANDS } from '../../services/printerService';
import { usePOS } from '../../context/POSContext';
import { parsePromptPayId } from '../../utils/promptpay';

/**
 * ตั้งค่าการรับชำระเงิน: หมายเลขพร้อมเพย์ของร้าน และลิ้นชักเก็บเงิน
 */
export default function PaymentSettings() {
  const { showToast } = usePOS();
  const { form, setForm, isDirty, save, error } = useSettingsForm((f) =>
    String(f.promptpayId || '').trim() !== '' && !parsePromptPayId(f.promptpayId)
      ? 'หมายเลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก'
      : ''
  );

  const handleOpenDrawer = async () => {
    const result = await printerService.openCashDrawer(form);
    showToast(result.message, result.ok ? 'success' : 'warning');
  };

  return (
    <SettingsCard
      icon={Wallet}
      title="การชำระเงิน"
      description="QR พร้อมเพย์ตามยอดเงิน และลิ้นชักเก็บเงิน"
      onSave={() => save('บันทึกการตั้งค่าการชำระเงินเรียบร้อย')}
      canSave={isDirty && !error}
    >
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800">
          <QrCode className="w-4 h-4 text-indigo-600" />
          <span>หมายเลขพร้อมเพย์ของร้าน (สำหรับสร้าง QR ตามยอดเงิน)</span>
        </div>
        <input
          type="text"
          inputMode="numeric"
          data-allow-scanner="false"
          value={form.promptpayId || ''}
          onChange={(e) => setForm({ ...form, promptpayId: e.target.value })}
          placeholder="เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก"
          className={`${inputClass} font-mono font-bold ${error ? 'border-rose-400' : ''}`}
        />
        {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
      </div>

      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Inbox className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-slate-800">
                เปิดลิ้นชักเก็บเงินอัตโนมัติเมื่อรับเงินสด
              </div>
              <div className="text-[11px] text-slate-500">
                ลิ้นชักต้องต่อสาย RJ11 กับเครื่องพิมพ์ (หรือพอร์ตของเครื่อง Sunmi) และเชื่อมแบบ Bluetooth / USB / Serial / RawBT
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={Boolean(form.cashDrawerEnabled)}
            onChange={(e) => setForm({ ...form, cashDrawerEnabled: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 rounded shrink-0"
          />
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <FieldLabel>ขาสัญญาณ</FieldLabel>
          <select
            value={form.cashDrawerPin || '2'}
            onChange={(e) => setForm({ ...form, cashDrawerPin: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
          >
            <option value="2">Pin 2 (ลิ้นชักทั่วไป)</option>
            <option value="5">Pin 5</option>
          </select>
          <FieldLabel>คำสั่ง</FieldLabel>
          <select
            value={form.cashDrawerCommand || 'auto'}
            onChange={(e) => setForm({ ...form, cashDrawerCommand: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
          >
            {Object.entries(CASH_DRAWER_COMMANDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleOpenDrawer}
            className="px-3 py-1.5 rounded-xl border border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-bold"
          >
            ทดสอบเปิดลิ้นชัก
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          ถ้ากดทดสอบแล้วลิ้นชักไม่เด้ง ให้ลองเปลี่ยน "คำสั่ง" ทีละแบบแล้วกดทดสอบอีกครั้ง (เครื่องพิมพ์แต่ละยี่ห้อรับคำสั่งต่างกัน)
          {' '}โหมดไดรเวอร์ระบบ / ระบบพิมพ์ของ Android สั่งเปิดลิ้นชักไม่ได้
        </p>
      </div>
    </SettingsCard>
  );
}
