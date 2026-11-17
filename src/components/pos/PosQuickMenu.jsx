import React, { useState } from 'react';
import { Grid3x3, X, ReceiptText, HandCoins, Inbox } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import PosBillsModal from './PosBillsModal';
import PosCreditModal from './PosCreditModal';
import ApproverPinModal from './ApproverPinModal';

const MENU_ITEMS = [
  { id: 'bills', label: 'ประวัติบิล', hint: 'ดูตัวอย่าง พิมพ์ซ้ำ ยกเลิกบิล', icon: ReceiptText, color: 'bg-indigo-600' },
  { id: 'credit', label: 'เครดิต', hint: 'ลูกค้าค้างชำระ / รับชำระหนี้', icon: HandCoins, color: 'bg-amber-500' },
  { id: 'drawer', label: 'เปิดลิ้นชัก', hint: 'ต้องใช้ PIN ผู้จัดการ', icon: Inbox, color: 'bg-emerald-600' },
];

/**
 * ปุ่มเมนูลัด (Grid) บน Header ของหน้าขาย
 * เปิดหน้าต่างประวัติบิล / เครดิต / เปิดลิ้นชัก ได้ทันทีโดยไม่ต้องสลับไปหลังร้าน
 */
export default function PosQuickMenu() {
  const { printerSettings, authEnabled, showToast } = usePOS();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'bills' | 'credit' | 'drawer'

  const kickDrawer = async () => {
    const result = await printerService.openCashDrawer(printerSettings);
    if (result?.ok) {
      showToast('ส่งคำสั่งเปิดลิ้นชักแล้ว', 'success');
      setActiveModal(null);
    } else {
      showToast(result?.message || 'เปิดลิ้นชักไม่สำเร็จ', 'error');
    }
  };

  const handleSelect = (id) => {
    setIsMenuOpen(false);
    if (id === 'drawer' && !authEnabled) {
      // ยังไม่ได้ตั้งผู้ใช้ (ไม่มี PIN ให้ตรวจ) = ยืนยันอย่างเดียว
      if (window.confirm('เปิดลิ้นชักเก็บเงิน?')) kickDrawer();
      return;
    }
    setActiveModal(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className="flex items-center justify-center gap-1 px-2 sm:px-2.5 h-8 sm:h-9 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0"
        title="เมนูลัด: ประวัติบิล / เครดิต / เปิดลิ้นชัก"
      >
        <Grid3x3 className="w-4 h-4" />
        <span className="hidden lg:inline">เมนู</span>
      </button>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end p-2 sm:p-3 bg-slate-900/40"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="bg-white w-full max-w-xs sm:mt-12 rounded-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700">เมนูลัด</span>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-center"
                    title={item.hint}
                  >
                    <span className={`w-12 h-12 rounded-2xl ${item.color} text-white flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </span>
                    <span className="text-xs font-bold text-slate-800 leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PosBillsModal isOpen={activeModal === 'bills'} onClose={() => setActiveModal(null)} />
      <PosCreditModal isOpen={activeModal === 'credit'} onClose={() => setActiveModal(null)} />
      <ApproverPinModal
        isOpen={activeModal === 'drawer'}
        title="อนุมัติเปิดลิ้นชัก"
        description="เปิดลิ้นชักเก็บเงินโดยไม่มีการขาย ต้องใช้ PIN ผู้จัดการหรือผู้ดูแลระบบ"
        permission="open_drawer"
        confirmLabel="เปิดลิ้นชัก"
        onApproved={kickDrawer}
        onClose={() => setActiveModal(null)}
      />
    </>
  );
}
