import React, { useState, useMemo } from 'react';
import { ClipboardList, Search, Plus, ShoppingCart, X, AlertTriangle } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SalesOrderModal from '../components/salesOrder/SalesOrderModal';
import { SALES_ORDER_STATUS } from '../utils/salesOrders';
import { formatDateTime, formatNumber } from '../utils/formatters';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * ใบสั่งขายส่ง / จองสินค้า (Module 3: Reserved Stock & ATP)
 * จองสต็อกให้ลูกค้าส่งที่รอส่งของ แล้วเปิดเข้าหน้าขายเพื่อคิดเงินเมื่อพร้อมส่ง
 */
export default function SalesOrdersPage({ onGoToPOS }) {
  const { salesOrders = [], products, cancelSalesOrder, loadSalesOrderToCart, activeSalesOrder, can } = usePOS();
  const [statusFilter, setStatusFilter] = useState('reserved');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const canManage = can('sales_order');
  const today = new Date().toLocaleDateString('sv-SE');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salesOrders
      .filter((so) => statusFilter === 'all' || so.status === statusFilter)
      .filter(
        (so) =>
          !q ||
          `${so.so_number} ${so.customer_name} ${(so.items || []).map((i) => i.product_name).join(' ')}`
            .toLowerCase()
            .includes(q)
      )
      .sort((a, b) => {
        if (a.status === 'reserved' && b.status === 'reserved') {
          return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [salesOrders, statusFilter, search]);

  const reservedOrders = salesOrders.filter((so) => so.status === 'reserved');
  const overdueCount = reservedOrders.filter((so) => so.due_date && so.due_date < today).length;
  const reservedSkuCount = new Set(reservedOrders.flatMap((so) => (so.items || []).map((i) => i.master_product_id))).size;

  const handleOpenInPOS = (so) => {
    if (loadSalesOrderToCart(so)) onGoToPOS?.(so);
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
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900">ใบสั่งขายส่ง / จองสินค้า</h1>
              <p className="text-xs text-slate-500">จองสต็อกให้ลูกค้าที่รอส่งของ พร้อมขาย (ATP) = สต็อก - ยอดจอง</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative md:w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเลขใบ / ลูกค้า / สินค้า..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> สร้างใบสั่งขาย
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-[11px] font-bold text-amber-700">รอส่งของ</div>
            <div className="text-sm sm:text-lg font-extrabold text-amber-700">{reservedOrders.length} ใบ</div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <div className="text-[11px] font-bold text-rose-700">เลยกำหนดส่ง</div>
            <div className="text-sm sm:text-lg font-extrabold text-rose-700">{overdueCount} ใบ</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-600">สินค้าที่ถูกจอง</div>
            <div className="text-sm sm:text-lg font-extrabold text-slate-900">{reservedSkuCount} รายการ</div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0">
          {[['reserved', 'รอส่งของ'], ['fulfilled', 'เปิดบิลแล้ว'], ['cancelled', 'ยกเลิก'], ['all', 'ทั้งหมด']].map(([key, label]) => (
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
          ))}
        </div>
        <div className="flex-1 overflow-auto divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">ไม่มีใบสั่งขาย</div>
          ) : (
            rows.map((so) => {
              const status = SALES_ORDER_STATUS[so.status] || SALES_ORDER_STATUS.reserved;
              const overdue = so.status === 'reserved' && so.due_date && so.due_date < today;
              const shortItems = (so.items || []).filter((i) => {
                const p = products.find((x) => x.id === i.product_id);
                return !p || (Number(p.stock) || 0) < i.qty;
              });
              const isActive = activeSalesOrder?.id === so.id;
              return (
                <div key={so.id} className="p-3 flex flex-col lg:flex-row lg:items-center gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{so.so_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.className}`}>{status.label}</span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          อยู่ในตะกร้าหน้าขาย
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-800">{so.customer_name}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      {(so.items || []).map((i) => `${i.product_name} ${formatNumber(i.qty)} ${i.unit}`).join(' • ')}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      <span className={overdue ? 'text-rose-600 font-bold' : ''}>
                        {overdue && <AlertTriangle className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                        กำหนดส่ง {formatDate(so.due_date)}
                      </span>
                      {` • สร้างโดย ${so.created_by_name || '-'} ${formatDateTime(so.created_at)}`}
                      {so.order_number && ` • บิล ${so.order_number}`}
                      {so.cancelled_at && ` • ยกเลิกโดย ${so.cancelled_by_name || '-'}`}
                      {so.note && ` • ${so.note}`}
                    </div>
                    {so.status === 'reserved' && shortItems.length > 0 && (
                      <div className="text-[11px] text-rose-600 font-semibold">
                        สต็อกจริงไม่พอ: {shortItems.map((i) => i.product_name).join(', ')}
                      </div>
                    )}
                  </div>
                  {so.status === 'reserved' && canManage && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`ยกเลิกใบสั่งขาย ${so.so_number} และคืนยอดจอง?`)) cancelSalesOrder(so);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> ยกเลิก
                      </button>
                      <button
                        type="button"
                        disabled={isActive}
                        onClick={() => handleOpenInPOS(so)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" /> เปิดบิลขาย
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && <SalesOrderModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
