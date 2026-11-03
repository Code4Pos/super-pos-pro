import React, { useState, useMemo } from 'react';
import { FilePlus2, FileText, Search, Eye } from 'lucide-react';
import ImportStatusBadge, { IMPORT_STATUS_META } from './ImportStatusBadge';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/formatters';

const STATUS_FILTERS = ['all', 'pending', 'in_transit', 'completed', 'cancelled'];

/**
 * Page 1: จัดการใบนำเข้า แสดงเป็นตาราง
 * (สถานะ, วันที่นำเข้า, รหัสใบนำเข้า, ชื่อผู้ผลิต, ยอดรวม, ตรวจสอบ)
 */
export default function ImportListView({ stockImports = [], onCreate, onOpenDetail }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const statusCounts = useMemo(() => {
    const counts = { all: stockImports.length };
    stockImports.forEach((imp) => {
      counts[imp.status] = (counts[imp.status] || 0) + 1;
    });
    return counts;
  }, [stockImports]);

  const filteredImports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockImports.filter((imp) => {
      if (statusFilter !== 'all' && imp.status !== statusFilter) return false;
      if (!q) return true;
      return `${imp.import_number} ${imp.supplier_name} ${imp.note || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [stockImports, statusFilter, search]);

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
      {/* แถบเครื่องมือ: กรองสถานะ ค้นหา และปุ่มสร้างใบนำเข้า */}
      <div className="p-4 border-b border-slate-200 space-y-3 shrink-0 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสใบนำเข้า หรือชื่อผู้ผลิต..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>สร้างใบนำเข้า</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {key === 'all' ? 'ทั้งหมด' : IMPORT_STATUS_META[key].label} ({statusCounts[key] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* ตารางใบนำเข้า */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2.5 px-3">สถานะ</th>
              <th className="py-2.5 px-3">วันที่นำเข้า</th>
              <th className="py-2.5 px-3">รหัสใบนำเข้า</th>
              <th className="py-2.5 px-3">ชื่อผู้ผลิต</th>
              <th className="py-2.5 px-3 text-right">ยอดรวม</th>
              <th className="py-2.5 px-3 text-center w-28">ตรวจสอบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 text-xs">
            {filteredImports.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-9 h-9 text-slate-300" />
                    <span className="font-bold text-slate-600">
                      {stockImports.length === 0
                        ? 'ยังไม่มีใบนำเข้าสินค้า'
                        : 'ไม่พบใบนำเข้าที่ตรงกับเงื่อนไข'}
                    </span>
                    {stockImports.length === 0 && (
                      <span className="text-[11px]">
                        กดปุ่ม &ldquo;สร้างใบนำเข้า&rdquo; เพื่อเริ่มนำเข้าสินค้าจากผู้ผลิต
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredImports.map((imp) => (
                <tr
                  key={imp.id}
                  onClick={() => onOpenDetail(imp)}
                  className="hover:bg-indigo-50/30 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <ImportStatusBadge status={imp.status} />
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    {formatDateTime(imp.created_at)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-extrabold">
                      {imp.import_number}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900">{imp.supplier_name}</div>
                    <div className="text-[10px] text-slate-400">
                      {formatNumber((imp.items || []).length)} รายการ •{' '}
                      {formatNumber(imp.total_items)} หน่วย
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                    {formatCurrency(imp.grand_total)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetail(imp);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-slate-700 font-bold inline-flex items-center gap-1 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>ตรวจสอบ</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
