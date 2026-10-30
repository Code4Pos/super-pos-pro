import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Banknote,
  QrCode,
  Building2,
  Handshake,
  CheckCircle2,
  Delete,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import CustomerSelector from './CustomerSelector';
import { formatCurrency } from '../../utils/formatters';

const PAYMENT_TABS = [
  { id: 'cash', label: 'เงินสด', icon: Banknote },
  { id: 'promptpay', label: 'QR PromptPay', icon: QrCode },
  { id: 'transfer', label: 'โอนธนาคาร', icon: Building2 },
  { id: 'credit', label: 'เครดิต', icon: Handshake },
];

/**
 * CheckoutModal (version beta 0.1.2):
 * - ออกแบบสัดส่วนให้พอดีกับหน้าจอ 100% ไม่มีการเลื่อนขึ้นลง (overflow-hidden)
 * - ปุ่มตัวเลข Numpad และปุ่มลัดธนบัตร (100, 500, 1000, พอดี) มีขนาดใหญ่ กดง่ายสำหรับจอสัมผัส Sunmi T2
 * - ค่าเริ่มต้นเงินสด = 0 และเมื่อกดตัวเลขครั้งแรกจะรีเซ็ตค่าเดิม
 * - ชำระแบบเครดิตบังคับเลือกลูกค้าก่อนเสมอ
 */
export default function CheckoutModal({ isOpen, onClose, onOrderSuccess }) {
  const { cartSummary, selectedCustomer, checkoutOrder } = usePOS();
  const { grandTotal, totalItemsCount, wholesaleSavings, vatMode, taxAmount } =
    cartSummary;

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashStr, setCashStr] = useState('0');
  const [isFresh, setIsFresh] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('cash');
      setCashStr('0');
      setIsFresh(true);
      setNote('');
    }
  }, [isOpen]);

  const handleDigit = useCallback(
    (digit) => {
      setCashStr((prev) => {
        if (isFresh) {
          setIsFresh(false);
          if (digit === '.') return '0.';
          if (digit === '00') return '0';
          return String(digit);
        }
        if (digit === '.') {
          if (prev.includes('.')) return prev;
          return prev + '.';
        }
        if (prev === '0') {
          if (digit === '0' || digit === '00') return '0';
          return String(digit);
        }
        return prev + String(digit);
      });
    },
    [isFresh]
  );

  const handleBackspace = useCallback(() => {
    setIsFresh(false);
    setCashStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);

  const handleClear = useCallback(() => {
    setIsFresh(true);
    setCashStr('0');
  }, []);

  const handleShortcutPrice = (val) => {
    setCashStr(String(val));
    setIsFresh(true);
  };

  if (!isOpen) return null;

  const numericCash = parseFloat(cashStr) || 0;
  const changeAmount = Math.max(0, numericCash - grandTotal);

  const isCashValid = paymentMethod !== 'cash' || numericCash >= grandTotal;
  const isCreditValid = paymentMethod !== 'credit' || Boolean(selectedCustomer);
  const canSubmit = isCashValid && isCreditValid && !submitting;

  const handleConfirmCheckout = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const savedOrder = await checkoutOrder({
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'cash' ? numericCash : grandTotal,
        note,
      });
      if (savedOrder) {
        onClose();
        onOrderSuccess(savedOrder);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-900/75 select-none">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[96dvh]">
        {/* ส่วนหัว Modal กระชับ */}
        <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm sm:text-base font-bold truncate">
              รับชำระเงินค่าสินค้า
            </h3>
            <span className="text-xs text-slate-300 truncate">
              • {selectedCustomer ? selectedCustomer.name : 'ลูกค้าทั่วไป'} (
              {totalItemsCount} ชิ้น)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* เนื้อหาหลัก ไม่มี Scrollbar แนวตั้ง */}
        <div className="p-3 sm:p-4 space-y-3 overflow-hidden flex-1 flex flex-col justify-between">
          {/* แถบเมนูเลือกวิธีชำระเงินแถวเดียว (Single-Row Tabs) */}
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200 shrink-0">
            {PAYMENT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = paymentMethod === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPaymentMethod(tab.id)}
                  className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* 1. หน้าต่างชำระเงินสด (แบ่งซ้าย-ขวาบนจอแนวนอน/แท็บเล็ต/Sunmi T2 เพื่อให้ปุ่มตัวเลขใหญ่และไม่ล้นจอ) */}
          {paymentMethod === 'cash' && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              {/* ฝั่งซ้าย: ยอดชำระสุทธิ, รับเงินสด, เงินทอน, หมายเหตุ และปุ่มยืนยัน */}
              <div className="sm:col-span-5 flex flex-col justify-between gap-2.5">
                <div className="space-y-2">
                  {/* ยอดสุทธิ */}
                  <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex sm:flex-col justify-between items-baseline sm:items-start">
                    <div className="text-xs font-bold text-indigo-800">
                      ยอดที่ต้องชำระสุทธิ
                      {vatMode !== 'no_vat' && (
                        <span className="ml-1 text-[10px] text-indigo-600 font-normal">
                          ({vatMode === 'vat_in' ? 'รวม VAT' : 'VAT นอก'}{' '}
                          {formatCurrency(taxAmount)})
                        </span>
                      )}
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-indigo-700 mt-0.5">
                      {formatCurrency(grandTotal)}
                    </div>
                  </div>

                  {/* รับเงินสด & เงินทอน */}
                  <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
                    <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-100 border-2 border-indigo-500/30 flex sm:flex-row flex-col justify-between sm:items-center">
                      <span className="text-xs font-bold text-slate-600">
                        รับเงินสดมา
                      </span>
                      <span
                        className={`text-xl sm:text-2xl font-mono font-extrabold ${
                          isFresh ? 'text-indigo-600' : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(numericCash)}
                      </span>
                    </div>

                    <div
                      className={`p-2.5 sm:p-3 rounded-2xl border flex sm:flex-row flex-col justify-between sm:items-center ${
                        numericCash >= grandTotal
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-rose-50 border-rose-200'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-700">
                        {numericCash >= grandTotal ? 'เงินทอน' : 'ยังขาดอีก'}
                      </span>
                      <span
                        className={`text-xl sm:text-2xl font-mono font-extrabold ${
                          numericCash >= grandTotal
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {numericCash >= grandTotal
                          ? formatCurrency(changeAmount)
                          : formatCurrency(grandTotal - numericCash)}
                      </span>
                    </div>
                  </div>

                  {/* ช่องหมายเหตุ */}
                  <input
                    type="text"
                    data-allow-scanner="false"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="หมายเหตุท้ายบิล (ถ้ามี)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* ปุ่มยืนยันการชำระเงินด้านซ้ายล่าง */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-3 px-4 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleConfirmCheckout}
                    className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>
                      {!isCashValid
                        ? 'รับเงินยังไม่ครบ'
                        : submitting
                        ? 'กำลังบันทึก...'
                        : 'ยืนยันชำระเงิน'}
                    </span>
                  </button>
                </div>
              </div>

              {/* ฝั่งขวา: ปุ่มลัดธนบัตร (100, 500, 1000, พอดี) + แป้นตัวเลข Numpad ขนาดใหญ่ */}
              <div className="sm:col-span-7 flex flex-col justify-between gap-2">
                {/* ปุ่มลัดธนบัตร */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '฿100', val: 100 },
                    { label: '฿500', val: 500 },
                    { label: '฿1,000', val: 1000 },
                    { label: 'พอดี', val: grandTotal, isExact: true },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => handleShortcutPrice(btn.val)}
                      className={`h-11 sm:h-12 rounded-2xl font-extrabold text-sm sm:text-base border transition-colors ${
                        btn.isExact
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* แป้นกดตัวเลข Numpad ขนาดใหญ่ */}
                <div className="grid grid-cols-4 gap-2">
                  {['7', '8', '9'].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleDigit(n)}
                      className="h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-12 sm:h-14 rounded-2xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-800 flex items-center justify-center"
                    title="ลบทีละหลัก"
                  >
                    <Delete className="w-6 h-6" />
                  </button>

                  {['4', '5', '6'].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleDigit(n)}
                      className="h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="h-12 sm:h-14 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-300 text-rose-700 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center"
                    title="รีเซ็ตเป็น 0"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>0 (C)</span>
                  </button>

                  {['1', '2', '3'].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleDigit(n)}
                      className="h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleDigit('.')}
                    className="h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl font-extrabold text-slate-800"
                  >
                    .
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDigit('0')}
                    className="col-span-2 h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigit('00')}
                    className="col-span-2 h-12 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-xl sm:text-2xl font-extrabold text-slate-800"
                  >
                    00
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. แท็บวิธีชำระเงินอื่นๆ (PromptPay, โอนธนาคาร, เครดิต) */}
          {paymentMethod !== 'cash' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-indigo-800">
                    ยอดที่ต้องชำระสุทธิ
                  </div>
                  {wholesaleSavings > 0 && (
                    <div className="text-[11px] text-emerald-600 font-semibold">
                      ลดราคาส่งแล้ว -{formatCurrency(wholesaleSavings)}
                    </div>
                  )}
                </div>
                <div className="text-3xl font-extrabold text-indigo-700">
                  {formatCurrency(grandTotal)}
                </div>
              </div>

              {paymentMethod === 'promptpay' && (
                <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200 flex flex-col items-center text-center space-y-2">
                  <div className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold">
                    THAI QR PROMPTPAY
                  </div>
                  <div className="w-36 h-36 bg-white p-3 rounded-2xl border-2 border-indigo-600 flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-slate-900 stroke-[1.5]" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    สแกนเพื่อชำระยอด{' '}
                    <span className="text-indigo-700 font-bold">
                      {formatCurrency(grandTotal)}
                    </span>
                  </p>
                </div>
              )}

              {paymentMethod === 'transfer' && (
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1.5 text-xs">
                  <div className="font-bold text-blue-900 text-sm">
                    ธนาคารกสิกรไทย (KBank)
                  </div>
                  <div className="font-mono text-lg font-extrabold text-slate-900">
                    123-4-56789-0
                  </div>
                  <div className="text-slate-600">
                    ชื่อบัญชี: บจก. สยามค้าปลีก-ส่ง จำกัด
                  </div>
                </div>
              )}

              {paymentMethod === 'credit' && (
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        selectedCustomer ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    />
                    <div className="text-xs">
                      <div className="font-bold text-slate-900 text-sm">
                        การชำระแบบเครดิต / ค้างชำระ (บังคับเลือกลูกค้าก่อน)
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        {selectedCustomer
                          ? `เลือกลูกค้าเรียบร้อยแล้ว: ${selectedCustomer.name} (${selectedCustomer.code})`
                          : 'กรุณาค้นหาหรือสแกนรหัสลูกค้าด้านล่างก่อนยืนยันบิลเครดิต'}
                      </p>
                    </div>
                  </div>

                  <CustomerSelector
                    placeholder="พิมพ์ค้นหา หรือสแกนรหัสลูกค้าเพื่อเปิดบิลเครดิต..."
                    requiredWarning={!selectedCustomer}
                  />
                </div>
              )}

              <input
                type="text"
                data-allow-scanner="false"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="หมายเหตุท้ายบิล / การจัดส่ง (ถ้ามี)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-5 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleConfirmCheckout}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>
                    {!isCreditValid
                      ? 'กรุณาเลือกลูกค้าก่อนชำระแบบเครดิต'
                      : submitting
                      ? 'กำลังบันทึกบิล...'
                      : 'ยืนยันชำระเงิน & ออกใบเสร็จ'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
