import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, HandCoins, RefreshCw, WifiOff, ChevronRight } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/formatters';
import CustomerPaymentModal from '../customers/CustomerPaymentModal';
import ApproverPinModal from './ApproverPinModal';

/**
 * หน้าต่าง "เครดิต" ในหน้าขาย: ลูกค้าที่ยังค้างชำระ และรับชำระหนี้ได้ทันที
 * - โหลดบิลขายเชื่อ/การรับชำระจากฐานข้อมูลเมื่อเปิดหน้าต่างเท่านั้น
 * - ผู้ใช้ที่ไม่มีสิทธิ์รับชำระหนี้ (เช่น แคชเชียร์) ต้องให้ผู้จัดการ/ผู้ดูแลระบบอนุมัติด้วย PIN
 */
export default function PosCreditModal({ isOpen, onClose }) {
  const { customers, getCustomerCredit, loadCreditData, can, authEnabled, showToast } = usePOS();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState('');
  const [payingCustomer, setPayingCustomer] = useState(null);
  const [pendingCustomer, setPendingCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadCreditData();
      setOffline(result.offline);
      setLoaded(true);
    } catch (err) {
      showToast(`โหลดข้อมูลเครดิตไม่สำเร็จ: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loadCreditData, showToast]);

  useEffect(() => {
    if (!isOpen) {
      setLoaded(false);
      setSearch('');
      setPayingCustomer(null);
      setPendingCustomer(null);
      return;
    }
    load();
  }, [isOpen, load]);

  // ลูกค้าที่มียอดค้าง เรียงยอดค้างมากไปน้อย
  const debtors = useMemo(() => {
    if (!isOpen || !loaded) return [];
    return customers
      .map((c) => ({ customer: c, credit: getCustomerCredit(c) }))
      .filter((row) => row.credit.outstanding > 0)
      .sort((a, b) => b.credit.outstanding - a.credit.outstanding);
  }, [isOpen, loaded, customers, getCustomerCredit]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? debtors.filter(
        ({ customer }) =>
          String(customer.name || '').toLowerCase().includes(q) ||
          String(customer.phone || '').includes(q)
      )
    : debtors;
  const totalOutstanding = debtors.reduce((sum, r) => sum + r.credit.outstanding, 0);
  const totalOverdue = debtors.reduce((sum, r) => sum + r.credit.overdue, 0);

  if (!isOpen) return null;

  const openPayment = (customer) => {
    if (can('receive_payment') || !authEnabled) {
      setPayingCustomer(customer);
      return;
    }
    setPendingCustomer(customer);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full sm:h-[85vh]">
        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <HandCoins className="w-5 h-5 text-amber-600 shrink-0" />
          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex-1 truncate">
            เครดิต — ลูกค้าค้างชำระ
          </h3>
          {offline && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
              <WifiOff className="w-3 h-3" /> ข้อมูลในเครื่อง
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="โหลดใหม่"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 space-y-2.5 shrink-0">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">ลูกค้าค้างชำระ</div>
              <div className="font-extrabold text-slate-900 text-sm">{debtors.length} ราย</div>
            </div>
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-[11px] text-rose-600">ยอดค้างรวม</div>
              <div className="font-extrabold text-rose-700 text-sm">{formatCurrency(totalOutstanding)}</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[11px] text-amber-700">เกินกำหนด</div>
              <div className="font-extrabold text-amber-700 text-sm">{formatCurrency(totalOverdue)}</div>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า หรือเบอร์โทร..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !loaded ? (
            <div className="p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูลเครดิต...
            </div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              {debtors.length === 0 ? 'ไม่มีลูกค้าค้างชำระ' : 'ไม่พบลูกค้าที่ค้นหา'}
            </div>
          ) : (
            visible.map(({ customer, credit }) => {
              const limit = Number(customer.credit_limit) || 0;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => openPayment(customer)}
                  className="w-full px-3 sm:px-4 py-3 border-b border-slate-100 hover:bg-slate-50 text-left flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {customer.name}
                      {customer.is_blocked && (
                        <span className="ml-1.5 px-1.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">ระงับเครดิต</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {customer.phone || '-'} • บิลค้าง {credit.openBills.length} ใบ • วงเงิน{' '}
                      {limit > 0 ? formatCurrency(limit) : 'ไม่จำกัด'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-rose-600 text-sm">{formatCurrency(credit.outstanding)}</div>
                    {credit.overdue > 0 && (
                      <div className="text-[10px] font-bold text-amber-700">เกินกำหนด {formatCurrency(credit.overdue)}</div>
                    )}
                  </div>
                  <span className="hidden sm:flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0">
                    รับชำระ <ChevronRight className="w-3 h-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {payingCustomer && (
        <CustomerPaymentModal customer={payingCustomer} onClose={() => setPayingCustomer(null)} />
      )}

      <ApproverPinModal
        isOpen={Boolean(pendingCustomer)}
        title="อนุมัติรับชำระหนี้"
        description={pendingCustomer ? `รับชำระหนี้จาก "${pendingCustomer.name}" ต้องใช้ PIN ผู้จัดการหรือผู้ดูแลระบบ` : ''}
        permission="receive_payment"
        onApproved={() => {
          setPayingCustomer(pendingCustomer);
          setPendingCustomer(null);
        }}
        onClose={() => setPendingCustomer(null)}
      />
    </div>
  );
}
