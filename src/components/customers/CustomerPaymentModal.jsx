import React, { useState, useEffect } from 'react';
import { X, Wallet, Save } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { PAYMENT_METHOD_LABELS } from '../../utils/payments';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const RECEIVE_METHODS = ['cash', 'transfer', 'promptpay'];

/**
 * Modal รับชำระหนี้ลูกค้าเครดิต (Payment Receipt)
 * แสดงบิลค้างชำระพร้อมวันครบกำหนด และรองรับชำระเต็มจำนวนหรือทยอยชำระ
 */
export default function CustomerPaymentModal({ customer, onClose }) {
  const { getCustomerCredit, recordCustomerPayment, customerPayments, showToast } = usePOS();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const credit = customer ? getCustomerCredit(customer) : null;

  useEffect(() => {
    if (customer) {
      setAmount(String(getCustomerCredit(customer).outstanding || ''));
      setMethod('cash');
      setNote('');
    }
    // เติมยอดค้างเฉพาะตอนเปิด Modal ของลูกค้าแต่ละราย
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  if (!customer || !credit) return null;

  const numericAmount = Math.round((Number(amount) || 0) * 100) / 100;
  const history = customerPayments.filter((p) => p.customer_id === customer.id).slice(0, 5);
  const now = new Date();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      showToast('กรุณาระบุยอดรับชำระ', 'error');
      return;
    }
    if (numericAmount > credit.outstanding + 0.001) {
      showToast(`ยอดรับชำระเกินยอดค้าง (${formatCurrency(credit.outstanding)})`, 'error');
      return;
    }
    setSaving(true);
    try {
      await recordCustomerPayment({
        customer_id: customer.id,
        customer_name: customer.name,
        amount: numericAmount,
        method,
        note,
      });
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
            <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="font-bold text-sm truncate">รับชำระหนี้: {customer.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">ยอดค้างชำระ</div>
              <div className="font-extrabold text-rose-600 text-sm">
                {formatCurrency(credit.outstanding)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">เกินกำหนด</div>
              <div className="font-extrabold text-amber-600 text-sm">
                {formatCurrency(credit.overdue)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">ชำระแล้วทั้งหมด</div>
              <div className="font-extrabold text-emerald-600 text-sm">
                {formatCurrency(credit.paid)}
              </div>
            </div>
          </div>

          {/* บิลเครดิตที่ยังค้างชำระ (ตัดชำระบิลเก่าก่อน) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-100 text-[11px] font-extrabold text-slate-600">
              บิลค้างชำระ ({credit.openBills.length}) — ระบบตัดชำระบิลที่เก่าที่สุดก่อน
            </div>
            {credit.openBills.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">ไม่มียอดค้างชำระ</div>
            ) : (
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                {credit.openBills.map((b) => {
                  const isOverdue = b.dueDate < now;
                  return (
                    <div key={b.order.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-indigo-700">
                          {b.order.order_number}
                        </div>
                        <div className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                          ครบกำหนด {formatDateTime(b.dueDate)}
                          {isOverdue && ' (เกินกำหนด)'}
                        </div>
                      </div>
                      <span className="font-extrabold text-slate-900">
                        {formatCurrency(b.remaining)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {credit.outstanding > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ยอดรับชำระ (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-allow-scanner="false"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-right font-mono font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ช่องทางรับชำระ
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                  >
                    {RECEIVE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                type="text"
                data-allow-scanner="false"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="หมายเหตุ (เช่น เลขที่เช็ค / อ้างอิงการโอน)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
              <button
                type="submit"
                disabled={saving || numericAmount <= 0}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving
                    ? 'กำลังบันทึก...'
                    : numericAmount >= credit.outstanding
                    ? 'รับชำระเต็มจำนวน'
                    : 'รับชำระบางส่วน'}
                </span>
              </button>
            </>
          )}

          {history.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-extrabold text-slate-500">ประวัติรับชำระล่าสุด</div>
              {history.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-50"
                >
                  <span className="text-slate-600">
                    <span className="font-mono font-bold">{p.receipt_number}</span> •{' '}
                    {formatDateTime(p.created_at)} • {PAYMENT_METHOD_LABELS[p.method] || p.method}
                  </span>
                  <span className="font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
