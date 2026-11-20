import React, { useEffect, useState } from 'react';
import { AlertTriangle, Archive, Loader2, X, CheckCircle2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { posService } from '../../services/posService';
import { downloadJsonFile, shopBackupFileName } from '../../utils/download';

/**
 * ขั้นตอนยืนยันงานที่ลบข้อมูลถาวร (รีเซ็ตร้าน / กู้คืนจากไฟล์)
 * 1) ถามว่าจะสำรองข้อมูลก่อนไหม (ทุกครั้ง)
 * 2) ยืนยันด้วย PIN ผู้ดูแลระบบ (ถ้ามีผู้ใช้) และพิมพ์ชื่อร้าน
 * 3) ทำงาน แล้วแสดงผล
 * onRun() คืนค่าข้อความหรือรายการผล [{ table, inserted, total, error }]
 * - askBackup = false: ข้ามขั้นถามสำรอง (เช่น ร้านว่างหลังคืนค่าโรงงาน)
 * - confirmPhrase: คำที่ต้องพิมพ์ยืนยัน (ค่าเริ่มต้น = ชื่อร้าน)
 */
export default function DangerActionModal({
  isOpen,
  title,
  description,
  actionLabel,
  onRun,
  onClose,
  askBackup = true,
  confirmPhrase = null,
}) {
  const { users, authEnabled, printerSettings, exportShopBackup, showToast } = usePOS();
  const admins = users.filter((u) => u.is_active && u.role === 'admin');
  const shopName = String(confirmPhrase ?? printerSettings.shopName ?? '').trim();

  const [step, setStep] = useState('backup'); // backup | confirm | running | done
  const [backingUp, setBackingUp] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [pin, setPin] = useState('');
  const [typedName, setTypedName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(askBackup ? 'backup' : 'confirm');
    setBackingUp(false);
    setAdminId(admins[0]?.id || '');
    setPin('');
    setTypedName('');
    setError('');
    setResult(null);
    // ตั้งค่าเริ่มต้นเฉพาะตอนเปิด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const backup = await exportShopBackup();
      const ok = downloadJsonFile(shopBackupFileName(backup.shopName), backup);
      if (!ok) {
        showToast('ดาวน์โหลดไฟล์สำรองไม่ได้ กรุณาสำรองจากเบราว์เซอร์บนคอมพิวเตอร์', 'error');
        return;
      }
      showToast('ดาวน์โหลดไฟล์สำรองแล้ว ตรวจว่าไฟล์อยู่ในเครื่องก่อนดำเนินการต่อ', 'success');
      setStep('confirm');
    } catch (err) {
      showToast(`สำรองข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const nameMatches = typedName.trim() === shopName && shopName !== '';
  const pinRequired = authEnabled;
  const canConfirm = nameMatches && (!pinRequired || pin.length >= 4);

  const handleRun = async () => {
    if (pinRequired) {
      const admin = admins.find((u) => u.id === adminId);
      if (!admin || !posService.verifyUserPin(admin, pin)) {
        setError('PIN ผู้ดูแลระบบไม่ถูกต้อง');
        setPin('');
        return;
      }
    }
    setError('');
    setStep('running');
    try {
      const output = await onRun();
      setResult(output || null);
      setStep('done');
    } catch (err) {
      setError(err.message || 'ทำรายการไม่สำเร็จ');
      setStep('confirm');
    }
  };

  const resultRows = Array.isArray(result?.results) ? result.results : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-4 py-3 bg-rose-600 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-sm">
            <AlertTriangle className="w-5 h-5" /> {title}
          </div>
          {step !== 'running' && (
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-rose-700">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs text-slate-700">
          {description && step !== 'done' && <div className="leading-relaxed">{description}</div>}

          {step === 'backup' && (
            <>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                สำรองข้อมูลทั้งร้านเป็นไฟล์ก่อนไหม? ข้อมูลที่ลบแล้วกู้คืนได้จากไฟล์สำรองเท่านั้น
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={backingUp}
                  onClick={handleBackup}
                  className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold flex items-center justify-center gap-1.5"
                >
                  {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  {backingUp ? 'กำลังสำรองข้อมูล...' : 'สำรองข้อมูลแล้วดำเนินการต่อ'}
                </button>
                <button
                  type="button"
                  disabled={backingUp}
                  onClick={() => setStep('confirm')}
                  className="h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                >
                  ดำเนินการต่อโดยไม่สำรอง
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              {pinRequired && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] font-bold text-slate-500">ผู้ดูแลระบบ</span>
                    <select
                      value={adminId}
                      onChange={(e) => setAdminId(e.target.value)}
                      className="mt-1 w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    >
                      {admins.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold text-slate-500">PIN</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="mt-1 w-full px-2 py-2 rounded-xl border border-slate-300 text-center font-bold tracking-[0.4em]"
                    />
                  </label>
                </div>
              )}
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">
                  พิมพ์{confirmPhrase ? 'คำว่า' : 'ชื่อร้าน'} <span className="text-rose-600">"{shopName}"</span> เพื่อยืนยัน
                </span>
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </label>
              {error && <div className="font-bold text-rose-600">{error}</div>}
              <button
                type="button"
                disabled={!canConfirm}
                onClick={handleRun}
                className="w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-extrabold"
              >
                {actionLabel}
              </button>
            </>
          )}

          {step === 'running' && (
            <div className="py-8 flex flex-col items-center gap-2 text-slate-600 font-semibold">
              <Loader2 className="w-7 h-7 animate-spin" /> กำลังดำเนินการ ห้ามปิดแอป...
            </div>
          )}

          {step === 'done' && (
            <>
              <div className="flex items-center gap-2 font-extrabold text-emerald-700 text-sm">
                <CheckCircle2 className="w-5 h-5" /> ดำเนินการเรียบร้อย
              </div>
              {resultRows && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {resultRows.map((r) => (
                    <div key={r.table} className="px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px]">{r.table}</span>
                      <span className={r.error ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                        {r.error ? `ผิดพลาด: ${r.error}` : `${r.inserted}/${r.total} แถว`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold"
              >
                ปิด
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
