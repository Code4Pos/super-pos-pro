import React, { useState, useMemo } from 'react';
import {
  X,
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  Package,
  Clock,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

/**
 * TrashModal (version beta 0.1.5):
 * ระบบถังขยะสินค้า (Recycle Bin):
 * - เมื่อลบสินค้าจากหน้าคลังสินค้า สินค้าจะถูกย้ายมาเก็บไว้ในถังขยะนี้
 * - สามารถกด "กู้คืน" (Restore) เพื่อนำสินค้ากลับเข้าคลังสินค้าปกติได้
 * - หากกด "ลบ" ในถังขยะ จะเป็นการลบออกจากระบบอย่างถาวร (Permanent Delete)
 */
export default function TrashModal({ isOpen, onClose }) {
  const {
    trashedProducts,
    products,
    restoreProductFromTrash,
    permanentDeleteProduct,
    emptyTrash,
    showToast,
  } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [itemToPermanentDelete, setItemToPermanentDelete] = useState(null);
  const [isConfirmEmptyTrashOpen, setIsConfirmEmptyTrashOpen] = useState(false);

  const filteredTrash = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return trashedProducts;
    return trashedProducts.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [trashedProducts, searchQuery]);

  if (!isOpen) return null;

  const handleRestore = async (item) => {
    // ตรวจสอบว่ามีสินค้าในคลังปัจจุบันที่ใช้รหัส SKU หรือ Barcode ซ้ำกับสินค้าที่จะกู้คืนหรือไม่
    const skuLower = String(item.sku || '').trim().toLowerCase();
    const barcodeLower = String(item.barcode || '').trim().toLowerCase();

    const duplicateSku = products.find(
      (p) =>
        p.id !== item.id &&
        String(p.sku || '').trim().toLowerCase() === skuLower
    );
    if (duplicateSku) {
      showToast(
        `ไม่สามารถกู้คืนได้: รหัสสินค้า "${item.sku}" ซ้ำกับ "${duplicateSku.name}" ที่มีอยู่ในคลัง`,
        'error'
      );
      return;
    }

    if (barcodeLower) {
      const duplicateBarcode = products.find(
        (p) =>
          p.id !== item.id &&
          (String(p.barcode || '').trim().toLowerCase() === barcodeLower ||
            (Array.isArray(p.selling_units) &&
              p.selling_units.some(
                (su) =>
                  String(su.barcode || '').trim().toLowerCase() === barcodeLower
              )))
      );
      if (duplicateBarcode) {
        showToast(
          `ไม่สามารถกู้คืนได้: เลขบาร์โค้ด "${item.barcode}" ซ้ำกับ "${duplicateBarcode.name}"`,
          'error'
        );
        return;
      }
    }

    await restoreProductFromTrash(item.id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88dvh]">
        {/* ส่วนหัว Modal */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                ถังขยะสินค้า ({trashedProducts.length} รายการ)
              </h3>
              <p className="text-[11px] text-slate-400">
                สามารถกู้คืนสินค้ากลับเข้าคลัง หรือลบออกจากระบบอย่างถาวร
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* แถบค้นหาและปุ่มล้างถังขยะทั้งหมด */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-allow-scanner="false"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาสินค้าในถังขยะด้วยชื่อ, รหัส SKU หรือบาร์โค้ด..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {trashedProducts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsConfirmEmptyTrashOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ล้างถังขยะถาวรทั้งหมด</span>
            </button>
          )}
        </div>

        {/* รายการสินค้าในถังขยะ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredTrash.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-2.5 text-slate-300">
                <Package className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-600">
                ไม่มีรายการสินค้าในถังขยะ
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                รายการสินค้าที่ถูกลบจากหน้าคลังสินค้าจะถูกย้ายมาเก็บไว้ที่นี่
              </p>
            </div>
          ) : (
            filteredTrash.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                    {item.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                      {item.sku}
                    </span>
                    {item.barcode && <span>• {item.barcode}</span>}
                    <span className="font-sans">
                      • ปลีก {formatCurrency(item.retail_price)}/{item.unit}
                    </span>
                    <span className="font-sans">
                      • คงเหลือเดิม {item.stock} {item.unit}
                    </span>
                  </div>
                  {item.deleted_at && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                      <Clock className="w-3 h-3" />
                      <span>ลบเมื่อ: {formatDateTime(item.deleted_at)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(item)}
                    className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>กู้คืนสินค้า</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setItemToPermanentDelete(item)}
                    className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ลบถาวร</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* คำแนะนำด้านล่าง */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>การลบสินค้าในถังขยะจะเป็นการลบข้อมูลอย่างถาวรและไม่สามารถกู้คืนได้</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>

      {/* Confirm ยืนยันการลบสินค้าในถังขยะแบบถาวร */}
      <ConfirmModal
        isOpen={Boolean(itemToPermanentDelete)}
        title="ยืนยันการลบสินค้าแบบถาวร"
        message={
          itemToPermanentDelete
            ? `คุณต้องการลบสินค้า "${itemToPermanentDelete.name}" (${itemToPermanentDelete.sku}) ออกจากถังขยะอย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถกู้คืนได้`
            : ''
        }
        confirmText="ลบถาวรทันที"
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setItemToPermanentDelete(null)}
        onConfirm={async () => {
          if (itemToPermanentDelete) {
            await permanentDeleteProduct(itemToPermanentDelete.id);
            setItemToPermanentDelete(null);
          }
        }}
      />

      {/* Confirm ยืนยันการล้างถังขยะทั้งหมดแบบถาวร */}
      <ConfirmModal
        isOpen={isConfirmEmptyTrashOpen}
        title="ยืนยันการล้างถังขยะทั้งหมดแบบถาวร"
        message={`คุณต้องการลบสินค้าทั้งหมด ${trashedProducts.length} รายการในถังขยะอย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถกู้คืนได้`}
        confirmText={`ลบถาวรทั้ง ${trashedProducts.length} รายการ`}
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setIsConfirmEmptyTrashOpen(false)}
        onConfirm={async () => {
          await emptyTrash();
          setIsConfirmEmptyTrashOpen(false);
        }}
      />
    </div>
  );
}

