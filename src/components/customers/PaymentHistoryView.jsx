import React, { useState, useMemo } from 'react';
import { Search, Printer, Download } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import { allocatePaymentsToBills } from '../../utils/credit';
import { PAYMENT_METHOD_LABELS } from '../../utils/payments';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/formatters';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * ประวัติการรับชำระหนี้ของลูกค้าเครดิต
 * แสดงบิลที่ถูกตัดชำระในแต่ละครั้ง (FIFO) พิมพ์ใบเสร็จซ้ำ และส่งออก CSV
 */
export default function PaymentHistoryView() {
  const { customers, orders, customerPayments = [] } = usePOS();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(currentMonthValue());
  const [methodFilter, setMethodFilter] = useState('all');

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  // จับคู่บิลที่ถูกตัดชำระของทุกลูกค้า (คำนวณจากประวัติทั้งหมด ไม่ขึ้นกับตัวกรอง)
  const allocationByPaymentId = useMemo(() => {
    const merged = new Map();
    customers.forEach((c) => {
      allocatePaymentsToBills(c, orders, customerPayments).forEach((parts, paymentId) =>
        merged.set(paymentId, parts)
      );
    });
    return merged;
  }, [customers, orders, customerPayments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customerPayments
      .filter((p) => {
        if (month) {
          const d = new Date(p.created_at);
          if (`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` !== month) return false;
        }
        if (methodFilter !== 'all' && p.method !== methodFilter) return false;
        if (!q) return true;
        return `${p.receipt_number} ${p.customer_name} ${p.note || ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [customerPayments, search, month, methodFilter]);

  const total = rows.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const handleExportCsv = () => {
    const header = ['วันที่', 'เลขที่ใบเสร็จ', 'ลูกค้า', 'ช่องทาง', 'จำนวนเงิน', 'บิลที่ตัดชำระ', 'หมายเหตุ'];
    const lines = rows.map((p) => [
      new Date(p.created_at).toLocaleString('th-TH'),
      p.receipt_number,
      p.customer_name,
      PAYMENT_METHOD_LABELS[p.method] || p.method,
      p.amount,
      (allocationByPaymentId.get(p.id) || []).map((a) => `${a.order_number} (${a.amount})`).join(' / '),
      p.note || '',
    ]);
    const escapeCsv = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [header, ...lines].map((r) => r.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ประวัติรับชำระหนี้-${month || 'ทั้งหมด'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
      <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบเสร็จ ชื่อลูกค้า หรือหมายเหตุ..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
          />
          <button
            type="button"
            onClick={() => setMonth('')}
            className={`px-3 py-2 rounded-xl border text-xs font-bold ${
              month ? 'border-slate-200 bg-white text-slate-600' : 'border-slate-900 bg-slate-900 text-white'
            }`}
          >
            ทุกเดือน
          </button>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
          >
            <option value="all">ทุกช่องทาง</option>
            {['cash', 'transfer', 'promptpay'].map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-slate-200 text-xs text-slate-600 shrink-0">
        {formatNumber(rows.length)} รายการ • รวมรับชำระ{' '}
        <strong className="text-emerald-700">{formatCurrency(total)}</strong>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[860px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2.5 px-3">วันที่</th>
              <th className="py-2.5 px-3">เลขที่ใบเสร็จ</th>
              <th className="py-2.5 px-3">ลูกค้า</th>
              <th className="py-2.5 px-3">ช่องทาง</th>
              <th className="py-2.5 px-3">บิลที่ตัดชำระ</th>
              <th className="py-2.5 px-3 text-right">จำนวนเงิน</th>
              <th className="py-2.5 px-3 text-center">พิมพ์</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center text-slate-400">
                  ไม่มีประวัติรับชำระหนี้ในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const parts = allocationByPaymentId.get(p.id) || [];
                return (
                  <tr key={p.id} className="hover:bg-indigo-50/30 align-top">
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600">{formatDateTime(p.created_at)}</td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">{p.receipt_number}</td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{p.customer_name}</div>
                      {p.note && <div className="text-[10px] text-slate-500">{p.note}</div>}
                    </td>
                    <td className="py-2 px-3">{PAYMENT_METHOD_LABELS[p.method] || p.method}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {parts.length === 0
                        ? '-'
                        : parts.map((a) => (
                            <div key={a.order_number} className="font-mono">
                              {a.order_number} <span className="font-sans text-slate-400">({formatCurrency(a.amount)})</span>
                            </div>
                          ))}
                    </td>
                    <td className="py-2 px-3 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => printerService.printPaymentReceipt(p, customerById.get(p.customer_id), parts)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600"
                        title="พิมพ์ใบเสร็จรับเงิน A4"
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
    </div>
  );
}
