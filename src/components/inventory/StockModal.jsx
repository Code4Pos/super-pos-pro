import React, { useState, useEffect } from 'react';
import {
  X,
  PackagePlus,
  PackageMinus,
  SlidersHorizontal,
  Check,
  GitBranch,
  DollarSign,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/formatters';

export default function StockModal({ product, onClose }) {
  const { products, updateProductStock } = usePOS();
  const [mode, setMode] = useState('add'); // 'add' | 'reduce' | 'set'
  const [amount, setAmount] = useState(1);
  const [remainderAmount, setRemainderAmount] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const masterProd = product?.linked_product_id
    ? products.find((p) => p.id === product.linked_product_id)
    : null;
  const isSecondaryLinked = Boolean(masterProd);
  const multiplier = masterProd
    ? Math.max(1, Number(product.linked_deduct_qty) || 1)
    : 1;

  const currentMasterStock = masterProd
    ? Number(masterProd.stock) || 0
    : Number(product?.stock) || 0;
  const currentStock = isSecondaryLinked
    ? Math.floor(currentMasterStock / multiplier)
    : Number(product?.stock) || 0;
  const currentRemainder = isSecondaryLinked
    ? currentMasterStock % multiplier
    : 0;
  const currentCost = Number(product?.cost_price) || 0;

  useEffect(() => {
    if (product) {
      const mProd = product.linked_product_id
        ? products.find((p) => p.id === product.linked_product_id)
        : null;
      const mult = mProd
        ? Math.max(1, Number(product.linked_deduct_qty) || 1)
        : 1;
      const mStock = mProd
        ? Number(mProd.stock) || 0
        : Number(product.stock) || 0;
      const rem = mProd ? mStock % mult : 0;

      setMode('add');
      setAmount(product.wholesale_min_qty || 12);
      setRemainderAmount(rem);
      setCostPrice(product.cost_price ?? 0);
    }
  }, [product?.id]);

  if (!product) return null;

  const numAmount = Math.max(0, Number(amount) || 0);
  const numRemainder = Math.max(0, Number(remainderAmount) || 0);

  let nextMasterStock = currentMasterStock;
  if (isSecondaryLinked) {
    if (mode === 'add') {
      nextMasterStock = Math.max(
        0,
        currentMasterStock + numAmount * multiplier
      );
    } else if (mode === 'reduce') {
      nextMasterStock = Math.max(
        0,
        currentMasterStock - numAmount * multiplier
      );
    } else {
      nextMasterStock = Math.max(0, numAmount * multiplier + numRemainder);
    }
  } else {
    if (mode === 'add') {
      nextMasterStock = Math.max(0, currentStock + numAmount);
    } else if (mode === 'reduce') {
      nextMasterStock = Math.max(0, currentStock - numAmount);
    } else {
      nextMasterStock = Math.max(0, numAmount);
    }
  }

  const previewStock = isSecondaryLinked
    ? Math.floor(nextMasterStock / multiplier)
    : nextMasterStock;
  const previewRemainder = isSecondaryLinked
    ? nextMasterStock % multiplier
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const hasCostUpdate = mode === 'add' || mode === 'set';
      if (isSecondaryLinked && masterProd) {
        const nextMasterCost = hasCostUpdate
          ? Number(((Number(costPrice) || 0) / multiplier).toFixed(2))
          : undefined;
        await updateProductStock(
          masterProd.id,
          nextMasterStock,
          nextMasterCost
        );
      } else {
        const nextCost = hasCostUpdate ? Number(costPrice) || 0 : undefined;
        await updateProductStock(product.id, previewStock, nextCost);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-base">ปรับสต็อกสินค้า</h3>
            <p className="text-xs text-slate-400 truncate">{product.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isSecondaryLinked && masterProd && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-violet-50/80 border border-violet-200/80 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0 text-violet-900 font-semibold truncate">
                <GitBranch className="w-4 h-4 text-violet-600 shrink-0" />
                <span className="truncate">{masterProd.name}</span>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-violet-200 text-[11px] font-bold text-violet-700 shrink-0">
                1 {product.unit} = {multiplier} {masterProd.unit}
              </span>
            </div>
          )}

          {/* แถบเลือกโหมด: เพิ่มสต็อก | ลดสต็อก | กำหนดยอดใหม่ */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100">
            <button
              type="button"
              onClick={() => {
                setMode('add');
                setAmount(product.wholesale_min_qty || 12);
                setCostPrice(product.cost_price ?? 0);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'add'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>เพิ่มสต็อก</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('reduce');
                setAmount(1);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'reduce'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackageMinus className="w-3.5 h-3.5 shrink-0" />
              <span>ลดสต็อก</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('set');
                setAmount(currentStock);
                setRemainderAmount(currentRemainder);
                setCostPrice(product.cost_price ?? 0);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'set'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>กำหนดยอดใหม่</span>
            </button>
          </div>

          {/* ช่องกรอกจำนวนสต็อก */}
          <div className="space-y-2">
            {isSecondaryLinked && mode === 'set' && masterProd ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวน ({product.unit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวน ({masterProd.unit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={remainderAmount}
                    onChange={(e) => setRemainderAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <>
                <label className="block text-xs font-bold text-slate-700">
                  {mode === 'add'
                    ? `จำนวนที่เพิ่ม (${product.unit})`
                    : mode === 'reduce'
                    ? `จำนวนที่ลด (${product.unit})`
                    : `ยอดสต็อกใหม่ (${product.unit})`}
                </label>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </>
            )}

            {(mode === 'add' || mode === 'reduce') && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[1, 6, 12, 24, 50, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      mode === 'reduce'
                        ? 'bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border-slate-200'
                        : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border-slate-200'
                    }`}
                  >
                    {mode === 'reduce' ? `-${val}` : `+${val}`} {product.unit}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ช่องราคาต้นทุน แสดงเฉพาะเมนู "เพิ่มสต็อก" และ "กำหนดยอดใหม่" */}
          {(mode === 'add' || mode === 'set') && (
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>ราคาต้นทุน (฿ / {product.unit})</span>
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  เดิม: {formatCurrency(currentCost)}
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-amber-50/30 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* สรุปยอดสต็อกเดิม -> สต็อกใหม่ (ไม่แสดงคำว่า เต็ม/เศษ ด้านหน้าตัวเลข) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500">สต็อกเดิม: </span>
              <strong className="text-slate-800">
                {isSecondaryLinked && masterProd
                  ? `${currentStock} ${product.unit} (${currentRemainder} ${masterProd.unit})`
                  : `${currentStock} ${product.unit}`}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">สต็อกใหม่: </span>
              <strong
                className={`text-sm sm:text-base ${
                  mode === 'reduce' ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {isSecondaryLinked && masterProd
                  ? `${previewStock} ${product.unit} (${previewRemainder} ${masterProd.unit})`
                  : `${previewStock} ${product.unit}`}
              </strong>
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all ${
                mode === 'reduce'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>ยืนยัน</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
