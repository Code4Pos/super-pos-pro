import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, Download, AlertTriangle } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { buildSalesTaxReport } from '../utils/tax';
import { formatCurrency, formatNumber } from '../utils/formatters';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateOnly(dateStr) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * รายงานภาษีขายประจำเดือน (สำหรับยื่น ภ.พ.30)
 * แยกใบกำกับภาษีเต็มรูป (รายฉบับ) และใบกำกับภาษีอย่างย่อ (บิลขายปลีกรวมยอด)
 */
export default function SalesTaxReportPage() {
  const { orders, taxInvoices = [], printerSettings, dbMode } = usePOS();
  const [month, setMonth] = useState(currentMonthValue());

  const report = useMemo(
    () => buildSalesTaxReport(orders, taxInvoices, month),
    [orders, taxInvoices, month]
  );

  // ส่งออก CSV (มี BOM ให้ Excel อ่านภาษาไทยได้)
  const handleExportCsv = () => {
    const header = ['ลำดับ', 'วันที่', 'เลขที่ใบกำกับภาษี', 'ชื่อผู้ซื้อ', 'เลขผู้เสียภาษีผู้ซื้อ', 'สาขา', 'มูลค่าสินค้า', 'ภาษีมูลค่าเพิ่ม', 'รวม', 'อ้างอิงบิล'];
    const rows = report.fullInvoices.map((t, idx) => [
      idx + 1,
      new Date(t.created_at).toLocaleDateString('th-TH'),
      t.invoice_number,
      t.buyer_name,
      t.buyer_tax_id || '',
      t.buyer_branch || '00000',
      t.base_amount,
      t.vat_amount,
      t.total_amount,
      t.order_number,
    ]);
    rows.push([]);
    rows.push(['', '', 'รวมใบกำกับภาษีเต็มรูป', '', '', '', report.fullTotals.base, report.fullTotals.vat, report.fullTotals.total, '']);
    rows.push(['', '', `ใบกำกับภาษีอย่างย่อ (${report.abbreviatedTotals.count} บิล)`, '', '', '', report.abbreviatedTotals.base, report.abbreviatedTotals.vat, report.abbreviatedTotals.total, '']);
    rows.push(['', '', 'รวมทั้งเดือน', '', '', '', report.grandTotals.base, report.grandTotals.vat, report.grandTotals.total, '']);

    const escapeCsv = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `รายงานภาษีขาย-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-5 space-y-3.5 pb-24 lg:pb-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">รายงานภาษีขาย (ภ.พ.30)</h1>
            <p className="text-xs text-slate-500">
              {printerSettings?.shopName} • เลขผู้เสียภาษี {printerSettings?.shopTaxId || '-'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
          />
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {!printerSettings?.vatRegistered && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>ร้านยังไม่ได้ตั้งค่าเป็นผู้จดทะเบียน VAT ตัวเลขด้านล่างเป็นการประมาณภาษีจากราคาขายรวม VAT</span>
        </div>
      )}
      {dbMode === 'supabase' && (
        <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
          หมายเหตุ: ยอดใบกำกับภาษีอย่างย่อคำนวณจากบิลที่โหลดไว้ (บิลล่าสุด 200 ใบ) ถ้าเดือนนี้มีบิลมากกว่านั้น ยอดอาจไม่ครบ
        </div>
      )}

      {/* สรุปยอดสำหรับกรอก ภ.พ.30 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: `ใบกำกับภาษีเต็มรูป (${formatNumber(report.fullTotals.count)} ฉบับ)`, t: report.fullTotals, cls: 'bg-white border-slate-200' },
          { label: `ใบกำกับภาษีอย่างย่อ (${formatNumber(report.abbreviatedTotals.count)} บิล)`, t: report.abbreviatedTotals, cls: 'bg-white border-slate-200' },
          { label: 'รวมยอดขายทั้งเดือน', t: report.grandTotals, cls: 'bg-indigo-50 border-indigo-200' },
        ].map((card) => (
          <div key={card.label} className={`p-3.5 rounded-2xl border text-xs space-y-1 ${card.cls}`}>
            <div className="font-bold text-slate-700">{card.label}</div>
            <div className="flex justify-between">
              <span className="text-slate-500">ยอดขาย (ไม่รวม VAT)</span>
              <span className="font-bold">{formatCurrency(card.t.base)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ภาษีขาย</span>
              <span className="font-extrabold text-indigo-700">{formatCurrency(card.t.vat)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">รวม</span>
              <span className="font-bold">{formatCurrency(card.t.total)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* รายการใบกำกับภาษีเต็มรูป */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
        <table className="w-full text-left border-collapse min-w-[860px] text-xs">
          <thead className="bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2.5 px-3">วันที่</th>
              <th className="py-2.5 px-3">เลขที่</th>
              <th className="py-2.5 px-3">ผู้ซื้อ</th>
              <th className="py-2.5 px-3">เลขผู้เสียภาษี / สาขา</th>
              <th className="py-2.5 px-3 text-right">มูลค่าสินค้า</th>
              <th className="py-2.5 px-3 text-right">ภาษี</th>
              <th className="py-2.5 px-3 text-right">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {report.fullInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  ไม่มีใบกำกับภาษีเต็มรูปในเดือนนี้ (ออกได้จากหน้าประวัติบิล)
                </td>
              </tr>
            ) : (
              report.fullInvoices.map((t) => (
                <tr key={t.id} className="hover:bg-indigo-50/30">
                  <td className="py-2 px-3 whitespace-nowrap">{formatDateOnly(t.created_at)}</td>
                  <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                    {t.invoice_number}
                    {t.orderVoided && (
                      <div className="text-[10px] font-sans font-bold text-rose-600">
                        บิลถูกยกเลิก ต้องออกใบลดหนี้
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-900">{t.buyer_name}</td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    {t.buyer_tax_id || '-'} / {t.buyer_branch || '00000'}
                  </td>
                  <td className="py-2 px-3 text-right">{formatCurrency(t.base_amount)}</td>
                  <td className="py-2 px-3 text-right font-bold text-indigo-700">{formatCurrency(t.vat_amount)}</td>
                  <td className="py-2 px-3 text-right font-bold">{formatCurrency(t.total_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
