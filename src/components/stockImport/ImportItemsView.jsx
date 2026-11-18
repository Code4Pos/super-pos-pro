import React, { useState, useMemo } from 'react';
import {
  Package,
  Barcode,
  Camera,
  Trash2,
  ArrowLeft,
  Send,
  CheckCircle2,
  Building2,
  Phone,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SearchableDropdown from '../common/SearchableDropdown';
import MobileBarcodeModal from '../common/MobileBarcodeModal';
import ConfirmModal from '../common/ConfirmModal';
import { formatCurrency, formatNumber } from '../../utils/formatters';

/**
 * คำนวณยอดรวมแต่ละแถวของตารางนำเข้า (จำนวน x ราคานำเข้า - ส่วนลดรวม)
 */
export function enrichImportRows(items = []) {
  return items.map((row) => {
    const qty = Math.max(0, Number(row.quantity) || 0);
    const importPrice = Math.max(0, Number(row.import_price) || 0);
    const discount = Math.max(0, Number(row.total_discount) || 0);
    const lineTotal = Math.max(0, Number((qty * importPrice - discount).toFixed(2)));
    return { ...row, line_total: lineTotal };
  });
}

/**
 * Page 3: นำเข้าสินค้า
 * เลือกสินค้าเข้าตาราง แล้วยืนยันเป็น "ขออนุมัติ" (ยังไม่เพิ่มสต็อก)
 * หรือ "อนุมัติทันที" (เพิ่มสต็อกทันทีและเปลี่ยนสถานะเป็นนำเข้าสำเร็จ)
 */
export default function ImportItemsView({
  supplier,
  items,
  setItems,
  note,
  setNote,
  warehouseId = 'wh-front',
  setWarehouseId = () => {},
  importNumber = null,
  submitting = false,
  onBack,
  onSubmit,
}) {
  const { products, showToast, warehouses = [] } = usePOS();
  const activeWarehouses = warehouses.filter((w) => w.is_active !== false);
  const [productPickerValue, setProductPickerValue] = useState('');
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);

  // Modal แสดง/สแกนบาร์โค้ดเพื่อเพิ่มสินค้าเข้าตาราง
  const [barcodeModalConfig, setBarcodeModalConfig] = useState({
    isOpen: false,
    mode: 'scan',
    currentBarcode: '',
    productName: '',
  });

  const productOptions = useMemo(() => {
    return products.map((p) => {
      const codeDisplay = p.barcode?.trim() ? p.barcode.trim() : p.sku;
      return {
        value: p.id,
        label: `${codeDisplay} — ${p.name}`,
        badge: `ขาย ${formatCurrency(p.retail_price)} • ทุน ${formatCurrency(p.cost_price)}`,
        searchText: `${p.name} ${p.barcode || ''} ${p.sku || ''}`,
      };
    });
  }, [products]);

  // เพิ่มสินค้าเข้าตารางนำเข้า (ถ้ามีอยู่แล้วให้บวกจำนวนเพิ่ม 1)
  const handleAddProductToImport = (product) => {
    if (!product) return;

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product_id === product.id);
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: (Number(item.quantity) || 0) + 1 }
            : item
        );
      }

      // ถ้ารหัสบาร์โค้ดว่างเปล่า ให้ใช้รหัสสินค้า (SKU) แทน
      const barcodeOrSku = product.barcode?.trim() ? product.barcode.trim() : product.sku;

      const newRow = {
        row_id: `imp-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: product.id,
        barcode_or_sku: barcodeOrSku,
        barcode: product.barcode || '',
        sku: product.sku || '',
        product_name: product.name,
        unit: product.unit || 'ชิ้น',
        retail_price: Number(product.retail_price) || 0,
        quantity: 1, // ค่าเริ่มต้น = 1
        import_price: Number(product.cost_price) || 0, // ค่าเริ่มต้น = ราคาต้นทุน
        total_discount: 0, // ค่าเริ่มต้น = 0
      };
      return [...prev, newRow];
    });
  };

  const handleSelectProductDropdown = (prodId) => {
    if (!prodId) return;
    const target = products.find((p) => p.id === prodId);
    if (target) {
      handleAddProductToImport(target);
      setProductPickerValue('');
    }
  };

  // ค้นหาและเพิ่มสินค้าจากเลขบาร์โค้ดหรือรหัสสินค้าที่สแกนมา
  const handleAddByScannedBarcode = (scannedCode) => {
    const clean = String(scannedCode || '').trim().toLowerCase();
    if (!clean) return;

    const matched = products.find((p) => {
      if (String(p.barcode || '').trim().toLowerCase() === clean) return true;
      if (String(p.sku || '').trim().toLowerCase() === clean) return true;
      if (Array.isArray(p.selling_units)) {
        return p.selling_units.some(
          (su) => String(su.barcode || '').trim().toLowerCase() === clean
        );
      }
      return false;
    });

    if (matched) {
      handleAddProductToImport(matched);
      showToast(`เพิ่ม "${matched.name}" เข้าตารางนำเข้าแล้ว`, 'success');
    } else {
      showToast(`ไม่พบสินค้าที่มีบาร์โค้ดหรือรหัส "${scannedCode}"`, 'error');
    }
  };

  // สินค้า (หรือสินค้าหลักของสินค้ารอง) เปิดติดตาม Lot / วันหมดอายุหรือไม่
  const isLotTracked = (productId) => {
    const prod = products.find((p) => p.id === productId);
    const master = prod?.linked_product_id ? products.find((p) => p.id === prod.linked_product_id) : prod;
    return Boolean(master?.track_lots);
  };

  const handleUpdateImportRow = (rowId, field, value) => {
    setItems((prev) =>
      prev.map((row) => (row.row_id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveImportRow = (rowId) => {
    setItems((prev) => prev.filter((row) => row.row_id !== rowId));
  };

  const enrichedImportRows = useMemo(() => enrichImportRows(items), [items]);

  const importSummary = useMemo(() => {
    return {
      totalRows: enrichedImportRows.length,
      totalQty: enrichedImportRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0),
      totalDiscount: enrichedImportRows.reduce(
        (sum, r) => sum + (Number(r.total_discount) || 0),
        0
      ),
      grandTotal: enrichedImportRows.reduce((sum, r) => sum + (Number(r.line_total) || 0), 0),
    };
  }, [enrichedImportRows]);

  const canSubmit = !submitting && enrichedImportRows.length > 0 && Boolean(supplier);

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
      {/* ส่วนหัว: ผู้ผลิตที่เลือก + เลือกสินค้าด้วย Searchable Dropdown + ปุ่มสแกนบาร์โค้ด (ไอคอน) */}
      <div className="p-2.5 sm:p-3 border-b border-slate-200 space-y-2 shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-extrabold text-slate-900 truncate">
            {supplier?.name || '-'}
          </span>
          {supplier?.phone && (
            <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 shrink-0">
              <Phone className="w-3 h-3" />
              {supplier.phone}
            </span>
          )}
          {importNumber && (
            <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 font-mono font-extrabold shrink-0">
              แก้ไข {importNumber}
            </span>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-12 sm:col-span-6 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchableDropdown
                value={productPickerValue}
                onChange={(val) => handleSelectProductDropdown(val)}
                options={productOptions}
                icon={Package}
                placeholder="ค้นหาชื่อสินค้า, บาร์โค้ด หรือ SKU เพื่อเพิ่มลงตาราง..."
              />
            </div>
            {/* ปุ่มสแกนบาร์โค้ดเพิ่มสินค้า (ไอคอนอย่างเดียว) */}
            <button
              type="button"
              onClick={() =>
                setBarcodeModalConfig({
                  isOpen: true,
                  mode: 'scan',
                  currentBarcode: '',
                  productName: 'สแกนบาร์โค้ดเพื่อเพิ่มสินค้าเข้าตารางนำเข้า',
                })
              }
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0"
              title="สแกนบาร์โค้ดเพิ่มสินค้า"
              aria-label="สแกนบาร์โค้ดเพิ่มสินค้า"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          {/* คลังที่รับสินค้าเข้า (สต็อกเพิ่มเมื่อใบนำเข้าเป็น "นำเข้าสำเร็จ") */}
          <div className="col-span-5 sm:col-span-2">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              title="รับสินค้าเข้าคลัง"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {activeWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  เข้า: {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-7 sm:col-span-4">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุใบนำเข้า (เช่น เลขที่บิลผู้ผลิต)..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* ตารางรายการสินค้านำเข้า: 1 รายการ = 1 บรรทัด เลื่อนซ้าย-ขวาได้ ชื่อสินค้าแสดงยาวไม่ตัดบรรทัด */}
      <div className="flex-1 overflow-auto">
        <table className="w-max min-w-full text-left border-collapse whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2 px-2 w-10 text-center">ลบ</th>
              <th className="py-2 px-2">ชื่อสินค้า</th>
              <th className="py-2 px-2">บาร์โค้ด / SKU</th>
              <th className="py-2 px-2 text-right">ราคาขาย</th>
              <th className="py-2 px-2 text-center">จำนวน</th>
              <th className="py-2 px-2 text-right">ราคานำเข้า</th>
              <th className="py-2 px-2 text-right">ส่วนลดรวม</th>
              <th className="py-2 px-3 text-right">ยอดรวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 text-xs">
            {enrichedImportRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-14 text-center text-slate-400 whitespace-normal">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-9 h-9 text-slate-300" />
                    <span className="font-bold text-slate-600">
                      ยังไม่มีรายการสินค้าในตารางนำเข้า
                    </span>
                    <span className="text-[11px]">
                      ค้นหาสินค้าจากช่องด้านบน หรือกดปุ่มกล้องเพื่อสแกนบาร์โค้ด
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              enrichedImportRows.map((row) => (
                <tr key={row.row_id} className="hover:bg-indigo-50/30">
                  {/* ปุ่มลบสินค้าไว้ด้านหน้า */}
                  <td className="py-1.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveImportRow(row.row_id)}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200"
                      title="ลบรายการนี้ออกจากตาราง"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>

                  {/* ชื่อสินค้า + หน่วย (+ เลขล็อต/วันหมดอายุ เมื่อสินค้าหลักติดตาม Lot) ในบรรทัดเดียว */}
                  <td className="py-1.5 px-2 font-bold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <span>{row.product_name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">
                        {row.unit}
                      </span>
                      {isLotTracked(row.product_id) && (
                        <>
                          <input
                            type="text"
                            data-allow-scanner="false"
                            value={row.lot_number || ''}
                            onChange={(e) => handleUpdateImportRow(row.row_id, 'lot_number', e.target.value)}
                            placeholder="เลขล็อต"
                            className="w-24 px-2 py-1 rounded-lg border border-violet-300 bg-violet-50/40 text-[11px] font-normal"
                          />
                          <input
                            type="date"
                            value={row.expiry_date || ''}
                            onChange={(e) => handleUpdateImportRow(row.row_id, 'expiry_date', e.target.value)}
                            title="วันหมดอายุ"
                            className="px-2 py-1 rounded-lg border border-violet-300 bg-violet-50/40 text-[11px] font-normal"
                          />
                        </>
                      )}
                    </div>
                  </td>

                  {/* รหัสบาร์โค้ด (ถ้าไม่ได้ใส่บาร์โค้ดให้แสดงรหัสสินค้า SKU) กดเพื่อแสดงรูปบาร์โค้ด */}
                  <td className="py-1.5 px-2 font-mono font-bold text-slate-700">
                    <button
                      type="button"
                      onClick={() =>
                        setBarcodeModalConfig({
                          isOpen: true,
                          mode: 'display',
                          currentBarcode: row.barcode_or_sku,
                          productName: row.product_name,
                        })
                      }
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700"
                      title="คลิกเพื่อแสดงรูปบาร์โค้ด"
                    >
                      <Barcode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{row.barcode_or_sku}</span>
                      {!row.barcode?.trim() && (
                        <span className="px-1 rounded text-[10px] font-sans font-bold bg-slate-100 text-slate-500">
                          SKU
                        </span>
                      )}
                    </button>
                  </td>

                  {/* ราคาขายสินค้า */}
                  <td className="py-1.5 px-2 text-right font-bold text-indigo-700">
                    {formatCurrency(row.retail_price)}
                  </td>

                  {/* จำนวน (ค่าเริ่มต้น 1) */}
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => handleUpdateImportRow(row.row_id, 'quantity', e.target.value)}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-300 bg-white text-center font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>

                  {/* ราคานำเข้า (ค่าเริ่มต้น ราคาต้นทุน) */}
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.import_price}
                      onChange={(e) => handleUpdateImportRow(row.row_id, 'import_price', e.target.value)}
                      className="w-24 px-2 py-1 rounded-lg border border-slate-300 bg-white text-right font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>

                  {/* ส่วนลดรวม (ค่าเริ่มต้น 0) */}
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.total_discount}
                      onChange={(e) => handleUpdateImportRow(row.row_id, 'total_discount', e.target.value)}
                      className="w-24 px-2 py-1 rounded-lg border border-slate-300 bg-white text-right font-bold text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </td>

                  {/* ยอดรวม */}
                  <td className="py-1.5 px-3 text-right font-extrabold text-emerald-700 text-sm">
                    {formatCurrency(row.line_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* แถบสรุปยอดและปุ่มยืนยัน (ย่อขนาด): เปลี่ยนผู้ผลิต / ขออนุมัติ / อนุมัติทันที */}
      <div className="px-2.5 py-2 sm:px-3 border-t border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-slate-600">
          <span>
            <strong className="text-slate-900">{formatNumber(importSummary.totalRows)}</strong> รายการ
          </span>
          <span>
            รวม <strong className="text-indigo-700">{formatNumber(importSummary.totalQty)}</strong> หน่วย
          </span>
          <span>
            ส่วนลด <strong className="text-rose-600">{formatCurrency(importSummary.totalDiscount)}</strong>
          </span>
          <span>
            สุทธิ <strong className="text-sm text-emerald-700">{formatCurrency(importSummary.grandTotal)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="px-2.5 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>ผู้ผลิต</span>
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit('pending', enrichedImportRows)}
            className="px-2.5 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-slate-950 disabled:text-white text-[11px] font-bold flex items-center justify-center gap-1"
            title="บันทึกใบนำเข้าเป็นสถานะรออนุมัติ (ยังไม่เพิ่มสต็อก)"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{importNumber ? 'บันทึก' : 'ขออนุมัติ'}</span>
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setIsApproveConfirmOpen(true)}
            className="px-2.5 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[11px] font-bold flex items-center justify-center gap-1"
            title="เพิ่มสต็อกทันทีและเปลี่ยนสถานะเป็นนำเข้าสำเร็จ"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{submitting ? 'กำลังบันทึก...' : 'อนุมัติทันที'}</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isApproveConfirmOpen}
        variant="warning"
        title="อนุมัตินำเข้าสินค้าทันที?"
        message={`ระบบจะเพิ่มสต็อก ${formatNumber(importSummary.totalQty)} หน่วย และอัปเดตราคาต้นทุนทันที แล้วเปลี่ยนสถานะใบนำเข้าเป็น "นำเข้าสำเร็จ"`}
        confirmText="อนุมัติทันที"
        onCancel={() => setIsApproveConfirmOpen(false)}
        onConfirm={() => {
          setIsApproveConfirmOpen(false);
          onSubmit('completed', enrichedImportRows);
        }}
      />

      {/* Modal แสดงบาร์โค้ด / สแกนบาร์โค้ดเพื่อเพิ่มสินค้าเข้าตารางนำเข้า */}
      <MobileBarcodeModal
        isOpen={barcodeModalConfig.isOpen}
        initialMode={barcodeModalConfig.mode}
        initialBarcode={barcodeModalConfig.currentBarcode}
        productName={barcodeModalConfig.productName}
        unitLabel=""
        onClose={() => setBarcodeModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onSelectBarcode={(scannedCode) => {
          handleAddByScannedBarcode(scannedCode);
        }}
      />
    </div>
  );
}
