import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, Save } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// วันที่รูปแบบ YYYY-MM-DD สำหรับช่อง input type="date"
function toDateInputValue(date) {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Modal ออกใบวางบิล: เลือกบิลเครดิตที่ค้างชำระของลูกค้า แล้วรวมเป็นใบวางบิลฉบับเดียว
 */
export default function BillingNoteModal({ customer, onClose }) {
  const { getCustomerCredit, createBillingNote } = usePOS();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const openBills = useMemo(
    () => (customer ? getCustomerCredit(customer).openBills : []),
    [customer, getCustomerCredit]
  );

  // ค่าเริ่มต้น: เลือกทุกบิลที่ค้าง และกำหนดชำระตามเครดิตเทอม (อย่างน้อย 7 วัน)
  useEffect(() => {
    if (!customer) return;
    setSelectedIds(new Set(openBills.map((b) => b.order.id)));
    const due = new Date();
    due.setDate(due.getDate() + Math.max(7, Number(customer.credit_term_days) || 0));
    setDueDate(toDateInputValue(due));
    setNote('');
    // ตั้งค่าเริ่มต้นเฉพาะตอนเปิด Modal ของลูกค้าแต่ละราย
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  if (!customer) return null;

  const selectedBills = openBills.filter((b) => selectedIds.has(b.order.id));
  const total = selectedBills.reduce((sum, b) => sum + b.remaining, 0);
  const allSelected = openBills.length > 0 && selectedBills.length === openBills.length;

  const toggleBill = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleCreate = async (printAfter) => {
    if (selectedBills.length === 0) return;
    setSaving(true);
    try {
      const saved = await createBillingNote({
        customer,
        bills: selectedBills.map((b) => ({
          order_id: b.order.id,
          order_number: b.order.order_number,
          order_date: b.order.created_at,
          due_date: b.dueDate.toISOString(),
          amount: b.remaining,
        })),
        payment_due_date: new Date(`${dueDate}T00:00:00`).toISOString(),
        note,
      });
      if (printAfter) printerService.printBillingNote(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="font-bold text-sm truncate">ออกใบวางบิล: {customer.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <label className="px-3 py-2 bg-slate-100 flex items-center gap-2 text-[11px] font-extrabold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelectedIds(allSelected ? new Set() : new Set(openBills.map((b) => b.order.id)))
                }
                className="w-4 h-4 accent-indigo-600"
              />
              <span>เลือกบิลค้างชำระ ({selectedBills.length}/{openBills.length})</span>
            </label>
            {openBills.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">ไม่มีบิลค้างชำระ</div>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                {openBills.map((b) => (
                  <label
                    key={b.order.id}
                    className="px-3 py-2 flex items-center gap-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.order.id)}
                      onChange={() => toggleBill(b.order.id)}
                      className="w-4 h-4 accent-indigo-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-bold text-indigo-700">
                        {b.order.order_number}
                      </div>
                      <div className="text-slate-500">
                        {formatDateTime(b.order.created_at)} • ครบกำหนด {formatDateTime(b.dueDate)}
                      </div>
                    </div>
                    <span className="font-extrabold text-slate-900">
                      {formatCurrency(b.remaining)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">กำหนดชำระ</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-right">
              <div className="text-[11px] font-bold text-indigo-700">ยอดรวมใบวางบิล</div>
              <div className="text-lg font-extrabold text-indigo-700">{formatCurrency(total)}</div>
            </div>
          </div>

          <input
            type="text"
            data-allow-scanner="false"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (เช่น ช่องทางชำระเงิน / ผู้ติดต่อ)..."
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving || selectedBills.length === 0 || !dueDate}
              onClick={() => handleCreate(false)}
              className="py-2.5 rounded-xl border border-indigo-600 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>บันทึกใบวางบิล</span>
            </button>
            <button
              type="button"
              disabled={saving || selectedBills.length === 0 || !dueDate}
              onClick={() => handleCreate(true)}
              className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>บันทึกและพิมพ์ A4</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
