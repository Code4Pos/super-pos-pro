import React, { useState, useMemo } from 'react';
import { Landmark, FileText, Wallet, Printer, AlertTriangle, Users } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { printerService } from '../services/printerService';
import BillingNoteModal from '../components/customers/BillingNoteModal';
import CustomerPaymentModal from '../components/customers/CustomerPaymentModal';
import PaymentHistoryView from '../components/customers/PaymentHistoryView';
import { AGING_BUCKETS, calculateAgingReport, getBillingNoteStatus } from '../utils/credit';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

/**
 * หน้าลูกหนี้การค้า (Accounts Receivable)
 * - รายงานวิเคราะห์อายุลูกหนี้ (Aging Report: 0-30, 31-60, 61-90, เกิน 90 วัน นับจากวันที่ออกบิล)
 * - ออก/พิมพ์ใบวางบิล และรับชำระหนี้
 */
export default function AccountsReceivablePage() {
  const { customers, orders, customerPayments, billingNotes, can } = usePOS();
  const [viewMode, setViewMode] = useState('aging'); // 'aging' | 'billing' | 'payments'
  const [billingCustomer, setBillingCustomer] = useState(null);
  const [paymentCustomer, setPaymentCustomer] = useState(null);

  const aging = useMemo(
    () => calculateAgingReport(customers, orders, customerPayments),
    [customers, orders, customerPayments]
  );

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const notesWithStatus = useMemo(
    () =>
      billingNotes.map((n) => ({
        ...n,
        status: getBillingNoteStatus(n, customerById.get(n.customer_id), orders, customerPayments),
      })),
    [billingNotes, customerById, orders, customerPayments]
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      {/* หัวข้อ + สรุปยอด */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
                ลูกหนี้การค้า & ใบวางบิล
              </h1>
              <p className="text-xs text-slate-500">อายุลูกหนี้นับจากวันที่ออกบิล</p>
            </div>
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto whitespace-nowrap">
            {[
              { id: 'aging', label: 'อายุลูกหนี้ (Aging)', icon: Users },
              { id: 'billing', label: `ใบวางบิล (${billingNotes.length})`, icon: FileText },
              { id: 'payments', label: `ประวัติรับชำระ (${customerPayments.length})`, icon: Wallet },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setViewMode(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                    viewMode === t.id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <div className="text-[11px] font-bold text-rose-700">ยอดลูกหนี้คงค้าง</div>
            <div className="text-sm sm:text-lg font-extrabold text-rose-700">
              {formatCurrency(aging.totals.total)}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-[11px] font-bold text-amber-700">เกินกำหนดชำระ</div>
            <div className="text-sm sm:text-lg font-extrabold text-amber-700">
              {formatCurrency(aging.totals.overdue)}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-600">ลูกค้าที่มียอดค้าง</div>
            <div className="text-sm sm:text-lg font-extrabold text-slate-900">
              {formatNumber(aging.rows.length)} ราย
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'aging' ? (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[860px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">ลูกค้า</th>
                {AGING_BUCKETS.map((b) => (
                  <th key={b.id} className="py-2.5 px-3 text-right">
                    {b.label}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">รวมค้างชำระ</th>
                <th className="py-2.5 px-3 text-center w-48">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {aging.rows.length === 0 ? (
                <tr>
                  <td colSpan={AGING_BUCKETS.length + 3} className="py-14 text-center text-slate-400">
                    ไม่มียอดลูกหนี้คงค้าง
                  </td>
                </tr>
              ) : (
                aging.rows.map((row) => (
                  <tr key={row.customer.id} className="hover:bg-indigo-50/30">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{row.customer.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {row.customer.code} • เครดิต {Number(row.customer.credit_term_days) || 0} วัน
                        {row.overdue > 0 && (
                          <span className="ml-1 font-bold text-amber-700">
                            • เกินกำหนด {formatCurrency(row.overdue)}
                          </span>
                        )}
                      </div>
                    </td>
                    {AGING_BUCKETS.map((b, idx) => (
                      <td
                        key={b.id}
                        className={`py-2.5 px-3 text-right font-semibold ${
                          row.buckets[b.id] > 0
                            ? idx >= 2
                              ? 'text-rose-600'
                              : 'text-slate-800'
                            : 'text-slate-300'
                        }`}
                      >
                        {formatCurrency(row.buckets[b.id])}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-extrabold text-rose-700">
                      {formatCurrency(row.total)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {can('billing_note') && (
                        <button
                          type="button"
                          onClick={() => setBillingCustomer(row.customer)}
                          className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>วางบิล</span>
                        </button>
                        )}
                        {can('receive_payment') && (
                        <button
                          type="button"
                          onClick={() => setPaymentCustomer(row.customer)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>รับชำระ</span>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {aging.rows.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-extrabold">
                <tr>
                  <td className="py-2.5 px-3">รวมทั้งหมด</td>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b.id} className="py-2.5 px-3 text-right">
                      {formatCurrency(aging.totals[b.id])}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-right text-rose-700">
                    {formatCurrency(aging.totals.total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : viewMode === 'payments' ? (
        <PaymentHistoryView />
      ) : (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">เลขที่ใบวางบิล</th>
                <th className="py-2.5 px-3">วันที่</th>
                <th className="py-2.5 px-3">ลูกค้า</th>
                <th className="py-2.5 px-3 text-center">จำนวนบิล</th>
                <th className="py-2.5 px-3 text-right">ยอดวางบิล</th>
                <th className="py-2.5 px-3">กำหนดชำระ</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3 text-center">พิมพ์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {notesWithStatus.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    ยังไม่มีใบวางบิล (ออกได้จากแท็บอายุลูกหนี้)
                  </td>
                </tr>
              ) : (
                notesWithStatus.map((n) => {
                  const isOverdue =
                    !n.status.paid && n.payment_due_date && new Date(n.payment_due_date) < new Date();
                  return (
                    <tr key={n.id} className="hover:bg-indigo-50/30">
                      <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700">
                        {n.billing_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{formatDateTime(n.created_at)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{n.customer_name}</td>
                      <td className="py-2.5 px-3 text-center">{(n.bills || []).length}</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                        {formatCurrency(n.total)}
                      </td>
                      <td className={`py-2.5 px-3 ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                        {formatDateTime(n.payment_due_date)}
                      </td>
                      <td className="py-2.5 px-3">
                        {n.status.paid ? (
                          <span className="px-2 py-1 rounded-full border text-[11px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                            ชำระครบแล้ว
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {isOverdue && <AlertTriangle className="w-3 h-3" />}
                            ค้าง {formatCurrency(n.status.remaining)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => printerService.printBillingNote(n)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600"
                          title="พิมพ์ใบวางบิล A4"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <BillingNoteModal customer={billingCustomer} onClose={() => setBillingCustomer(null)} />
      <CustomerPaymentModal customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} />
    </div>
  );
}
