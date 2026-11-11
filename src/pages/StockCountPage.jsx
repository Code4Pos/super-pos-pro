import React, { useState, useMemo } from 'react';
import { ClipboardCheck, Plus, Search, Save, Send, CheckCircle2, XCircle, ArrowLeft, EyeOff } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import ConfirmModal from '../components/common/ConfirmModal';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

const STATUS_META = {
  counting: { label: 'กำลังนับ', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  submitted: { label: 'รออนุมัติ', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  approved: { label: 'ปรับสต็อกแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิก', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const hasCount = (it) => it.counted_qty !== null && it.counted_qty !== undefined && it.counted_qty !== '';

/**
 * ตรวจนับสต็อกแบบ Blind Count (ผู้นับไม่เห็นยอดในระบบ)
 * ขั้นตอน: สร้างใบนับ > นับและบันทึก > ส่งผลนับ (ระบบจดยอดในระบบ ณ ตอนส่ง) > ผู้มีสิทธิ์อนุมัติ > ปรับสต็อกตามผลต่าง
 */
export default function StockCountPage() {
  const {
    products,
    categories,
    stockCounts = [],
    createStockCount,
    saveStockCountProgress,
    submitStockCount,
    approveStockCount,
    cancelStockCount,
    can,
  } = usePOS();
  const [openCountId, setOpenCountId] = useState(null);
  const [newCategory, setNewCategory] = useState('all');
  const [draftItems, setDraftItems] = useState(null);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null); // 'submit' | 'approve' | 'cancel'
  const [busy, setBusy] = useState(false);

  const openCount = stockCounts.find((c) => c.id === openCountId) || null;
  const canCount = can('adjust_stock');
  const canApprove = can('approve_stock');

  const sortedCounts = useMemo(
    () => [...stockCounts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [stockCounts]
  );

  const handleCreate = async () => {
    const masterProducts = products.filter(
      (p) => !p.linked_product_id && (newCategory === 'all' || p.category_id === newCategory)
    );
    const label =
      newCategory === 'all'
        ? 'สินค้าทั้งหมด'
        : categories.find((c) => c.id === newCategory)?.name || newCategory;
    const saved = await createStockCount({ scopeLabel: label, productIds: masterProducts.map((p) => p.id) });
    if (saved) {
      setOpenCountId(saved.id);
      setDraftItems(saved.items);
    }
  };

  const openSheet = (count) => {
    setOpenCountId(count.id);
    setDraftItems(count.items);
    setSearch('');
  };

  const closeSheet = () => {
    setOpenCountId(null);
    setDraftItems(null);
  };

  const runConfirmed = async () => {
    const action = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      if (action === 'submit') await submitStockCount(openCount, draftItems);
      if (action === 'approve') await approveStockCount(openCount);
      if (action === 'cancel') await cancelStockCount(openCount);
      // หลังเปลี่ยนสถานะ ใช้ข้อมูลที่บันทึกแล้ว (มียอดในระบบ ณ ตอนส่งผลนับ)
      setDraftItems(null);
    } finally {
      setBusy(false);
    }
  };

  // ===== รายการใบตรวจนับ =====
  if (!openCount) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">ตรวจนับสต็อก (Blind Count)</h1>
              <p className="text-xs text-slate-500">ผู้นับไม่เห็นยอดในระบบ ผลต่างจะแสดงตอนอนุมัติเท่านั้น</p>
            </div>
          </div>
          {canCount && (
            <div className="flex items-center gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              >
                <option value="all">สินค้าทั้งหมด</option>
                {categories
                  .filter((c) => c.id !== 'all')
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างใบตรวจนับ</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[720px] text-xs">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">เลขที่</th>
                <th className="py-2.5 px-3">ขอบเขต</th>
                <th className="py-2.5 px-3">สร้างเมื่อ / ผู้สร้าง</th>
                <th className="py-2.5 px-3 text-center">นับแล้ว</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {sortedCounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">ยังไม่มีใบตรวจนับ</td>
                </tr>
              ) : (
                sortedCounts.map((c) => {
                  const counted = c.items.filter(hasCount).length;
                  const meta = STATUS_META[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-indigo-50/30">
                      <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700">{c.count_number}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{c.scope_label}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {formatDateTime(c.created_at)}
                        {c.created_by && <div className="text-[10px] text-slate-400">{c.created_by}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-center">{counted}/{c.items.length}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => openSheet(c)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold"
                        >
                          {c.status === 'counting' ? 'นับต่อ' : 'ดูผล'}
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

  const items = draftItems || openCount.items;
  const isCounting = openCount.status === 'counting';
  const q = search.trim().toLowerCase();
  const visibleItems = items
    .map((it, idx) => ({ ...it, idx }))
    .filter((it) => !q || `${it.product_name} ${it.sku} ${it.barcode}`.toLowerCase().includes(q));
  const countedCount = items.filter(hasCount).length;

  const variances = items.map((it) => {
    const counted = hasCount(it) ? Number(it.counted_qty) : null;
    const diff = counted === null ? 0 : counted - (Number(it.system_qty) || 0);
    return { ...it, counted, diff, value: diff * (Number(it.cost_price) || 0) };
  });
  const varianceSummary = {
    lines: variances.filter((v) => v.diff !== 0).length,
    over: variances.filter((v) => v.diff > 0).reduce((s, v) => s + v.value, 0),
    short: variances.filter((v) => v.diff < 0).reduce((s, v) => s + v.value, 0),
  };

  const updateQty = (idx, value) => {
    setDraftItems((prev) =>
      (prev || openCount.items).map((it, i) =>
        i === idx ? { ...it, counted_qty: value === '' ? null : Math.max(0, Number(value) || 0) } : it
      )
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={closeSheet}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 shrink-0"
            title="กลับรายการใบตรวจนับ"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 font-mono">{openCount.count_number}</h1>
              <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_META[openCount.status].className}`}>
                {STATUS_META[openCount.status].label}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {openCount.scope_label} • นับแล้ว {countedCount}/{items.length} รายการ
              {openCount.submitted_by && ` • ส่งโดย ${openCount.submitted_by}`}
              {openCount.approved_by && ` • อนุมัติโดย ${openCount.approved_by}`}
            </p>
          </div>
        </div>
        <div className="relative lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา / ยิงบาร์โค้ดสินค้า..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {isCounting ? (
        // ===== หน้าจอนับ (Blind): ไม่แสดงยอดในระบบ =====
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800 flex items-center gap-1.5 shrink-0">
            <EyeOff className="w-3.5 h-3.5" />
            นับจากของจริงบนชั้นวาง ระบบจะไม่แสดงยอดคงเหลือในระหว่างนับ • ช่องที่เว้นว่าง = ไม่ปรับสต็อกรายการนั้น
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {visibleItems.map((it) => (
              <div key={it.product_id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{it.product_name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{it.barcode || it.sku}</div>
                </div>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  disabled={!canCount}
                  data-allow-scanner="false"
                  value={it.counted_qty ?? ''}
                  onChange={(e) => updateQty(it.idx, e.target.value)}
                  placeholder="จำนวน"
                  className={`w-24 px-2 py-1.5 rounded-lg border text-center text-sm font-extrabold ${
                    hasCount(it) ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-300'
                  }`}
                />
                <span className="w-12 text-[11px] text-slate-500">{it.unit}</span>
              </div>
            ))}
          </div>
          {canCount && (
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirm('cancel')}
                className="px-3 py-2 rounded-xl border border-rose-200 bg-white text-rose-600 text-xs font-bold flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                ยกเลิกใบนับ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => saveStockCountProgress(openCount, items)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                บันทึกชั่วคราว
              </button>
              <button
                type="button"
                disabled={busy || countedCount === 0}
                onClick={() => setConfirm('submit')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                ส่งผลนับ ({countedCount}/{items.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        // ===== หน้าตรวจผล: เทียบยอดในระบบกับยอดนับ =====
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          {!canApprove && openCount.status === 'submitted' ? (
            <div className="p-10 text-center text-sm text-slate-500">
              ส่งผลนับแล้ว รอผู้จัดการตรวจสอบและอนุมัติ (ผู้นับไม่เห็นผลต่าง)
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-slate-200 grid grid-cols-3 gap-2 text-center text-xs shrink-0">
                <div>
                  <div className="text-slate-500">รายการที่ไม่ตรง</div>
                  <div className="font-extrabold text-slate-900">{formatNumber(varianceSummary.lines)}</div>
                </div>
                <div>
                  <div className="text-slate-500">มูลค่าเกิน (ทุน)</div>
                  <div className="font-extrabold text-emerald-600">{formatCurrency(varianceSummary.over)}</div>
                </div>
                <div>
                  <div className="text-slate-500">มูลค่าขาด (ทุน)</div>
                  <div className="font-extrabold text-rose-600">{formatCurrency(varianceSummary.short)}</div>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
                    <tr>
                      <th className="py-2 px-3">สินค้า</th>
                      <th className="py-2 px-3 text-right">ยอดในระบบ</th>
                      <th className="py-2 px-3 text-right">นับได้</th>
                      <th className="py-2 px-3 text-right">ผลต่าง</th>
                      <th className="py-2 px-3 text-right">มูลค่าผลต่าง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {variances
                      .filter((v) => !q || `${v.product_name} ${v.sku} ${v.barcode}`.toLowerCase().includes(q))
                      .map((v) => (
                        <tr key={v.product_id} className={v.diff !== 0 ? 'bg-amber-50/40' : ''}>
                          <td className="py-2 px-3 font-bold text-slate-900">{v.product_name}</td>
                          <td className="py-2 px-3 text-right">{formatNumber(v.system_qty)} {v.unit}</td>
                          <td className="py-2 px-3 text-right">{v.counted === null ? 'ไม่ได้นับ' : `${formatNumber(v.counted)} ${v.unit}`}</td>
                          <td className={`py-2 px-3 text-right font-extrabold ${v.diff > 0 ? 'text-emerald-600' : v.diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {v.diff > 0 ? '+' : ''}{formatNumber(v.diff)}
                          </td>
                          <td className={`py-2 px-3 text-right ${v.value < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                            {formatCurrency(v.value)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {openCount.status === 'submitted' && canApprove && (
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirm('cancel')}
                    className="px-3 py-2 rounded-xl border border-rose-200 bg-white text-rose-600 text-xs font-bold flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    ไม่อนุมัติ / ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm('approve')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    อนุมัติและปรับสต็อก
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(confirm)}
        variant={confirm === 'cancel' ? 'danger' : 'warning'}
        title={
          confirm === 'submit'
            ? 'ส่งผลตรวจนับ?'
            : confirm === 'approve'
            ? 'อนุมัติและปรับสต็อก?'
            : 'ยกเลิกใบตรวจนับ?'
        }
        message={
          confirm === 'submit'
            ? `นับแล้ว ${countedCount} จาก ${items.length} รายการ รายการที่ไม่ได้นับจะไม่ถูกปรับสต็อก และแก้ไขผลนับไม่ได้หลังส่ง`
            : confirm === 'approve'
            ? `ระบบจะปรับสต็อก ${varianceSummary.lines} รายการตามผลต่าง และบันทึกใน Stock Ledger`
            : 'ใบตรวจนับนี้จะไม่ถูกนำไปปรับสต็อก'
        }
        confirmText={confirm === 'submit' ? 'ส่งผลนับ' : confirm === 'approve' ? 'อนุมัติ' : 'ยกเลิกใบนับ'}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
