import React from 'react';
import { Banknote, QrCode, Building2, Handshake, Plus, Trash2, ArrowDownToLine } from 'lucide-react';
import CustomerSelector from './CustomerSelector';
import PromptPayQR from './PromptPayQR';
import { PAYMENT_METHOD_LABELS, summarizeSplitPayments } from '../../utils/payments';
import { formatCurrency } from '../../utils/formatters';

const METHOD_ICONS = {
  cash: Banknote,
  promptpay: QrCode,
  transfer: Building2,
  credit: Handshake,
};

let lineSeq = 0;
export function createSplitLine(method, amount = '') {
  lineSeq += 1;
  return { id: `split-${Date.now()}-${lineSeq}`, method, amount: String(amount) };
}

/**
 * แบ่งจ่ายหลายช่องทาง (Split Payment) เช่น เงินสดส่วนหนึ่ง + สแกน QR ส่วนที่เหลือ
 * เงินทอนคิดจากเงินสดเท่านั้น
 */
export default function SplitPaymentPanel({ lines, setLines, grandTotal, selectedCustomer }) {
  const summary = summarizeSplitPayments(lines, grandTotal);
  const promptpayAmount = lines
    .filter((l) => l.method === 'promptpay')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const hasCreditLine = lines.some((l) => l.method === 'credit' && Number(l.amount) > 0);

  const updateLine = (id, patch) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  // เติมยอดที่ยังขาดลงในช่องทางนี้
  const fillRemaining = (line) => {
    const others = lines
      .filter((l) => l.id !== line.id)
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const rest = Math.max(0, Math.round((grandTotal - others) * 100) / 100);
    updateLine(line.id, { amount: String(rest) });
  };

  const addLine = (method) => {
    setLines((prev) => [...prev, createSplitLine(method, summary.remaining || '')]);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 min-h-0">
      {/* ฝั่งซ้าย: รายการช่องทางชำระ */}
      <div className="md:col-span-7 space-y-2 min-h-0">
        {lines.map((line) => {
          const Icon = METHOD_ICONS[line.method] || Banknote;
          return (
            <div
              key={line.id}
              className="p-2 rounded-2xl border border-slate-200 bg-white flex items-center gap-2"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-800 w-20 sm:w-24 shrink-0 truncate">
                {PAYMENT_METHOD_LABELS[line.method]}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                data-allow-scanner="false"
                value={line.amount}
                onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                placeholder="0.00"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-slate-300 text-right font-mono font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => fillRemaining(line)}
                className="p-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 shrink-0"
                title="เติมยอดที่เหลือในช่องทางนี้"
              >
                <ArrowDownToLine className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={lines.length <= 1}
                onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                className="p-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 shrink-0"
                title="ลบช่องทางนี้"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {/* ปุ่มเพิ่มช่องทาง */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {Object.keys(METHOD_ICONS).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => addLine(method)}
              className="py-2 px-2 rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="truncate">{PAYMENT_METHOD_LABELS[method]}</span>
            </button>
          ))}
        </div>

        {hasCreditLine && (
          <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5">
            <div className="text-xs font-bold text-amber-900">
              มียอดเครดิต/ค้างชำระ ต้องเลือกลูกค้าก่อนยืนยัน
              {selectedCustomer && `: ${selectedCustomer.name}`}
            </div>
            <CustomerSelector
              placeholder="พิมพ์ค้นหา หรือสแกนรหัสลูกค้า..."
              requiredWarning={!selectedCustomer}
            />
          </div>
        )}
      </div>

      {/* ฝั่งขวา: สรุปยอด และ QR ของยอดที่จ่ายด้วยพร้อมเพย์ */}
      <div className="md:col-span-5 space-y-2">
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="font-bold text-slate-600">ยอดสุทธิ</span>
            <span className="font-extrabold text-indigo-700">{formatCurrency(grandTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-slate-600">รับชำระแล้ว</span>
            <span className="font-extrabold text-slate-900">{formatCurrency(summary.total)}</span>
          </div>
          <div
            className={`flex justify-between pt-1 border-t border-slate-200 text-sm ${
              summary.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            <span className="font-bold">{summary.remaining > 0 ? 'ยังขาดอีก' : 'เงินทอน'}</span>
            <span className="font-extrabold">
              {formatCurrency(summary.remaining > 0 ? summary.remaining : summary.change)}
            </span>
          </div>
          {summary.nonCashExceeds && (
            <p className="text-[11px] font-bold text-rose-600">
              ยอด QR / โอน / เครดิต รวมกันเกินยอดสุทธิ (ทอนเงินได้จากเงินสดเท่านั้น)
            </p>
          )}
        </div>

        {promptpayAmount > 0 && <PromptPayQR amount={promptpayAmount} size={140} />}
      </div>
    </div>
  );
}
