import React from 'react';
import ReactDOM from 'react-dom/client';
import PosApp from './PosApp.jsx';
import ShopAuthGate from './components/auth/ShopAuthGate.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShopAuthGate>
      <PosApp />
    </ShopAuthGate>
  </React.StrictMode>
);

// ลงทะเบียน Service Worker เฉพาะตอน build จริง (เปิดแอปได้ตอนไม่มีเน็ต)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
