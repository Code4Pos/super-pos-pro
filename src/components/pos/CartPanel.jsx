import React, { useState } from 'react';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  Tag,
  ArrowUpRight,
  CreditCard,
  PauseCircle,
  Edit3,
  RotateCcw,
  X,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import CustomerSelector from './CustomerSelector';
import HoldBillModal from './HoldBillModal';
import NumpadModal from '../common/NumpadModal';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency } from '../../utils/formatters';

const VAT_MODES = [
  { id: 'no_vat', label: 'No VAT' },
  { id: 'vat_in', label: 'VAT in (รวมในสินค้า)' },
  { id: 'vat_out', label: 'VAT out (คิดแยกนอก)' },
];

export default function CartPanel({ onOpenCheckout, onCloseMobileDrawer }) {
  const {
    cartSummary,
    pricingMode,
    setPricingMode,
    billDiscount,
    setBillDiscount,
    vatMode,
    setVatMode,
    updateCartQty,
    updateCartItemPrice,
    resetCartItemPrice,
    removeFromCart,
    clearCart,
    heldBills,
    holdCurrentBill,
  } = usePOS();

  const {
    items,
    totalItemsCount,
    wholesaleSavings,
    netBeforeVat,
    taxAmount,
    grandTotal,
  } = cartSummary;

  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);

  const [numpadConfig, setNumpadConfig] = useState({
    isOpen: false,
    title: '',
    subtitle: '',
    initialValue: 0,
    allowDecimal: true,
    max: 9999999,
    unitLabel: '',
    presets: [],
    onConfirm: () => {},
  });

  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'ยืนยัน',
    onConfirm: () => {},
  });

  /**
   * เมื่อกดปุ่ม "พักบิล":
   * - หากมีสินค้าในตะกร้า จะบันทึกพักบิลให้อัตโนมัติทันที (ลดขั้นตอนการกดบันทึกซ้ำ)
   * - หากตะกร้าว่างอยู่ จะเปิดหน้าต่างคลังเก็บบิลพักทันที (หรือคลิกที่ตัวเลขแจ้งเตือนเพื่อเปิดคลังบิลพักได้ตลอดเวลา)
   */
  const handleHoldButtonClick = () => {
    if (items.length > 0) {
      holdCurrentBill();
    } else {
      setIsHoldModalOpen(true);
    }
  };

  // เปิด Numpad แก้ไขจำนวนสินค้าในบิล
  const handleOpenQtyNumpad = (item) => {
    setNumpadConfig({
      isOpen: true,
      title: 'แก้ไขจำนวนสินค้า',
      subtitle: item.product_name,
      initialValue: item.quantity,
      allowDecimal: false,
      min: 0,
      max: Number(item.current_stock) || 9999,
      unitLabel: `สูงสุด ${item.current_stock} ${item.unit}`,
      presets: [
        { label: `1 ${item.unit}`, value: 1 },
        {
          label: `ส่ง (${item.wholesale_min_qty} ${item.unit})`,
          value: Math.min(item.current_stock, item.wholesale_min_qty),
        },
        { label: `12 ${item.unit}`, value: Math.min(item.current_stock, 12) },
      ],
      onConfirm: (val) => {
        if (val <= 0) {
          handleConfirmRemoveItem(item);
        } else {
          updateCartQty(item.product_id, val);
        }
      },
    });
  };

  // เปิด Numpad แก้ไขราคาต่อหน่วยของสินค้าในบิล
  const handleOpenPriceNumpad = (item) => {
    setNumpadConfig({
      isOpen: true,
      title: 'แก้ไขราคาขายต่อหน่วยในบิล',
      subtitle: `${item.product_name}`,
      initialValue: item.unit_price,
      allowDecimal: true,
      min: 0,
      max: 9999999,
      unitLabel: `บาท / ${item.unit}`,
      presets: [
        {
          label: `ราคาปลีก (${formatCurrency(item.original_retail_price)})`,
          value: item.original_retail_price,
        },
        {
          label: `ราคาส่ง (${formatCurrency(item.wholesale_price)})`,
          value: item.wholesale_price,
        },
      ],
      onConfirm: (val) => {
        updateCartItemPrice(item.product_id, val);
      },
    });
  };

  // เปิด Numpad แก้ไขส่วนลดท้ายบิล
  const handleOpenDiscountNumpad = () => {
    setNumpadConfig({
      isOpen: true,
      title: 'ระบุส่วนลดท้ายบิล (บาท)',
      subtitle: `ยอดรวมก่อนลด ${formatCurrency(cartSummary.subtotal)}`,
      initialValue: billDiscount,
      allowDecimal: true,
      min: 0,
      max: cartSummary.subtotal || 999999,
      unitLabel: 'บาท (฿)',
      presets: [
        { label: 'ไม่ลด (฿0)', value: 0 },
        { label: 'ลด ฿10', value: 10 },
        { label: 'ลด ฿20', value: 20 },
        { label: 'ลด ฿50', value: 50 },
      ],
      onConfirm: (val) => {
        setBillDiscount(val);
      },
    });
  };

  // ยืนยันการลบสินค้าออกจากตะกร้า
  const handleConfirmRemoveItem = (item) => {
    setConfirmConfig({
      isOpen: true,
      title: 'ยืนยันการลบสินค้า',
      message: `ต้องการลบ "${item.product_name}" (จำนวน ${item.quantity} ${item.unit}) ออกจากบิลปัจจุบันใช่หรือไม่?`,
      confirmText: 'ลบสินค้า',
      onConfirm: () => {
        removeFromCart(item.product_id);
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ยืนยันการล้างบิลทั้งหมด
  const handleConfirmClearBill = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'ยืนยันการล้างบิล',
      message: `ต้องการล้างรายการสินค้าทั้งหมด (${totalItemsCount} ชิ้น) ในบิลปัจจุบันใช่หรือไม่?`,
      confirmText: 'ล้างบิลทั้งหมด',
      onConfirm: () => {
        clearCart();
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-white select-none overflow-hidden">
      {/* ส่วนหัวตะกร้า + ปุ่มพักบิลอัตโนมัติ + ปุ่มล้างบิล */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-800 text-sm truncate">
                รายการขาย
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 shrink-0">
                {totalItemsCount} ชิ้น
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* ปุ่ม "พักบิล" (กดเมื่อมีของ = บันทึกพักบิลอัตโนมัติทันที / กดที่ตัวเลขแจ้งเตือนหรือตอนบิลว่าง = เปิดคลังบิลพัก) */}
          <div className="flex items-center rounded-xl bg-amber-100 border border-amber-300/90 overflow-hidden">
            <button
              type="button"
              onClick={handleHoldButtonClick}
              className="px-2.5 py-1.5 hover:bg-amber-200/80 text-amber-950 text-xs font-bold flex items-center gap-1 transition-colors"
              title={
                items.length > 0
                  ? 'กดเพื่อบันทึกพักบิลนี้อัตโนมัติทันที'
                  : 'เปิดดูคลังเก็บบิลที่พักไว้'
              }
            >
              <PauseCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>พักบิล</span>
            </button>

            {heldBills.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(true)}
                className="px-2 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold flex items-center justify-center transition-colors"
                title="คลิกเพื่อเปิดคลังเก็บบิลที่พักไว้"
              >
                {heldBills.length}
              </button>
            )}
          </div>

          {/* ปุ่มล้างบิล */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmClearBill}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 flex items-center gap-1"
              title="ล้างบิลทั้งหมด"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ล้างบิล</span>
            </button>
          )}

          {onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* เลือกลูกค้า และ โหมดการคิดราคา */}
      <div className="p-2.5 border-b border-slate-200 space-y-2 bg-white shrink-0">
        <CustomerSelector />

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/70">
          {[
            { id: 'auto', label: 'ปลีก-ส่งอัตโนมัติ' },
            { id: 'wholesale', label: 'ราคาส่งทั้งบิล' },
            { id: 'retail', label: 'ราคาปลีกทั้งบิล' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setPricingMode(mode.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                pricingMode === mode.id
                  ? mode.id === 'wholesale'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* รายการสินค้าในตะกร้า */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {items.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-6 text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-2 text-slate-300">
              <ShoppingCart className="w-7 h-7" />
            </div>
            <p className="font-semibold text-slate-600 text-xs sm:text-sm">
              ยังไม่มีสินค้าในตะกร้า
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              กดปุ่มราคาปลีก/ส่งบนการ์ดสินค้า หรือยิงบาร์โค้ดได้ทันที
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.product_id}
              className={`p-2.5 rounded-2xl border ${
                item.is_custom_price
                  ? 'bg-amber-50/40 border-amber-200'
                  : item.is_wholesale_applied
                  ? 'bg-emerald-50/40 border-emerald-200/90'
                  : 'bg-slate-50/70 border-slate-200/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800 line-clamp-1">
                    {item.product_name}
                  </div>

                  {/* ปุ่มกดแก้ไขราคาต่อหน่วยในบิล (เปิด Numpad) */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenPriceNumpad(item)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-xs font-bold text-indigo-700"
                      title="คลิกเพื่อแก้ไขราคาสินค้าชิ้นนี้ด้วย Numpad"
                    >
                      <span>
                        {formatCurrency(item.unit_price)} / {item.unit}
                      </span>
                      <Edit3 className="w-3 h-3 text-indigo-500" />
                    </button>

                    {item.is_custom_price && (
                      <button
                        type="button"
                        onClick={() => resetCartItemPrice(item.product_id)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold"
                        title="รีเซ็ตกลับเป็นราคาปลีก/ส่งมาตรฐาน"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>ราคาปรับเอง</span>
                      </button>
                    )}

                    {item.is_wholesale_applied && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Sparkles className="w-2.5 h-2.5" />
                        ราคาส่ง
                      </span>
                    )}
                  </div>
                </div>

                {/* ยอดรวมรายชิ้น */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-900">
                    {formatCurrency(item.subtotal)}
                  </div>
                  {(item.is_wholesale_applied ||
                    (item.is_custom_price &&
                      item.unit_price < item.original_retail_price)) && (
                    <div className="text-[10px] text-slate-400 line-through">
                      {formatCurrency(item.original_retail_price * item.quantity)}
                    </div>
                  )}
                </div>
              </div>

              {/* แถบปรับจำนวน + ปุ่มลบสินค้า */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.quantity <= 1) {
                        handleConfirmRemoveItem(item);
                      } else {
                        updateCartQty(item.product_id, item.quantity - 1);
                      }
                    }}
                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  {/* ปุ่มจำนวนสินค้า กดเพื่อเปิด Numpad */}
                  <button
                    type="button"
                    onClick={() => handleOpenQtyNumpad(item)}
                    className="min-w-[54px] h-7 px-2 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-xs font-extrabold text-indigo-700 flex items-center justify-center gap-1"
                    title="คลิกเพื่อระบุจำนวนผ่าน Numpad"
                  >
                    <span>{item.quantity}</span>
                    <Edit3 className="w-2.5 h-2.5 opacity-70" />
                  </button>

                  <button
                    type="button"
                    onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {pricingMode === 'auto' &&
                    !item.is_custom_price &&
                    !item.is_wholesale_applied &&
                    item.qty_to_unlock_wholesale > 0 &&
                    item.wholesale_price < item.original_retail_price &&
                    item.current_stock >= item.wholesale_min_qty && (
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQty(item.product_id, item.wholesale_min_qty)
                        }
                        className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold flex items-center gap-1"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        <span>+{item.qty_to_unlock_wholesale} ได้ราคาส่ง</span>
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => handleConfirmRemoveItem(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="ลบสินค้านี้ออกจากตะกร้า"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ส่วนสรุปยอดเงิน, ระบบคำนวณ VAT 3 รูปแบบ และปุ่มชำระเงิน */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/90 space-y-2 shrink-0">
        {/* เลือกรูปแบบการคำนวณ VAT 3 รูปแบบ: No VAT | VAT in product | VAT out product */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/70 border border-slate-200">
          {VAT_MODES.map((vm) => (
            <button
              key={vm.id}
              type="button"
              onClick={() => setVatMode(vm.id)}
              className={`py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold truncate transition-colors ${
                vatMode === vm.id
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {vm.label}
            </button>
          ))}
        </div>

        {/* ปุ่มส่วนลดท้ายบิล (Numpad) & แสดงยอดภาษีตามโหมด VAT */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleOpenDiscountNumpad}
            className="flex items-center justify-between gap-1 bg-white hover:bg-indigo-50/50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-left"
            title="คลิกเพื่อระบุส่วนลดท้ายบิลด้วย Numpad"
          >
            <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              ลดท้ายบิล
            </span>
            <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1">
              {billDiscount > 0 ? `-${formatCurrency(billDiscount)}` : '฿0'}
              <Edit3 className="w-3 h-3 text-slate-400" />
            </span>
          </button>

          <div className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium truncate">
              {vatMode === 'no_vat'
                ? 'ภาษี (No VAT)'
                : vatMode === 'vat_in'
                ? 'VAT 7% (ในสินค้า)'
                : 'VAT 7% (แยกนอก)'}
            </span>
            <span className="font-bold text-slate-800 shrink-0">
              {vatMode === 'vat_out' ? '+' : ''}
              {formatCurrency(taxAmount)}
            </span>
          </div>
        </div>

        {/* แสดงรายละเอียดเมื่อเลือก VAT in product หรือประหยัดราคาส่ง */}
        {(vatMode === 'vat_in' && taxAmount > 0) || wholesaleSavings > 0 ? (
          <div className="flex items-center justify-between text-[11px] px-1 text-slate-500">
            {vatMode === 'vat_in' && taxAmount > 0 ? (
              <span>มูลค่าก่อนภาษี: {formatCurrency(netBeforeVat)}</span>
            ) : (
              <span />
            )}
            {wholesaleSavings > 0 && (
              <span className="text-emerald-700 font-bold">
                ประหยัดราคาส่ง -{formatCurrency(wholesaleSavings)}
              </span>
            )}
          </div>
        ) : null}

        {/* ยอดรวมสุทธิ */}
        <div className="flex items-baseline justify-between pt-0.5">
          <div>
            <span className="text-xs font-bold text-slate-600">ยอดชำระสุทธิ</span>
            <span className="text-[11px] text-slate-400 ml-1.5">
              ({items.length} รายการ)
            </span>
          </div>
          <div className="text-2xl font-extrabold text-indigo-600 tracking-tight">
            {formatCurrency(grandTotal)}
          </div>
        </div>

        {/* ปุ่มกดชำระเงิน */}
        <button
          type="button"
          disabled={items.length === 0}
          onClick={onOpenCheckout}
          className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white font-extrabold text-base shadow-md flex items-center justify-center gap-2 transition-colors"
        >
          <CreditCard className="w-5 h-5" />
          <span>รับชำระเงิน ({formatCurrency(grandTotal)})</span>
        </button>
      </div>

      {/* Modal คลังเก็บบิลที่พักไว้ */}
      <HoldBillModal
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
      />

      {/* Modal Numpad */}
      <NumpadModal
        isOpen={numpadConfig.isOpen}
        title={numpadConfig.title}
        subtitle={numpadConfig.subtitle}
        initialValue={numpadConfig.initialValue}
        allowDecimal={numpadConfig.allowDecimal}
        min={numpadConfig.min}
        max={numpadConfig.max}
        unitLabel={numpadConfig.unitLabel}
        presets={numpadConfig.presets}
        onConfirm={numpadConfig.onConfirm}
        onClose={() => setNumpadConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Modal ยืนยันการลบสินค้า / ล้างบิล */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() =>
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}
