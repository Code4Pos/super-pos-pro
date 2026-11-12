import React, { useState, useMemo } from 'react';
import { X, ClipboardPlus, Trash2, Users } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SearchableDropdown from '../common/SearchableDropdown';
import { getAvailableToPromise } from '../../utils/salesOrders';
import { formatNumber } from '../../utils/formatters';

/**
 * สร้างใบสั่งขายส่ง (จองสินค้า) จำนวนจองต้องไม่เกินยอดพร้อมขาย (ATP)
 */
export default function SalesOrderModal({ onClose }) {
  const { products, customers, reservedByProduct, createSalesOrder } = usePOS();
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState([]); // [{ product_id, qty }]
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const atpOf = (product) => getAvailableToPromise(product, products, reservedByProduct);

  const customerOptions = useMemo(
    () =>
      customers
        .filter((c) => !c.is_blocked)
        .map((c) => ({
          value: c.id,
          label: c.name,
          badge: c.customer_type === 'wholesale' ? 'ขายส่ง' : '',
          searchText: `${c.code || ''} ${c.phone || ''} ${c.shop_name || ''}`,
        })),
    [customers]
  );

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => !items.some((i) => i.product_id === p.id))
        .map((p) => ({
          value: p.id,
          label: p.name,
          badge: `พร้อมขาย ${formatNumber(getAvailableToPromise(p, products, reservedByProduct))} ${p.unit || ''}`,
          searchText: `${p.sku || ''} ${p.barcode || ''}`,
        })),
    [products, items, reservedByProduct]
  );

  const handleSubmit = async () => {
    setSaving(true);
    const customer = customers.find((c) => c.id === customerId);
    const saved = await createSalesOrder({ customer, items, dueDate, note: note.trim() });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardPlus className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-extrabold text-slate-900">สร้างใบสั่งขายส่ง (จองสินค้า)</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-slate-600">ลูกค้า</span>
              <SearchableDropdown value={customerId} onChange={(v) => setCustomerId(v)} options={customerOptions} icon={Users} placeholder="ค้นหาลูกค้า..." placement="bottom" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-slate-600">กำหนดส่งของ</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-600">เพิ่มสินค้า</span>
            <SearchableDropdown
              value=""
              onChange={(v) => v && setItems((prev) => [...prev, { product_id: v, qty: '' }])}
              options={productOptions}
              placeholder="ค้นหาชื่อสินค้า / SKU / บาร์โค้ด..."
              placement="bottom"
            />
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">ยังไม่มีสินค้าในใบสั่งขาย</div>
            ) : (
              items.map((item) => {
                const product = products.find((p) => p.id === item.product_id);
                if (!product) return null;
                const atp = atpOf(product);
                const over = Number(item.qty) > atp;
                return (
                  <div key={item.product_id} className="p-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{product.name}</div>
                      <div className={`text-[11px] ${over ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                        พร้อมขาย (ATP) {formatNumber(atp)} {product.unit || ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(e) =>
                        setItems((prev) => prev.map((i) => (i.product_id === item.product_id ? { ...i, qty: e.target.value } : i)))
                      }
                      className={`w-24 px-2 py-1.5 rounded-lg border text-xs text-right font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        over ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                      }`}
                      placeholder="จำนวน"
                    />
                    <span className="text-[11px] text-slate-500 w-10">{product.unit || ''}</span>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((i) => i.product_id !== item.product_id))}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (เช่น ที่อยู่จัดส่ง)"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-slate-500">
            สินค้าจะถูกจองไว้ (ยังไม่ตัดสต็อก) จนกว่าจะกด "เปิดบิลขาย" และชำระเงินในหน้าขาย หรือยกเลิกใบสั่งขาย
          </p>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={saving || items.length === 0 || !customerId}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <ClipboardPlus className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกและจองสินค้า'}
          </button>
        </div>
      </div>
    </div>
  );
}
