import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Sparkles,
  Award,
  AlertTriangle,
  ArrowRight,
  CreditCard,
  CalendarDays,
  Loader2,
  WifiOff,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { getMinStock, isLowStock, getNegativeStockProducts } from '../utils/stockAlerts';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { getOrderPayments } from '../utils/payments';

// ช่วงเวลาของแดชบอร์ด (คำนวณจากวันที่ท้องถิ่น)
const RANGE_OPTIONS = [
  { id: 'today', label: 'วันนี้' },
  { id: '7d', label: '7 วัน' },
  { id: '30d', label: '30 วัน' },
  { id: 'thisMonth', label: 'เดือนนี้' },
  { id: 'lastMonth', label: 'เดือนที่แล้ว' },
];

function getRangeBounds(rangeId, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const tomorrow = new Date(startOfDay(now).getTime() + 86400000);
  switch (rangeId) {
    case '7d':
      return { start: new Date(tomorrow.getTime() - 7 * 86400000), end: tomorrow };
    case '30d':
      return { start: new Date(tomorrow.getTime() - 30 * 86400000), end: tomorrow };
    case 'thisMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: tomorrow };
    case 'lastMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    default:
      return { start: startOfDay(now), end: tomorrow };
  }
}

// คอลัมน์ที่แดชบอร์ดใช้ (รวมรายการสินค้าเพื่อหาสินค้าขายดี)
const DASHBOARD_ORDER_COLUMNS =
  'id, order_number, status, grand_total, total_cost, wholesale_savings, pricing_mode, payment_method, payments, items, created_at';

export default function DashboardPage({ onNavigate }) {
  const { orders, products, printerSettings, fetchOrdersInRange, dbMode } = usePOS();
  const defaultMinStock = printerSettings?.defaultMinStock;

  // บิลทั้งหมดในช่วงที่เลือก (โหลดจากฐานข้อมูล ไม่จำกัดแค่บิลล่าสุด 200 ใบ)
  const [rangeId, setRangeId] = useState('today');
  const [rangeOrders, setRangeOrders] = useState(null);
  const [loadingRange, setLoadingRange] = useState(false);
  const [offlineData, setOfflineData] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const { start, end } = getRangeBounds(rangeId);
    setLoadingRange(true);
    setLoadError('');
    fetchOrdersInRange(start, end, DASHBOARD_ORDER_COLUMNS)
      .then((res) => {
        if (cancelled) return;
        setRangeOrders(res.orders);
        setOfflineData(res.offline);
      })
      .catch((err) => {
        if (cancelled) return;
        // โหลดไม่ได้: ใช้บิลที่โหลดไว้ตอนเปิดหลังร้านที่อยู่ในช่วงนี้แทน
        setRangeOrders(
          orders.filter((o) => {
            const d = new Date(o.created_at);
            return d >= start && d < end;
          })
        );
        setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingRange(false);
      });
    return () => {
      cancelled = true;
    };
    // orders ใช้เป็นข้อมูลสำรองเท่านั้น ไม่ต้องโหลดใหม่ทุกครั้งที่บิลล่าสุดเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeId, fetchOrdersInRange]);

  const analytics = useMemo(() => {
    const validOrders = (rangeOrders || []).filter((o) => o.status === 'completed');

    let totalRevenue = 0;
    let totalCost = 0;
    let totalWholesaleSavings = 0;
    let wholesaleOrderCount = 0;

    const paymentMap = {
      cash: 0,
      promptpay: 0,
      transfer: 0,
      credit: 0,
    };

    const productSalesMap = {};

    validOrders.forEach((order) => {
      const rev = Number(order.grand_total) || 0;
      const cost = Number(order.total_cost) || 0;
      const sav = Number(order.wholesale_savings) || 0;

      totalRevenue += rev;
      totalCost += cost;
      totalWholesaleSavings += sav;

      if (sav > 0 || order.pricing_mode === 'wholesale') {
        wholesaleOrderCount += 1;
      }

      // บิลแบ่งจ่ายกระจายยอดเข้าแต่ละช่องทางตามจริง
      getOrderPayments(order).forEach((p) => {
        paymentMap[p.method] = (paymentMap[p.method] || 0) + (Number(p.amount) || 0);
      });

      (order.items || []).forEach((item) => {
        const key = item.product_id || item.sku || item.product_name;
        if (!productSalesMap[key]) {
          productSalesMap[key] = {
            name: item.product_name,
            unit: item.unit || 'ชิ้น',
            qty: 0,
            revenue: 0,
          };
        }
        productSalesMap[key].qty += Number(item.quantity) || 0;
        productSalesMap[key].revenue += Number(item.subtotal) || 0;
      });
    });

    const grossProfit = Math.max(0, totalRevenue - totalCost);
    const profitMargin =
      totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const lowStockProducts = products.filter((p) => isLowStock(p, defaultMinStock));
    const negativeStockProducts = getNegativeStockProducts(products);

    return {
      orderCount: validOrders.length,
      wholesaleOrderCount,
      totalRevenue,
      grossProfit,
      profitMargin,
      totalWholesaleSavings,
      paymentMap,
      topProducts,
      lowStockProducts,
      negativeStockProducts,
    };
  }, [rangeOrders, products, defaultMinStock]);

  const maxProductRev = Math.max(
    1,
    ...analytics.topProducts.map((p) => p.revenue)
  );

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 lg:pb-8 space-y-4 sm:space-y-5">
      {/* เลือกช่วงเวลา */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRangeId(opt.id)}
              className={`px-3 h-8 rounded-xl border text-xs font-bold ${
                rangeId === opt.id
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loadingRange && (
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังโหลดบิล...
          </span>
        )}
        {!loadingRange && (offlineData || loadError) && dbMode === 'supabase' && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
            <WifiOff className="w-3.5 h-3.5" /> ใช้บิลที่มีในเครื่อง ตัวเลขอาจไม่ครบ
          </span>
        )}
      </div>

      {/* KPI Cards แถวบน (2 คอลัมน์บนมือถือ, 4 คอลัมน์บนจอใหญ่) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              ยอดขายสุทธิรวม
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-extrabold text-slate-900 mt-1 truncate">
              {formatCurrency(analytics.totalRevenue)}
            </div>
            <div className="text-[11px] text-indigo-600 font-medium mt-0.5 truncate">
              {analytics.orderCount} บิลสำเร็จ
            </div>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              กำไรขั้นต้น
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-extrabold text-emerald-600 mt-1 truncate">
              {formatCurrency(analytics.grossProfit)}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-0.5 truncate">
              กำไร {analytics.profitMargin}%
            </div>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              บิลเรตราคาส่ง
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-extrabold text-violet-600 mt-1 truncate">
              {analytics.wholesaleOrderCount} / {analytics.orderCount}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              บิลขายส่ง
            </div>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              ส่วนลดราคาส่งรวม
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-extrabold text-amber-600 mt-1 truncate">
              {formatCurrency(analytics.totalWholesaleSavings)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              ประหยัดให้ลูกค้า
            </div>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* กราฟสินค้าขายดี Top 5 และ สัดส่วนช่องทางชำระเงิน */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* อันดับสินค้าขายดี Top 5 */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-base">
                5 อันดับสินค้าทำยอดขายสูงสุด
              </h3>
            </div>
            <span className="text-xs text-slate-400">เรียงตามมูลค่ายอดขาย</span>
          </div>

          {analytics.topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              ยังไม่มีข้อมูลการขาย
            </p>
          ) : (
            <div className="space-y-3.5">
              {analytics.topProducts.map((prod, idx) => {
                const pct = Math.round((prod.revenue / maxProductRev) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2 font-semibold text-slate-800 truncate pr-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate">{prod.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-slate-900">
                          {formatCurrency(prod.revenue)}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                          ({formatNumber(prod.qty)} {prod.unit})
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* สัดส่วนการรับชำระเงิน */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-base">
              ยอดขายแยกตามวิธีชำระเงิน
            </h3>
          </div>

          <div className="space-y-3">
            {[
              { id: 'cash', label: 'เงินสด (Cash)', color: 'bg-emerald-500' },
              { id: 'promptpay', label: 'สแกน QR PromptPay', color: 'bg-indigo-500' },
              { id: 'transfer', label: 'โอนเงินธนาคาร', color: 'bg-blue-500' },
              { id: 'credit', label: 'เครดิตลูกค้าขายส่ง', color: 'bg-amber-500' },
            ].map((pm) => {
              const amount = analytics.paymentMap[pm.id] || 0;
              const pct =
                analytics.totalRevenue > 0
                  ? Math.round((amount / analytics.totalRevenue) * 100)
                  : 0;
              return (
                <div
                  key={pm.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{pm.label}</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(amount)} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pm.color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* สินค้าสต็อกติดลบ: ขายเกินสต็อกที่มีในระบบ ต้องตรวจนับหรือรับสินค้าเข้า */}
      {analytics.negativeStockProducts.length > 0 && (
        <div className="bg-rose-50 p-4 sm:p-5 rounded-2xl border border-rose-200 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-rose-800 text-sm sm:text-base">
                  สินค้าสต็อกติดลบ {analytics.negativeStockProducts.length} รายการ
                </h3>
                <p className="text-[11px] text-rose-700">
                  ขายไปมากกว่าที่มีในระบบ ควรตรวจนับสต็อกจริง หรือบันทึกรับสินค้าเข้าที่ยังไม่ได้ลง
                </p>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-xs font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 shrink-0"
              >
                <span>ไปหน้าคลังสินค้า</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {analytics.negativeStockProducts.slice(0, 12).map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-xl bg-white border border-rose-200 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500">รหัส {p.sku}</div>
                </div>
                <span className="px-2 py-1 rounded-lg bg-rose-600 text-white font-extrabold text-xs shrink-0">
                  {formatNumber(p.stock)} {p.unit}
                </span>
              </div>
            ))}
          </div>
          {analytics.negativeStockProducts.length > 12 && (
            <div className="text-[11px] text-rose-700">และอีก {analytics.negativeStockProducts.length - 12} รายการ (ดูทั้งหมดที่หน้าคลังสินค้า ตัวกรอง "สต็อกติดลบ")</div>
          )}
        </div>
      )}

      {/* รายการแจ้งเตือนสินค้าใกล้หมดสต็อก */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-800 text-base">
              รายการสินค้าที่ควรสั่งเติมสต็อกด่วน ({analytics.lowStockProducts.length} รายการ)
            </h3>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>ไปหน้าคลังสินค้า</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {analytics.lowStockProducts.length === 0 ? (
          <p className="text-xs text-emerald-600 font-medium py-4">
            ✅ สต็อกสินค้าทุกรายการอยู่ในเกณฑ์ปกติ
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.lowStockProducts.map((p) => (
              <div
                key={p.id}
                className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    รหัส {p.sku} • จุดเตือนขั้นต่ำ {getMinStock(p, defaultMinStock)} {p.unit}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-200/80 text-amber-950 font-extrabold text-xs shrink-0">
                  เหลือ {p.stock} {p.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

