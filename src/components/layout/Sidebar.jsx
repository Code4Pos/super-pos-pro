import React from 'react';
import {
  ShoppingCart,
  Package,
  Receipt,
  Users,
  BarChart3,
  Store,
  AlertTriangle,
  Database,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

export const NAV_ITEMS = [
  {
    id: 'pos',
    label: 'ขายหน้าร้าน (POS)',
    shortLabel: 'หน้าขาย',
    icon: ShoppingCart,
    description: 'คิดเงิน ปลีก-ส่ง สแกนบาร์โค้ด',
  },
  {
    id: 'inventory',
    label: 'คลังสินค้า & ราคาส่ง',
    shortLabel: 'คลังสินค้า',
    icon: Package,
    description: 'จัดการสต็อก ราคาปลีก/ส่ง',
  },
  {
    id: 'orders',
    label: 'ประวัติบิลขาย',
    shortLabel: 'ประวัติบิล',
    icon: Receipt,
    description: 'ดูใบเสร็จย้อนหลัง พิมพ์ซ้ำ',
  },
  {
    id: 'customers',
    label: 'ลูกค้า & ยี่ปั๊ว',
    shortLabel: 'ลูกค้า',
    icon: Users,
    description: 'สมาชิกและร้านค้าขายส่ง',
  },
  {
    id: 'dashboard',
    label: 'แดชบอร์ดสรุปยอด',
    shortLabel: 'สรุปยอด',
    icon: BarChart3,
    description: 'วิเคราะห์ยอดขายและกำไร',
  },
];

/**
 * Sidebar (version beta 0.1.4):
 * - ค่าเริ่มต้นอยู่ในสถานะย่อ/ซ่อนข้อความ (isOpen = false) แสดงเฉพาะไอคอน (2 ขั้น: แสดงเต็ม / ย่อแสดงแค่ icon)
 */
export default function Sidebar({
  activeTab,
  setActiveTab,
  isOpen = false,
  onToggleSidebar,
}) {
  const { products, dbMode, resetDemo, appVersion } = usePOS();

  const lowStockCount = products.filter(
    (p) => Number(p.stock) <= Number(p.min_stock || 10)
  ).length;

  return (
    <aside
      className={`hidden lg:flex lg:flex-col bg-slate-900 text-white border-r border-slate-800 shrink-0 select-none transition-all duration-200 ${
        isOpen ? 'lg:w-64 xl:w-72' : 'lg:w-[72px]'
      }`}
    >
      {/* ส่วนหัว โลโก้ร้านค้า + ปุ่มสลับ 2 ขั้น (แสดงเต็ม / ย่อแสดงเฉพาะไอคอน) */}
      <div
        className={`border-b border-slate-800/80 flex items-center ${
          isOpen
            ? 'p-4 justify-between gap-2'
            : 'py-3.5 px-2 flex-col justify-center gap-2'
        }`}
      >
        {isOpen ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-base tracking-tight text-white truncate">
                    SiamPOS <span className="text-indigo-400">Pro</span>
                  </h1>
                </div>
                <span className="inline-block px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-semibold">
                  {appVersion}
                </span>
              </div>
            </div>

            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                title="ย่อแถบเมนูด้านซ้าย (แสดงเฉพาะไอคอน)"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 transition-all group relative"
            title="ขยายแถบเมนูด้านซ้าย (แสดงชื่อเมนูเต็ม)"
          >
            <PanelLeftOpen className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* เมนูหลัก 2 ขั้น: ขั้นแสดงเต็ม (Icon + ข้อความ) และ ขั้นย่อ (แสดงเฉพาะ Icon) */}
      <nav
        className={`flex-1 py-4 space-y-1.5 overflow-y-auto ${
          isOpen ? 'px-3' : 'px-2'
        }`}
      >
        {isOpen && (
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            เมนูการใช้งานหลัก
          </div>
        )}

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              title={`${item.label} — ${item.description}`}
              className={`w-full flex items-center rounded-xl transition-all duration-150 group relative ${
                isOpen
                  ? 'gap-3.5 px-3.5 py-3 text-left'
                  : 'justify-center py-3 px-0'
              } ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-medium'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform duration-150 ${
                  isActive
                    ? 'text-white scale-105'
                    : 'text-slate-400 group-hover:text-indigo-400'
                }`}
              />

              {isOpen && (
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-tight truncate">{item.label}</div>
                  <div
                    className={`text-[11px] truncate mt-0.5 ${
                      isActive ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    {item.description}
                  </div>
                </div>
              )}

              {/* แจ้งเตือนสต็อกต่ำ */}
              {item.id === 'inventory' && lowStockCount > 0 && (
                isOpen ? (
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full flex items-center gap-1 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                    title={`สินค้าใกล้หมด ${lowStockCount} รายการ`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {lowStockCount}
                  </span>
                ) : (
                  <span
                    className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold flex items-center justify-center ring-2 ring-slate-900"
                    title={`สินค้าใกล้หมด ${lowStockCount} รายการ`}
                  >
                    {lowStockCount}
                  </span>
                )
              )}
            </button>
          );
        })}
      </nav>

      {/* ส่วนท้าย Sidebar: แสดงสถานะฐานข้อมูลแบบเต็ม หรือแบบไอคอนย่อ */}
      {isOpen ? (
        <div className="p-4 m-3 rounded-2xl bg-slate-800/90 border border-slate-700/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">ฐานข้อมูลระบบ</span>
            </div>
            {dbMode === 'supabase' ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Supabase Cloud
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Demo Mode
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {dbMode === 'supabase'
              ? 'เชื่อมต่อฐานข้อมูล Supabase PostgreSQL เรียบร้อยแล้ว'
              : 'ทำงานด้วยข้อมูลจำลองในเครื่อง (LocalStorage)'}
          </p>

          {dbMode === 'demo' && (
            <button
              type="button"
              onClick={resetDemo}
              className="w-full py-1.5 px-3 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              รีเซ็ตข้อมูลตัวอย่างเริ่มต้น
            </button>
          )}

          <div className="pt-1 border-t border-slate-700/60 text-center text-[10px] font-mono text-slate-400">
            SiamPOS Pro • {appVersion}
          </div>
        </div>
      ) : (
        <div className="py-3 px-2 border-t border-slate-800/80 flex flex-col items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/70 flex items-center justify-center relative"
            title={
              dbMode === 'supabase'
                ? 'เชื่อมต่อฐานข้อมูล Supabase Cloud'
                : 'โหมดสาธิต (Demo LocalStorage)'
            }
          >
            <Database className="w-4 h-4 text-indigo-400" />
            <span
              className={`w-2 h-2 rounded-full absolute top-1.5 right-1.5 ${
                dbMode === 'supabase' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>

          {dbMode === 'demo' && (
            <button
              type="button"
              onClick={resetDemo}
              className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="รีเซ็ตข้อมูลตัวอย่างเริ่มต้น"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
