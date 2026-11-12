import React, { useState } from 'react';
import { LayoutGrid, X, Store } from 'lucide-react';
import { NAV_ITEMS, SIDEBAR_MENU_GROUPS } from './Sidebar';
import { usePOS } from '../../context/POSContext';

export default function MobileNav({ activeTab, setActiveTab }) {
  const { products, canTab } = usePOS();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // แสดงเฉพาะเมนูหลักที่บทบาทของผู้ใช้มีสิทธิ์เข้า
  const items = NAV_ITEMS.filter((item) => canTab(item.id));

  // กรองเมนูทั้งหมดของหลังร้านสำหรับ Drawer "เมนูทั้งหมด" บนมือถือ
  const visibleGroups = SIDEBAR_MENU_GROUPS.map((group) =>
    group.isDropdown
      ? { ...group, children: group.children.filter((c) => canTab(c.id)) }
      : group
  ).filter((group) =>
    group.isDropdown ? group.children.length > 0 : canTab(group.id)
  );

  const lowStockCount = products.filter(
    (p) => Number(p.stock) <= Number(p.min_stock || 10)
  ).length;

  const isCurrentInQuickNav = items.some((i) => i.id === activeTab);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setIsMoreOpen(false);
  };

  const navigateToPOS = () => {
    try {
      sessionStorage.setItem('siampos_entry_chosen_v1', 'pos');
    } catch {
      // ignore storage errors
    }
    window.location.href = './index.html?mode=pos';
  };

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 safe-area-pb select-none">
        <div
          className="grid h-15 max-w-lg mx-auto"
          style={{
            gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !isMoreOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 relative transition-colors ${
                  isActive
                    ? 'text-indigo-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-0.5 bg-indigo-600 rounded-b-full" />
                )}
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? 'stroke-[2.5px]' : 'stroke-2'
                    }`}
                  />
                  {item.id === 'inventory' && lowStockCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {lowStockCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] leading-none truncate max-w-full px-1">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          {/* ปุ่มที่ 5: เมนูทั้งหมด (เปิด Bottom Sheet เมนูหลังร้านครบทุกหมวดหมู่บนมือถือ) */}
          <button
            type="button"
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center gap-1 relative transition-colors ${
              isMoreOpen || !isCurrentInQuickNav
                ? 'text-indigo-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {(isMoreOpen || !isCurrentInQuickNav) && (
              <span className="absolute top-0 inset-x-4 h-0.5 bg-indigo-600 rounded-b-full" />
            )}
            <LayoutGrid
              className={`w-5 h-5 ${
                isMoreOpen || !isCurrentInQuickNav
                  ? 'stroke-[2.5px]'
                  : 'stroke-2'
              }`}
            />
            <span className="text-[11px] leading-none truncate max-w-full px-1">
              เมนูทั้งหมด
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom Sheet แสดงเมนูหลังร้านทั้งหมดสำหรับหน้าจอมือถือ */}
      {isMoreOpen && (
        <div
          onClick={() => setIsMoreOpen(false)}
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 flex flex-col justify-end select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-h-[82dvh] rounded-t-3xl border-t border-slate-200 flex flex-col overflow-hidden"
          >
            {/* ส่วนหัวของ Sheet */}
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  เมนูจัดการหลังร้านทั้งหมด
                </h3>
                <p className="text-[11px] text-slate-500">
                  เลือกหน้าที่ต้องการเข้าใช้งาน
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canTab('pos') && (
                  <button
                    type="button"
                    onClick={navigateToPOS}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>ไปหน้าขาย</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* รายการหมวดหมู่เมนูแบบ Grid มินิมอล กดง่ายด้วยนิ้วโป้ง */}
            <div className="p-4 overflow-y-auto space-y-4 pb-8">
              {visibleGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(group.children || []).map((sub) => {
                      const SubIcon = sub.icon;
                      const active = activeTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSelectTab(sub.id)}
                          className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-colors ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                              : 'bg-slate-50/80 hover:bg-slate-100 text-slate-800 border-slate-200/80 font-semibold'
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-white/20 text-white'
                                : 'bg-white text-indigo-600 border border-slate-200/80'
                            }`}
                          >
                            <SubIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs leading-tight truncate">
                              {sub.label}
                            </div>
                            {sub.id === 'inventory' && lowStockCount > 0 && (
                              <span
                                className={`inline-block mt-0.5 text-[10px] font-bold ${
                                  active ? 'text-amber-200' : 'text-amber-600'
                                }`}
                              >
                                ใกล้หมด {lowStockCount}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
