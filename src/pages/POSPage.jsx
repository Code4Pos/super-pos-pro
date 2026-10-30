import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Barcode,
  ShoppingCart,
  Sparkles,
  ChevronUp,
  ChevronDown,
  X,
  PackageSearch,
  FolderSearch,
  Check,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import ProductCard from '../components/pos/ProductCard';
import CartPanel from '../components/pos/CartPanel';
import CheckoutModal from '../components/pos/CheckoutModal';
import ReceiptModal from '../components/pos/ReceiptModal';
import NumpadModal from '../components/common/NumpadModal';
import ConfirmModal from '../components/common/ConfirmModal';
import BarcodeErrorModal from '../components/common/BarcodeErrorModal';
import {
  playScanSuccessBeep,
  playBarcodeNotFoundAlarm,
} from '../utils/soundAlert';
import { formatCurrency } from '../utils/formatters';

export default function POSPage() {
  const {
    products,
    categories,
    cartSummary,
    pricingMode,
    addToCart,
    updateCartQty,
    removeFromCart,
    showToast,
  } = usePOS();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const catDropdownRef = useRef(null);

  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const [cardNumpadProduct, setCardNumpadProduct] = useState(null);
  const [cardNumpadInitialQty, setCardNumpadInitialQty] = useState(1);

  const [productToRemove, setProductToRemove] = useState(null);

  // สถานะ Popup Alert เมื่อสแกนไม่พบบาร์โค้ด (ถ้าไม่กดปิดจะไม่สามารถสแกนต่อได้)
  const [notFoundBarcode, setNotFoundBarcode] = useState(null);

  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        catDropdownRef.current &&
        !catDropdownRef.current.contains(e.target)
      ) {
        setIsCatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * ตรวจสอบรหัสบาร์โค้ดที่สแกนเข้ามา:
   * - หากพบสินค้า: ส่งเสียงติ๊ดสั้นๆ และเพิ่มสินค้าไว้ด้านบนสุดของตะกร้า
   * - หากไม่พบสินค้า: ส่งเสียงเตือนภัย (Alarm) และเปิด Popup Alert “ไม่พบ (เลขบาร์โค้ด) นี้” บล็อกการสแกนต่อทันที
   */
  const processScannedCode = useCallback(
    (rawCode) => {
      if (notFoundBarcode) {
        playBarcodeNotFoundAlarm();
        return false;
      }

      const cleanCode = rawCode.trim();
      const q = cleanCode.toLowerCase();
      if (!q) return false;

      // 1. ตรวจสอบจากบาร์โค้ดหน่วยย่อย/หลายหน่วยนับ (selling_units) ก่อน
      let matchedMultiUnit = null;
      const foundByMultiUnit = products.find((p) => {
        if (!Array.isArray(p.selling_units)) return false;
        const unitMatch = p.selling_units.find(
          (su) => su.barcode && su.barcode.trim().toLowerCase() === q
        );
        if (unitMatch) {
          matchedMultiUnit = unitMatch;
          return true;
        }
        return false;
      });

      if (foundByMultiUnit && matchedMultiUnit) {
        const deductQty = Math.max(
          1,
          Number(matchedMultiUnit.stock_deduct_qty) || 1
        );
        playScanSuccessBeep();
        addToCart(foundByMultiUnit, deductQty);
        showToast(
          `สแกนเพิ่ม "${foundByMultiUnit.name}" [หน่วย: ${matchedMultiUnit.unit} • ตัดสต็อก ${deductQty} ${foundByMultiUnit.unit}]`,
          'success'
        );
        return true;
      }

      // 2. ตรวจสอบจากบาร์โค้ดหลัก, SKU หรือชื่อสินค้า
      const found = products.find(
        (p) =>
          p.barcode?.toLowerCase() === q ||
          p.sku?.toLowerCase() === q ||
          p.name?.toLowerCase() === q
      );

      if (found) {
        playScanSuccessBeep();
        addToCart(found, 1);
        showToast(
          `สแกนเพิ่ม "${found.name}" (+1 ${found.unit}) เข้าตะกร้าแล้ว`,
          'success'
        );
        return true;
      } else {
        playBarcodeNotFoundAlarm();
        setNotFoundBarcode(cleanCode);
        return false;
      }
    },
    [notFoundBarcode, products, addToCart, showToast]
  );

  // ระบบ Always-On Barcode Scanner: สแกนสินค้าได้ตลอดเวลา แต่จะหยุดรับทันทีเมื่อมี Popup Alert ค้างอยู่
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // หากมี Popup แจ้งเตือนบาร์โค้ดไม่พบค้างอยู่ ห้ามรับการสแกนใหม่เด็ดขาด
      if (notFoundBarcode) {
        barcodeBufferRef.current = '';
        return;
      }

      if (cardNumpadProduct || isCheckoutOpen) return;

      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT');

      if (isInputFocused) return;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 2) {
          e.preventDefault();
          const code = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          processScannedCode(code);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          barcodeBufferRef.current = '';
        }, 500);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    };
  }, [notFoundBarcode, cardNumpadProduct, isCheckoutOpen, processScannedCode]);

  const filteredCategories = useMemo(() => {
    const q = catSearchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name?.toLowerCase().includes(q));
  }, [categories, catSearchQuery]);

  const currentCategoryObj =
    categories.find((c) => c.id === selectedCategory) || categories[0];

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat =
        selectedCategory === 'all' || p.category_id === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const matchMultiUnit =
        Array.isArray(p.selling_units) &&
        p.selling_units.some((su) => su.barcode?.toLowerCase().includes(q));
      return (
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        matchMultiUnit
      );
    });
  }, [products, selectedCategory, searchQuery]);

  const cartItemMap = useMemo(() => {
    const map = new Map();
    cartSummary.items.forEach((item) => {
      map.set(item.product_id, item);
    });
    return map;
  }, [cartSummary.items]);

  const handleEditQtyFromCard = useCallback((prod, currentQty) => {
    setCardNumpadProduct(prod);
    setCardNumpadInitialQty(currentQty);
  }, []);

  const handleRemoveFromCard = useCallback((prod) => {
    setProductToRemove(prod);
  }, []);

  // รองรับการยิงบาร์โค้ดในช่องค้นหาแล้วกด Enter
  const handleSearchBarcodeKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      if (notFoundBarcode) {
        playBarcodeNotFoundAlarm();
        return;
      }
      const raw = searchQuery.trim();
      setSearchQuery('');
      processScannedCode(raw);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden relative h-full">
      {/* ฝั่งซ้าย: แถบค้นหา + Dropdown หมวดหมู่ + ตารางสินค้า */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        <div className="p-2.5 sm:p-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* ช่องค้นหา / สแกนบาร์โค้ด */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                disabled={Boolean(notFoundBarcode)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchBarcodeKeyDown}
                placeholder="ค้นหาชื่อสินค้า, SKU หรือยิงบาร์โค้ดได้ตลอดเวลา..."
                className="w-full pl-10 pr-32 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white disabled:bg-rose-50 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-rose-600"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <Barcode className="w-3.5 h-3.5" />
                  พร้อมสแกนตลอดเวลา
                </span>
              )}
            </div>

            {/* หมวดหมู่สินค้าแบบ Dropdown ที่สามารถพิมพ์ค้นหาได้ */}
            <div ref={catDropdownRef} className="relative sm:w-64 md:w-72 shrink-0">
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500">
                <FolderSearch className="w-4 h-4 text-indigo-600 ml-3 mr-1.5 shrink-0" />
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={
                    isCatDropdownOpen
                      ? catSearchQuery
                      : currentCategoryObj?.name || 'สินค้าทั้งหมด'
                  }
                  onFocus={() => {
                    setIsCatDropdownOpen(true);
                    setCatSearchQuery('');
                  }}
                  onChange={(e) => {
                    setCatSearchQuery(e.target.value);
                    setIsCatDropdownOpen(true);
                  }}
                  placeholder="พิมพ์ค้นหาหมวดหมู่สินค้า..."
                  className="w-full py-2 px-1.5 bg-transparent text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none truncate"
                />

                {(selectedCategory !== 'all' || catSearchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setCatSearchQuery('');
                      setIsCatDropdownOpen(false);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                    title="ล้างการเลือกหมวดหมู่"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                  className="pr-3 pl-1 text-slate-400 hover:text-slate-700"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {isCatDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 z-30 max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {filteredCategories.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      ไม่พบหมวดหมู่ที่ค้นหา
                    </div>
                  ) : (
                    filteredCategories.map((cat) => {
                      const active = selectedCategory === cat.id;
                      const count =
                        cat.id === 'all'
                          ? products.length
                          : products.filter((p) => p.category_id === cat.id)
                              .length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            setCatSearchQuery('');
                            setIsCatDropdownOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-left text-xs sm:text-sm flex items-center justify-between hover:bg-indigo-50/70 ${
                            active
                              ? 'bg-indigo-50 font-bold text-indigo-700'
                              : 'text-slate-700 font-medium'
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              {count} รายการ
                            </span>
                            {active && (
                              <Check className="w-4 h-4 text-indigo-600" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ตารางการ์ดสินค้า */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 pb-32 lg:pb-4">
          {filteredProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
              <PackageSearch className="w-12 h-12 stroke-1.5 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600 text-sm">
                ไม่พบสินค้าที่ค้นหา
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                หากสแกนด้วยเครื่องยิงบาร์โค้ดแล้วกด Enter ระบบจะแจ้งเตือนหากไม่พบรหัสสินค้า
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
              {filteredProducts.map((product) => {
                const cartItem = cartItemMap.get(product.id);
                const qtyInCart = cartItem?.quantity || 0;
                const isWholesaleActiveInCart =
                  Boolean(cartItem?.is_wholesale_applied) ||
                  pricingMode === 'wholesale';

                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    qtyInCart={qtyInCart}
                    isWholesaleActiveInCart={isWholesaleActiveInCart}
                    onAddToCart={addToCart}
                    onEditQtyNumpad={handleEditQtyFromCard}
                    onRequestRemoveFromCart={handleRemoveFromCard}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ฝั่งขวา (Desktop): ตะกร้าสินค้าและคิดเงิน */}
      <div className="hidden lg:block lg:w-96 xl:w-[410px] border-l border-slate-200 bg-white shrink-0 h-full overflow-hidden">
        <CartPanel onOpenCheckout={() => setIsCheckoutOpen(true)} />
      </div>

      {/* แถบสรุปตะกร้าลอยด้านล่างสำหรับ Smartphone / Tablet (< lg) */}
      {cartSummary.items.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 p-2.5 z-20 pointer-events-none">
          <div className="max-w-lg mx-auto bg-slate-900 text-white rounded-2xl p-2.5 shadow-lg border border-slate-700 flex items-center justify-between gap-3 pointer-events-auto">
            <div
              onClick={() => setIsMobileCartOpen(true)}
              className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-sm relative shrink-0">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 px-1.5 min-w-[20px] h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center">
                  {cartSummary.totalItemsCount}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base text-white">
                    {formatCurrency(cartSummary.grandTotal)}
                  </span>
                  {cartSummary.wholesaleSavings > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      ลดส่ง -{formatCurrency(cartSummary.wholesaleSavings)}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300 flex items-center gap-1">
                  <span>แตะเพื่อดูรายการในตะกร้า</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCheckoutOpen(true)}
              className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shrink-0"
            >
              ชำระเงินทันที
            </button>
          </div>
        </div>
      )}

      {/* Drawer ตะกร้าสินค้าสำหรับ Smartphone / Tablet */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end bg-slate-900/75">
          <div className="bg-white w-full h-[86dvh] rounded-t-3xl overflow-hidden flex flex-col shadow-xl">
            <CartPanel
              onCloseMobileDrawer={() => setIsMobileCartOpen(false)}
              onOpenCheckout={() => {
                setIsMobileCartOpen(false);
                setIsCheckoutOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Numpad แก้ไขจำนวนสินค้าเมื่อกดที่แท็กจำนวนบน ProductCard */}
      <NumpadModal
        isOpen={Boolean(cardNumpadProduct)}
        title="แก้ไขจำนวนสินค้าในตะกร้า"
        subtitle={cardNumpadProduct?.name || ''}
        initialValue={cardNumpadInitialQty}
        allowDecimal={false}
        min={0}
        max={Number(cardNumpadProduct?.stock) || 9999}
        unitLabel={
          cardNumpadProduct
            ? `คงเหลือสูงสุด ${cardNumpadProduct.stock} ${cardNumpadProduct.unit}`
            : ''
        }
        presets={
          cardNumpadProduct
            ? [
                { label: `1 ${cardNumpadProduct.unit}`, value: 1 },
                {
                  label: `ส่ง (${cardNumpadProduct.wholesale_min_qty} ${cardNumpadProduct.unit})`,
                  value: Math.min(
                    cardNumpadProduct.stock,
                    cardNumpadProduct.wholesale_min_qty
                  ),
                },
              ]
            : []
        }
        onConfirm={(val) => {
          if (!cardNumpadProduct) return;
          if (val <= 0) {
            setProductToRemove(cardNumpadProduct);
          } else {
            updateCartQty(cardNumpadProduct.id, val);
          }
        }}
        onClose={() => setCardNumpadProduct(null)}
      />

      {/* Confirm ยืนยันการลบสินค้าออกจากตะกร้าจากปุ่มลบบน ProductCard */}
      <ConfirmModal
        isOpen={Boolean(productToRemove)}
        title="ยืนยันการลบสินค้า"
        message={
          productToRemove
            ? `คุณต้องการลบ "${productToRemove.name}" ออกจากตะกร้าสินค้าใช่หรือไม่?`
            : ''
        }
        confirmText="ลบสินค้า"
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setProductToRemove(null)}
        onConfirm={() => {
          if (productToRemove) {
            removeFromCart(productToRemove.id);
            setProductToRemove(null);
          }
        }}
      />

      {/* Popup Alert แจ้งเตือนเมื่อสแกนไม่พบบาร์โค้ด (บล็อกการสแกนต่อจนกว่าจะกดปิด) */}
      <BarcodeErrorModal
        barcode={notFoundBarcode}
        onClose={() => setNotFoundBarcode(null)}
      />

      {/* หน้าต่างรับชำระเงิน (Checkout Modal) */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderSuccess={(savedOrder) => setCompletedOrder(savedOrder)}
      />

      {/* หน้าต่างสั่งพิมพ์เอกสารหลังการขาย (Receipt / A4 / Order Slip Modal) */}
      <ReceiptModal
        order={completedOrder}
        onClose={() => setCompletedOrder(null)}
      />
    </div>
  );
}
