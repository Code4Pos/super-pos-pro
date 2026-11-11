import React, { useState, useMemo } from 'react';
import { History, Search } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { MOVEMENT_TYPE_META } from '../utils/stockLedger';
import { formatDateTime, formatNumber } from '../utils/formatters';

const DATE_FILTERS = [
  { id: 'today', label: 'วันนี้', days: 0 },
  { id: '7days', label: '7 วัน', days: 7 },
  { id: '30days', label: '30 วัน', days: 30 },
  { id: 'all', label: 'ทั้งหมด', days: null },
];

/**
 * หน้าประวัติความเคลื่อนไหวสต็อก (Stock Movement Ledger)
 * แสดงทุกครั้งที่สต็อกเปลี่ยน: ขาย, ยกเลิกบิล, รับสินค้าเข้า, ปรับสต็อก, แก้ไขสินค้า
 */
export default function StockLedgerPage() {
  const { stockLedger = [] } = usePOS();
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('7days');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const range = DATE_FILTERS.find((d) => d.id === dateFilter);
    const todayStr = new Date().toDateString();
    const now = Date.now();
    return stockLedger.filter((e) => {
      if (typeFilter !== 'all' && e.movement_type !== typeFilter) return false;
      if (range?.days === 0 && new Date(e.created_at).toDateString() !== todayStr) return false;
      if (range?.days && now - new Date(e.created_at).getTime() > range.days * 86400000) return false;
      if (!q) return true;
      return `${e.product_name} ${e.sku} ${e.reference_doc} ${e.reason} ${e.approved_by}`
        .toLowerCase()
        .includes(q);
    });
  }, [stockLedger, typeFilter, dateFilter, search]);

  const summary = useMemo(() => {
    const inQty = filtered.filter((e) => e.change_qty > 0).reduce((s, e) => s + e.change_qty, 0);
    const outQty = filtered.filter((e) => e.change_qty < 0).reduce((s, e) => s - e.change_qty, 0);
    return { inQty, outQty };
  }, [filtered]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
                ความเคลื่อนไหวสต็อก (Stock Ledger)
              </h1>
              <p className="text-xs text-slate-500">
                รับเข้า {formatNumber(summary.inQty)} • จ่ายออก {formatNumber(summary.outQty)} (หน่วยฐาน) • {formatNumber(filtered.length)} รายการ
              </p>
            </div>
          </div>
          <div className="relative md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า, เลขที่เอกสาร, เหตุผล..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[['all', 'ทุกประเภท'], ...Object.entries(MOVEMENT_TYPE_META).map(([k, v]) => [k, v.label])].map(
              ([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap ${
                    typeFilter === id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            {DATE_FILTERS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateFilter(d.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  dateFilter === d.id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
        <table className="w-full text-left border-collapse min-w-[860px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2.5 px-3">วันที่/เวลา</th>
              <th className="py-2.5 px-3">สินค้า</th>
              <th className="py-2.5 px-3">ประเภท</th>
              <th className="py-2.5 px-3 text-right">เปลี่ยนแปลง</th>
              <th className="py-2.5 px-3 text-right">คงเหลือ</th>
              <th className="py-2.5 px-3">อ้างอิง</th>
              <th className="py-2.5 px-3">เหตุผล / ผู้อนุมัติ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center text-slate-400">
                  ไม่พบความเคลื่อนไหวสต็อกในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const meta = MOVEMENT_TYPE_META[e.movement_type] || MOVEMENT_TYPE_META.ADJUST;
                return (
                  <tr key={e.id} className="hover:bg-indigo-50/30">
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{e.product_name}</div>
                      {e.sku && <div className="text-[10px] font-mono text-slate-400">{e.sku}</div>}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-extrabold whitespace-nowrap ${
                        e.change_qty > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {e.change_qty > 0 ? '+' : ''}
                      {formatNumber(e.change_qty)} {e.unit}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {formatNumber(e.balance_after)} {e.unit}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">{e.reference_doc || '-'}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {e.reason || '-'}
                      {e.approved_by && (
                        <div className="text-[10px] text-slate-400">อนุมัติ: {e.approved_by}</div>
                      )}
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
