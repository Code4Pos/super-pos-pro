import React, { useState } from 'react';
import {
  PauseCircle,
  Play,
  Trash2,
  Edit3,
  Check,
  X,
  FolderArchive,
  Clock,
  ShoppingBag,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

/**
 * HoldBillModal (version beta 0.1.2):
 * - เมื่อกดปุ่ม "พักบิล" ระบบจะบันทึกบิลพักให้อัตโนมัติทันทีโดยไม่ต้องกดบันทึกซ้ำ
 * - ในหน้าต่างนี้สามารถแก้ไขชื่อบิลที่พักไว้, เรียกบิลกลับมาขายต่อ หรือลบบิลพัก (มี Confirm) ได้ทันที
 */
export default function HoldBillModal({ isOpen, onClose }) {
  const {
    heldBills,
    updateHeldBillName,
    recallHeldBill,
    deleteHeldBill,
  } = usePOS();

  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [billToDelete, setBillToDelete] = useState(null);

  if (!isOpen) return null;

  const handleStartRename = (bill) => {
    setEditingId(bill.id);
    setEditingTitle(bill.title);
  };

  const handleSaveRename = (billId) => {
    if (editingTitle.trim()) {
      updateHeldBillName(billId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90dvh]">
        {/* ส่วนหัว Modal */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-base">
                คลังเก็บบิลที่พักไว้ ({heldBills.length} บิล)
              </h3>
              <p className="text-[11px] text-slate-400">
                สามารถคลิกไอคอนดินสอเพื่อแก้ไขชื่อบิลพัก หรือกดเรียกบิลกลับมาขายต่อ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <FolderArchive className="w-4 h-4 text-indigo-600" />
              รายการบิลที่พักอยู่ในคลัง ({heldBills.length})
            </h4>
          </div>

          {heldBills.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 text-slate-400 space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto stroke-1.5 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">
                ยังไม่มีรายการบิลที่พักไว้
              </p>
              <p className="text-[11px] text-slate-400">
                เมื่อมีสินค้าในตะกร้าแล้วกดปุ่ม &ldquo;พักบิล&rdquo; ระบบจะบันทึกเข้าคลังให้อัตโนมัติทันที
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {heldBills.map((bill, index) => {
                const isEditing = editingId === bill.id;
                const isLatest = index === 0;
                return (
                  <div
                    key={bill.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      isLatest
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-slate-50 border-slate-200/90 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              data-allow-scanner="false"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(bill.id);
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded-xl border border-indigo-400 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(bill.id)}
                              className="p-2 rounded-xl bg-emerald-600 text-white"
                              title="บันทึกชื่อใหม่"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-2 rounded-xl bg-slate-200 text-slate-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm truncate">
                              {bill.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStartRename(bill)}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-600 text-[11px] font-bold flex items-center gap-1 shrink-0"
                              title="แก้ไขชื่อบิลที่พักไว้"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>เปลี่ยนชื่อ</span>
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(bill.created_at)}
                          </span>
                          <span>•</span>
                          <span>
                            ลูกค้า: {bill.selectedCustomer?.name || 'ลูกค้าทั่วไป'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-indigo-600">
                          {formatCurrency(bill.grandTotal)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {bill.totalItemsCount} ชิ้น
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                      <div className="text-[11px] text-slate-500 truncate flex-1">
                        {(bill.cart || [])
                          .map((i) => `${i.product.name} (x${i.quantity})`)
                          .join(', ')}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setBillToDelete(bill)}
                          className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200"
                          title="ลบบิลที่พักไว้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            recallHeldBill(bill.id);
                            onClose();
                          }}
                          className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>เรียกบิลกลับมา</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ยืนยันการลบบิลที่พักอยู่ */}
      <ConfirmModal
        isOpen={Boolean(billToDelete)}
        title="ยืนยันการลบบิลที่พักอยู่"
        message={
          billToDelete
            ? `คุณต้องการลบบิลพัก "${billToDelete.title}" (${formatCurrency(
                billToDelete.grandTotal
              )}) ออกจากคลังพักบิลใช่หรือไม่?`
            : ''
        }
        confirmText="ลบบิลพัก"
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setBillToDelete(null)}
        onConfirm={() => {
          if (billToDelete) {
            deleteHeldBill(billToDelete.id);
            setBillToDelete(null);
          }
        }}
      />
    </div>
  );
}
