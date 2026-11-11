import React, { useState, useMemo } from 'react';
import { CalendarClock, Search, AlertTriangle, Edit3, Check, X, RefreshCw } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import {
  LOT_STRATEGIES,
  NEAR_EXPIRY_DAYS,
  getExpiryStatus,
  daysUntilExpiry,
  summarizeLotsByProduct,
} from '../utils/lots';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

const EXPIRY_META = {
  expired: { label: 'หมดอายุแล้ว', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  near: { label: `ใกล้หมดอายุ (≤${NEAR_EXPIRY_DAYS} วัน)`, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ok: { label: 'ปกติ', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  none: { label: 'ไม่ระบุวันหมดอายุ', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function formatExpiry(dateStr) {
  if (!dateStr) return '-';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Lot / วันหมดอายุ (Module 2)
 * - รายการล็อตคงเหลือพร้อมเตือนสินค้าหมดอายุ/ใกล้หมดอายุ
 * - ตั้งค่าสินค้าที่ติดตาม Lot และกลยุทธ์ตัดสต็อก FEFO/FIFO
 */
export default function LotsPage() {
  const { products, productLots = [], updateLotSettings, reconcileProductLots, updateLotDetails, can } = usePOS();
  const [viewMode, setViewMode] = useState('lots'); // 'lots' | 'settings'
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [editing, setEditing] = useState(null); // { id, lot_number, expiry_date }
  const canEdit = can('adjust_stock');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const masterProducts = useMemo(() => products.filter((p) => !p.linked_product_id), [products]);
  const lotTotals = useMemo(() => summarizeLotsByProduct(productLots), [productLots]);

  const lotsWithStatus = useMemo(
    () =>
      productLots
        .filter((l) => productById.get(l.product_id)?.track_lots)
        .map((l) => ({ ...l, status: getExpiryStatus(l), days: daysUntilExpiry(l) })),
    [productLots, productById]
  );

  const activeLots = lotsWithStatus.filter((l) => l.remaining_qty > 0);
  const summary = {
    expired: activeLots.filter((l) => l.status === 'expired'),
    near: activeLots.filter((l) => l.status === 'near'),
    tracked: masterProducts.filter((p) => p.track_lots).length,
  };

  const visibleLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lotsWithStatus
      .filter((l) => showEmpty || l.remaining_qty > 0)
      .filter((l) => statusFilter === 'all' || l.status === statusFilter)
      .filter((l) => !q || `${l.product_name} ${l.lot_number}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const ea = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
        const eb = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
        return ea - eb;
      });
  }, [lotsWithStatus, showEmpty, statusFilter, search]);

  const settingsRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return masterProducts.filter((p) => !q || `${p.name} ${p.sku || ''}`.toLowerCase().includes(q));
  }, [masterProducts, search]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">Lot / วันหมดอายุ</h1>
              <p className="text-xs text-slate-500">ตัดสต็อกอัตโนมัติตาม FEFO หรือ FIFO ของแต่ละสินค้า</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาสินค้า หรือเลขล็อต..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              {[
                ['lots', 'ล็อตคงเหลือ'],
                ['settings', 'ตั้งค่าสินค้า'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    viewMode === id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <div className="text-[11px] font-bold text-rose-700">หมดอายุแล้ว</div>
            <div className="text-sm sm:text-lg font-extrabold text-rose-700">{summary.expired.length} ล็อต</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-[11px] font-bold text-amber-700">ใกล้หมดอายุ</div>
            <div className="text-sm sm:text-lg font-extrabold text-amber-700">{summary.near.length} ล็อต</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-600">สินค้าที่ติดตาม Lot</div>
            <div className="text-sm sm:text-lg font-extrabold text-slate-900">{summary.tracked} รายการ</div>
          </div>
        </div>
      </div>

      {viewMode === 'lots' ? (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="p-3 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0">
            {['all', 'expired', 'near', 'ok', 'none'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {key === 'all' ? 'ทั้งหมด' : EXPIRY_META[key].label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={(e) => setShowEmpty(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              แสดงล็อตที่ใช้หมดแล้ว
            </label>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[860px] text-xs">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">สินค้า</th>
                  <th className="py-2.5 px-3">เลขล็อต</th>
                  <th className="py-2.5 px-3">วันหมดอายุ</th>
                  <th className="py-2.5 px-3 text-right">คงเหลือ / รับเข้า</th>
                  <th className="py-2.5 px-3 text-right">มูลค่าคงเหลือ</th>
                  <th className="py-2.5 px-3">รับเข้าเมื่อ</th>
                  <th className="py-2.5 px-3 text-center">แก้ไข</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {visibleLots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-400">
                      {summary.tracked === 0
                        ? 'ยังไม่มีสินค้าที่ติดตาม Lot (เปิดได้ที่แท็บ "ตั้งค่าสินค้า")'
                        : 'ไม่มีล็อตในกลุ่มนี้'}
                    </td>
                  </tr>
                ) : (
                  visibleLots.map((l) => {
                    const unit = productById.get(l.product_id)?.unit || '';
                    const isEditing = editing?.id === l.id;
                    return (
                      <tr key={l.id} className={l.remaining_qty <= 0 ? 'opacity-50' : 'hover:bg-indigo-50/30'}>
                        <td className="py-2 px-3 font-bold text-slate-900">{l.product_name}</td>
                        <td className="py-2 px-3 font-mono">
                          {isEditing ? (
                            <input
                              type="text"
                              data-allow-scanner="false"
                              value={editing.lot_number}
                              onChange={(e) => setEditing({ ...editing, lot_number: e.target.value })}
                              className="w-28 px-2 py-1 rounded-lg border border-slate-300"
                            />
                          ) : (
                            l.lot_number
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editing.expiry_date || ''}
                              onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })}
                              className="px-2 py-1 rounded-lg border border-slate-300"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{formatExpiry(l.expiry_date)}</span>
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${EXPIRY_META[l.status].className}`}>
                                {l.status === 'expired'
                                  ? `เลยมา ${Math.abs(l.days)} วัน`
                                  : l.status === 'none'
                                  ? 'ไม่ระบุ'
                                  : `อีก ${l.days} วัน`}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <strong>{formatNumber(l.remaining_qty)}</strong> / {formatNumber(l.received_qty)} {unit}
                        </td>
                        <td className="py-2 px-3 text-right">{formatCurrency(l.remaining_qty * (Number(l.cost_price) || 0))}</td>
                        <td className="py-2 px-3 text-slate-600">
                          {formatDateTime(l.received_at)}
                          {l.reference_doc && <div className="text-[10px] font-mono text-slate-400">{l.reference_doc}</div>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {canEdit &&
                            (isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateLotDetails(l.id, editing);
                                    setEditing(null);
                                  }}
                                  className="p-1.5 rounded-lg bg-emerald-600 text-white"
                                  title="บันทึก"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500"
                                  title="ยกเลิก"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditing({ id: l.id, lot_number: l.lot_number, expiry_date: l.expiry_date })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600"
                                title="แก้ไขเลขล็อต / วันหมดอายุ"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">สินค้า</th>
                <th className="py-2.5 px-3 text-center">ติดตาม Lot</th>
                <th className="py-2.5 px-3">กลยุทธ์ตัดสต็อก</th>
                <th className="py-2.5 px-3 text-right">สต็อก / ยอดล็อตรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {settingsRows.map((p) => {
                const lotTotal = lotTotals.get(p.id) || 0;
                const mismatch = p.track_lots && Math.abs(lotTotal - (Number(p.stock) || 0)) > 0.0001;
                return (
                  <tr key={p.id} className="hover:bg-indigo-50/30">
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{p.sku}</div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={Boolean(p.track_lots)}
                        onChange={(e) =>
                          updateLotSettings(p.id, { track_lots: e.target.checked, lot_strategy: p.lot_strategy || 'FEFO' })
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        disabled={!canEdit || !p.track_lots}
                        value={p.lot_strategy || 'FEFO'}
                        onChange={(e) => updateLotSettings(p.id, { track_lots: p.track_lots, lot_strategy: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold disabled:opacity-50"
                      >
                        {Object.entries(LOT_STRATEGIES).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {formatNumber(p.stock)} {p.unit}
                      {p.track_lots && (
                        <div className={mismatch ? 'text-rose-600 font-bold flex items-center justify-end gap-1' : 'text-slate-400'}>
                          {mismatch && <AlertTriangle className="w-3 h-3" />}
                          ล็อตรวม {formatNumber(lotTotal)}
                          {mismatch && canEdit && (
                            <button
                              type="button"
                              onClick={() => reconcileProductLots(p.id)}
                              className="ml-1 px-1.5 py-0.5 rounded border border-rose-300 bg-white text-rose-600 flex items-center gap-0.5"
                              title="ปรับยอดล็อตให้เท่าสต็อก"
                            >
                              <RefreshCw className="w-3 h-3" />
                              ปรับให้ตรง
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
