import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  Boxes,
  FileBarChart,
  UserCog,
  Tags,
  Sparkles,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * รายการหน้าทั้งหมดสำหรับ Mobile Bottom Navigation
 */
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
    label: 'จัดการสินค้า',
    shortLabel: 'คลังสินค้า',
    icon: Package,
    description: 'จัดการสต็อก ราคาปลีก/ส่ง',
  },
  {
    id: 'orders',
    label: 'ประวัติบิล',
    shortLabel: 'ประวัติบิล',
    icon: Receipt,
    description: 'ดูใบเสร็จย้อนหลัง พิมพ์ซ้ำ',
  },
  {
    id: 'dashboard',
    label: 'แดชบอร์ด',
    shortLabel: 'แดชบอร์ด',
    icon: BarChart3,
    description: 'วิเคราะห์ยอดขายและกำไร',
  },
  {
    id: 'customers',
    label: 'จัดการลูกค้า',
    shortLabel: 'ลูกค้า',
    icon: Users,
    description: 'สมาชิกและร้านค้าขายส่ง',
  },
];

/**
 * โครงสร้างเมนู Sidebar (version beta 0.1.7):
 * - ยกเว้นเมนู "ขายหน้าร้าน" ที่กดเข้าหน้าขายได้ทันที
 * - เมนูอื่นๆ เป็น Menu Dropdown:
 *   1. คลังสินค้า -> จัดการสินค้า
 *   2. รายงาน -> ประวัติบิล, แดชบอร์ด
 *   3. ลูกค้า -> จัดการลูกค้า
 */
export const SIDEBAR_MENU_GROUPS = [
  {
    id: 'pos',
    label: 'ขายหน้าร้าน (POS)',
    description: 'คิดเงิน ปลีก-ส่ง สแกนบาร์โค้ด',
    icon: ShoppingCart,
    isDropdown: false,
  },
  {
    id: 'group-inventory',
    label: 'คลังสินค้า',
    description: 'สต็อกสินค้า & โครงสร้างราคา',
    icon: Package,
    isDropdown: true,
    children: [
      {
        id: 'inventory',
        label: 'จัดการสินค้า',
        description: 'เพิ่ม/แก้ไขสินค้า ปรับสต็อก',
        icon: Boxes,
      },
      {
        id: 'wholesale-pricing',
        label: 'ราคาขายส่ง',
        description: 'ตั้งราคาส่งหลายระดับ (สูงสุด 10 ขั้น)',
        icon: Tags,
      },
      {
        id: 'special-pricing',
        label: 'ราคาพิเศษ',
        description: 'ตั้งราคาพิเศษหลายระดับ (สูงสุด 10 ขั้น)',
        icon: Sparkles,
      },
    ],
  },
  {
    id: 'group-reports',
    label: 'รายงาน',
    description: 'ประวัติการขาย & สรุปยอด',
    icon: FileBarChart,
    isDropdown: true,
    children: [
      {
        id: 'orders',
        label: 'ประวัติบิล',
        description: 'ดูใบเสร็จย้อนหลัง พิมพ์ซ้ำ',
        icon: Receipt,
      },
      {
        id: 'dashboard',
        label: 'แดชบอร์ด',
        description: 'วิเคราะห์ยอดขายและกำไร',
        icon: BarChart3,
      },
    ],
  },
  {
    id: 'group-customers',
    label: 'ลูกค้า',
    description: 'ข้อมูลสมาชิก & ร้านค้าส่ง',
    icon: Users,
    isDropdown: true,
    children: [
      {
        id: 'customers',
        label: 'จัดการลูกค้า',
        description: 'เพิ่ม/แก้ไขข้อมูลลูกค้าและยี่ปั๊ว',
        icon: UserCog,
      },
    ],
  },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  isOpen = false,
  onToggleSidebar,
}) {
  const { products, dbMode, resetDemo, appVersion } = usePOS();

  // เก็บสถานะการเปิด/ปิดของแต่ละ Dropdown ในโหมดขยายเต็ม
  const [openGroups, setOpenGroups] = useState({
    'group-inventory': true,
    'group-reports': true,
    'group-customers': true,
  });

  // เก็บสถานะ Popover Dropdown ในโหมดย่อแสดงเฉพาะไอคอน
  const [collapsedPopoverGroupId, setCollapsedPopoverGroupId] = useState(null);
  const sidebarRef = useRef(null);

  const lowStockCount = products.filter(
    (p) => Number(p.stock) <= Number(p.min_stock || 10)
  ).length;

  // เปิดกลุ่มเมนูอัตโนมัติเมื่อ activeTab อยู่ในกลุ่มนั้น
  useEffect(() => {
    SIDEBAR_MENU_GROUPS.forEach((group) => {
      if (
        group.isDropdown &&
        group.children?.some((child) => child.id === activeTab)
      ) {
        setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
      }
    });
    setCollapsedPopoverGroupId(null);
  }, [activeTab]);

  // ปิด Popover เมนูย่อเมื่อคลิกข้างนอก
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setCollapsedPopoverGroupId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleGroupDropdown = (groupId) => {
    if (isOpen) {
      setOpenGroups((prev) => ({
        ...prev,
        [groupId]: !prev[groupId],
      }));
    } else {
      setCollapsedPopoverGroupId((prev) => (prev === groupId ? null : groupId));
    }
  };

  return (
    <aside
      ref={sidebarRef}
      className={`hidden lg:flex lg:flex-col bg-slate-900 text-white border-r border-slate-800 shrink-0 select-none transition-all duration-200 relative z-30 ${
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

      {/* รายการเมนู: เมนูขายหน้าร้านเป็นปุ่มตรง ส่วน คลังสินค้า / รายงาน / ลูกค้า เป็น Menu Dropdown */}
      <nav
        className={`flex-1 py-4 space-y-2 overflow-visible ${
          isOpen ? 'px-3 overflow-y-auto' : 'px-2'
        }`}
      >
        {isOpen && (
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            เมนูการใช้งานหลัก
          </div>
        )}

        {SIDEBAR_MENU_GROUPS.map((group) => {
          const GroupIcon = group.icon;

          // 1. เมนูขายหน้าร้าน (POS) — ไม่เป็น Dropdown กดเข้าหน้าขายได้ทันที
          if (!group.isDropdown) {
            const isPosActive = activeTab === group.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setActiveTab(group.id);
                  setCollapsedPopoverGroupId(null);
                }}
                title={`${group.label} — ${group.description}`}
                className={`w-full flex items-center rounded-xl transition-all duration-150 group relative ${
                  isOpen
                    ? 'gap-3.5 px-3.5 py-3 text-left'
                    : 'justify-center py-3 px-0'
                } ${
                  isPosActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <GroupIcon
                  className={`w-5 h-5 shrink-0 transition-transform duration-150 ${
                    isPosActive
                      ? 'text-white scale-105'
                      : 'text-slate-400 group-hover:text-indigo-400'
                  }`}
                />

                {isOpen && (
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-tight truncate">
                      {group.label}
                    </div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        isPosActive ? 'text-indigo-100' : 'text-slate-400'
                      }`}
                    >
                      {group.description}
                    </div>
                  </div>
                )}
              </button>
            );
          }

          // 2. เมนูแบบ Dropdown (คลังสินค้า, รายงาน, ลูกค้า)
          const hasActiveChild = group.children?.some(
            (child) => child.id === activeTab
          );
          const isGroupExpanded = Boolean(openGroups[group.id]);
          const isPopoverOpen = collapsedPopoverGroupId === group.id;
          const showInventoryBadge =
            group.id === 'group-inventory' && lowStockCount > 0;

          return (
            <div key={group.id} className="relative space-y-1">
              {/* ปุ่มหัวข้อหลักของ Dropdown */}
              <button
                type="button"
                onClick={() => toggleGroupDropdown(group.id)}
                title={`${group.label} — ${group.description}`}
                className={`w-full flex items-center rounded-xl transition-all duration-150 group relative ${
                  isOpen
                    ? 'gap-3 px-3.5 py-2.5 text-left'
                    : 'justify-center py-3 px-0'
                } ${
                  hasActiveChild
                    ? 'bg-slate-800 text-white border border-indigo-500/40 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <GroupIcon
                  className={`w-5 h-5 shrink-0 transition-transform duration-150 ${
                    hasActiveChild
                      ? 'text-indigo-400 scale-105'
                      : 'text-slate-400 group-hover:text-indigo-400'
                  }`}
                />

                {isOpen && (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight truncate flex items-center gap-2">
                        <span>{group.label}</span>
                        {showInventoryBadge && (
                          <span
                            className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-0.5"
                            title={`สินค้าใกล้หมด ${lowStockCount} รายการ`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {lowStockCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] truncate mt-0.5 text-slate-400">
                        {group.description}
                      </div>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isGroupExpanded ? 'rotate-180 text-indigo-400' : ''
                      }`}
                    />
                  </>
                )}

                {/* ป้ายแจ้งเตือนสต็อกต่ำเมื่อย่อ Sidebar */}
                {!isOpen && showInventoryBadge && (
                  <span
                    className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold flex items-center justify-center ring-2 ring-slate-900"
                    title={`สินค้าใกล้หมด ${lowStockCount} รายการ`}
                  >
                    {lowStockCount}
                  </span>
                )}
              </button>

              {/* รายการเมนูรอง (Submenu) เมื่อ Sidebar ขยายเต็ม */}
              {isOpen && isGroupExpanded && (
                <div className="pl-4 pr-1 py-0.5 space-y-1 border-l-2 border-slate-800 ml-5">
                  {group.children.map((subItem) => {
                    const SubIcon = subItem.icon;
                    const isSubActive = activeTab === subItem.id;
                    return (
                      <button
                        key={subItem.id}
                        type="button"
                        onClick={() => setActiveTab(subItem.id)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                          isSubActive
                            ? 'bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/25'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SubIcon
                            className={`w-4 h-4 shrink-0 ${
                              isSubActive ? 'text-white' : 'text-slate-400'
                            }`}
                          />
                          <span className="text-xs sm:text-sm truncate">
                            {subItem.label}
                          </span>
                        </div>

                        {subItem.id === 'inventory' && lowStockCount > 0 && (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                              isSubActive
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {lowStockCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Popover Dropdown ลอยด้านข้างเมื่อ Sidebar อยู่ในโหมดย่อเฉพาะไอคอน */}
              {!isOpen && isPopoverOpen && (
                <div className="absolute left-full top-0 ml-2 w-52 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
                  <div className="px-2.5 py-1.5 border-b border-slate-800 text-xs font-bold text-indigo-300 flex items-center justify-between">
                    <span>{group.label}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                  {group.children.map((subItem) => {
                    const SubIcon = subItem.icon;
                    const isSubActive = activeTab === subItem.id;
                    return (
                      <button
                        key={subItem.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(subItem.id);
                          setCollapsedPopoverGroupId(null);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors ${
                          isSubActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          <SubIcon className="w-4 h-4 shrink-0" />
                          <span>{subItem.label}</span>
                        </span>
                        {subItem.id === 'inventory' && lowStockCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950">
                            {lowStockCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ส่วนท้าย Sidebar: แสดงสถานะฐานข้อมูลแบบเต็ม หรือแบบไอคอนย่อ */}
      {isOpen ? (
        <div className="p-4 m-3 rounded-2xl bg-slate-800/90 border border-slate-700/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">
                ฐานข้อมูลระบบ
              </span>
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
