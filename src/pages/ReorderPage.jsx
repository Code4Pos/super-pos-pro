import React, { useState, useMemo } from 'react';
import { ClipboardList, Building2, FilePlus2, Search } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SearchableDropdown from '../components/common/SearchableDropdown';
import { calculateReorderSuggestions, REORDER_DEFAULTS } from '../utils/reorder';
import { formatCurrency, formatNumber } from '../utils/formatters';

const STATUS_META = {
  reorder: { label: 'ต้องสั่งซื้อ', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  near: { label: 'ใกล้ถึงจุดสั่งซื้อ', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ok: { label: 'สต็อกเพียงพอ', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/**
 * หน้าแนะนำสั่งซื้อ (Reorder Point) และสร้างใบสั่งซื้อ (PO)
 * ROP = (ยอดขายเฉลี่ยต่อวัน x ระยะเวลารอสินค้า) + สต็อกสำรอง
 * ใบสั่งซื้อจะถูกสร้างเป็นใบนำเข้าสถานะ "รออนุมัติ" (ยังไม่เพิ่มสต็อก) แล้วรับของผ่านหน้านำเข้าสินค้า
 */
export default function ReorderPage() {
  const { products, orders, suppliers = [], createStockImport, updateReorderSettings, showToast } =
    usePOS();
  const [statusFilter, setStatusFilter] = useState('reorder');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({}); // { [productId]: qty }
  const [supplierId, setSupplierId] = useState('');
  const [creating, setCreating] = useState(false);

  const suggestions = useMemo(
    () => calculateReorderSuggestions(products, orders),
    [products, orders]
  );

  const counts = useMemo(() => {
    const c = { all: suggestions.length, reorder: 0, near: 0, ok: 0 };
    suggestions.forEach((s) => {
      c[s.status] += 1;
    });
    return c;
  }, [suggestions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suggestions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return `${s.product.name} ${s.product.sku || ''} ${s.product.barcode || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [suggestions, statusFilter, search]);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name, badge: s.phone || '' })),
    [suppliers]
  );

  const selectedRows = suggestions.filter((s) => selected[s.product.id] !== undefined);
  const poTotal = selectedRows.reduce(
    (sum, s) => sum + (Number(selected[s.product.id]) || 0) * (Number(s.product.cost_price) || 0),
    0
  );

  const toggleRow = (s) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[s.product.id] !== undefined) delete next[s.product.id];
      else next[s.product.id] = s.suggestedQty || 1;
      return next;
    });
  };

  // เลือกทุกรายการที่ต้องสั่งซื้อพร้อมจำนวนแนะนำ
  const selectAllReorder = () => {
    const next = {};
    suggestions
      .filter((s) => s.status === 'reorder')
      .forEach((s) => {
        next[s.product.id] = s.suggestedQty;
      });
    setSelected(next);
  };

  const handleSettingBlur = (product, field, value) => {
    const current = product[field];
    const normalized = value === '' ? null : Math.max(0, Number(value) || 0);
    if ((current ?? null) === normalized) return;
    updateReorderSettings(product.id, {
      lead_time_days: field === 'lead_time_days' ? normalized : product.lead_time_days,
      safety_stock: field === 'safety_stock' ? normalized : product.safety_stock,
    });
  };

  const handleCreatePO = async () => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) {
      showToast('กรุณาเลือกผู้ผลิตสำหรับใบสั่งซื้อ', 'error');
      return;
    }
    const items = selectedRows
      .map((s, idx) => {
        const p = s.product;
        const qty = Math.max(0, Math.floor(Number(selected[p.id]) || 0));
        const cost = Number(p.cost_price) || 0;
        return {
          row_id: `po-row-${Date.now()}-${idx}`,
          product_id: p.id,
          barcode_or_sku: p.barcode?.trim() ? p.barcode.trim() : p.sku,
          barcode: p.barcode || '',
          sku: p.sku || '',
          product_name: p.name,
          unit: p.unit || 'ชิ้น',
          retail_price: Number(p.retail_price) || 0,
          quantity: qty,
          import_price: cost,
          total_discount: 0,
          line_total: Math.round(qty * cost * 100) / 100,
        };
      })
      .filter((it) => it.quantity > 0);
    if (items.length === 0) {
      showToast('กรุณาเลือกสินค้าและระบุจำนวนสั่งซื้อ', 'error');
      return;
    }
    setCreating(true);
    try {
      await createStockImport({
        supplier,
        items,
        note: 'ใบสั่งซื้อ (PO) จากระบบแนะนำสั่งซื้อ',
        status: 'pending',
      });
      setSelected({});
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
                แนะนำสั่งซื้อ & ใบสั่งซื้อ (PO)
              </h1>
              <p className="text-xs text-slate-500">
                จุดสั่งซื้อ = ยอดขายเฉลี่ย/วัน ({REORDER_DEFAULTS.demandDays} วันล่าสุด) × ระยะรอสินค้า + สต็อกสำรอง
              </p>
            </div>
          </div>
          <div className="relative md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {['reorder', 'near', 'ok', 'all'].map((key) => (
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
              {key === 'all' ? 'ทั้งหมด' : STATUS_META[key].label} ({counts[key]})
            </button>
          ))}
          <button
            type="button"
            onClick={selectAllReorder}
            className="ml-auto px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold whitespace-nowrap"
          >
            เลือกทุกรายการที่ต้องสั่ง
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[940px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
              <tr>
                <th className="py-2.5 px-3 w-10" />
                <th className="py-2.5 px-3">สินค้า</th>
                <th className="py-2.5 px-3 text-right">คงเหลือ</th>
                <th className="py-2.5 px-3 text-right">ขาย/วัน</th>
                <th className="py-2.5 px-3 text-center w-24">รอสินค้า (วัน)</th>
                <th className="py-2.5 px-3 text-center w-24">สต็อกสำรอง</th>
                <th className="py-2.5 px-3 text-right">จุดสั่งซื้อ</th>
                <th className="py-2.5 px-3 text-right">พอขายอีก</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3 text-center w-28">จำนวนสั่ง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-400">
                    ไม่มีสินค้าในกลุ่มนี้
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const p = s.product;
                  const isSelected = selected[p.id] !== undefined;
                  const meta = STATUS_META[s.status];
                  return (
                    <tr key={p.id} className={isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(s)}
                          className="w-4 h-4 accent-indigo-600"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {p.sku} • ทุน {formatCurrency(p.cost_price)}/{p.unit}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                        {formatNumber(s.stock)} {p.unit}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        {s.dailyDemand.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          key={`lt-${p.id}-${p.lead_time_days ?? ''}`}
                          type="number"
                          min="0"
                          defaultValue={p.lead_time_days ?? ''}
                          placeholder={String(REORDER_DEFAULTS.leadTimeDays)}
                          onBlur={(e) => handleSettingBlur(p, 'lead_time_days', e.target.value)}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center text-xs"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          key={`ss-${p.id}-${p.safety_stock ?? ''}`}
                          type="number"
                          min="0"
                          defaultValue={p.safety_stock ?? ''}
                          placeholder={String(p.min_stock ?? 0)}
                          onBlur={(e) => handleSettingBlur(p, 'safety_stock', e.target.value)}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center text-xs"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-extrabold text-slate-900">
                        {formatNumber(s.reorderPoint)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                        {Number.isFinite(s.daysOfStock) ? `${Math.floor(s.daysOfStock)} วัน` : 'ไม่มียอดขาย'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {isSelected ? (
                          <input
                            type="number"
                            min="1"
                            value={selected[p.id]}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="w-20 px-2 py-1 rounded-lg border border-indigo-400 text-center text-xs font-extrabold"
                          />
                        ) : (
                          <span className="text-slate-400">
                            {s.suggestedQty > 0 ? `แนะนำ ${formatNumber(s.suggestedQty)}` : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* แถบสร้างใบสั่งซื้อ */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            เลือก <strong className="text-slate-900">{selectedRows.length}</strong> รายการ • มูลค่าโดยประมาณ{' '}
            <strong className="text-indigo-700">{formatCurrency(poTotal)}</strong> (ราคาทุนปัจจุบัน)
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="sm:w-72">
              <SearchableDropdown
                value={supplierId}
                onChange={(val) => setSupplierId(val)}
                options={supplierOptions}
                icon={Building2}
                placeholder="เลือกผู้ผลิต..."
              />
            </div>
            <button
              type="button"
              disabled={creating || selectedRows.length === 0 || !supplierId}
              onClick={handleCreatePO}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{creating ? 'กำลังสร้าง...' : 'สร้างใบสั่งซื้อ (PO)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
