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
 * ให้ผู้ใช้เลือกระหว่าง "ขายหน้าร้าน (POS)" และ "จัดการหลังร้าน (Back-office)"
 * ออกแบบปุ่มขนาดใหญ่ กดง่ายบนจอสัมผัส (Sunmi T2 / Tablet / Desktop)
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
    <div className="h-[100dvh] w-screen overflow-y-auto bg-slate-900 text-white flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* แถบส่วนหัว: โลโก้ร้าน + สถานะฐานข้อมูล + พนักงานที่ล็อกอิน */}
      <div className="max-w-4xl w-full mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                {printerSettings?.shopName || 'SiamPOS Pro'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {appVersion}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              ระบบขายหน้าร้านปลีก-ส่ง และบริหารคลังสินค้าอัจฉริยะ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              dbMode === 'supabase'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{dbMode === 'supabase' ? 'Supabase Cloud' : 'Demo Mode'}</span>
          </span>

          {currentUser && (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600/20 border border-slate-700 hover:border-rose-500/40 text-slate-200 hover:text-rose-300 text-xs font-bold transition-colors"
              title="ออกจากระบบ"
            >
              <UserCircle2 className="w-4 h-4 text-indigo-400" />
              <span>{currentUser.name}</span>
              <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                ({ROLES[currentUser.role]?.label || currentUser.role})
              </span>
              <LogOut className="w-3.5 h-3.5 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* ส่วนกลาง: การ์ดเลือกโหมด 2 ฝั่ง (หน้าร้าน vs หลังร้าน) */}
      <div className="max-w-4xl w-full mx-auto my-auto py-6 space-y-6">
        <div className="text-center space-y-1.5">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white">
            เลือกส่วนการทำงานที่ต้องการเข้าใช้งาน
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            แยกส่วนหน้าร้านและหลังร้านออกจากกัน เพื่อให้หน้าขายทำงานได้รวดเร็วที่สุด
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* การ์ดที่ 1: ขายหน้าร้าน (POS) */}
          <button
            type="button"
            disabled={!canEnterPOS}
            onClick={onSelectPOS}
            className={`group text-left p-6 sm:p-8 rounded-3xl border-2 transition-all flex flex-col justify-between min-h-[240px] sm:min-h-[270px] ${
              canEnterPOS
                ? 'bg-slate-800/90 hover:bg-indigo-950/80 border-indigo-500/50 hover:border-indigo-400 shadow-xl'
                : 'bg-slate-800/40 border-slate-800 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                  <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  index.html • โหลดไวพิเศษ
                </span>
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                  ขายหน้าร้าน (POS)
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  หน้าคิดเงินเต็มจอ สแกนบาร์โค้ดตลอดเวลา คำนวณราคาปลีก-ส่งอัตโนมัติ พักบิล และพิมพ์ใบเสร็จความร้อน
                </p>
              </div>
            </div>

            <div className="pt-5 mt-4 border-t border-slate-700/70 flex items-center justify-between">
              {canEnterPOS ? (
                <>
                  <span className="text-xs sm:text-sm font-extrabold text-indigo-400 group-hover:text-indigo-300">
                    เข้าสู่หน้าขายหน้าร้าน
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 group-hover:bg-indigo-500 text-white flex items-center justify-center">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </>
              ) : (
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  บทบาทของคุณไม่มีสิทธิ์เข้าหน้าขายหน้าร้าน
                </span>
              )}
            </div>
          </button>

          {/* การ์ดที่ 2: จัดการหลังร้าน (Back-office / Admin) */}
          <button
            type="button"
            disabled={!canEnterAdmin}
            onClick={onSelectAdmin}
            className={`group text-left p-6 sm:p-8 rounded-3xl border-2 transition-all flex flex-col justify-between min-h-[240px] sm:min-h-[270px] ${
              canEnterAdmin
                ? 'bg-slate-800/90 hover:bg-emerald-950/70 border-emerald-500/50 hover:border-emerald-400 shadow-xl'
                : 'bg-slate-800/40 border-slate-800 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                  <Boxes className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  admin.html • ระบบบริหารครบวงจร
                </span>
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                  จัดการหลังร้าน (Back-office)
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  จัดการสินค้า สต็อกหลายคลัง นำเข้าสินค้า ราคาส่งหลายระดับ ลูกหนี้/วางบิล รายงานภาษีขาย และตั้งค่าระบบ
                </p>
              </div>
            </div>

            <div className="pt-5 mt-4 border-t border-slate-700/70 flex items-center justify-between">
              {canEnterAdmin ? (
                <>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-400 group-hover:text-emerald-300">
                    เข้าสู่ระบบจัดการหลังร้าน
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 group-hover:bg-emerald-500 text-white flex items-center justify-center">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </>
              ) : (
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  บทบาทของคุณไม่มีสิทธิ์เข้าเมนูหลังร้าน
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ส่วนท้าย */}
      <div className="max-w-4xl w-full mx-auto text-center text-[11px] text-slate-500">
        SiamPOS Pro ({appVersion}) • ออกแบบเพื่อความลื่นไหลบนเครื่อง POS หน้าจอสัมผัส
      </div>
    </div>
  );
}
