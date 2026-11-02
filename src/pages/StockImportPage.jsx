import React, { useState, useMemo } from 'react';
import {
  Truck,
  UserPlus,
  Edit3,
  Package,
  Barcode,
  Camera,
  Trash2,
  Plus,
  Save,
  MapPin,
  Phone,
  Building2,
  X,
  CheckCircle2,
  History,
  FileText,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SearchableDropdown from '../components/common/SearchableDropdown';
import MobileBarcodeModal from '../components/common/MobileBarcodeModal';
import {
  getProvinceOptions,
  getAmphoeOptions,
  getTambonOptions,
  resolvePostalCode,
} from '../data/thaiAddressData';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

const DEFAULT_SUPPLIER_FORM = {
  id: null,
  name: '',
  address: '',
  tambon: '',
  amphoe: '',
  province: '',
  zipcode: '',
  phone: '',
};

export default function StockImportPage() {
  const {
    products,
    suppliers = [],
    stockImports = [],
    saveSupplier,
    createStockImport,
    showToast,
  } = usePOS();

  // สลับมุมมอง: 'import' (หน้าสร้างใบนำเข้าสินค้า) | 'history' (ประวัติการนำเข้าสินค้า)
  const [viewMode, setViewMode] = useState('import');

  // Stage 1: เลือกผู้ผลิต (Supplier)
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    () => suppliers[0]?.id || ''
  );

  // Stage 2: รายการสินค้าในตารางนำเข้า
  const [importItems, setImportItems] = useState([]);
  const [productPickerValue, setProductPickerValue] = useState('');
  const [importNote, setImportNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal ลงทะเบียน/แก้ไขผู้ผลิต
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState(DEFAULT_SUPPLIER_FORM);

  // Modal แสดง/สแกนบาร์โค้ดเพื่อเพิ่มสินค้าเข้าตาราง
  const [barcodeModalConfig, setBarcodeModalConfig] = useState({
    isOpen: false,
    mode: 'scan',
    currentBarcode: '',
    productName: '',
  });

  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.province ? `จ.${s.province} • ${s.phone || '-'}` : s.phone || '',
      searchText: `${s.name} ${s.phone} ${s.province} ${s.amphoe} ${s.tambon}`,
    }));
  }, [suppliers]);

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

  // ข้อมูล Dropdown จังหวัด / อำเภอ / ตำบล ของประเทศไทยทั้งหมดสำหรับ Modal ผู้ผลิต
  const provinceOptions = useMemo(() => getProvinceOptions(), []);
  const amphoeOptions = useMemo(
    () => getAmphoeOptions(supplierForm.province),
    [supplierForm.province]
  );
  const tambonOptions = useMemo(
    () => getTambonOptions(supplierForm.province, supplierForm.amphoe),
    [supplierForm.province, supplierForm.amphoe]
  );

  // เพิ่มสินค้าเข้าตารางนำเข้า (Stage 2)
  const handleAddProductToImport = (product) => {
    if (!product) return;

    setImportItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product_id === product.id
      );
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: (Number(item.quantity) || 0) + 1 }
            : item
        );
      }

      // ถ้ารหัสบาร์โค้ดว่างเปล่า ให้ใช้รหัสสินค้า (SKU) แทน
      const barcodeOrSku = product.barcode?.trim()
        ? product.barcode.trim()
        : product.sku;

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

  const handleUpdateImportRow = (rowId, field, value) => {
    setImportItems((prev) =>
      prev.map((row) => (row.row_id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveImportRow = (rowId) => {
    setImportItems((prev) => prev.filter((row) => row.row_id !== rowId));
  };

  // คำนวณยอดรวมแต่ละแถวและยอดรวมสุทธิ
  const enrichedImportRows = useMemo(() => {
    return importItems.map((row) => {
      const qty = Math.max(0, Number(row.quantity) || 0);
      const importPrice = Math.max(0, Number(row.import_price) || 0);
      const discount = Math.max(0, Number(row.total_discount) || 0);
      const gross = qty * importPrice;
      const lineTotal = Math.max(0, Number((gross - discount).toFixed(2)));
      return {
        ...row,
        line_total: lineTotal,
      };
    });
  }, [importItems]);

  const importSummary = useMemo(() => {
    const totalRows = enrichedImportRows.length;
    const totalQty = enrichedImportRows.reduce(
      (sum, r) => sum + (Number(r.quantity) || 0),
      0
    );
    const totalDiscount = enrichedImportRows.reduce(
      (sum, r) => sum + (Number(r.total_discount) || 0),
      0
    );
    const grandTotal = enrichedImportRows.reduce(
      (sum, r) => sum + (Number(r.line_total) || 0),
      0
    );
    return { totalRows, totalQty, totalDiscount, grandTotal };
  }, [enrichedImportRows]);

  // เปิด Modal ลงทะเบียนผู้ผลิตใหม่
  const openRegisterSupplierModal = () => {
    setSupplierForm(DEFAULT_SUPPLIER_FORM);
    setIsSupplierModalOpen(true);
  };

  // เปิด Modal แก้ไขข้อมูลผู้ผลิตที่เลือกอยู่
  const openEditSupplierModal = (supplier) => {
    if (!supplier) return;
    setSupplierForm({
      id: supplier.id,
      name: supplier.name || '',
      address: supplier.address || '',
      tambon: supplier.tambon || '',
      amphoe: supplier.amphoe || '',
      province: supplier.province || '',
      zipcode: supplier.zipcode || '',
      phone: supplier.phone || '',
    });
    setIsSupplierModalOpen(true);
  };

  // การเลือกจังหวัด / อำเภอ / ตำบล พร้อมใส่รหัสไปรษณีย์อัตโนมัติ
  const handleSelectProvince = (provVal) => {
    setSupplierForm((prev) => ({
      ...prev,
      province: provVal,
      amphoe: '',
      tambon: '',
      zipcode: '',
    }));
  };

  const handleSelectAmphoe = (ampVal, optObj) => {
    const resolvedProv = optObj?.province || supplierForm.province;
    const resolvedAmp = optObj?.amphoe || String(ampVal).split('||')[0];
    const autoZip = resolvePostalCode(resolvedProv, resolvedAmp, '');
    setSupplierForm((prev) => ({
      ...prev,
      province: resolvedProv,
      amphoe: resolvedAmp,
      tambon: '',
      zipcode: autoZip || prev.zipcode,
    }));
  };

  const handleSelectTambon = (tamVal, optObj) => {
    const resolvedProv =
      optObj?.province ||
      (String(tamVal).includes('||') ? String(tamVal).split('||')[2] : supplierForm.province);
    const resolvedAmp =
      optObj?.amphoe ||
      (String(tamVal).includes('||') ? String(tamVal).split('||')[1] : supplierForm.amphoe);
    const resolvedTam =
      optObj?.tambon ||
      (String(tamVal).includes('||') ? String(tamVal).split('||')[0] : tamVal);
    const autoZip =
      optObj?.zipcode ||
      resolvePostalCode(resolvedProv, resolvedAmp, resolvedTam);

    setSupplierForm((prev) => ({
      ...prev,
      province: resolvedProv,
      amphoe: resolvedAmp,
      tambon: resolvedTam,
      zipcode: autoZip || prev.zipcode,
    }));
  };

  const handleSaveSupplierForm = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast('กรุณาระบุชื่อผู้ผลิต', 'error');
      return;
    }
    const saved = await saveSupplier(supplierForm);
    setSelectedSupplierId(saved.id);
    setIsSupplierModalOpen(false);
  };

  const handleConfirmStockImport = async () => {
    if (!selectedSupplier) {
      showToast('กรุณาเลือกผู้ผลิตใน Stage 1 ก่อนบันทึกนำเข้าสินค้า', 'error');
      return;
    }
    if (enrichedImportRows.length === 0) {
      showToast('กรุณาเลือกสินค้าเข้าตารางอย่างน้อย 1 รายการ', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await createStockImport({
        supplier: selectedSupplier,
        items: enrichedImportRows,
        note: importNote,
      });
      setImportItems([]);
      setImportNote('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      {/* แถบหัวข้อเพจนำเข้าสินค้า */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
              ระบบนำเข้าสินค้าเข้าคลัง (Stock Import)
            </h1>
            <p className="text-xs text-slate-500">
              Stage 1 เลือกผู้ผลิต • Stage 2 เลือกสินค้าและตรวจสอบตารางนำเข้าเพื่อรับสต็อกเข้าคลัง
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('import')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'import'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>สร้างใบนำเข้าสินค้า</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'history'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>ประวัติการนำเข้า ({stockImports.length})</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'history' ? (
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
          {stockImports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                ยังไม่มีประวัติการนำเข้าสินค้า
              </div>
              <p className="text-xs text-slate-400">
                เมื่อยืนยันการนำเข้าสินค้า รายการใบนำเข้าจะแสดงที่นี่
              </p>
            </div>
          ) : (
            stockImports.map((imp) => (
              <div
                key={imp.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-extrabold">
                      {imp.import_number}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      ผู้ผลิต: {imp.supplier_name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(imp.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">
                      รวม <strong>{imp.total_items}</strong> ชิ้น
                    </span>
                    <span className="text-sm font-extrabold text-emerald-700">
                      ยอดรวมสุทธิ {formatCurrency(imp.grand_total)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="py-1.5 px-2">รหัสบาร์โค้ด / รหัสสินค้า</th>
                        <th className="py-1.5 px-2">ชื่อสินค้า</th>
                        <th className="py-1.5 px-2 text-right">ราคาขาย</th>
                        <th className="py-1.5 px-2 text-center">จำนวน</th>
                        <th className="py-1.5 px-2 text-right">ราคานำเข้า</th>
                        <th className="py-1.5 px-2 text-right">ส่วนลดรวม</th>
                        <th className="py-1.5 px-2 text-right">ยอดรวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(imp.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-mono font-bold text-slate-700">
                            {it.barcode_or_sku}
                          </td>
                          <td className="py-1.5 px-2 font-semibold text-slate-900">
                            {it.product_name}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-600">
                            {formatCurrency(it.retail_price)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-bold text-indigo-700">
                            {it.quantity} {it.unit}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-700">
                            {formatCurrency(it.import_price)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-rose-600">
                            {formatCurrency(it.total_discount)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                            {formatCurrency(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden gap-3.5">
          {/* STAGE 1: เลือกผู้ผลิต (บริษัทหรือร้านที่ขายของให้เรา) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shrink-0 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-600 text-white">
                  Stage 1
                </span>
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
                  เลือกผู้ผลิต (บริษัทหรือร้านค้าที่ขายของให้เรา)
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {selectedSupplier && (
                  <button
                    type="button"
                    onClick={() => openEditSupplierModal(selectedSupplier)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>แก้ไขผู้ผลิต</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={openRegisterSupplierModal}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>ลงทะเบียนผู้ผลิต</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <div className="lg:col-span-5">
                <SearchableDropdown
                  value={selectedSupplierId}
                  onChange={(val) => setSelectedSupplierId(val)}
                  options={supplierOptions}
                  icon={Building2}
                  placeholder="พิมพ์ค้นหาชื่อผู้ผลิต, เบอร์โทร หรือจังหวัด..."
                />
              </div>

              <div className="lg:col-span-7">
                {selectedSupplier ? (
                  <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">
                        {selectedSupplier.name}
                      </span>
                      <span className="text-slate-500 truncate">
                        {[
                          selectedSupplier.address,
                          selectedSupplier.tambon &&
                            `ต.${selectedSupplier.tambon}`,
                          selectedSupplier.amphoe &&
                            `อ.${selectedSupplier.amphoe}`,
                          selectedSupplier.province &&
                            `จ.${selectedSupplier.province}`,
                          selectedSupplier.zipcode,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                    </div>
                    {selectedSupplier.phone && (
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 shrink-0">
                        <Phone className="w-3 h-3" />
                        {selectedSupplier.phone}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                    กรุณาเลือกผู้ผลิต หรือกดปุ่ม &ldquo;ลงทะเบียนผู้ผลิต&rdquo; เพื่อเริ่มนำเข้าสินค้า
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* STAGE 2: เลือกสินค้าเข้าตารางนำเข้า และ ตารางรายการนำเข้า */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
            {/* ส่วนหัว Stage 2: เลือกสินค้าด้วย Searchable Dropdown + ปุ่มแสดง/สแกนบาร์โค้ด */}
            <div className="p-4 border-b border-slate-200 space-y-3 shrink-0 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                      selectedSupplier
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-300 text-slate-600'
                    }`}
                  >
                    Stage 2
                  </span>
                  <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
                    เลือกสินค้าเข้าตารางนำเข้า (พิมพ์ค้นหา หรือใช้บาร์โค้ด)
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {/* ปุ่มสแกนบาร์โค้ดเพิ่มสินค้า */}
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
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>สแกนบาร์โค้ดเพิ่มสินค้า</span>
                  </button>

                  {/* ปุ่มแสดงบาร์โค้ดเพื่อเลือกเพิ่มสินค้า */}
                  <button
                    type="button"
                    onClick={() =>
                      setBarcodeModalConfig({
                        isOpen: true,
                        mode: 'display',
                        currentBarcode:
                          products[0]?.barcode || products[0]?.sku || '',
                        productName: products[0]?.name || 'บาร์โค้ดสินค้า',
                      })
                    }
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>แสดงบาร์โค้ดเพิ่มสินค้า</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                <div className="sm:col-span-8">
                  <SearchableDropdown
                    value={productPickerValue}
                    onChange={(val) => handleSelectProductDropdown(val)}
                    options={productOptions}
                    icon={Package}
                    placeholder="พิมพ์ค้นหาชื่อสินค้า, รหัสบาร์โค้ด หรือรหัสสินค้า (SKU) เพื่อเพิ่มลงตาราง..."
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={importNote}
                    onChange={(e) => setImportNote(e.target.value)}
                    placeholder="หมายเหตุใบนำเข้า (เช่น เลขที่บิลผู้ผลิต)..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* ตารางรายการสินค้านำเข้า 7 คอลัมน์ + ปุ่มลบด้านหน้า */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600 uppercase">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">ลบ</th>
                    <th className="py-2.5 px-3">
                      1. รหัสบาร์โค้ด / รหัสสินค้า
                    </th>
                    <th className="py-2.5 px-3">2. ชื่อสินค้า</th>
                    <th className="py-2.5 px-3 text-right">
                      3. ราคาขายสินค้า
                    </th>
                    <th className="py-2.5 px-3 text-center w-32">
                      4. จำนวน
                    </th>
                    <th className="py-2.5 px-3 text-right w-36">
                      5. ราคานำเข้า
                    </th>
                    <th className="py-2.5 px-3 text-right w-36">
                      6. ส่วนลดรวม
                    </th>
                    <th className="py-2.5 px-4 text-right w-36">
                      7. ยอดรวม
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {enrichedImportRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-14 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Package className="w-9 h-9 text-slate-300" />
                          <span className="font-bold text-slate-600">
                            ยังไม่มีรายการสินค้าในตารางนำเข้า
                          </span>
                          <span className="text-[11px]">
                            ค้นหาและเลือกสินค้าจากช่อง Dropdown ด้านบน หรือกดปุ่มบาร์โค้ดเพื่อเพิ่มสินค้า
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    enrichedImportRows.map((row) => (
                      <tr
                        key={row.row_id}
                        className="hover:bg-indigo-50/30 transition-colors"
                      >
                        {/* ปุ่มลบสินค้าไว้ด้านหน้า */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveImportRow(row.row_id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-colors"
                            title="ลบรายการนี้ออกจากตาราง"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* 1. รหัสบาร์โค้ด (ถ้าไม่ได้ใส่บาร์โค้ดให้แสดงรหัสสินค้า SKU) */}
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
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
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 border border-slate-200 transition-colors"
                              title="คลิกเพื่อแสดงรูปบาร์โค้ด"
                            >
                              <Barcode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>{row.barcode_or_sku}</span>
                            </button>
                            {!row.barcode?.trim() && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-slate-100 text-slate-500">
                                SKU
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. ชื่อสินค้า */}
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div>{row.product_name}</div>
                          <div className="text-[10px] font-normal text-slate-400">
                            หน่วย: {row.unit}
                          </div>
                        </td>

                        {/* 3. ราคาขายสินค้า */}
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-700 whitespace-nowrap">
                          {formatCurrency(row.retail_price)}
                        </td>

                        {/* 4. จำนวน (ค่าเริ่มต้น 1) */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={row.quantity}
                            onChange={(e) =>
                              handleUpdateImportRow(
                                row.row_id,
                                'quantity',
                                e.target.value
                              )
                            }
                            className="w-24 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-center font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>

                        {/* 5. ราคานำเข้า (ค่าเริ่มต้น ราคาต้นทุน) */}
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.import_price}
                            onChange={(e) =>
                              handleUpdateImportRow(
                                row.row_id,
                                'import_price',
                                e.target.value
                              )
                            }
                            className="w-28 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-right font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>

                        {/* 6. ส่วนลดรวม (ค่าเริ่มต้น 0) */}
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.total_discount}
                            onChange={(e) =>
                              handleUpdateImportRow(
                                row.row_id,
                                'total_discount',
                                e.target.value
                              )
                            }
                            className="w-28 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-right font-bold text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </td>

                        {/* 7. ยอดรวม */}
                        <td className="py-2.5 px-4 text-right font-extrabold text-emerald-700 text-sm whitespace-nowrap">
                          {formatCurrency(row.line_total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* แถบสรุปยอดและปุ่มยืนยันการนำเข้าสินค้า */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <span className="text-slate-600">
                  จำนวนรายการ:{' '}
                  <strong className="text-slate-900">
                    {formatNumber(importSummary.totalRows)} รายการ
                  </strong>
                </span>
                <span className="text-slate-600">
                  จำนวนรวม:{' '}
                  <strong className="text-indigo-700">
                    {formatNumber(importSummary.totalQty)} หน่วย
                  </strong>
                </span>
                <span className="text-slate-600">
                  ส่วนลดรวม:{' '}
                  <strong className="text-rose-600">
                    {formatCurrency(importSummary.totalDiscount)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4">
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-slate-500">
                    ยอดรวมสุทธิใบนำเข้า
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-emerald-700">
                    {formatCurrency(importSummary.grandTotal)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    submitting ||
                    enrichedImportRows.length === 0 ||
                    !selectedSupplier
                  }
                  onClick={handleConfirmStockImport}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {submitting ? 'กำลังบันทึก...' : 'ยืนยันนำเข้าสินค้า'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ลงทะเบียนผู้ผลิต (ชื่อ, ที่อยู่, ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์อัตโนมัติ, เบอร์โทร) */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold">
                  {supplierForm.id
                    ? 'แก้ไขข้อมูลผู้ผลิต'
                    : 'ลงทะเบียนผู้ผลิต (บริษัท / ร้านค้าที่ขายของให้เรา)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveSupplierForm}
              className="p-5 overflow-y-auto space-y-4"
            >
              {/* ชื่อผู้ผลิต & เบอร์โทร */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อผู้ผลิต (บริษัท / ร้านค้า) *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierForm.name}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, name: e.target.value })
                    }
                    placeholder="เช่น บริษัท สยามดิสทริบิวชั่น จำกัด"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เบอร์โทร
                  </label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        phone: e.target.value,
                      })
                    }
                    placeholder="เช่น 02-123-4567, 081-234-5678"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* ที่อยู่ (บ้านเลขที่ หมู่ ซอย ถนน) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ที่อยู่ (เลขที่ หมู่บ้าน ซอย ถนน)
                </label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      address: e.target.value,
                    })
                  }
                  placeholder="ระบุบ้านเลขที่ หมู่ ซอย ถนน..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* จังหวัด & อำเภอ (Searchable Dropdown ข้อมูลครบทั้งประเทศไทย) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จังหวัด (พิมพ์ค้นหาได้)
                  </label>
                  <SearchableDropdown
                    value={supplierForm.province}
                    onChange={handleSelectProvince}
                    options={provinceOptions}
                    icon={MapPin}
                    allowClear={true}
                    defaultValue=""
                    placeholder="พิมพ์ค้นหาจังหวัด..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    อำเภอ / เขต (พิมพ์ค้นหาได้)
                  </label>
                  <SearchableDropdown
                    value={supplierForm.amphoe}
                    onChange={handleSelectAmphoe}
                    options={amphoeOptions}
                    icon={MapPin}
                    allowClear={true}
                    defaultValue=""
                    placeholder="พิมพ์ค้นหาอำเภอ/เขต..."
                  />
                </div>
              </div>

              {/* ตำบล & รหัสไปรษณีย์อัตโนมัติ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ตำบล / แขวง (พิมพ์ค้นหาได้)
                  </label>
                  <SearchableDropdown
                    value={supplierForm.tambon}
                    onChange={handleSelectTambon}
                    options={tambonOptions}
                    icon={MapPin}
                    allowClear={true}
                    defaultValue=""
                    placeholder="พิมพ์ค้นหาตำบล/แขวง..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสไปรษณีย์ (เติมให้อัตโนมัติ)
                  </label>
                  <input
                    type="text"
                    value={supplierForm.zipcode}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        zipcode: e.target.value,
                      })
                    }
                    placeholder="รหัสไปรษณีย์ 5 หลัก"
                    className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50/40 text-xs font-mono font-extrabold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>บันทึกข้อมูลผู้ผลิต</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal แสดงบาร์โค้ด / สแกนบาร์โค้ดเพื่อเพิ่มสินค้าเข้าตารางนำเข้า */}
      <MobileBarcodeModal
        isOpen={barcodeModalConfig.isOpen}
        initialMode={barcodeModalConfig.mode}
        initialBarcode={barcodeModalConfig.currentBarcode}
        productName={barcodeModalConfig.productName}
        unitLabel=""
        onClose={() =>
          setBarcodeModalConfig((prev) => ({ ...prev, isOpen: false }))
        }
        onSelectBarcode={(scannedCode) => {
          handleAddByScannedBarcode(scannedCode);
        }}
      />
    </div>
  );
}
