import React from 'react';
import ShopSettings from '../components/settings/ShopSettings';
import ReceiptSettings from '../components/settings/ReceiptSettings';
import SalesRulesSettings from '../components/settings/SalesRulesSettings';
import DocumentNumberingSettings from '../components/settings/DocumentNumberingSettings';
import AlertsDefaultsSettings from '../components/settings/AlertsDefaultsSettings';
import TaxSettings from '../components/settings/TaxSettings';
import PaymentSettings from '../components/settings/PaymentSettings';
import PrinterSettings from '../components/settings/PrinterSettings';
import UsersSettings from '../components/settings/UsersSettings';
import DeviceSettings from '../components/settings/DeviceSettings';

const SECTIONS = {
  'settings-shop': ShopSettings,
  'settings-receipt': ReceiptSettings,
  'settings-sales': SalesRulesSettings,
  'settings-docs': DocumentNumberingSettings,
  'settings-defaults': AlertsDefaultsSettings,
  'settings-tax': TaxSettings,
  'settings-payment': PaymentSettings,
  'settings-printer': PrinterSettings,
  'settings-users': UsersSettings,
};

/**
 * หน้าตั้งค่าระบบ แยกเป็นเมนูย่อยใน Sidebar (ข้อมูลร้าน / ภาษี / การชำระเงิน / เครื่องพิมพ์ / ผู้ใช้งาน)
 */
export default function SettingsPage({ section }) {
  const Section = SECTIONS[section] || ShopSettings;
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-5 pb-24 lg:pb-5">
      <div className={`${section === 'settings-receipt' || section === 'settings-docs' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-4`}>
        <Section />
        {/* ค่าตั้งเฉพาะเครื่อง (รหัสเครื่อง / อัปโหลดข้อมูลจากเครื่องหลัก / บัญชีร้าน) แสดงที่หน้าข้อมูลร้านและเครื่องพิมพ์ */}
        {(section === 'settings-shop' || section === 'settings-printer') && <DeviceSettings />}
      </div>
    </div>
  );
}
