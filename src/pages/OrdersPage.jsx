import React, { useState, useMemo } from 'react';
import {
  Search,
  Receipt,
  Printer,
  Ban,
  Calendar,
  Sparkles,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import ReceiptModal from '../components/pos/ReceiptModal';
import TaxInvoiceModal from '../components/pos/TaxInvoiceModal';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { getOrderPayments, describeOrderPayments } from '../utils/payments';

const PAYMENT_BADGES = {
  cash: { label: 'เงินสด', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  promptpay: { label: 'QR PromptPay', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  transfer: { label: 'โอนธนาคาร', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  credit: { label: 'เครดิต/ค้างชำระ', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  split: { label: 'แบ่งจ่าย', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export default function OrdersPage() {
  const { orders, voidOrder, taxInvoices = [], can } = usePOS();
  const [taxInvoiceOrder, setTaxInvoiceOrder] = useState(null);
  const invoicedOrderNumbers = useMemo(
    () => new Set(taxInvoices.filter((t) => t.status !== 'cancelled').map((t) => t.order_number)),
    [taxInvoices]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | '7days'
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const todayStr = new Date().toDateString();

    return orders.filter((o) => {
      // บิลแบ่งจ่ายจะแสดงเมื่อกรองด้วยช่องทางใดก็ได้ที่ใช้ชำระในบิลนั้น
      if (
        paymentFilter !== 'all' &&
        o.payment_method !== paymentFilter &&
        !getOrderPayments(o).some((p) => p.method === paymentFilter)
      ) {
        return false;
      }

      if (dateFilter === 'today') {
        if (new Date(o.created_at).toDateString() !== todayStr) return false;
      } else if (dateFilter === '7days') {
        const diffDays = (now - new Date(o.created_at).getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }

      if (!q) return true;
      return (
        o.order_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        (o.items || []).some((i) => i.product_name?.toLowerCase().includes(q))
      );
    });
  }, [orders, searchQuery, dateFilter, paymentFilter]);

  const summary = useMemo(() => {
    const valid = filteredOrders.filter((o) => o.status === 'completed');
    return {
      count: valid.length,
      totalSales: valid.reduce((sum, o) => sum + (Number(o.grand_total) || 0), 0),
      totalSavings: valid.reduce(
        (sum, o) => sum + (Number(o.wholesale_savings) || 0),
        0
      ),
    };
  }, [filteredOrders]);

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 lg:pb-8 space-y-4">
      {/* สรุปยอดจากรายการบิลที่กรอง */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
            บิลที่สำเร็จ
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-0.5 sm:mt-1">
            {summary.count} <span className="text-[11px] font-normal text-slate-500">บิล</span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
            ยอดขายสุทธิรวม
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-indigo-600 mt-0.5 sm:mt-1 truncate">
            {formatCurrency(summary.totalSales)}
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
            ส่วนลดราคาส่ง
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-emerald-600 mt-0.5 sm:mt-1 truncate">
            {formatCurrency(summary.totalSavings)}
          </div>
        </div>
      </div>

      {/* ตัวกรองและค้นหาบิล */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาเลขที่บิล, ชื่อลูกค้า หรือชื่อสินค้า..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'today', label: 'วันนี้' },
              { id: '7days', label: '7 วัน' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateFilter(d.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  dateFilter === d.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="all">ทุกช่องทางชำระเงิน</option>
            <option value="cash">เงินสด (Cash)</option>
            <option value="promptpay">QR PromptPay</option>
            <option value="transfer">โอนเงินธนาคาร</option>
            <option value="credit">เครดิต/ค้างชำระ</option>
            <option value="split">แบ่งจ่ายหลายช่องทาง</option>
          </select>
        </div>
      </div>

      {/* มุมมองการ์ดบิลสำหรับหน้าจอมือถือ (md:hidden) */}
      <div className="md:hidden space-y-2.5">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-400">
            ไม่พบประวัติบิลขายที่ตรงกับเงื่อนไข
          </div>
        ) : (
          filteredOrders.map((order) => {
            const pBadge =
              PAYMENT_BADGES[order.payment_method] || PAYMENT_BADGES.cash;
            const isVoided = order.status === 'voided';
            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border border-slate-200/90 p-3.5 space-y-2.5 ${
                  isVoided ? 'opacity-60 bg-slate-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs text-indigo-700">
                        {order.order_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${pBadge.cls}`}
                      >
                        {pBadge.label}
                      </span>
                      {isVoided && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          ยกเลิกแล้ว
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-1">
                      {order.customer_name || 'ลูกค้าทั่วไป'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatDateTime(order.created_at)}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold text-slate-900">
                      {formatCurrency(order.grand_total)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {(order.items || []).length} รายการ
                    </div>
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl truncate">
                    {order.items
                      .map((i) => `${i.product_name} x${i.quantity}`)
                      .join(' • ')}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>สั่งพิมพ์</span>
                    </button>

                    {(!isVoided ||
                      invoicedOrderNumbers.has(order.order_number)) &&
                      can('issue_tax_invoice') && (
                        <button
                          type="button"
                          onClick={() => setTaxInvoiceOrder(order)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                            invoicedOrderNumbers.has(order.order_number)
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>ใบกำกับ</span>
                        </button>
                      )}
                  </div>

                  {!isVoided && can('void_order') && (
                    <button
                      type="button"
                      onClick={() => voidOrder(order)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="ยกเลิกบิล"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* รายการบิลขายแบบตาราง (สำหรับหน้าจอ Tablet / Desktop ขึ้นไป) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">เลขที่ใบเสร็จ / เวลา</th>
                <th className="py-3.5 px-3">ลูกค้า</th>
                <th className="py-3.5 px-3 hidden md:table-cell">รายการสินค้า</th>
                <th className="py-3.5 px-3 text-center">วิธีชำระ</th>
                <th className="py-3.5 px-3 text-right">ยอดสุทธิ</th>
                <th className="py-3.5 px-3 text-center">สถานะ</th>
                <th className="py-3.5 px-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-xs sm:text-sm">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    ไม่พบประวัติบิลขายที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const pBadge =
                    PAYMENT_BADGES[order.payment_method] || PAYMENT_BADGES.cash;
                  const isVoided = order.status === 'voided';
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isVoided ? 'opacity-50 bg-slate-50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-indigo-700">
                          {order.order_number}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatDateTime(order.created_at)}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-medium text-slate-800">
                        <div>{order.customer_name || 'ลูกค้าทั่วไป'}</div>
                        {Number(order.wholesale_savings) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                            <Sparkles className="w-2.5 h-2.5" />
                            ได้ลดราคาส่ง {formatCurrency(order.wholesale_savings)}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 hidden md:table-cell text-xs text-slate-600 max-w-xs">
                        <div className="truncate">
                          {(order.items || [])
                            .map((i) => `${i.product_name} (x${i.quantity})`)
                            .join(', ')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          รวม {(order.items || []).length} รายการ
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${pBadge.cls}`}
                        >
                          {pBadge.label}
                        </span>
                        {order.payment_method === 'split' && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {describeOrderPayments(order, formatCurrency)}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right font-extrabold text-slate-900">
                        {formatCurrency(order.grand_total)}
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        {isVoided ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                            <XCircle className="w-3 h-3" />
                            ยกเลิกแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            สำเร็จ
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>สั่งพิมพ์</span>
                          </button>

                          {/* บิลที่ยกเลิกแต่มีใบกำกับแล้ว ยังเปิดได้เพื่อออกใบลดหนี้ */}
                          {(!isVoided || invoicedOrderNumbers.has(order.order_number)) &&
                            can('issue_tax_invoice') && (
                            <button
                              type="button"
                              onClick={() => setTaxInvoiceOrder(order)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                invoicedOrderNumbers.has(order.order_number)
                                  ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                  : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                              }`}
                              title={
                                invoicedOrderNumbers.has(order.order_number)
                                  ? 'ออกใบกำกับภาษีแล้ว (พิมพ์ซ้ำ)'
                                  : 'ออกใบกำกับภาษีเต็มรูป'
                              }
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}

                          {!isVoided && can('void_order') && (
                            <button
                              type="button"
                              onClick={() => voidOrder(order)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="ยกเลิกบิลและคืนสต็อกสินค้า"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ดูใบเสร็จย้อนหลังและสั่งพิมพ์ซ้ำ */}
      <ReceiptModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
      <TaxInvoiceModal order={taxInvoiceOrder} onClose={() => setTaxInvoiceOrder(null)} />
    </div>
  );
}

