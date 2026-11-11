import React, { useState, useEffect } from 'react';
import {
  Store,
  RefreshCw,
  Database,
  TrendingUp,
  AlertTriangle,
  PanelLeftOpen,
  PanelLeftClose,
  Maximize,
  Minimize,
  Settings,
  LogOut,
  UserCircle2,
  WifiOff,
  CloudUpload,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/formatters';
import { ROLES, SETTINGS_TABS } from '../../utils/rbac';

export default function Header({
  activeTab,
  setActiveTab,
  isSidebarOpen,
  onToggleSidebar,
}) {
  const {
    orders,
    products,
    dbMode,
    isOffline,
    pendingSyncCount,
    syncing,
    syncNow,
    refreshData,
    loading,
    appVersion,
    printerStatus,
    currentUser,
    logout,
    canTab,
  } = usePOS();

  // ปุ่มฟันเฟืองพาไปหน้าตั้งค่าเครื่องพิมพ์ (หรือหน้าตั้งค่าแรกที่บทบาทนี้เข้าได้)
  const settingsTab = canTab('settings-printer')
    ? 'settings-printer'
    : SETTINGS_TABS.find((tab) => canTab(tab));

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle error:', err);
    }
  };

  const todayStr = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) =>
      o.status === 'completed' &&
      new Date(o.created_at).toDateString() === todayStr
  );
  const todayRevenue = todayOrders.reduce(
    (sum, o) => sum + (Number(o.grand_total) || 0),
    0
  );

  const lowStockCount = products.filter(
    (p) => Number(p.stock) <= Number(p.min_stock || 10)
  ).length;

  // สีของจุดแสดงสถานะเครื่องพิมพ์ 3 สถานะ (เขียว = พร้อม, ส้ม = เชื่อมต่อแล้วแต่มีปัญหา, แดง = ไม่พร้อมใช้งาน)
  const printerDotColorClass =
    printerStatus === 'ready'
      ? 'bg-emerald-500'
      : printerStatus === 'warning'
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-4 flex items-center justify-between shrink-0 z-20 select-none">
      {/* ด้านซ้าย: ปุ่มแสดง/ซ่อน Sidebar + ปุ่มกลับหน้าขาย (รูปร้านค้า) + ชื่อหน้า + Version */}
      <div className="flex items-center gap-2 min-w-0">
        {/* 1. ปุ่มสลับแสดง/ซ่อน Sidebar บนหน้าจอ Desktop */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden lg:flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 shrink-0"
          title={isSidebarOpen ? 'ซ่อนแถบเมนูด้านซ้าย' : 'แสดงแถบเมนูด้านซ้าย'}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4 text-indigo-600" />
          )}
        </button>

        {/* 2. ปุ่ม "กลับหน้าขาย" ถัดจากปุ่มแสดง/ซ่อนเมนู ใส่ไอคอนรูปร้านค้า (Store) */}
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-1.5 px-3 h-9 rounded-xl font-bold text-xs transition-colors shrink-0 ${
            activeTab === 'pos'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
          }`}
          title="กลับหน้าขายหน้าร้าน (POS)"
        >
          <Store className="w-4 h-4 shrink-0" />
          <span>กลับหน้าขาย</span>
        </button>

        <div className="min-w-0 ml-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="font-bold text-slate-800 text-xs sm:text-sm md:text-base leading-tight truncate">
              {activeTab === 'pos' && 'ขายหน้าร้าน (POS)'}
              {activeTab === 'inventory' && 'คลังสินค้า › จัดการสินค้า'}
              {activeTab === 'stock-import' && 'คลังสินค้า › นำเข้าสินค้า'}
              {activeTab === 'stock-ledger' && 'คลังสินค้า › ความเคลื่อนไหวสต็อก'}
              {activeTab === 'stock-count' && 'คลังสินค้า › ตรวจนับสต็อก'}
              {activeTab === 'lots' && 'คลังสินค้า › Lot / วันหมดอายุ'}
              {activeTab === 'reorder' && 'คลังสินค้า › แนะนำสั่งซื้อ (PO)'}
              {activeTab === 'wholesale-pricing' && 'คลังสินค้า › ราคาขายส่ง'}
              {activeTab === 'special-pricing' && 'คลังสินค้า › ราคาพิเศษ'}
              {activeTab === 'orders' && 'รายงาน › ประวัติบิล'}
              {activeTab === 'dashboard' && 'รายงาน › แดชบอร์ด'}
              {activeTab === 'sales-tax' && 'รายงาน › รายงานภาษีขาย'}
              {activeTab === 'settings-shop' && 'ตั้งค่า › ข้อมูลร้าน'}
              {activeTab === 'settings-tax' && 'ตั้งค่า › ภาษี (VAT)'}
              {activeTab === 'settings-payment' && 'ตั้งค่า › การชำระเงิน'}
              {activeTab === 'settings-printer' && 'ตั้งค่า › เครื่องพิมพ์'}
              {activeTab === 'settings-users' && 'ตั้งค่า › ผู้ใช้งาน & สิทธิ์'}
              {activeTab === 'customers' && 'ลูกค้า › จัดการลูกค้า'}
              {activeTab === 'suppliers' && 'บริหาร › จัดการผู้ผลิต'}
              {activeTab === 'receivables' && 'ลูกค้า › ลูกหนี้ & วางบิล'}
            </h2>

            {/* ป้าย Version Beta 0.1.3 */}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              {appVersion}
            </span>

            <span
              className={`lg:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                dbMode === 'supabase'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <Database className="w-2.5 h-2.5" />
              {dbMode === 'supabase' ? 'Supabase' : 'Demo'}
            </span>
          </div>
        </div>
      </div>

      {/* ด้านขวา: ยอดขายวันนี้ + เตือนสต็อก + ไอคอนเครื่องพิมพ์พร้อมจุดสีสถานะ + ปุ่ม Full Screen + รีเฟรช */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-indigo-50/90 hover:bg-indigo-100/80 border border-indigo-100 text-left"
          title="ดูแดชบอร์ดสรุปยอดขาย"
        >
          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[10px] font-medium text-indigo-600 leading-none">
              วันนี้ ({todayOrders.length} บิล)
            </div>
            <div className="text-xs font-bold text-slate-900">
              {formatCurrency(todayRevenue)}
            </div>
          </div>
        </button>

        {/* สถานะออฟไลน์ / รายการรอซิงค์ขึ้นฐานข้อมูล (กดเพื่อซิงค์ทันที) */}
        {(isOffline || pendingSyncCount > 0) && (
          <button
            type="button"
            onClick={() => syncNow()}
            disabled={syncing}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-60 ${
              isOffline
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
            }`}
            title={
              isOffline
                ? 'ออฟไลน์: บิลจะถูกเก็บไว้ในเครื่องแล้วซิงค์เมื่อกลับมาออนไลน์'
                : 'กดเพื่อซิงค์ข้อมูลที่ค้างขึ้นระบบ'
            }
          >
            {isOffline ? (
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isOffline ? 'ออฟไลน์' : syncing ? 'กำลังซิงค์' : 'รอซิงค์'}
            </span>
            {pendingSyncCount > 0 && (
              <span className="px-1.5 bg-white/80 rounded font-bold">{pendingSyncCount}</span>
            )}
          </button>
        )}

        {lowStockCount > 0 && (
          <button
            onClick={() => setActiveTab('inventory')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-xs font-semibold"
            title="คลิกเพื่อดูสินค้าใกล้หมดสต็อก"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden xl:inline">สต็อกต่ำ</span>
            <span className="px-1.5 bg-amber-200/80 text-amber-900 rounded font-bold">
              {lowStockCount}
            </span>
          </button>
        )}

        {/* ปุ่มตั้งค่าระบบ (ฟันเฟือง) พร้อมจุดสีสถานะเครื่องพิมพ์ เขียว/ส้ม/แดง */}
        {settingsTab && (
          <button
            type="button"
            onClick={() => setActiveTab(settingsTab)}
            className="relative w-10 h-9 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center"
            title="ตั้งค่าระบบ (จุดสี = สถานะเครื่องพิมพ์)"
          >
            <Settings className="w-4 h-4 text-slate-700" />
            <span
              className={`w-2.5 h-2.5 rounded-full ${printerDotColorClass} absolute top-1.5 right-1.5 ring-2 ring-white`}
            />
          </button>
        )}

        {/* ผู้ใช้งานที่ล็อกอินอยู่ และปุ่มออกจากระบบ */}
        {currentUser && (
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs font-bold"
            title={`${currentUser.name} (${ROLES[currentUser.role]?.label || currentUser.role}) — กดเพื่อออกจากระบบ`}
          >
            <UserCircle2 className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline max-w-[8rem] truncate">{currentUser.name}</span>
            <LogOut className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {/* ปุ่ม Full Screen */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`flex items-center gap-1.5 px-2.5 h-9 rounded-xl border text-xs font-bold transition-colors ${
            isFullscreen
              ? 'bg-slate-900 text-white border-slate-900'
              : 'border-slate-200 hover:bg-slate-100 text-slate-700'
          }`}
          title={isFullscreen ? 'ออกจากโหมดเต็มจอ (Exit Full Screen)' : 'ขยายเต็มจอ (Full Screen)'}
        >
          {isFullscreen ? (
            <Minimize className="w-4 h-4" />
          ) : (
            <Maximize className="w-4 h-4" />
          )}
          <span className="hidden xl:inline">
            {isFullscreen ? 'ย่อจอ' : 'เต็มจอ'}
          </span>
        </button>

        <button
          onClick={refreshData}
          disabled={loading}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`}
          />
        </button>
      </div>

    </header>
  );
}
