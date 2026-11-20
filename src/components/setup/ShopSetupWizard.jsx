import React, { useRef, useState } from 'react';
import { Store, UserCog, Smartphone, CheckCircle2, ChevronLeft, ChevronRight, Loader2, FileJson } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { posService, SHOP_BACKUP_TYPE } from '../../services/posService';
import { sanitizeDeviceCode } from '../../utils/device';
import { readFileAsText } from '../../utils/download';
import { isValidThaiTaxId } from '../../utils/credit';
import DangerActionModal from '../settings/DangerActionModal';

const STEPS = [
  { id: 'shop', label: 'ข้อมูลร้าน', icon: Store },
  { id: 'admin', label: 'ผู้ดูแลระบบ', icon: UserCog },
  { id: 'device', label: 'เครื่องนี้', icon: Smartphone },
  { id: 'finish', label: 'เริ่มใช้งาน', icon: CheckCircle2 },
];

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';

/**
 * ขั้นตอนสร้างร้านหลังคืนค่าโรงงาน (ค่าตั้ง setupRequired = true และยังไม่มีผู้ใช้)
 * ข้อมูลร้าน → สร้างผู้ดูแลระบบ → ตั้งค่าเครื่องนี้ → เริ่มร้านใหม่ หรือกู้คืนจากไฟล์สำรอง
 */
export default function ShopSetupWizard() {
  const { updatePrinterSettings, saveUser, restoreShopBackup, dbMode, showToast } = usePOS();
  const fileRef = useRef(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [shop, setShop] = useState({
    shopName: '',
    shopAddress: '',
    shopPhone: '',
    vatRegistered: false,
    shopTaxId: '',
  });
  const [admin, setAdmin] = useState({ name: '', pin: '', pin2: '' });
  const [device, setDevice] = useState(() => {
    const d = posService.getDeviceSettings();
    return { code: d.code, defaultMode: d.defaultMode || 'ask' };
  });
  const [saving, setSaving] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);

  const step = STEPS[stepIndex].id;

  const errors = {
    shop: !shop.shopName.trim()
      ? 'กรุณาระบุชื่อร้าน'
      : shop.vatRegistered && !isValidThaiTaxId(shop.shopTaxId)
      ? 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)'
      : '',
    admin: !admin.name.trim()
      ? 'กรุณาระบุชื่อผู้ดูแลระบบ'
      : !/^\d{4,6}$/.test(admin.pin)
      ? 'PIN ต้องเป็นตัวเลข 4-6 หลัก'
      : admin.pin !== admin.pin2
      ? 'PIN ทั้งสองช่องไม่ตรงกัน'
      : '',
    device: !sanitizeDeviceCode(device.code) ? 'กรุณาระบุรหัสเครื่อง (A-Z, 0-9 หรือ -)' : '',
    finish: '',
  };
  const currentError = errors[step];

  const handleFinish = async () => {
    setSaving(true);
    try {
      posService.saveDeviceSettings({ code: device.code, defaultMode: device.defaultMode });
      updatePrinterSettings({
        shopName: shop.shopName.trim(),
        shopAddress: shop.shopAddress.trim(),
        shopPhone: shop.shopPhone.trim(),
        vatRegistered: shop.vatRegistered,
        shopTaxId: shop.vatRegistered ? shop.shopTaxId.replace(/\D/g, '') : '',
        setupRequired: false,
      });
      // ผู้ดูแลระบบคนแรก: บันทึกแล้วล็อกอินให้อัตโนมัติ
      const saved = await saveUser({ name: admin.name.trim(), pin: admin.pin, role: 'admin', is_active: true });
      if (!saved) {
        updatePrinterSettings({ setupRequired: true });
        return;
      }
      showToast(`สร้างร้าน "${shop.shopName.trim()}" เรียบร้อย`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePickBackup = async (file) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await readFileAsText(file));
      if (data?.type !== SHOP_BACKUP_TYPE || !data.tables) throw new Error('ไม่ใช่ไฟล์สำรองข้อมูลร้านของ SiamPOS Pro');
      setRestoreFile(data);
    } catch (err) {
      showToast(err.message.startsWith('Unexpected') ? 'ไฟล์ไม่ใช่ JSON' : err.message, 'error');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-indigo-600 text-white">
          <div className="text-base font-extrabold">สร้างร้านใหม่</div>
          <div className="text-xs text-indigo-100">
            ร้านถูกคืนค่าโรงงานแล้ว ตั้งค่าเริ่มต้นให้ครบเพื่อเริ่มใช้งาน ({dbMode === 'supabase' ? 'ฐานข้อมูลจริง' : 'Demo'})
          </div>
        </div>

        {/* แถบขั้นตอน */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const active = idx === stepIndex;
            const done = idx < stepIndex;
            return (
              <React.Fragment key={s.id}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                <div
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 whitespace-nowrap border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : done
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className={active ? '' : 'hidden sm:inline'}>{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="p-5 space-y-3">
          {step === 'shop' && (
            <>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">ชื่อร้าน / ชื่อบริษัท *</span>
                <input
                  type="text"
                  data-allow-scanner="false"
                  autoFocus
                  value={shop.shopName}
                  onChange={(e) => setShop({ ...shop, shopName: e.target.value })}
                  className={`${inputClass} mt-1 font-bold`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">ที่อยู่ร้าน</span>
                <textarea
                  rows={2}
                  data-allow-scanner="false"
                  value={shop.shopAddress}
                  onChange={(e) => setShop({ ...shop, shopAddress: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">เบอร์โทรร้าน</span>
                <input
                  type="tel"
                  data-allow-scanner="false"
                  value={shop.shopPhone}
                  onChange={(e) => setShop({ ...shop, shopPhone: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shop.vatRegistered}
                  onChange={(e) => setShop({ ...shop, vatRegistered: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600"
                />
                ร้านจดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
              </label>
              {shop.vatRegistered && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">เลขประจำตัวผู้เสียภาษี 13 หลัก</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    data-allow-scanner="false"
                    maxLength={13}
                    value={shop.shopTaxId}
                    onChange={(e) => setShop({ ...shop, shopTaxId: e.target.value.replace(/\D/g, '') })}
                    className={`${inputClass} mt-1 font-mono`}
                  />
                </label>
              )}
            </>
          )}

          {step === 'admin' && (
            <>
              <p className="text-xs text-slate-500">
                ผู้ดูแลระบบทำได้ทุกอย่าง ใช้ PIN นี้ล็อกอินและอนุมัติรายการสำคัญ (เพิ่มพนักงานคนอื่นได้ทีหลัง)
              </p>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">ชื่อผู้ดูแลระบบ *</span>
                <input
                  type="text"
                  data-allow-scanner="false"
                  autoFocus
                  value={admin.name}
                  onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">PIN 4-6 หลัก *</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    value={admin.pin}
                    onChange={(e) => setAdmin({ ...admin, pin: e.target.value.replace(/\D/g, '') })}
                    className={`${inputClass} mt-1 text-center font-bold tracking-[0.4em]`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">ยืนยัน PIN *</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    value={admin.pin2}
                    onChange={(e) => setAdmin({ ...admin, pin2: e.target.value.replace(/\D/g, '') })}
                    className={`${inputClass} mt-1 text-center font-bold tracking-[0.4em]`}
                  />
                </label>
              </div>
            </>
          )}

          {step === 'device' && (
            <>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">รหัสเครื่องนี้ (ใช้ในเลขที่บิล)</span>
                <input
                  type="text"
                  data-allow-scanner="false"
                  maxLength={10}
                  value={device.code}
                  onChange={(e) => setDevice({ ...device, code: sanitizeDeviceCode(e.target.value) || e.target.value.toUpperCase() })}
                  className={`${inputClass} mt-1 font-mono font-bold`}
                />
                <span className="text-[11px] text-slate-500">ตั้งไม่ซ้ำกันในแต่ละเครื่อง เช่น POS1, POS2</span>
              </label>
              <div>
                <span className="text-xs font-bold text-slate-700">เปิดแอปแล้วเข้าหน้าไหน</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {[
                    { id: 'ask', label: 'ถามทุกครั้ง' },
                    { id: 'pos', label: 'หน้าร้าน' },
                    { id: 'admin', label: 'หลังร้าน' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDevice({ ...device, defaultMode: opt.id })}
                      className={`h-10 rounded-xl border text-xs font-bold ${
                        device.defaultMode === opt.id
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'finish' && (
            <>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div>
                  ร้าน: <span className="font-bold">{shop.shopName}</span>
                </div>
                <div>
                  ผู้ดูแลระบบ: <span className="font-bold">{admin.name}</span>
                </div>
                <div>
                  รหัสเครื่อง: <span className="font-mono font-bold">{device.code}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-extrabold flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                เริ่มใช้งานร้านใหม่
              </button>
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] text-slate-500">
                  ย้ายร้านหรือย้อนข้อมูลเดิม? กู้คืนจากไฟล์สำรองแทนได้ (ข้อมูลร้าน ผู้ใช้ และค่าตั้งจะมาจากไฟล์)
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => handlePickBackup(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <FileJson className="w-4 h-4" /> กู้คืนจากไฟล์สำรอง
                </button>
              </div>
            </>
          )}

          {currentError && step !== 'finish' && <div className="text-xs font-bold text-rose-600">{currentError}</div>}

          {/* ปุ่มย้อน/ถัดไป */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={stepIndex === 0 || saving}
              onClick={() => setStepIndex((i) => i - 1)}
              className="px-4 h-10 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 disabled:opacity-30 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> ย้อนกลับ
            </button>
            {step !== 'finish' && (
              <button
                type="button"
                disabled={Boolean(currentError)}
                onClick={() => setStepIndex((i) => i + 1)}
                className="px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1"
              >
                ถัดไป <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* กู้คืนจากไฟล์ใช้ขั้นตอนยืนยันเดียวกับหน้ารีเซ็ต (ยังไม่มีผู้ใช้ = ยืนยันด้วยชื่อร้านอย่างเดียว) */}
      <DangerActionModal
        isOpen={Boolean(restoreFile)}
        title="กู้คืนข้อมูลจากไฟล์สำรอง"
        description={`ใช้ข้อมูลจากไฟล์สำรองของ "${restoreFile?.shopName || '-'}" แทนการสร้างร้านใหม่`}
        actionLabel="กู้คืนข้อมูล"
        onRun={() => restoreShopBackup(restoreFile)}
        onClose={() => setRestoreFile(null)}
        askBackup={false}
        confirmPhrase="กู้คืน"
      />
    </div>
  );
}
