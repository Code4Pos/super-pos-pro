import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { POSProvider, usePOS } from './context/POSContext';
import Header from './components/layout/Header';
import POSPage from './pages/POSPage';
import LoginScreen from './components/auth/LoginScreen';
import ModeSelectorScreen from './components/layout/ModeSelectorScreen';

const ENTRY_SESSION_KEY = 'siampos_entry_chosen_v1';

function PosAppContent() {
  const { toast, authEnabled, currentUser, canTab } = usePOS();

  // แสดงหน้าเลือกโหมด (หน้าร้าน / หลังร้าน) เมื่อเปิดเข้าแอปครั้งแรกใน Session นี้
  // แต่ถ้าสลับมาจากหลังร้าน (?mode=pos) หรือเคยกดเลือกเข้าหน้าขายแล้ว จะเข้าหน้าขายทันที
  const [showModeSelector, setShowModeSelector] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'select') return true;
      if (params.get('mode') === 'pos') {
        sessionStorage.setItem(ENTRY_SESSION_KEY, 'pos');
        return false;
      }
      if (localStorage.getItem('siampos_pending_pos_action_v1')) {
        sessionStorage.setItem(ENTRY_SESSION_KEY, 'pos');
        return false;
      }
      return sessionStorage.getItem(ENTRY_SESSION_KEY) !== 'pos';
    } catch {
      return false;
    }
  });

  // ถ้าบทบาทของผู้ใช้ไม่มีสิทธิ์เข้าหน้าขายเลย (เช่น เจ้าหน้าที่คลัง / บัญชี) ให้แสดงหน้าเลือกโหมดเพื่อกดเข้าหลังร้าน
  useEffect(() => {
    if (!canTab('pos')) {
      setShowModeSelector(true);
    }
  }, [canTab]);

  if (authEnabled && !currentUser) {
    return <LoginScreen />;
  }

  const handleSelectPOS = () => {
    try {
      sessionStorage.setItem(ENTRY_SESSION_KEY, 'pos');
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // ignore storage errors
    }
    setShowModeSelector(false);
  };

  const handleSelectAdmin = () => {
    window.location.href = './admin.html';
  };

  if (showModeSelector) {
    return (
      <ModeSelectorScreen
        onSelectPOS={handleSelectPOS}
        onSelectAdmin={handleSelectAdmin}
      />
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* แถบด้านบนของหน้าขาย (ไม่มี Sidebar ด้านซ้าย และไม่มี MobileNav ด้านล่าง) */}
      <Header
        mode="pos"
        activeTab="pos"
        onOpenModeSelector={() => setShowModeSelector(true)}
      />

      {/* พื้นที่ขายหน้าร้านเต็มจอ 100% */}
      <main className="flex-1 flex overflow-hidden relative">
        <POSPage />
      </main>

      {/* ระบบแจ้งเตือน Toast ลอยมุมขวาบน */}
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

export default function PosApp() {
  return (
    <POSProvider scope="pos">
      <PosAppContent />
    </POSProvider>
  );
}
