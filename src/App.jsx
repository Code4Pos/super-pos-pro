import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { POSProvider, usePOS } from './context/POSContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import MobileNav from './components/layout/MobileNav';
import POSPage from './pages/POSPage';
import InventoryPage from './pages/InventoryPage';
import PricingTierPage from './pages/PricingTierPage';
import OrdersPage from './pages/OrdersPage';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';

const ACTIVE_TAB_STORAGE_KEY = 'siampos_active_tab_v1';
const VALID_TABS = new Set([
  'pos',
  'inventory',
  'wholesale-pricing',
  'special-pricing',
  'orders',
  'customers',
  'dashboard',
]);

function MainAppContent() {
  // จดจำหน้าปัจจุบันไว้ใน localStorage เพื่อให้กด Refresh แล้วอยู่หน้าเดิม ไม่เด้งกลับไปหน้าขาย
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const savedTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (savedTab && VALID_TABS.has(savedTab)) {
        return savedTab;
      }
    } catch {
      // ignore storage errors
    }
    return 'pos';
  });

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  // ซ่อน/ย่อ Sidebar เป็นค่าเริ่มต้น (false = โหมดย่อแสดงเฉพาะไอคอน, true = โหมดแสดงเต็ม)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { toast } = usePOS();

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex bg-slate-50 text-slate-900">
      {/* แถบเมนูด้านซ้าย (Desktop Sidebar - สามารถกดซ่อน/แสดงได้) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      {/* พื้นที่หลักของแอป ความสูงพอดีกับจอ (100dvh) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 flex overflow-hidden relative">
          {activeTab === 'pos' && <POSPage />}
          {activeTab === 'inventory' && <InventoryPage />}
          {activeTab === 'wholesale-pricing' && (
            <PricingTierPage key="wholesale" mode="wholesale" />
          )}
          {activeTab === 'special-pricing' && (
            <PricingTierPage key="special" mode="special" />
          )}
          {activeTab === 'orders' && <OrdersPage />}
          {activeTab === 'customers' && (
            <CustomersPage onNavigateToPOS={() => setActiveTab('pos')} />
          )}
          {activeTab === 'dashboard' && (
            <DashboardPage onNavigate={(tab) => setActiveTab(tab)} />
          )}
        </main>

        {/* แถบเมนูด้านล่าง (Smartphone & Tablet Bottom Nav) */}
        <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      {/* ระบบแจ้งเตือน Toast ลอยมุมขวาบน (ตัดแอนิเมชันหนักๆ ออกเพื่อให้ลื่นบน Sunmi T2) */}
      {toast && (
        <div className="fixed top-3 right-3 z-[80] max-w-sm pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-lg border flex items-center gap-2 text-xs sm:text-sm font-bold ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : toast.type === 'warning'
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : toast.type === 'info'
                ? 'bg-slate-900 text-white border-slate-700'
                : 'bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            {toast.type === 'error' || toast.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <POSProvider>
      <MainAppContent />
    </POSProvider>
  );
}
