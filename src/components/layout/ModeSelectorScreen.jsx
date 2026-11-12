import React, { useState } from 'react';
import {
  ShoppingCart,
  Boxes,
  Store,
  Database,
  UserCircle2,
  LogOut,
  ArrowRight,
  Lock,
  MonitorSmartphone,
  Server,
  X,
  RotateCcw,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { posService } from '../../services/posService';
import { getServerConfig, saveServerConfig, resetServerConfig } from '../../lib/supabase';
import { canAccessAnyAdminTab } from '../../utils/rbac';

const DEFAULT_MODE_OPTIONS = [
  { id: 'ask', label: 'ถามทุกครั้ง' },
  { id: 'pos', label: 'เข้าขายหน้าร้านทันที' },
  { id: 'admin', label: 'เข้าจัดการหลังร้านทันที' },
];

/**
 * หน้าเลือกโหมดการทำงานหลักของระบบ (Mode Selector Screen)
 * ดีไซน์มินิมอล สะอาดตา รองรับทั้งหน้าจอมือถือ, แท็บเล็ต และเครื่อง POS Sunmi T2
 */
export default function ModeSelectorScreen({ onSelectPOS, onSelectAdmin }) {
  const {
    appVersion,
    dbMode,
    printerSettings,
    currentUser,
    logout,
    canTab,
    showToast,
  } = usePOS();

  const [device, setDevice] = useState(() => posService.getDeviceSettings());
  const [showServerModal, setShowServerModal] = useState(false);
  const serverCfg = getServerConfig();
  const [serverUrl, setServerUrl] = useState(serverCfg.customUrl || serverCfg.url || '');
  const [serverKey, setServerKey] = useState(serverCfg.customAnonKey || serverCfg.anonKey || '');
  const [serverError, setServerError] = useState('');

  const canEnterPOS = canTab('pos');
  const canEnterAdmin = canAccessAnyAdminTab(currentUser);

  const handleChangeDefaultMode = (nextMode) => {
    try {
      const saved = posService.saveDeviceSettings({ defaultMode: nextMode });
      setDevice(saved);
      if (showToast) {
        const label = DEFAULT_MODE_OPTIONS.find((o) => o.id === saved.defaultMode)?.label || '';
        showToast(`ตั้งโหมดเริ่มต้นของเครื่องนี้เป็น "${label}" แล้ว`, 'info');
      }
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    }
  };

  const handleSaveServer = (e) => {
    e.preventDefault();
    setServerError('');
    try {
      saveServerConfig({ url: serverUrl, anonKey: serverKey });
      window.location.reload();
    } catch (err) {
      setServerError(err.message || 'บันทึกการตั้งค่าเซิร์ฟเวอร์ไม่สำเร็จ');
    }
  };

  const handleResetServer = () => {
    resetServerConfig();
    window.location.reload();
  };

  return (
    <div className="h-[100dvh] w-screen overflow-y-auto bg-slate-50 text-slate-900 flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* แถบส่วนหัว: โลโก้ร้าน + สถานะฐานข้อมูล + พนักงานที่ล็อกอิน */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 truncate">
                {printerSettings?.shopName || 'SiamPOS Pro'}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700 shrink-0">
                {appVersion}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              ระบบขายหน้าร้านปลีก-ส่ง และบริหารคลังสินค้า • เครื่อง {device.code}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const cfg = getServerConfig();
              setServerUrl(cfg.customUrl || cfg.url || '');
              setServerKey(cfg.customAnonKey || cfg.anonKey || '');
              setServerError('');
              setShowServerModal(true);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
              dbMode === 'supabase'
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
            }`}
            title="ตั้งค่าเซิร์ฟเวอร์ฐานข้อมูล (Supabase / VPS)"
          >
            <Database className="w-3 h-3" />
            <span>{dbMode === 'supabase' ? 'Supabase' : 'Demo (ตั้งค่าเซิร์ฟเวอร์)'}</span>
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs font-bold transition-colors"
              title="ออกจากระบบ"
            >
              <UserCircle2 className="w-4 h-4 text-indigo-600" />
              <span className="max-w-[6rem] truncate">{currentUser.name}</span>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ส่วนกลาง: การ์ดเลือกโหมด 2 ฝั่ง (หน้าร้าน vs หลังร้าน) + ตั้งค่าโหมดเริ่มต้นของเครื่องนี้ */}
      <div className="max-w-3xl w-full mx-auto my-auto py-4 sm:py-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900">
            เลือกโหมดการใช้งาน
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            แยกส่วนหน้าร้านและหลังร้านออกจากกันเพื่อความรวดเร็วในการใช้งาน
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-5">
          {/* การ์ดที่ 1: ขายหน้าร้าน (POS) */}
          <button
            type="button"
            disabled={!canEnterPOS}
            onClick={onSelectPOS}
            className={`group text-left p-5 sm:p-6 rounded-3xl border transition-all flex flex-col justify-between min-h-[180px] sm:min-h-[220px] bg-white ${
              canEnterPOS
                ? 'border-slate-200 hover:border-indigo-500 hover:ring-4 hover:ring-indigo-500/10'
                : 'border-slate-200 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  หน้าร้าน (POS)
                </span>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  ขายหน้าร้าน
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  คิดเงินปลีก-ส่ง สแกนบาร์โค้ด พักบิล และพิมพ์ใบเสร็จความร้อน
                </p>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
              {canEnterPOS ? (
                <>
                  <span className="text-xs sm:text-sm font-bold text-indigo-600">
                    เข้าสู่หน้าขาย
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </>
              ) : (
                <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  ไม่มีสิทธิ์เข้าหน้าขาย
                </span>
              )}
            </div>
          </button>

          {/* การ์ดที่ 2: จัดการหลังร้าน (Back-office / Admin) */}
          <button
            type="button"
            disabled={!canEnterAdmin}
            onClick={onSelectAdmin}
            className={`group text-left p-5 sm:p-6 rounded-3xl border transition-all flex flex-col justify-between min-h-[180px] sm:min-h-[220px] bg-white ${
              canEnterAdmin
                ? 'border-slate-200 hover:border-slate-900 hover:ring-4 hover:ring-slate-900/5'
                : 'border-slate-200 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                  <Boxes className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  หลังร้าน (Admin)
                </span>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  จัดการหลังร้าน
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  คลังสินค้า นำเข้า ราคาส่ง ลูกหนี้/วางบิล รายงานภาษี และตั้งค่าระบบ
                </p>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
              {canEnterAdmin ? (
                <>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    เข้าสู่ระบบหลังร้าน
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-900 text-slate-700 group-hover:text-white flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </>
              ) : (
                <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  ไม่มีสิทธิ์เข้าเมนูหลังร้าน
                </span>
              )}
            </div>
          </button>
        </div>

        {/* แถบตั้งค่าโหมดเริ่มต้นประจำเครื่องนี้ */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <MonitorSmartphone className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold text-slate-800">เมื่อเปิดแอปในเครื่องนี้ครั้งถัดไป:</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
            {DEFAULT_MODE_OPTIONS.map((opt) => {
              const active = (device.defaultMode || 'ask') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeDefaultMode(opt.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    active
                      ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ส่วนท้าย */}
      <div className="max-w-3xl w-full mx-auto text-center text-[11px] text-slate-400">
        SiamPOS Pro • {appVersion}
      </div>

      {/* Modal ตั้งค่าเซิร์ฟเวอร์ฐานข้อมูล (Supabase Cloud / Self-Hosted VPS) */}
      {showServerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    ตั้งค่าเซิร์ฟเวอร์ฐานข้อมูล
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    เชื่อมต่อ Supabase Cloud หรือ VPS ของร้านคุณเอง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveServer} className="p-5 space-y-3.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600">
                  Server URL (Supabase URL หรือ VPS URL)
                </span>
                <input
                  type="url"
                  required
                  placeholder="https://xxxx.supabase.co หรือ https://db.ร้านคุณ.com"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600">
                  Anon Public Key
                </span>
                <textarea
                  rows={3}
                  required
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={serverKey}
                  onChange={(e) => setServerKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              {serverError && (
                <div className="text-xs font-bold text-rose-600">{serverError}</div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {serverCfg.source === 'local' ? (
                  <button
                    type="button"
                    onClick={handleResetServer}
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> คืนค่าเริ่มต้น
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    สถานะ: {serverCfg.source === 'env' ? 'ค่าจากระบบ (.env)' : 'โหมดสาธิต'}
                  </span>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowServerModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                  >
                    บันทึกและเชื่อมต่อใหม่
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
