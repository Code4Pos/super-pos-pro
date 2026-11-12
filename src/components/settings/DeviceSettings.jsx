import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, LogOut, Save, UploadCloud, CheckCircle2, AlertTriangle, Server, RotateCcw } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { posService } from '../../services/posService';
import { sanitizeDeviceCode, localDateCode } from '../../utils/device';
import { signOutShop, getShopAccountEmail } from '../auth/ShopAuthGate';
import { getServerConfig, saveServerConfig, resetServerConfig } from '../../lib/supabase';

const DEFAULT_MODE_OPTIONS = [
  { id: 'ask', label: 'ถามทุกครั้ง (แสดงหน้าเลือกโหมด)' },
  { id: 'pos', label: 'ขายหน้าร้านทันที (เหมาะกับเครื่องแคชเชียร์ / Sunmi)' },
  { id: 'admin', label: 'จัดการหลังร้านทันที (เหมาะกับคอมออฟฟิศ / เจ้าของร้าน)' },
];

/**
 * ค่าตั้งเฉพาะเครื่องนี้ (ไม่ซิงค์ไปเครื่องอื่น): รหัสเครื่องที่ใช้ขึ้นต้นเลขที่บิล, โหมดเริ่มต้นของเครื่อง, เซิร์ฟเวอร์ฐานข้อมูล, เครื่องมืออัปโหลดข้อมูลจากเครื่องหลัก และบัญชีร้านที่ล็อกอินอยู่
 */
export default function DeviceSettings() {
  const { showToast, dbMode, isOffline, uploadLocalData } = usePOS();
  const [device, setDevice] = useState(() => posService.getDeviceSettings());
  const [code, setCode] = useState(device.code);
  const [email, setEmail] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [localSummary, setLocalSummary] = useState(() => posService.getLocalDataSummary());
  const [serverCfg, setServerCfg] = useState(() => getServerConfig());
  const [serverUrl, setServerUrl] = useState(() => {
    const cfg = getServerConfig();
    return cfg.customUrl || cfg.url || '';
  });
  const [serverKey, setServerKey] = useState(() => {
    const cfg = getServerConfig();
    return cfg.customAnonKey || cfg.anonKey || '';
  });
  const [showServerForm, setShowServerForm] = useState(false);

  useEffect(() => {
    getShopAccountEmail().then(setEmail);
    setLocalSummary(posService.getLocalDataSummary());
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

  const handleChangeDefaultMode = (nextMode) => {
    try {
      const saved = posService.saveDeviceSettings({ defaultMode: nextMode });
      setDevice(saved);
      const label = DEFAULT_MODE_OPTIONS.find((o) => o.id === saved.defaultMode)?.label || '';
      showToast(`บันทึกโหมดเริ่มต้น: ${label}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveServerConfig = (e) => {
    e.preventDefault();
    try {
      saveServerConfig({ url: serverUrl, anonKey: serverKey });
      setServerCfg(getServerConfig());
      showToast('บันทึกเซิร์ฟเวอร์ฐานข้อมูลแล้ว กำลังโหลดระบบใหม่...', 'success');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      showToast(err.message || 'บันทึกการตั้งค่าเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
    }
  };

  const handleResetServerConfig = () => {
    if (!window.confirm('คืนค่าเซิร์ฟเวอร์กลับเป็นค่าเริ่มต้นจากระบบ (.env)?')) return;
    resetServerConfig();
    setServerCfg(getServerConfig());
    showToast('คืนค่าเซิร์ฟเวอร์เริ่มต้นแล้ว กำลังโหลดระบบใหม่...', 'info');
    setTimeout(() => window.location.reload(), 600);
  };

  const handleUploadLocalData = async () => {
    if (uploading) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await uploadLocalData();
      setUploadResult(res);
      setLocalSummary(posService.getLocalDataSummary());
      if (res.errors?.length > 0) {
        showToast(
          `อัปโหลดบางส่วนสำเร็จ (มี ${res.errors.length} ตารางที่ยังไม่ได้รัน SQL Migration)`,
          'warning'
        );
      } else {
        showToast('อัปโหลดข้อมูลจากเครื่องนี้ขึ้นฐานข้อมูลสำเร็จครบทุกรายการ!', 'success');
      }
    } catch (err) {
      showToast(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดข้อมูล', 'error');
    } finally {
      setUploading(false);
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
          <p className="text-xs text-slate-500">ค่าตั้งเฉพาะเครื่องนี้ และการซิงค์ข้อมูลจากเครื่องหลักขึ้นฐานข้อมูล</p>
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

        {/* โหมดเริ่มต้นเมื่อเปิดแอปในเครื่องนี้ */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="text-[11px] font-bold text-slate-600">
            โหมดเริ่มต้นเมื่อเปิดแอปในเครื่องนี้
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DEFAULT_MODE_OPTIONS.map((opt) => {
              const active = (device.defaultMode || 'ask') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeDefaultMode(opt.id)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-colors ${
                    active
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            ถึงแม้จะตั้งให้เข้าหน้าขายหรือหลังร้านทันที คุณยังกดปุ่มสลับโหมดบนแถบด้านบนได้ตลอดเวลา
          </p>
        </div>

        {/* การเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูล (Supabase Cloud / Self-Hosted VPS) */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-600" />
                <span>เซิร์ฟเวอร์ฐานข้อมูล (Supabase Cloud / Self-Hosted VPS)</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                {serverCfg.url ? (
                  <>
                    เชื่อมต่อกับ: <span className="font-bold text-slate-700">{serverCfg.url}</span>{' '}
                    ({serverCfg.source === 'local' ? 'ตั้งค่าผ่านหน้าแอป' : 'ค่าเริ่มต้น .env'})
                  </>
                ) : (
                  'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (ทำงานในโหมดสาธิต Demo)'
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowServerForm((v) => !v)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold self-start sm:self-center shrink-0"
            >
              {showServerForm ? 'ซ่อนฟอร์มตั้งค่า' : 'ตั้งค่า / ย้ายเซิร์ฟเวอร์ VPS'}
            </button>
          </div>

          {showServerForm && (
            <form
              onSubmit={handleSaveServerConfig}
              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="grid grid-cols-1 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600">
                    Server URL (Supabase URL หรือ VPS URL ของร้าน)
                  </span>
                  <input
                    type="url"
                    required
                    placeholder="https://xxxx.supabase.co หรือ https://db.ร้านคุณ.com"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600">
                    Anon Public Key
                  </span>
                  <textarea
                    rows={2}
                    required
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={serverKey}
                    onChange={(e) => setServerKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {serverCfg.source === 'local' ? (
                  <button
                    type="button"
                    onClick={handleResetServerConfig}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> คืนค่าเริ่มต้น (.env)
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    เปลี่ยนไปชี้ VPS ของตัวเองได้ทันทีโดยไม่ต้องลงแอป (.apk) ใหม่
                  </span>
                )}
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 ml-auto"
                >
                  <Save className="w-3.5 h-3.5" /> บันทึกและเชื่อมต่อใหม่
                </button>
              </div>
            </form>
          )}
        </div>

        {dbMode === 'supabase' && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-slate-800">
                  อัปโหลดข้อมูลจากเครื่องนี้ขึ้นฐานข้อมูล
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  ส่งข้อมูลที่เคยเก็บในเครื่องหลักขึ้นฐานข้อมูลเพื่อให้เครื่องอื่นเห็นตรงกัน (กดซ้ำได้ปลอดภัย ไม่สร้างรายการซ้ำ):
                  {' '}ผู้ผลิต {localSummary.suppliers} รายการ · ใบนำเข้า {localSummary.stockImports} ใบ · กฎราคาส่ง/พิเศษ{' '}
                  {localSummary.wholesaleRules + localSummary.specialRules} กฎ · หน่วยนับ {localSummary.units} หน่วย · ประวัติตัดล็อต{' '}
                  {localSummary.lotConsumptions} รายการ · ตั้งค่าร้านและข้อมูลเสริมสินค้า/ลูกค้า
                </p>
              </div>
              <button
                type="button"
                disabled={uploading || isOffline}
                onClick={handleUploadLocalData}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-center"
              >
                <UploadCloud className="w-4 h-4" />
                {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดข้อมูลจากเครื่องนี้ขึ้นฐานข้อมูล'}
              </button>
            </div>

            {uploadResult && (
              <div
                className={`rounded-xl p-3 text-xs border ${
                  uploadResult.errors?.length > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  {uploadResult.errors?.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  )}
                  <span>
                    อัปโหลดแล้ว: ตั้งค่าร้าน {uploadResult.counts.shopSettings} · หน่วยนับ {uploadResult.counts.units} · ผู้ผลิต{' '}
                    {uploadResult.counts.suppliers} · ใบนำเข้า {uploadResult.counts.stockImports} · กฎราคาส่ง{' '}
                    {uploadResult.counts.wholesaleRules} · กฎราคาพิเศษ {uploadResult.counts.specialRules} · ประวัติตัดล็อต{' '}
                    {uploadResult.counts.lotConsumptions} · ข้อมูลเสริมสินค้า {uploadResult.counts.productsUpdated} · ลูกค้า{' '}
                    {uploadResult.counts.customersUpdated}
                  </span>
                </div>
                {uploadResult.errors?.length > 0 && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    หมายเหตุ (กรุณารัน SQL Migration beta 0.3.7 บน Supabase): {uploadResult.errors.join(' | ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
