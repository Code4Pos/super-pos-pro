import React from 'react';
import { Store } from 'lucide-react';
import SettingsCard, { useSettingsForm, FieldLabel, inputClass } from './SettingsCard';

/**
 * ตั้งค่าข้อมูลร้าน: แสดงบนใบเสร็จ ใบกำกับภาษี ใบวางบิล และใบสั่งซื้อ
 */
export default function ShopSettings() {
  const { form, setForm, isDirty, save } = useSettingsForm((f) =>
    String(f.shopName || '').trim() ? '' : 'กรุณาระบุชื่อร้าน'
  );

  return (
    <SettingsCard
      icon={Store}
      title="ข้อมูลร้าน"
      description="แสดงบนใบเสร็จ ใบกำกับภาษี ใบวางบิล และใบสั่งซื้อ"
      onSave={() => save('บันทึกข้อมูลร้านเรียบร้อย')}
      canSave={isDirty}
    >
      <div>
        <FieldLabel>ชื่อร้าน / ชื่อบริษัท *</FieldLabel>
        <input
          type="text"
          data-allow-scanner="false"
          value={form.shopName || ''}
          onChange={(e) => setForm({ ...form, shopName: e.target.value })}
          className={`${inputClass} font-bold`}
        />
      </div>
      <div>
        <FieldLabel>ที่อยู่ร้าน (ตามที่จดทะเบียน)</FieldLabel>
        <textarea
          rows={2}
          data-allow-scanner="false"
          value={form.shopAddress || ''}
          onChange={(e) => setForm({ ...form, shopAddress: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>เบอร์โทรร้าน</FieldLabel>
          <input
            type="text"
            data-allow-scanner="false"
            value={form.shopPhone || ''}
            onChange={(e) => setForm({ ...form, shopPhone: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>ข้อความท้ายใบเสร็จ</FieldLabel>
          <input
            type="text"
            data-allow-scanner="false"
            value={form.footerText || ''}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
