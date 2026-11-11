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
import { ADJUST_REASONS, requiresApprover } from '../../utils/stockLedger';

export default function StockModal({ product, onClose }) {
  const {
    products,
    updateProductStock,
    authEnabled,
    currentUser,
    users,
    can,
    verifyApprover,
    showToast,
  } = usePOS();
  // เมื่อเปิดระบบผู้ใช้: ผู้มีสิทธิ์อนุมัติจะเป็นผู้อนุมัติอัตโนมัติ ถ้าไม่มีสิทธิ์ต้องให้ผู้จัดการใส่ PIN
  const [approverId, setApproverId] = useState('');
  const [approverPin, setApproverPin] = useState('');
  const approverCandidates = (users || []).filter(
    (u) => u.is_active && (u.role === 'admin' || u.role === 'manager')
  );
  const selfApprove = authEnabled && can('approve_stock');
  const canAdjust = !authEnabled || can('adjust_stock');
  const [mode, setMode] = useState('add'); // 'add' | 'reduce' | 'set'
  const [amount, setAmount] = useState(1);
  const [remainderAmount, setRemainderAmount] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  // เหตุผลและผู้อนุมัติการปรับสต็อก (บันทึกลง Stock Ledger)
  const [reason, setReason] = useState(ADJUST_REASONS.add[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [approvedBy, setApprovedBy] = useState('');

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
      setReason(ADJUST_REASONS.add[0]);
      setReasonDetail('');
      setApprovedBy('');
      setApproverId('');
      setApproverPin('');
    }
  }, [product?.id]);

  // เปลี่ยนโหมดแล้วเลือกเหตุผลแรกของโหมดนั้นให้อัตโนมัติ
  useEffect(() => {
    setReason(ADJUST_REASONS[mode][0]);
    setReasonDetail('');
  }, [mode]);

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

  const needsApprover = requiresApprover(mode);
  const finalReason = reason === 'อื่นๆ' ? reasonDetail.trim() : reason;
  const approverReady = !needsApprover
    ? true
    : !authEnabled
    ? approvedBy.trim() !== ''
    : selfApprove || (approverId !== '' && approverPin.length >= 4);
  const canSubmit = !saving && canAdjust && Boolean(finalReason) && approverReady;

  // ชื่อผู้อนุมัติที่บันทึกลง Stock Ledger (ตรวจ PIN ของผู้อนุมัติเมื่อเปิดระบบผู้ใช้)
  const resolveApproverName = () => {
    if (!authEnabled) return approvedBy.trim();
    if (selfApprove) return currentUser.name;
    if (!needsApprover) return '';
    const approver = verifyApprover(approverId, approverPin, 'approve_stock');
    return approver ? approver.name : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const approverName = resolveApproverName();
    if (approverName === null) {
      showToast('PIN ผู้อนุมัติไม่ถูกต้อง', 'error');
      setApproverPin('');
      return;
    }
    setSaving(true);
    try {
      const hasCostUpdate = mode === 'add' || mode === 'set';
      const movementMeta = {
        reason: finalReason,
        approved_by: approverName,
        reference_doc: authEnabled && currentUser ? `ปรับสต็อกโดย ${currentUser.name}` : 'ปรับสต็อกด้วยมือ',
      };
      if (isSecondaryLinked && masterProd) {
        const nextMasterCost = hasCostUpdate
          ? Number(((Number(costPrice) || 0) / multiplier).toFixed(2))
          : undefined;
        await updateProductStock(
          masterProd.id,
          nextMasterStock,
          nextMasterCost,
          movementMeta
        );
      } else {
        const nextCost = hasCostUpdate ? Number(costPrice) || 0 : undefined;
        await updateProductStock(product.id, previewStock, nextCost, movementMeta);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94dvh]">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
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

          {/* เหตุผลการปรับสต็อก (บังคับ) และผู้อนุมัติ (บังคับเมื่อลด/กำหนดยอดใหม่) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className={reason === 'อื่นๆ' ? 'col-span-2 sm:col-span-1' : ''}>
              <label className="block text-xs font-bold text-slate-700 mb-1">เหตุผล *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              >
                {ADJUST_REASONS[mode].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ผู้อนุมัติ {needsApprover ? '*' : '(ไม่บังคับ)'}
              </label>
              {!authEnabled ? (
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="ชื่อผู้อนุมัติ"
                  className={`w-full px-3 py-2 rounded-xl border text-xs ${
                    needsApprover && !approvedBy.trim() ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300'
                  }`}
                />
              ) : selfApprove || !needsApprover ? (
                <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                  {selfApprove ? currentUser.name : '-'}
                </div>
              ) : (
                <select
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border bg-white text-xs font-bold ${
                    approverId ? 'border-slate-300' : 'border-amber-400'
                  }`}
                >
                  <option value="">เลือกผู้จัดการ...</option>
                  {approverCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {authEnabled && needsApprover && !selfApprove && (
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                data-allow-scanner="false"
                maxLength={6}
                value={approverPin}
                onChange={(e) => setApproverPin(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN ผู้อนุมัติ *"
                className="col-span-2 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono tracking-widest"
              />
            )}
            {!canAdjust && (
              <p className="col-span-2 text-[11px] font-bold text-rose-600">
                บทบาทของคุณไม่มีสิทธิ์ปรับสต็อก
              </p>
            )}
            {reason === 'อื่นๆ' && (
              <input
                type="text"
                data-allow-scanner="false"
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder="ระบุเหตุผล *"
                className="col-span-2 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            )}
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
              disabled={!canSubmit}
              className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50 ${
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
