import React, { useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { checkCreditSale } from '../../utils/credit';
import { formatCurrency } from '../../utils/formatters';

/**
 * แสดงสถานะวงเงินเครดิตของลูกค้าที่เลือก และผลตรวจก่อนขายเชื่อยอดนี้
 */
export default function CreditStatusBox({ customer, creditAmount }) {
  const { getCustomerCredit, loadCreditData } = usePOS();
  const credit = customer ? getCustomerCredit(customer) : null;
  const needsLoad = Boolean(customer?.id) && credit?.creditLoaded === false;

  // หน้าขาย: โหลดยอดค้างของลูกค้าคนนี้เมื่อเลือกขายเชื่อครั้งแรก
  useEffect(() => {
    if (needsLoad) loadCreditData(customer.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLoad, customer?.id]);

  if (!customer) return null;
  if (needsLoad) {
    return (
      <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center gap-1.5">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดยอดค้างชำระของลูกค้า...
      </div>
    );
  }
  const check = checkCreditSale(customer, creditAmount, credit);
  const limit = Number(customer.credit_limit) || 0;

  return (
    <div
      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
        check.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-300'
      }`}
    >
      <div className="flex items-center gap-1.5 font-bold">
        {check.ok ? (
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
        ) : (
          <ShieldAlert className="w-4 h-4 text-rose-600" />
        )}
        <span className={check.ok ? 'text-emerald-800' : 'text-rose-700'}>
          {check.ok ? 'ผ่านการตรวจวงเงินเครดิต' : check.message}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-slate-600">
        <span>
          วงเงิน: <strong>{limit > 0 ? formatCurrency(limit) : 'ไม่จำกัด'}</strong>
        </span>
        <span>
          ค้างชำระ: <strong>{formatCurrency(credit.outstanding)}</strong>
        </span>
        <span>
          ใช้ได้อีก:{' '}
          <strong>{limit > 0 ? formatCurrency(credit.available) : 'ไม่จำกัด'}</strong>
        </span>
        <span>
          เครดิต: <strong>{Number(customer.credit_term_days) || 0} วัน</strong>
        </span>
      </div>
      {credit.overdue > 0 && (
        <div className="font-bold text-amber-700">
          มียอดเกินกำหนดชำระ {formatCurrency(credit.overdue)}
        </div>
      )}
    </div>
  );
}
