import React, { useState, useMemo } from 'react';
import { X, FileMinus, FilePlus } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import {
  CREDIT_NOTE_REASONS,
  DEBIT_NOTE_REASONS,
  calculateCreditNote,
  calculateDebitNote,
  getCreditedSummary,
} from '../../utils/tax';
import { formatCurrency } from '../../utils/formatters';

// เหตุผลที่เกี่ยวกับการรับสินค้าคืน จะติ๊ก "คืนสินค้าเข้าสต็อก" ให้อัตโนมัติ
const RESTOCK_REASONS = ['ลูกค้าคืนสินค้า', 'ยกเลิกการขาย'];

/**
 * ออกใบลดหนี้ (Credit Note) หรือใบเพิ่มหนี้ (Debit Note) อ้างอิงใบกำกับภาษีเต็มรูป
 */
export default function TaxNoteModal({ invoice, noteType, onClose }) {
  const { taxNotes = [], createTaxNote, orders } = usePOS();
  const isCredit = noteType === 'credit';
  const reasons = isCredit ? CREDIT_NOTE_REASONS : DEBIT_NOTE_REASONS;
  const [reason, setReason] = useState(reasons[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [quantities, setQuantities] = useState({});
  const [extraAmount, setExtraAmount] = useState('');
  const [restock, setRestock] = useState(true);
  const [saving, setSaving] = useState(false);

  // ใบกำกับเก่าที่ยังไม่มี product_id ให้หาสินค้าจากบิลขายต้นทาง (เทียบชื่อและรหัสสินค้า)
  const invoiceWithProducts = useMemo(() => {
    if (!invoice) return null;
    const order = orders.find((o) => o.order_number === invoice.order_number);
    return {
      ...invoice,
      items: (invoice.items || []).map((it) => {
        if (it.product_id) return it;
        const match = (order?.items || []).find(
          (oi) => oi.product_name === it.product_name && (oi.sku || '') === (it.sku || '')
        );
        return { ...it, product_id: match?.product_id || null };
      }),
    };
  }, [invoice, orders]);

  if (!invoice || !invoiceWithProducts) return null;

  const { creditedQty, creditedTotal } = getCreditedSummary(invoice, taxNotes);
  const remainingCredit = Math.max(0, Math.round((Number(invoice.total_amount) - creditedTotal) * 100) / 100);
  const lines = Object.entries(quantities).map(([index, quantity]) => ({ index: Number(index), quantity: Number(quantity) || 0 }));
  const amounts = isCredit
    ? calculateCreditNote(invoiceWithProducts, lines, extraAmount)
    : calculateDebitNote(invoiceWithProducts, extraAmount);
  const finalReason = reason === 'อื่นๆ' ? reasonDetail.trim() : reason;
  const overLimit = isCredit && amounts.total > remainingCredit + 0.001;
  const canSave = !saving && amounts.total > 0 && Boolean(finalReason) && !overLimit;

  const selectAllRemaining = () => {
    const next = {};
    invoice.items.forEach((it, idx) => {
      const left = (Number(it.quantity) || 0) - (creditedQty[idx] || 0);
      if (left > 0) next[idx] = left;
    });
    setQuantities(next);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await createTaxNote({
        note_type: noteType,
        invoice: invoiceWithProducts,
        reason: finalReason,
        amounts,
        restock: isCredit && restock && amounts.items?.length > 0,
      });
      if (saved) {
        printerService.printTaxNote(saved, 'ต้นฉบับ');
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const Icon = isCredit ? FileMinus : FilePlus;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-900/60">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="font-bold text-sm truncate">
              {isCredit ? 'ออกใบลดหนี้' : 'ออกใบเพิ่มหนี้'} • อ้างอิง {invoice.invoice_number}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">เหตุผล *</label>
              <select
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setRestock(RESTOCK_REASONS.includes(e.target.value));
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
              >
                {[...reasons, 'อื่นๆ'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-right">
              <div className="text-slate-500">มูลค่าใบกำกับเดิม</div>
              <div className="font-extrabold text-slate-900">{formatCurrency(invoice.total_amount)}</div>
              {isCredit && creditedTotal > 0 && (
                <div className="text-rose-600 font-bold">ลดหนี้ไปแล้ว {formatCurrency(creditedTotal)}</div>
              )}
            </div>
          </div>
          {reason === 'อื่นๆ' && (
            <input
              type="text"
              data-allow-scanner="false"
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="ระบุเหตุผล *"
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
          )}

          {isCredit && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-100 flex items-center justify-between font-extrabold text-slate-600">
                <span>สินค้าที่คืน / ลดราคา</span>
                <button type="button" onClick={selectAllRemaining} className="text-indigo-700 hover:underline">
                  เลือกทั้งหมดที่เหลือ
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {invoice.items.map((it, idx) => {
                  const left = (Number(it.quantity) || 0) - (creditedQty[idx] || 0);
                  return (
                    <div key={idx} className="px-3 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate">{it.product_name}</div>
                        <div className="text-slate-500">
                          {formatCurrency(it.unit_price)} × ขาย {it.quantity} {it.unit} • คืนได้อีก {left}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={left}
                        disabled={left <= 0}
                        data-allow-scanner="false"
                        value={quantities[idx] ?? ''}
                        onChange={(e) => {
                          const v = Math.min(left, Math.max(0, Number(e.target.value) || 0));
                          setQuantities((prev) => ({ ...prev, [idx]: v }));
                        }}
                        placeholder="0"
                        className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-center font-bold disabled:bg-slate-100"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isCredit ? 'ยอดลดราคาเพิ่มเติม (รวม VAT, ไม่ผูกกับรายการสินค้า)' : 'ยอดที่เรียกเก็บเพิ่ม (รวม VAT) *'}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              data-allow-scanner="false"
              value={extraAmount}
              onChange={(e) => setExtraAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-right font-mono font-bold"
            />
          </div>

          {isCredit && (
            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              คืนสินค้าที่เลือกเข้าสต็อก (บันทึกใน Stock Ledger)
            </label>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">ผลต่างก่อนภาษี</div>
              <div className="font-extrabold">{formatCurrency(amounts.base)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">VAT ของผลต่าง</div>
              <div className="font-extrabold">{formatCurrency(amounts.vat)}</div>
            </div>
            <div className={`p-2.5 rounded-xl border ${overLimit ? 'bg-rose-50 border-rose-300' : 'bg-indigo-50 border-indigo-200'}`}>
              <div className={overLimit ? 'text-rose-700' : 'text-indigo-700'}>{isCredit ? 'ยอดลดหนี้' : 'ยอดเพิ่มหนี้'}</div>
              <div className={`font-extrabold ${overLimit ? 'text-rose-700' : 'text-indigo-700'}`}>{formatCurrency(amounts.total)}</div>
            </div>
          </div>
          {overLimit && (
            <p className="font-bold text-rose-600">ยอดลดหนี้เกินยอดที่เหลือของใบกำกับ ({formatCurrency(remainingCredit)})</p>
          )}

          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <Icon className="w-4 h-4" />
            <span>{saving ? 'กำลังออกเลขที่...' : `ออก${isCredit ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'}และพิมพ์ต้นฉบับ`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
