import React, { useState, useEffect } from 'react';
import {
  X,
  PackagePlus,
  PackageMinus,
  SlidersHorizontal,
  Check,
  GitBranch,
  Lock,
  DollarSign,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/formatters';

export default function StockModal({ product, onClose }) {
  const { products, updateProductStock } = usePOS();
  const [mode, setMode] = useState('add'); // 'add' | 'reduce' | 'set'
  const [amount, setAmount] = useState(1);
  const [costPrice, setCostPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setMode('add');
      setAmount(product.wholesale_min_qty || 12);
      setCostPrice(product.cost_price ?? 0);
    }
  }, [product]);

  if (!product) return null;

  const masterProd = product.linked_product_id
    ? products.find((p) => p.id === product.linked_product_id)
    : null;
  const isSecondaryLinked = Boolean(masterProd);
  const multiplier = masterProd
    ? Math.max(1, Number(product.linked_deduct_qty) || 1)
    : 1;

  const currentStock = Number(product.stock) || 0;
  const currentCost = Number(product.cost_price) || 0;
  const numAmount = Math.max(0, Number(amount) || 0);

  const previewStock =
    mode === 'add'
      ? Math.max(0, currentStock + numAmount)
      : mode === 'reduce'
      ? Math.max(0, currentStock - numAmount)
      : Math.max(0, numAmount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSecondaryLinked) return;
    setSaving(true);
    try {
      const nextCost =
        mode === 'add' || mode === 'set' ? Number(costPrice) || 0 : undefined;
      await updateProductStock(product.id, previewStock, nextCost);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">ปรับสต็อกสินค้า</h3>
            <p className="text-xs text-slate-400 truncate max-w-[260px]">
              {product.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isSecondaryLinked && (
            <div className="p-3.5 rounded-2xl bg-violet-50 border border-violet-200 text-xs text-violet-900 space-y-2">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                <div>
                  <strong>ล็อกการแก้ไข (สินค้ารองในระบบสินค้าสัมพันธ์):</strong>{' '}
                  สินค้านี้เชื่อมกับสินค้าหลัก{' '}
                  <span className="underline font-bold">{masterProd.name}</span>{' '}
                  (1 {product.unit} = {multiplier} {masterProd.unit})
                  ราคาต้นทุนและสต็อกจะคำนวณตามสินค้าหลักโดยอัตโนมัติ
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-xl bg-white border border-violet-200">
                  <div className="text-[10px] text-slate-500 font-bold">
                    ราคาต้นทุนสัมพันธ์
                  </div>
                  <div className="text-sm font-extrabold text-violet-700">
                    {formatCurrency(currentCost)} / {product.unit}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white border border-violet-200">
                  <div className="text-[10px] text-slate-500 font-bold">
                    สต็อกสัมพันธ์คงเหลือ
                  </div>
                  <div className="text-sm font-extrabold text-emerald-700">
                    {currentStock} {product.unit}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* แถบเลือกโหมด: เพิ่มสต็อก | ลดสต็อก | กำหนดยอดใหม่ */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100">
            <button
              type="button"
              disabled={isSecondaryLinked}
              onClick={() => {
                setMode('add');
                setAmount(product.wholesale_min_qty || 12);
                setCostPrice(product.cost_price ?? 0);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'add'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              } ${isSecondaryLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <PackagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>เพิ่มสต็อก</span>
            </button>

            <button
              type="button"
              disabled={isSecondaryLinked}
              onClick={() => {
                setMode('reduce');
                setAmount(1);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'reduce'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              } ${isSecondaryLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <PackageMinus className="w-3.5 h-3.5 shrink-0" />
              <span>ลดสต็อก</span>
            </button>

            <button
              type="button"
              disabled={isSecondaryLinked}
              onClick={() => {
                setMode('set');
                setAmount(currentStock);
                setCostPrice(product.cost_price ?? 0);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mode === 'set'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              } ${isSecondaryLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>กำหนดยอดใหม่</span>
            </button>
          </div>

          {/* ช่องกรอกจำนวนสต็อก */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              {mode === 'add'
                ? `จำนวนที่เพิ่มสต็อก (${product.unit})`
                : mode === 'reduce'
                ? `จำนวนที่ลดสต็อก (${product.unit})`
                : `กำหนดยอดสต็อกใหม่ (${product.unit})`}
            </label>
            <input
              type="number"
              min="0"
              disabled={isSecondaryLinked}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isSecondaryLinked
                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'border-slate-300 text-slate-900'
              }`}
            />

            {(mode === 'add' || mode === 'reduce') && !isSecondaryLinked && (
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

          {/* ช่องราคาต้นทุน แสดงเฉพาะเมนู "เพิ่มสต็อก" และ "กำหนดยอดใหม่" (ค่าเริ่มต้นเป็นราคาต้นทุนปัจจุบัน) */}
          {(mode === 'add' || mode === 'set') && (
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>ราคาต้นทุน (฿ / {product.unit})</span>
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  ต้นทุนเดิม: {formatCurrency(currentCost)}
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isSecondaryLinked}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className={`w-full px-4 py-2.5 rounded-xl border text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isSecondaryLinked
                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 text-slate-900 bg-amber-50/30'
                }`}
              />
            </div>
          )}

          {/* สรุปยอดสต็อกและต้นทุนก่อนบันทึก */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-slate-500">สต็อกเดิม: </span>
                <strong className="text-slate-800">
                  {currentStock} {product.unit}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">สต็อกใหม่: </span>
                <strong
                  className={`text-base ${
                    mode === 'reduce' ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {previewStock} {product.unit}
                </strong>
              </div>
            </div>

            {(mode === 'add' || mode === 'set') && (
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70">
                <span className="text-slate-500">ราคาต้นทุนที่จะบันทึก:</span>
                <strong className="text-amber-700 font-bold">
                  {formatCurrency(Number(costPrice) || 0)} / {product.unit}
                </strong>
              </div>
            )}
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || isSecondaryLinked}
              className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all ${
                isSecondaryLinked
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : mode === 'reduce'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>ยืนยันอัปเดตสต็อก</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
