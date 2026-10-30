import React, { useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Sparkles,
  Award,
  AlertTriangle,
  ArrowRight,
  CreditCard,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { formatCurrency, formatNumber } from '../utils/formatters';

export default function DashboardPage({ onNavigate }) {
  const { orders, products } = usePOS();

  const analytics = useMemo(() => {
    const validOrders = orders.filter((o) => o.status === 'completed');

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

      const pm = order.payment_method || 'cash';
      paymentMap[pm] = (paymentMap[pm] || 0) + rev;

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

    const lowStockProducts = products.filter(
      (p) => Number(p.stock) <= Number(p.min_stock || 10)
    );

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
    };
  }, [orders, products]);

  const maxProductRev = Math.max(
    1,
    ...analytics.topProducts.map((p) => p.revenue)
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-8 space-y-5">
      {/* KPI Cards แถวบน */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              ยอดขายสุทธิรวม (Total Revenue)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1.5">
              {formatCurrency(analytics.totalRevenue)}
            </div>
            <div className="text-xs text-indigo-600 font-medium mt-1">
              จากทั้งหมด {analytics.orderCount} บิลขายสำเร็จ
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              กำไรขั้นต้นโดยประมาณ (Gross Profit)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1.5">
              {formatCurrency(analytics.grossProfit)}
            </div>
            <div className="text-xs text-emerald-700 font-medium mt-1">
              อัตรากำไรขั้นต้น {analytics.profitMargin}%
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              บิลที่มีเรตราคาส่ง (Wholesale Bills)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-violet-600 mt-1.5">
              {analytics.wholesaleOrderCount} / {analytics.orderCount}{' '}
              <span className="text-sm font-normal text-slate-500">บิล</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              ช่วยกระตุ้นยอดซื้อยกลัง/แพ็ค
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              ส่วนลดราคาส่งที่มอบให้ลูกค้า
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1.5">
              {formatCurrency(analytics.totalWholesaleSavings)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              คำนวณจากส่วนต่างราคาปลีก-ส่ง
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6" />
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
                    รหัส {p.sku} • จุดเตือนขั้นต่ำ {p.min_stock} {p.unit}
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

