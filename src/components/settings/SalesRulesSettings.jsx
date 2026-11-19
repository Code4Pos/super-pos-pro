import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SettingsCard, { useSettingsForm } from './SettingsCard';
import ShopConfigFields from './ShopConfigFields';

/**
 * ตั้งค่ากติกาการขายหน้าร้าน (ปุ่มลัดธนบัตร ปัดเศษ สต็อก ส่วนลด แต้มสะสม ช่องทางชำระเงิน) ใช้ร่วมกันทุกเครื่อง
 */
export default function SalesRulesSettings() {
  const { showToast } = usePOS();
  const { form, setForm, isDirty, save } = useSettingsForm();

  return (
    <SettingsCard
      icon={SlidersHorizontal}
      title="กติกาการขาย"
      description="กำหนดการทำงานของหน้าขาย ใช้ร่วมกันทุกเครื่อง"
      onSave={() => save('บันทึกกติกาการขายเรียบร้อย')}
      canSave={isDirty}
    >
      <ShopConfigFields group="sales" form={form} setForm={setForm} onError={(m) => showToast(m, 'error')} />
    </SettingsCard>
  );
}
