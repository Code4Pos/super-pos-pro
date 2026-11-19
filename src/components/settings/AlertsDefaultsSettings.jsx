import React from 'react';
import { BellRing } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SettingsCard, { useSettingsForm } from './SettingsCard';
import ShopConfigFields from './ShopConfigFields';

/**
 * ตั้งค่าการแจ้งเตือนและค่าเริ่มต้น (สต็อกต่ำ วันหมดอายุ แนะนำสั่งซื้อ เครดิตลูกค้าใหม่) และปิดเมนูที่ร้านไม่ได้ใช้
 * ใช้ร่วมกันทุกเครื่อง
 */
export default function AlertsDefaultsSettings() {
  const { showToast } = usePOS();
  const { form, setForm, isDirty, save } = useSettingsForm();

  return (
    <SettingsCard
      icon={BellRing}
      title="การแจ้งเตือน & ค่าเริ่มต้น"
      description="เกณฑ์แจ้งเตือน ค่าเริ่มต้นของข้อมูลใหม่ และเมนูที่เปิดใช้ ใช้ร่วมกันทุกเครื่อง"
      onSave={() => save('บันทึกการแจ้งเตือนและค่าเริ่มต้นเรียบร้อย')}
      canSave={isDirty}
    >
      <ShopConfigFields group="defaults" form={form} setForm={setForm} onError={(m) => showToast(m, 'error')} />
    </SettingsCard>
  );
}
