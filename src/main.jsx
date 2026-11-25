import React from 'react';
import ReactDOM from 'react-dom/client';
import PosApp from './PosApp.jsx';
import ShopAuthGate from './components/auth/ShopAuthGate.jsx';
import BranchGate from './components/branch/BranchGate.jsx';
import { initAppUpdater } from './services/appUpdater';
import './index.css';

// แอป Android: ยืนยันว่าเปิดสำเร็จ (กันย้อนกลับเวอร์ชัน) และตรวจหาอัปเดต OTA / APK
initAppUpdater();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShopAuthGate>
      <BranchGate>
        <PosApp />
      </BranchGate>
    </ShopAuthGate>
  </React.StrictMode>
);

// ลงทะเบียน Service Worker เฉพาะตอน build จริงบนเว็บ (ในแอป Android Capacitor มีไฟล์ในตัวแล้ว ไม่ต้องใช้ SW)
const isNativeApp = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNativeApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
