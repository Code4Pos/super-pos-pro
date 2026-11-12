import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, LogOut, Save } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { posService } from '../../services/posService';
import { sanitizeDeviceCode, localDateCode } from '../../utils/device';
import { signOutShop, getShopAccountEmail } from '../auth/ShopAuthGate';

/**
 * ค่าตั้งเฉพาะเครื่องนี้ (ไม่ซิงค์ไปเครื่องอื่น): รหัสเครื่องที่ใช้ขึ้นต้นเลขที่บิล และบัญชีร้านที่ล็อกอินอยู่
 */
export default function DeviceSettings() {
  const { showToast, dbMode } = usePOS();
  const [device, setDevice] = useState(() => posService.getDeviceSettings());
  const [code, setCode] = useState(device.code);
  const [email, setEmail] = useState('');

  useEffect(() => {
    getShopAccountEmail().then(setEmail);
  }, []);

  const clean = sanitizeDeviceCode(code);
  const isDirty = clean !== device.code;

  const handleSave = () => {
    try {
      const saved = posService.saveDeviceSettings({ code: clean });
      setDevice(saved);
      setCode(saved.code);
      showToast(`ตั้งรหัสเครื่องเป็น ${saved.code} แล้ว`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('ออกจากระบบบัญชีร้านในเครื่องนี้? ต้องล็อกอินใหม่ด้วยอีเมลและรหัสผ่านของร้าน')) return;
    await signOutShop();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <MonitorSmartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">เครื่องนี้</h2>
          <p className="text-xs text-slate-500">ค่าตั้งเฉพาะเครื่องนี้ ไม่ซิงค์ไปเครื่องอื่น</p>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-600" htmlFor="device-code">
            รหัสเครื่อง (ขึ้นต้นเลขที่บิล)
          </label>
          <div className="flex gap-2">
            <input
              id="device-code"
              type="text"
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-40 px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              disabled={!isDirty || !clean}
              onClick={handleSave}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> บันทึก
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            ตัวอย่างเลขที่บิล: <span className="font-mono font-bold text-slate-700">{clean || '???'}-{localDateCode()}-0001</span>
            {' '}ตั้งรหัสไม่ซ้ำกันในแต่ละเครื่อง (เช่น POS1, POS2) เพื่อให้เลขที่บิลไม่ชนกันแม้ขายตอนออฟไลน์
          </p>
        </div>

        {dbMode === 'supabase' && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              บัญชีร้านที่ล็อกอิน: <span className="font-bold text-slate-900">{email || '-'}</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 self-start"
            >
              <LogOut className="w-3.5 h-3.5" /> ออกจากระบบบัญชีร้าน
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
