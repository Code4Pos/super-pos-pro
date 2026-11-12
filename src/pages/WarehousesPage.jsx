import React, { useState, useMemo } from 'react';
import { Warehouse, Search, ArrowRightLeft, AlertTriangle, Check, X, Plus, Edit3 } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import StockTransferModal from '../components/warehouse/StockTransferModal';
import {
  SALES_WAREHOUSE_ID,
  TRANSIT_WAREHOUSE_ID,
  WAREHOUSE_TYPES,
  TRANSFER_STATUS,
  getProductWarehouseQty,
  summarizeWarehouses,
} from '../utils/warehouses';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

/**
 * คลังสินค้า & โอนย้าย (Module 3)
 * - ยอดคงเหลือแยกตามคลัง (หน้าร้าน = สต็อกรวม - คลังอื่น - ระหว่างโอน)
 * - ใบโอนแบบ 2 ขั้น: ส่งออก (ระหว่างโอน) → ยืนยันรับเข้า
 * - จัดการรายชื่อคลัง
 */
export default function WarehousesPage() {
  const {
    products,
    warehouses = [],
    inventoryBalances = [],
    stockTransfers = [],
    saveWarehouse,
    changeStockTransferStatus,
    can,
  } = usePOS();
  const [viewMode, setViewMode] = useState('balances'); // 'balances' | 'transfers' | 'warehouses'
  const [search, setSearch] = useState('');
  const [onlyNegative, setOnlyNegative] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('in_transit');
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const canTransfer = can('transfer_stock');
  const canManage = can('manage_warehouses');

  const activeWarehouses = warehouses.filter((w) => w.is_active !== false);
  const warehouseName = (id) =>
    id === TRANSIT_WAREHOUSE_ID ? 'ระหว่างโอน' : warehouses.find((w) => w.id === id)?.name || id;

  const summary = useMemo(
    () => summarizeWarehouses(products, inventoryBalances, warehouses),
    [products, inventoryBalances, warehouses]
  );

  const balanceRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !p.linked_product_id)
      .filter((p) => !q || `${p.name} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(q))
      .map((p) => ({ product: p, qty: getProductWarehouseQty(p, inventoryBalances, warehouses) }))
      .filter((row) => !onlyNegative || row.qty[SALES_WAREHOUSE_ID] < 0);
  }, [products, inventoryBalances, warehouses, search, onlyNegative]);

  const transferRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockTransfers
      .filter((t) => statusFilter === 'all' || t.status === statusFilter)
      .filter(
        (t) =>
          !q ||
          `${t.transfer_number} ${(t.items || []).map((i) => i.product_name).join(' ')}`.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [stockTransfers, statusFilter, search]);

  const inTransitCount = stockTransfers.filter((t) => t.status === 'in_transit').length;
  const hasTransit = (summary[TRANSIT_WAREHOUSE_ID]?.qty || 0) !== 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">คลังสินค้า & โอนย้าย</h1>
              <p className="text-xs text-slate-500">ขายและปรับสต็อกตัดจากคลังหน้าร้าน โอนเติมจากคลังอื่นแบบยืนยันรับ 2 ขั้น</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative md:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={viewMode === 'transfers' ? 'ค้นหาเลขใบโอน / สินค้า...' : 'ค้นหาสินค้า...'}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 overflow-x-auto">
              {[
                ['balances', 'ยอดตามคลัง'],
                ['transfers', `ใบโอน${inTransitCount ? ` (${inTransitCount})` : ''}`],
                ['warehouses', 'รายชื่อคลัง'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                    viewMode === id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {canTransfer && (
              <button
                type="button"
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
              >
                <ArrowRightLeft className="w-4 h-4" />
                โอนสินค้า
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...activeWarehouses, ...(hasTransit ? [{ id: TRANSIT_WAREHOUSE_ID, name: 'ระหว่างโอน', code: 'TRANSIT' }] : [])].map(
            (w) => {
              const s = summary[w.id] || { skuCount: 0, value: 0, negativeCount: 0 };
              return (
                <div
                  key={w.id}
                  className={`p-2.5 rounded-xl border ${
                    w.id === TRANSIT_WAREHOUSE_ID ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-700 truncate">{w.name}</span>
                    {w.id === SALES_WAREHOUSE_ID && (
                      <span className="text-[10px] px-1.5 rounded bg-indigo-100 text-indigo-700 font-bold shrink-0">คลังขาย</span>
                    )}
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">{formatCurrency(s.value)}</div>
                  <div className="text-[11px] text-slate-500">
                    {s.skuCount} รายการ
                    {s.negativeCount > 0 && <span className="text-rose-600 font-bold"> • ติดลบ {s.negativeCount}</span>}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>

      {viewMode === 'balances' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={onlyNegative} onChange={(e) => setOnlyNegative(e.target.checked)} />
              เฉพาะสินค้าที่หน้าร้านติดลบ (ต้องโอนเติม)
            </label>
            <span className="text-[11px] text-slate-500">{balanceRows.length} รายการ</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">สินค้า</th>
                  {activeWarehouses.map((w) => (
                    <th key={w.id} className="text-right px-3 py-2 font-bold whitespace-nowrap">{w.name}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-bold whitespace-nowrap">ระหว่างโอน</th>
                  <th className="text-right px-3 py-2 font-bold whitespace-nowrap">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balanceRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeWarehouses.length + 3} className="p-8 text-center text-slate-400">
                      ไม่พบสินค้า
                    </td>
                  </tr>
                ) : (
                  balanceRows.map(({ product, qty }) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{product.name}</div>
                        <div className="text-[11px] text-slate-400">{product.sku || '-'}</div>
                      </td>
                      {activeWarehouses.map((w) => {
                        const value = qty[w.id] || 0;
                        return (
                          <td
                            key={w.id}
                            className={`px-3 py-2 text-right font-semibold ${
                              value < 0 ? 'text-rose-600' : value === 0 ? 'text-slate-300' : 'text-slate-800'
                            }`}
                          >
                            {value < 0 && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                            {formatNumber(value)}
                          </td>
                        );
                      })}
                      <td className={`px-3 py-2 text-right ${qty[TRANSIT_WAREHOUSE_ID] ? 'text-amber-700 font-bold' : 'text-slate-300'}`}>
                        {formatNumber(qty[TRANSIT_WAREHOUSE_ID] || 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {formatNumber(product.stock)} <span className="text-[11px] font-normal text-slate-500">{product.unit}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'transfers' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="p-3 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0">
            {[['in_transit', 'ระหว่างโอน'], ['received', 'รับเข้าแล้ว'], ['cancelled', 'ยกเลิก'], ['all', 'ทั้งหมด']].map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    statusFilter === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
          <div className="flex-1 overflow-auto divide-y divide-slate-100">
            {transferRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">ไม่มีใบโอน</div>
            ) : (
              transferRows.map((t) => {
                const status = TRANSFER_STATUS[t.status] || TRANSFER_STATUS.in_transit;
                return (
                  <div key={t.id} className="p-3 flex flex-col lg:flex-row lg:items-center gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{t.transfer_number}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.className}`}>{status.label}</span>
                        <span className="text-xs text-slate-700 font-semibold">
                          {warehouseName(t.from_warehouse_id)} → {warehouseName(t.to_warehouse_id)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {(t.items || []).map((i) => `${i.product_name} ${formatNumber(i.qty)} ${i.unit}`).join(' • ')}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ส่งโดย {t.created_by_name || '-'} {formatDateTime(t.created_at)}
                        {t.received_at && ` • รับโดย ${t.received_by_name || '-'} ${formatDateTime(t.received_at)}`}
                        {t.cancelled_at && ` • ยกเลิกโดย ${t.cancelled_by_name || '-'} ${formatDateTime(t.cancelled_at)}`}
                        {t.note && ` • ${t.note}`}
                      </div>
                    </div>
                    {t.status === 'in_transit' && canTransfer && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`ยกเลิกใบโอน ${t.transfer_number} และคืนสินค้ากลับคลังต้นทาง?`)) {
                              changeStockTransferStatus(t, 'cancelled');
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => changeStockTransferStatus(t, 'received')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> ยืนยันรับเข้า
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {viewMode === 'warehouses' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-600">คลังหน้าร้านเป็นคลังขาย (ปิดใช้งานไม่ได้)</span>
            {canManage && (
              <button
                type="button"
                onClick={() => setEditingWarehouse({ code: '', name: '', type: 'backstore', is_active: true })}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มคลัง
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto divide-y divide-slate-100">
            {editingWarehouse && (
              <div className="p-3 bg-indigo-50/50 grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                <input
                  value={editingWarehouse.code}
                  onChange={(e) => setEditingWarehouse((w) => ({ ...w, code: e.target.value.toUpperCase() }))}
                  placeholder="รหัส"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                />
                <input
                  value={editingWarehouse.name}
                  onChange={(e) => setEditingWarehouse((w) => ({ ...w, name: e.target.value }))}
                  placeholder="ชื่อคลัง"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs sm:col-span-2"
                />
                <select
                  value={editingWarehouse.type}
                  disabled={editingWarehouse.id === SALES_WAREHOUSE_ID}
                  onChange={(e) => setEditingWarehouse((w) => ({ ...w, type: e.target.value }))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {Object.entries(WAREHOUSE_TYPES).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingWarehouse(null)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 bg-white"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await saveWarehouse(editingWarehouse)) setEditingWarehouse(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            )}
            {warehouses.map((w) => {
              const s = summary[w.id] || { skuCount: 0, value: 0 };
              const hasStock = s.skuCount > 0;
              return (
                <div key={w.id} className="p-3 flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-500 w-16 shrink-0">{w.code}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold ${w.is_active === false ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{w.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {WAREHOUSE_TYPES[w.type] || '-'} • {s.skuCount} รายการ • {formatCurrency(s.value)}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1.5 shrink-0">
                      {w.id !== SALES_WAREHOUSE_ID && (
                        <button
                          type="button"
                          disabled={w.is_active !== false && hasStock}
                          title={w.is_active !== false && hasStock ? 'ต้องโอนสินค้าออกให้หมดก่อนปิดใช้งาน' : ''}
                          onClick={() => saveWarehouse({ ...w, is_active: w.is_active === false })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {w.is_active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingWarehouse({ ...w })}
                        className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showTransferModal && <StockTransferModal onClose={() => setShowTransferModal(false)} />}
    </div>
  );
}
