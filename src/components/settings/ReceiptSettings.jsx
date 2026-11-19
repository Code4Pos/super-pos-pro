import React, { useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import SettingsCard, { useSettingsForm } from './SettingsCard';
import ShopConfigFields from './ShopConfigFields';

// บิลตัวอย่างสำหรับแสดงตัวอย่างใบเสร็จ (ไม่บันทึกที่ใด)
function buildSampleOrder() {
  return {
    order_number: 'POS-01-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-0001',
    created_at: new Date().toISOString(),
    customer_name: 'เจ๊พร มินิมาร์ท',
    created_by_name: 'สมหญิง (แคชเชียร์)',
    items: [
      { product_name: 'น้ำดื่มคริสตัล 600 มล. (แพ็ค 12 ขวด)', quantity: 2, unit: 'แพ็ค', unit_price: 50, subtotal: 100 },
      { product_name: 'มาม่าต้มยำกุ้งน้ำข้น 55 กรัม', quantity: 10, unit: 'ซอง', unit_price: 6, subtotal: 60 },
      { product_name: 'น้ำปลาแท้ตราชั่งทอง 700 มล.', quantity: 1, unit: 'ขวด', unit_price: 35, subtotal: 35 },
    ],
    subtotal: 195,
    wholesale_savings: 26,
    bill_discount: 5,
    tax_amount: 0,
    grand_total: 190,
    payment_method: 'cash',
    payments: [{ method: 'cash', amount: 190 }],
    cash_received: 200,
    change_amount: 10,
  };
}

/**
 * ตั้งค่าหน้าตาใบเสร็จ (โลโก้ ข้อมูลที่แสดง ขนาดตัวอักษร จำนวนใบ) พร้อมตัวอย่างใบเสร็จทันที
 */
export default function ReceiptSettings() {
  const { showToast } = usePOS();
  const { form, setForm, isDirty, save } = useSettingsForm();
  const [previewSize, setPreviewSize] = useState(form.paperSize === '58mm' ? '58mm' : '80mm');
  const sampleOrder = useMemo(buildSampleOrder, []);
  const previewHtml = printerService.getThermalReceiptHtml(sampleOrder, previewSize, form);

  return (
    <SettingsCard
      icon={ReceiptText}
      title="ใบเสร็จ"
      description="ปรับหน้าตาใบเสร็จความร้อน ใช้ร่วมกันทุกเครื่อง (ชื่อร้าน/ข้อความท้ายใบเสร็จแก้ที่หน้าข้อมูลร้าน)"
      onSave={() => save('บันทึกการตั้งค่าใบเสร็จเรียบร้อย')}
      canSave={isDirty}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <ShopConfigFields group="receipt" form={form} setForm={setForm} onError={(m) => showToast(m, 'error')} />
        </div>
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700">ตัวอย่างใบเสร็จ</span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              {['58mm', '80mm'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPreviewSize(size)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    previewSize === size ? 'bg-white text-indigo-700' : 'text-slate-500'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 border border-slate-200 p-2 flex justify-center">
            <iframe
              title="ตัวอย่างใบเสร็จ"
              srcDoc={previewHtml}
              sandbox=""
              className="w-[300px] max-w-full h-[520px] bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">ตัวอย่างอัปเดตทันทีขณะแก้ไข (ยังไม่บันทึก)</p>
        </div>
      </div>
    </SettingsCard>
  );
}
