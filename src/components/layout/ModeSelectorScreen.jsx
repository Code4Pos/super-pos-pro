import React from 'react';
import {
  ShoppingCart,
  Boxes,
  Store,
  Database,
  UserCircle2,
  LogOut,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { ROLES, canAccessAnyAdminTab } from '../../utils/rbac';

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
  } = usePOS();

  const canEnterPOS = canTab('pos');
  const canEnterAdmin = canAccessAnyAdminTab(currentUser);

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
              ระบบขายหน้าร้านปลีก-ส่ง และบริหารคลังสินค้า
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
              dbMode === 'supabase'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <Database className="w-3 h-3" />
            <span>{dbMode === 'supabase' ? 'Supabase' : 'Demo'}</span>
          </span>

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

      {/* ส่วนกลาง: การ์ดเลือกโหมด 2 ฝั่ง (หน้าร้าน vs หลังร้าน) */}
      <div className="max-w-3xl w-full mx-auto my-auto py-4 sm:py-6 space-y-4 sm:space-y-6">
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
            className={`group text-left p-5 sm:p-6 rounded-3xl border transition-all flex flex-col justify-between min-h-[180px] sm:min-h-[230px] bg-white ${
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
            className={`group text-left p-5 sm:p-6 rounded-3xl border transition-all flex flex-col justify-between min-h-[180px] sm:min-h-[230px] bg-white ${
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
      </div>

      {/* ส่วนท้าย */}
      <div className="max-w-3xl w-full mx-auto text-center text-[11px] text-slate-400">
        SiamPOS Pro • {appVersion}
      </div>
    </div>
  );
}
