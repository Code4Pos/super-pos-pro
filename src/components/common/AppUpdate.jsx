import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Loader2, Smartphone, CheckCircle2 } from 'lucide-react';
import {
  isUpdaterAvailable,
  getUpdateState,
  subscribeUpdateState,
  checkForUpdates,
  applyUpdateNow,
  installApkUpdate,
  getNativeInfo,
  BUILD_ID,
} from '../../services/appUpdater';
import { APP_VERSION } from '../../context/POSContext';

// สถานะอัปเดตแอป Android (แชร์กันทุกคอมโพเนนต์)
function useAppUpdate() {
  const [state, setState] = useState(getUpdateState);
  useEffect(() => subscribeUpdateState(setState), []);
  return state;
}

async function confirmAndApply() {
  if (
    !window.confirm(
      'อัปเดตตอนนี้? แอปจะโหลดใหม่ทันที (บิลที่ยังไม่ได้ชำระในตะกร้าจะหายไป ให้พักบิลหรือชำระให้เสร็จก่อน)'
    )
  ) {
    return;
  }
  await applyUpdateNow();
}

async function installApk(onError) {
  try {
    await installApkUpdate();
  } catch (err) {
    onError?.(err?.message || 'ติดตั้งอัปเดตไม่สำเร็จ');
  }
}

/**
 * ปุ่มเล็กบน Header แสดงเฉพาะในแอป Android เมื่อมีอัปเดตพร้อม
 */
export function AppUpdateHeaderButton({ onError }) {
  const state = useAppUpdate();
  if (!isUpdaterAvailable()) return null;

  if (state.status === 'bundle-ready') {
    return (
      <button
        type="button"
        onClick={confirmAndApply}
        className="flex items-center gap-1 px-2 sm:px-2.5 h-8 sm:h-9 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold"
        title={state.message || 'มีอัปเดตพร้อมใช้งาน (จะใช้เองเมื่อเปิดแอปครั้งถัดไป)'}
      >
        <RefreshCw className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">อัปเดตพร้อม</span>
      </button>
    );
  }
  if (state.status === 'apk-available' || state.status === 'installing') {
    return (
      <button
        type="button"
        disabled={state.status === 'installing'}
        onClick={() => installApk(onError)}
        className="flex items-center gap-1 px-2 sm:px-2.5 h-8 sm:h-9 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold disabled:opacity-60"
        title={state.message || 'มีแอปเวอร์ชันใหม่'}
      >
        {state.status === 'installing' ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="hidden sm:inline">อัปเดตแอป</span>
      </button>
    );
  }
  return null;
}

/**
 * ส่วนอัปเดตแอปในการ์ด "เครื่องนี้" (แสดงเฉพาะในแอป Android)
 */
export function AppUpdatePanel({ onError }) {
  const state = useAppUpdate();
  const [native, setNative] = useState(null);

  useEffect(() => {
    if (isUpdaterAvailable()) getNativeInfo().then(setNative);
  }, []);

  if (!isUpdaterAvailable()) return null;

  const busy = ['checking', 'downloading', 'installing'].includes(state.status);

  return (
    <div className="pt-3 border-t border-slate-100 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <Smartphone className="w-4 h-4 text-indigo-600" />
        อัปเดตแอป
      </div>
      <div className="text-[11px] text-slate-500 leading-relaxed">
        เวอร์ชันหน้าจอ: <span className="font-bold text-slate-700">{APP_VERSION}</span> ({BUILD_ID.slice(0, 7)})
        {native && (
          <>
            {' '}• แอป Android: <span className="font-bold text-slate-700">{native.versionName || '-'}</span> (build{' '}
            {native.versionCode}, native {native.nativeApi})
          </>
        )}
      </div>
      {state.message && (
        <div
          className={`text-[11px] font-semibold flex items-center gap-1 ${
            state.status === 'error' ? 'text-rose-600' : state.status === 'up-to-date' ? 'text-emerald-700' : 'text-indigo-700'
          }`}
        >
          {state.status === 'up-to-date' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {state.message}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {state.status === 'bundle-ready' && (
          <button
            type="button"
            onClick={confirmAndApply}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> อัปเดตตอนนี้
          </button>
        )}
        {(state.status === 'apk-available' || state.status === 'installing') && (
          <button
            type="button"
            disabled={state.status === 'installing'}
            onClick={() => installApk(onError)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> ดาวน์โหลดและติดตั้งแอปเวอร์ชันใหม่
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => checkForUpdates({ manual: true })}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          ตรวจหาอัปเดต
        </button>
      </div>
      <p className="text-[10px] text-slate-500">
        อัปเดตทั่วไปจะดาวน์โหลดเองเบื้องหลังและใช้ตอนเปิดแอปครั้งถัดไป ส่วนอัปเดตที่ต้องลงแอปใหม่ Android จะให้กด "ติดตั้ง" ยืนยันเอง
      </p>
    </div>
  );
}
