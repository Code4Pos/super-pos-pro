import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Save,
  Package,
  DollarSign,
  Plus,
  Minus,
  Camera,
  Barcode,
  Upload,
  Link2,
  Image as ImageIcon,
  FolderKanban,
  Scale,
  Layers,
  Trash2,
  GitBranch,
  AlertCircle,
  Unlink,
  Lock,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SearchableDropdown from '../common/SearchableDropdown';
import MobileBarcodeModal from '../common/MobileBarcodeModal';

const DEFAULT_FORM = {
  id: null,
  sku: '',
  barcode: '', // ค่าเริ่มต้นเลขบาร์โค้ด ว่างเปล่า
  name: '',
  category_id: 'beverages',
  unit: 'ชิ้น',
  cost_price: '',
  retail_price: '',
  wholesale_price: '',
  wholesale_min_qty: 6,
  stock: 0, // ค่าเริ่มต้นจำนวนสต็อก = 0
  min_stock: 10,
  pack_size: '',
  image_url: '',
  selling_units: [],
  linked_product_id: '',
  linked_deduct_qty: 6,
};

/**
 * ย่อและบีบอัดรูปภาพที่อัปโหลดให้เป็น Data URL ขนาดเหมาะสม
 */
function compressUploadedImage(file, maxSize = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProductModal({ isOpen, onClose, editingProduct }) {
  const {
    products,
    categories,
    units,
    saveProduct,
    addUnit,
    showToast,
  } = usePOS();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Toggle สำหรับเปิด/ปิด การตั้งราคาส่งและขั้นต่ำได้ราคาส่ง (ค่าเริ่มต้นปิดไว้ = false)
  const [isWholesaleEnabled, setIsWholesaleEnabled] = useState(false);

  // Toggle สำหรับ Session สินค้าสัมพันธ์
  const [isLinkedSessionEnabled, setIsLinkedSessionEnabled] = useState(false);

  // Toggle สำหรับ Session ระบบการขายสินค้าหลายหน่วยนับ
  const [isMultiUnitSessionEnabled, setIsMultiUnitSessionEnabled] =
    useState(false);

  // Toggle สำหรับ Session รูปภาพสินค้า + เลือก 2 วิธี (1.อัพโหลดภาพ 2.จากURL)
  const [isImageSessionEnabled, setIsImageSessionEnabled] = useState(false);
  const [imageInputMethod, setImageInputMethod] = useState('upload');
  const fileInputRef = useRef(null);

  // สถานะสำหรับเปิด Modal สแกน/แสดงบาร์โค้ดผ่านมือถือ
  const [barcodeModalConfig, setBarcodeModalConfig] = useState({
    isOpen: false,
    mode: 'scan',
    targetRowIndex: null,
    currentBarcode: '',
    unitLabel: '',
  });

  // ค้นหารายการสินค้ารองที่กำลังเชื่อมมายังสินค้านี้ (กรณีสินค้านี้เป็น "สินค้าตัวหลัก")
  const linkedChildProducts = useMemo(() => {
    if (!editingProduct?.id) return [];
    return products.filter((p) => p.linked_product_id === editingProduct.id);
  }, [products, editingProduct]);

  const isMasterProductLocked = linkedChildProducts.length > 0;

  useEffect(() => {
    if (editingProduct) {
      const hasImg = Boolean(editingProduct.image_url?.trim());
      const isDataImg = editingProduct.image_url?.startsWith('data:image');
      const hasSellingUnits =
        Array.isArray(editingProduct.selling_units) &&
        editingProduct.selling_units.length > 0;
      const hasParentLink = Boolean(editingProduct.linked_product_id);
      const hasChildLinks = products.some(
        (p) => p.linked_product_id === editingProduct.id
      );

      const wholesaleActive =
        editingProduct.is_wholesale_enabled !== undefined
          ? Boolean(editingProduct.is_wholesale_enabled)
          : Number(editingProduct.wholesale_price) > 0 &&
            Number(editingProduct.wholesale_price) <
              Number(editingProduct.retail_price);

      setIsWholesaleEnabled(wholesaleActive);
      setIsImageSessionEnabled(hasImg);
      setImageInputMethod(isDataImg ? 'upload' : hasImg ? 'url' : 'upload');
      setIsMultiUnitSessionEnabled(hasSellingUnits);
      setIsLinkedSessionEnabled(hasParentLink || hasChildLinks);

      setForm({
        id: editingProduct.id,
        sku: editingProduct.sku || '',
        barcode: editingProduct.barcode || '',
        name: editingProduct.name || '',
        category_id: editingProduct.category_id || 'beverages',
        unit: editingProduct.unit || 'ชิ้น',
        cost_price: editingProduct.cost_price ?? '',
        retail_price: editingProduct.retail_price ?? '',
        wholesale_price: editingProduct.wholesale_price ?? '',
        wholesale_min_qty: editingProduct.wholesale_min_qty ?? 6,
        stock: editingProduct.stock ?? 0,
        min_stock: editingProduct.min_stock ?? 10,
        pack_size: editingProduct.pack_size || '',
        image_url: editingProduct.image_url || '',
        linked_product_id: hasChildLinks
          ? ''
          : editingProduct.linked_product_id || '',
        linked_deduct_qty: editingProduct.linked_deduct_qty ?? 6,
        selling_units: hasSellingUnits
          ? editingProduct.selling_units.map((u, idx) => ({
              id: u.id || `su-${idx}`,
              barcode: u.barcode || '',
              unit: u.unit || editingProduct.unit || 'ชิ้น',
              stock_deduct_qty: u.stock_deduct_qty ?? 1,
            }))
          : [],
      });
    } else {
      // สุ่มเฉพาะรหัส SKU ที่ไม่ซ้ำ ส่วนเลขบาร์โค้ดตั้งค่าเริ่มต้นเป็นว่างเปล่า ('') และสต็อก = 0
      let randomNum = Math.floor(100 + Math.random() * 900);
      while (
        products.some((p) => p.sku?.toUpperCase() === `SKU-${randomNum}`)
      ) {
        randomNum = Math.floor(100 + Math.random() * 900);
      }

      // ตั้งค่าเริ่มต้นปิด Toggle ราคาส่งไว้
      setIsWholesaleEnabled(false);
      setIsImageSessionEnabled(false);
      setImageInputMethod('upload');
      setIsMultiUnitSessionEnabled(false);
      setIsLinkedSessionEnabled(false);

      setForm({
        ...DEFAULT_FORM,
        sku: `SKU-${randomNum}`,
        barcode: '',
        stock: 0,
        selling_units: [],
        linked_product_id: '',
        linked_deduct_qty: 6,
      });
    }
  }, [editingProduct, isOpen, products]);

  const categoryOptions = useMemo(() => {
    return categories
      .filter((c) => c.id !== 'all')
      .map((c) => ({
        value: c.id,
        label: c.name,
      }));
  }, [categories]);

  const unitOptions = useMemo(() => {
    return units.map((u) => ({
      value: u.name,
      label: u.name,
    }));
  }, [units]);

  // ตัวเลือกสินค้าสำหรับ Dropdown สินค้าสัมพันธ์:
  // - รองรับทั้งตอนเพิ่มสินค้าใหม่ (form.id === null) และตอนแก้ไขสินค้า
  // - กรองเฉพาะสินค้าหลักที่ไม่ได้เป็นสินค้ารองของตัวอื่น (!p.linked_product_id)
  const linkedProductOptions = useMemo(() => {
    return products
      .filter((p) => {
        if (form.id && p.id === form.id) return false;
        if (form.id && p.linked_product_id === form.id) return false;
        // สินค้าที่เป็นสินค้ารองอยู่แล้ว ไม่สามารถนำมาเป็นสินค้าหลักซ้อนได้
        if (p.linked_product_id) return false;
        return true;
      })
      .map((p) => ({
        value: p.id,
        label: `${p.name} [${p.sku}]`,
        badge: `ทุน ฿${Number(p.cost_price) || 0} • สต็อก ${p.stock} ${p.unit}`,
      }));
  }, [products, form.id]);

  const selectedMasterProduct = useMemo(() => {
    if (!isLinkedSessionEnabled || isMasterProductLocked || !form.linked_product_id) {
      return null;
    }
    return products.find((p) => p.id === form.linked_product_id) || null;
  }, [products, isLinkedSessionEnabled, isMasterProductLocked, form.linked_product_id]);

  // คำนวณราคาต้นทุนและจำนวนสต็อกของสินค้ารองให้สัมพันธ์กับสินค้าหลักแบบเรียลไทม์
  const linkedDeductMultiplier = Math.max(1, Number(form.linked_deduct_qty) || 1);
  const syncedSecondaryCostPrice = selectedMasterProduct
    ? Number(
        (
          (Number(selectedMasterProduct.cost_price) || 0) *
          linkedDeductMultiplier
        ).toFixed(2)
      )
    : form.cost_price;

  const syncedSecondaryStock = selectedMasterProduct
    ? Math.floor(
        (Number(selectedMasterProduct.stock) || 0) / linkedDeductMultiplier
      )
    : form.stock;

  // ตรวจสอบรหัสสินค้า (SKU) และ เลขบาร์โค้ด (Barcode) ซ้ำแบบเรียลไทม์
  const duplicateValidation = useMemo(() => {
    const cleanSku = String(form.sku || '').trim().toLowerCase();
    const cleanBarcode = String(form.barcode || '').trim().toLowerCase();

    let skuError = null;
    let barcodeError = null;
    const multiUnitErrors = {};

    if (cleanSku) {
      const dupSkuProd = products.find(
        (p) =>
          p.id !== form.id &&
          String(p.sku || '').trim().toLowerCase() === cleanSku
      );
      if (dupSkuProd) {
        skuError = `รหัสสินค้า "${form.sku.trim()}" ซ้ำกับ "${dupSkuProd.name}"`;
      }
    }

    if (cleanBarcode) {
      const dupBarcodeProd = products.find((p) => {
        if (p.id === form.id) return false;
        if (String(p.barcode || '').trim().toLowerCase() === cleanBarcode) {
          return true;
        }
        if (Array.isArray(p.selling_units)) {
          return p.selling_units.some(
            (su) =>
              String(su.barcode || '').trim().toLowerCase() === cleanBarcode
          );
        }
        return false;
      });
      if (dupBarcodeProd) {
        barcodeError = `เลขบาร์โค้ด "${form.barcode.trim()}" ซ้ำกับ "${dupBarcodeProd.name}"`;
      }
    }

    if (isMultiUnitSessionEnabled && Array.isArray(form.selling_units)) {
      const seenInForm = new Set();
      if (cleanBarcode) seenInForm.add(cleanBarcode);

      form.selling_units.forEach((row, idx) => {
        const rowCode = String(row.barcode || '').trim().toLowerCase();
        if (!rowCode) return;

        const dupOther = products.find((p) => {
          if (p.id === form.id) return false;
          if (String(p.barcode || '').trim().toLowerCase() === rowCode) {
            return true;
          }
          if (Array.isArray(p.selling_units)) {
            return p.selling_units.some(
              (su) => String(su.barcode || '').trim().toLowerCase() === rowCode
            );
          }
          return false;
        });

        if (dupOther) {
          multiUnitErrors[idx] = `บาร์โค้ด "${row.barcode.trim()}" ซ้ำกับ "${dupOther.name}"`;
        } else if (seenInForm.has(rowCode)) {
          multiUnitErrors[idx] = `บาร์โค้ด "${row.barcode.trim()}" ซ้ำกับหน่วยอื่นในสินค้านี้`;
        } else {
          seenInForm.add(rowCode);
        }
      });
    }

    const hasAnyError =
      Boolean(skuError) ||
      Boolean(barcodeError) ||
      Object.keys(multiUnitErrors).length > 0;

    return {
      skuError,
      barcodeError,
      multiUnitErrors,
      hasAnyError,
    };
  }, [
    form.id,
    form.sku,
    form.barcode,
    form.selling_units,
    isMultiUnitSessionEnabled,
    products,
  ]);

  if (!isOpen) return null;

  const handleAddSellingUnitRow = () => {
    const randomSuffix = Math.floor(10 + Math.random() * 89);
    setForm((prev) => ({
      ...prev,
      selling_units: [
        ...(prev.selling_units || []),
        {
          id: `su-${Date.now()}-${prev.selling_units.length}`,
          barcode: prev.barcode ? `${prev.barcode}${randomSuffix}` : '',
          unit: prev.selling_units.length === 0 ? 'แพ็ค' : 'ลัง',
          stock_deduct_qty: prev.selling_units.length === 0 ? 6 : 12,
        },
      ],
    }));
  };

  const handleRemoveSellingUnitRow = (index) => {
    setForm((prev) => ({
      ...prev,
      selling_units: prev.selling_units.filter((_, idx) => idx !== index),
    }));
  };

  const handleUpdateSellingUnitRow = (index, field, val) => {
    setForm((prev) => ({
      ...prev,
      selling_units: prev.selling_units.map((row, idx) =>
        idx === index ? { ...row, [field]: val } : row
      ),
    }));
  };

  const handleUnlinkChildProduct = async (childProduct) => {
    await saveProduct({
      ...childProduct,
      linked_product_id: null,
      linked_deduct_qty: 1,
    });
  };

  const handleUploadImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressUploadedImage(file, 480);
      setForm((prev) => ({ ...prev, image_url: compressedDataUrl }));
    } catch (err) {
      console.error('Image upload error:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim()) return;

    if (duplicateValidation.hasAnyError) {
      const firstError =
        duplicateValidation.skuError ||
        duplicateValidation.barcodeError ||
        Object.values(duplicateValidation.multiUnitErrors)[0];
      showToast(`ไม่สามารถบันทึกได้: ${firstError}`, 'error');
      return;
    }

    setSaving(true);
    try {
      if (form.unit && !units.some((u) => u.name === form.unit.trim())) {
        await addUnit({ name: form.unit.trim() });
      }
      if (isMultiUnitSessionEnabled) {
        for (const su of form.selling_units || []) {
          if (su.unit && !units.some((u) => u.name === su.unit.trim())) {
            await addUnit({ name: su.unit.trim() });
          }
        }
      }

      const activeLinkedMasterId =
        isLinkedSessionEnabled && !isMasterProductLocked && form.linked_product_id
          ? form.linked_product_id
          : null;

      const payload = {
        ...form,
        cost_price: selectedMasterProduct
          ? syncedSecondaryCostPrice
          : Number(form.cost_price) || 0,
        retail_price: Number(form.retail_price) || 0,
        is_wholesale_enabled: isWholesaleEnabled,
        wholesale_price: isWholesaleEnabled
          ? Number(form.wholesale_price) || Number(form.retail_price) || 0
          : Number(form.retail_price) || 0,
        wholesale_min_qty: isWholesaleEnabled
          ? Math.max(1, Number(form.wholesale_min_qty) || 6)
          : 6,
        stock: Number(form.stock) || 0,
        sync_master_stock: Boolean(activeLinkedMasterId),
        image_url: isImageSessionEnabled ? form.image_url : '',
        selling_units: isMultiUnitSessionEnabled ? form.selling_units : [],
        linked_product_id: activeLinkedMasterId,
        linked_deduct_qty: activeLinkedMasterId ? linkedDeductMultiplier : 1,
      };
      await saveProduct(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94dvh]">
        {/* หัวข้อ Modal */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold">
              {editingProduct
                ? 'แก้ไขข้อมูลสินค้า / สินค้าสัมพันธ์ / ขายหลายหน่วย'
                : 'เพิ่มสินค้าใหม่เข้าคลัง'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* 1. รหัสสินค้า SKU และ เลขบาร์โค้ดหลัก (ค่าเริ่มต้นว่างเปล่า, ห้ามซ้ำ + ปุ่มสแกนบาร์โค้ดผ่านมือถือ) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รหัสสินค้า (SKU) *
              </label>
              <input
                type="text"
                required
                data-allow-scanner="false"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-2 ${
                  duplicateValidation.skuError
                    ? 'border-rose-500 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
                    : 'border-slate-300 text-slate-900 focus:ring-indigo-500'
                }`}
                placeholder="เช่น BEV-001"
              />
              {duplicateValidation.skuError && (
                <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{duplicateValidation.skuError}</span>
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                เลขบาร์โค้ดหลัก (เว้นว่างได้ • ห้ามซ้ำ)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className={`flex-1 px-3.5 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 ${
                    duplicateValidation.barcodeError
                      ? 'border-rose-500 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
                      : 'border-slate-300 text-slate-800 focus:ring-indigo-500'
                  }`}
                  placeholder="เว้นว่างไว้ หรือสแกน/กรอกเลขบาร์โค้ด..."
                />

                {/* ปุ่มกดเพื่อสแกนบาร์โค้ดผ่านมือถือ */}
                <button
                  type="button"
                  onClick={() =>
                    setBarcodeModalConfig({
                      isOpen: true,
                      mode: 'scan',
                      targetRowIndex: null,
                      currentBarcode: form.barcode,
                      unitLabel: form.unit,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs"
                  title="กดเพื่อสแกนบาร์โค้ดผ่านมือถือ"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">สแกนผ่านมือถือ</span>
                </button>

                {/* ปุ่มแสดงบาร์โค้ดผ่านมือถือ */}
                <button
                  type="button"
                  onClick={() =>
                    setBarcodeModalConfig({
                      isOpen: true,
                      mode: 'display',
                      targetRowIndex: null,
                      currentBarcode: form.barcode,
                      unitLabel: form.unit,
                    })
                  }
                  className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 shrink-0"
                  title="แสดงรูปบาร์โค้ดผ่านหน้าจอมือถือ"
                >
                  <Barcode className="w-4 h-4" />
                </button>
              </div>
              {duplicateValidation.barcodeError && (
                <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{duplicateValidation.barcodeError}</span>
                </p>
              )}
            </div>
          </div>

          {/* 2. ชื่อสินค้า + หมวดหมู่สินค้า (Searchable Dropdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อสินค้า *
              </label>
              <input
                type="text"
                required
                data-allow-scanner="false"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="ระบุชื่อสินค้า ขนาด และรายละเอียด..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                หมวดหมู่สินค้า (พิมพ์ค้นหาได้) *
              </label>
              <SearchableDropdown
                value={form.category_id}
                onChange={(val) => setForm({ ...form, category_id: val })}
                options={categoryOptions}
                icon={FolderKanban}
                placeholder="พิมพ์ค้นหาหมวดหมู่..."
              />
            </div>
          </div>

          {/* 3. โครงสร้างราคาทุน ราคาปลีก และ Toggle เปิด/ปิดราคาส่งไว้ด้านหลังชื่อหัวข้อ */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                <span>กำหนดโครงสร้างราคาต้นทุน - ราคาปลีก - ราคาส่ง</span>
              </div>

              {/* Toggle สำหรับเปิด/ปิด การตั้งราคาส่งและขั้นต่ำได้ราคาส่ง ไว้ด้านหลังชื่อหัวข้อ */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-600">
                  เปิดใช้งานราคาส่ง & ขั้นต่ำ
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isWholesaleEnabled}
                  onClick={() => setIsWholesaleEnabled((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    isWholesaleEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title="เปิด/ปิด การตั้งราคาส่งและขั้นต่ำได้ราคาส่ง"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                      isWholesaleEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* ราคาต้นทุน: ไม่บังคับกรอก และล็อกอัตโนมัติหากเป็นสินค้ารองที่เชื่อมสินค้าสัมพันธ์ */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                  <span>ต้นทุนต่อหน่วย (฿)</span>
                  {selectedMasterProduct && (
                    <Lock
                      className="w-3 h-3 text-violet-600"
                      title="ล็อกตามราคาต้นทุนของสินค้าหลัก"
                    />
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={Boolean(selectedMasterProduct)}
                  readOnly={Boolean(selectedMasterProduct)}
                  data-allow-scanner="false"
                  value={
                    selectedMasterProduct
                      ? syncedSecondaryCostPrice
                      : form.cost_price
                  }
                  onChange={(e) => {
                    if (selectedMasterProduct) return;
                    setForm({ ...form, cost_price: e.target.value });
                  }}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    selectedMasterProduct
                      ? 'border-violet-200 bg-violet-100/60 text-violet-900 cursor-not-allowed select-none'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                  placeholder="0.00 (ไม่บังคับ)"
                />
              </div>

              {/* ราคาขายปลีก: ไม่บังคับกรอก */}
              <div>
                <label className="block text-[11px] font-bold text-indigo-700 mb-1">
                  ราคาขายปลีก (฿)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  data-allow-scanner="false"
                  value={form.retail_price}
                  onChange={(e) =>
                    setForm({ ...form, retail_price: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm font-bold text-indigo-700"
                  placeholder="0.00 (ไม่บังคับ)"
                />
              </div>

              {/* ราคาขายส่ง: ปิดเป็นค่าเริ่มต้น (สีจาง ไม่สามารถพิมพ์ได้ จนกว่าจะเปิด Toggle) */}
              <div className={!isWholesaleEnabled ? 'opacity-45' : ''}>
                <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                  ราคาขายส่ง (฿)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!isWholesaleEnabled}
                  data-allow-scanner="false"
                  value={form.wholesale_price}
                  onChange={(e) =>
                    setForm({ ...form, wholesale_price: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    isWholesaleEnabled
                      ? 'border-emerald-300 bg-white text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                  }`}
                  placeholder={isWholesaleEnabled ? '0.00' : 'ปิดใช้งาน'}
                />
              </div>

              {/* ขั้นต่ำได้ราคาส่ง: ปิดเป็นค่าเริ่มต้น (สีจาง ไม่สามารถพิมพ์ได้ จนกว่าจะเปิด Toggle) */}
              <div className={!isWholesaleEnabled ? 'opacity-45' : ''}>
                <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                  ขั้นต่ำได้ราคาส่ง
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={!isWholesaleEnabled}
                  data-allow-scanner="false"
                  value={form.wholesale_min_qty}
                  onChange={(e) =>
                    setForm({ ...form, wholesale_min_qty: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    isWholesaleEnabled
                      ? 'border-emerald-300 bg-white text-slate-900'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                  }`}
                  placeholder="เช่น 6 หรือ 12"
                />
              </div>
            </div>
          </div>

          {/* 4. หน่วยนับหลัก (Searchable Dropdown) และสต็อกคงเหลือ (เริ่มต้น = 0, ล็อกอัตโนมัติถ้าเป็นสินค้ารอง) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                หน่วยนับหลัก (พิมพ์ค้นหาได้) *
              </label>
              <SearchableDropdown
                value={form.unit}
                onChange={(val) => setForm({ ...form, unit: val })}
                options={unitOptions}
                icon={Scale}
                allowCustomValue={true}
                placeholder="เลือกหรือพิมพ์หน่วยนับ..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>สต็อกคงเหลือ ({form.unit || 'หน่วย'})</span>
                {selectedMasterProduct && (
                  <GitBranch
                    className="w-3 h-3 text-violet-600"
                    title="สต็อกเชื่อมกับสินค้าหลัก (แก้ไขแล้วจะอัปเดตเชื่อมกันอัตโนมัติ)"
                  />
                )}
              </label>
              <input
                type="number"
                min="0"
                data-allow-scanner="false"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                  selectedMasterProduct
                    ? 'border-violet-300 bg-violet-50/40 text-violet-950 focus:ring-2 focus:ring-violet-500'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                จุดเตือนสต็อกต่ำ
              </label>
              <input
                type="number"
                min="0"
                data-allow-scanner="false"
                value={form.min_stock}
                onChange={(e) =>
                  setForm({ ...form, min_stock: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รายละเอียดบรรจุภัณฑ์
              </label>
              <input
                type="text"
                data-allow-scanner="false"
                value={form.pack_size}
                onChange={(e) =>
                  setForm({ ...form, pack_size: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800"
                placeholder="เช่น 12 ขวด/แพ็ค"
              />
            </div>
          </div>

          {/* 5. Session สินค้าสัมพันธ์ */}
          <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      สินค้าสัมพันธ์ (เชื่อมต้นทุนและสต็อกกับสินค้าหลัก)
                    </h4>
                    {isMasterProductLocked && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white">
                        สินค้าตัวหลัก (ถูกเชื่อม {linkedChildProducts.length} รายการ)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    เชื่อมสินค้านี้เข้ากับสินค้าตัวหลัก โดยราคาต้นทุนและสต็อกจะคำนวณตามสินค้าหลักอัตโนมัติ
                  </p>
                </div>
              </div>

              {/* ปุ่ม Toggle Switch เปิด/ปิดการใช้งาน Session สินค้าสัมพันธ์ */}
              <button
                type="button"
                role="switch"
                aria-checked={isLinkedSessionEnabled}
                onClick={() => setIsLinkedSessionEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  isLinkedSessionEnabled ? 'bg-violet-600' : 'bg-slate-300'
                }`}
                title="เปิด/ปิดการใช้งานสินค้าสัมพันธ์"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                    isLinkedSessionEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isLinkedSessionEnabled && (
              <div className="pt-2.5 border-t border-violet-200/70 space-y-3">
                {/* กรณีสินค้านี้เป็น "สินค้าตัวหลัก" ที่ถูกเชื่อมแล้ว: แสดงรายการสินค้ารอง และล็อกไม่ให้ไปเชื่อมกับตัวอื่น */}
                {isMasterProductLocked ? (
                  <div className="p-3.5 rounded-2xl bg-white border border-violet-200 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-violet-900 bg-violet-100/80 px-3 py-2 rounded-xl border border-violet-200">
                      <Lock className="w-4 h-4 text-violet-700 shrink-0" />
                      <span>
                        สินค้าตัวหลักนี้ถูกเชื่อมกับสินค้ารองแล้ว จึงไม่สามารถนำไปเชื่อมกับสินค้าตัวอื่นได้
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-700 pt-1">
                      รายการสินค้ารองที่เชื่อมตัดสต็อกจากสินค้านี้ ({linkedChildProducts.length} รายการ):
                    </div>

                    <div className="space-y-1.5">
                      {linkedChildProducts.map((child) => (
                        <div
                          key={child.id}
                          className="p-2.5 rounded-xl bg-violet-50/70 border border-violet-100 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {child.name}{' '}
                              <span className="font-mono text-[11px] text-slate-500">
                                ({child.sku})
                              </span>
                            </div>
                            <div className="text-[11px] text-violet-800 font-semibold mt-0.5">
                              ขาย 1 {child.unit} → ตัดสต็อกสินค้าหลัก{' '}
                              <strong className="underline">
                                {child.linked_deduct_qty} {form.unit || 'ชิ้น'}
                              </strong>{' '}
                              • ต้นทุนสินค้ารอง ฿{child.cost_price} • สต็อกสินค้ารอง{' '}
                              {child.stock} {child.unit}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUnlinkChildProduct(child)}
                            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold flex items-center gap-1 shrink-0"
                            title="ยกเลิกการเชื่อมสินค้าสัมพันธ์ของสินค้ารองตัวนี้"
                          >
                            <Unlink className="w-3 h-3" />
                            <span>ยกเลิกเชื่อม</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* กรณีเป็นสินค้าเพิ่มใหม่ หรือสินค้ารอง: สามารถเลือกสินค้าหลักและระบุจำนวนได้ */
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-white p-3 rounded-2xl border border-violet-200">
                      <div className="sm:col-span-8">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          เลือกสินค้าตัวหลักที่ต้องการเชื่อม (พิมพ์ค้นหาได้)
                        </label>
                        <SearchableDropdown
                          value={form.linked_product_id}
                          onChange={(val) => {
                            const master = products.find((p) => p.id === val);
                            const mult = Math.max(
                              1,
                              Number(form.linked_deduct_qty) || 1
                            );
                            const nextStock = master
                              ? Math.floor(
                                  (Number(master.stock) || 0) / mult
                                )
                              : form.stock;
                            setForm({
                              ...form,
                              linked_product_id: val,
                              stock: nextStock,
                            });
                          }}
                          options={linkedProductOptions}
                          icon={GitBranch}
                          allowClear={true}
                          defaultValue=""
                          placeholder="พิมพ์ค้นหาชื่อสินค้าตัวหลัก, SKU หรือบาร์โค้ด..."
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          จำนวน (ตัดสต็อกสินค้าหลัก)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            data-allow-scanner="false"
                            value={form.linked_deduct_qty}
                            onChange={(e) => {
                              const newDeduct = e.target.value;
                              const mult = Math.max(1, Number(newDeduct) || 1);
                              const nextStock = selectedMasterProduct
                                ? Math.floor(
                                    (Number(selectedMasterProduct.stock) || 0) /
                                      mult
                                  )
                                : form.stock;
                              setForm({
                                ...form,
                                linked_deduct_qty: newDeduct,
                                stock: nextStock,
                              });
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-violet-300 bg-violet-50/40 text-xs font-extrabold text-violet-950 text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="เช่น 6 หรือ 12"
                          />
                          <span className="text-xs font-bold text-slate-600 shrink-0">
                            {selectedMasterProduct?.unit || 'ชิ้น'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* แสดงราคาต้นทุนและสต็อกของสินค้ารองที่สัมพันธ์กับสินค้าหลัก */}
                    {selectedMasterProduct && (
                      <div className="p-3 rounded-2xl bg-violet-100/70 border border-violet-200 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-violet-950">
                          <span className="flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5 text-violet-700" />
                            <span>
                              ข้อมูลต้นทุนและสต็อกเชื่อมกับ &ldquo;{selectedMasterProduct.name}&rdquo; (ปรับสต็อกแล้วจะเชื่อมกันอัตโนมัติ)
                            </span>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="p-2.5 rounded-xl bg-white/90 border border-violet-200 flex items-center justify-between">
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                ราคาต้นทุนสินค้ารอง (คำนวณอัตโนมัติ)
                              </div>
                              <div className="text-[10px] text-slate-400">
                                ทุนหลัก ฿{Number(selectedMasterProduct.cost_price) || 0} × {linkedDeductMultiplier} {selectedMasterProduct.unit}
                              </div>
                            </div>
                            <div className="text-sm font-extrabold text-violet-800 flex items-center gap-1">
                              <Lock className="w-3 h-3 opacity-70" />
                              <span>฿{syncedSecondaryCostPrice}</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-white/90 border border-violet-200 flex items-center justify-between">
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                สต็อกสินค้ารองเชื่อมกับสินค้าหลัก
                              </div>
                              <div className="text-[10px] text-slate-400">
                                เต็ม {Number(form.stock) || 0} {form.unit || 'หน่วย'} • เศษ {(Number(selectedMasterProduct.stock) || 0) % linkedDeductMultiplier} {selectedMasterProduct.unit}
                              </div>
                            </div>
                            <div className="text-sm font-extrabold text-violet-800 flex items-center gap-1">
                              <GitBranch className="w-3 h-3 opacity-70" />
                              <span>
                                เต็ม {Number(form.stock) || 0} {form.unit || 'หน่วย'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 6. Session ระบบการขายสินค้าหลายหน่วยนับ (พร้อมปุ่ม Toggle เปิด/ปิด) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      ระบบการขายสินค้าหลายหน่วยนับ (เช่น ชิ้น / แพ็ค / ลัง)
                    </h4>
                    {isMultiUnitSessionEnabled &&
                      form.selling_units.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {form.selling_units.length} หน่วย
                        </span>
                      )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    เปิดสวิตช์เพื่อกำหนดบาร์โค้ด หน่วยนับ และจำนวนที่ตัดสต็อกของแต่ละหน่วย
                  </p>
                </div>
              </div>

              {/* ปุ่ม Toggle Switch เปิด/ปิดการใช้งาน Session ระบบการขายสินค้าหลายหน่วยนับ */}
              <button
                type="button"
                role="switch"
                aria-checked={isMultiUnitSessionEnabled}
                onClick={() => {
                  const next = !isMultiUnitSessionEnabled;
                  setIsMultiUnitSessionEnabled(next);
                  if (next && form.selling_units.length === 0) {
                    handleAddSellingUnitRow();
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  isMultiUnitSessionEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
                title="เปิด/ปิดการใช้งานระบบการขายสินค้าหลายหน่วยนับ"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                    isMultiUnitSessionEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isMultiUnitSessionEnabled && (
              <div className="pt-2.5 border-t border-slate-200/80 space-y-3">
                {form.selling_units.length > 0 && (
                  <div className="space-y-2">
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-2 text-[11px] font-bold text-slate-500">
                      <div className="sm:col-span-5">เลขบาร์โค้ดประจำหน่วย</div>
                      <div className="sm:col-span-3">หน่วยนับ (พิมพ์ค้นหาได้)</div>
                      <div className="sm:col-span-3">
                        จำนวน (จำนวนที่ตัดสต็อก {form.unit || 'ชิ้น'})
                      </div>
                      <div className="sm:col-span-1 text-right">ลบแถว</div>
                    </div>

                    {form.selling_units.map((row, idx) => {
                      const rowBarcodeErr =
                        duplicateValidation.multiUnitErrors[idx];
                      return (
                        <div
                          key={row.id || idx}
                          className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <div className="sm:col-span-5 flex items-center gap-1">
                              <input
                                type="text"
                                data-allow-scanner="false"
                                value={row.barcode}
                                onChange={(e) =>
                                  handleUpdateSellingUnitRow(
                                    idx,
                                    'barcode',
                                    e.target.value
                                  )
                                }
                                placeholder="เลขบาร์โค้ดของหน่วยนี้..."
                                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 ${
                                  rowBarcodeErr
                                    ? 'border-rose-500 bg-rose-50/40 text-rose-900 focus:ring-rose-500'
                                    : 'border-slate-300 text-slate-900 focus:ring-indigo-500'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setBarcodeModalConfig({
                                    isOpen: true,
                                    mode: 'scan',
                                    targetRowIndex: idx,
                                    currentBarcode: row.barcode,
                                    unitLabel: row.unit,
                                  })
                                }
                                className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0"
                                title="สแกนบาร์โค้ดผ่านมือถือสำหรับหน่วยนี้"
                              >
                                <Camera className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBarcodeModalConfig({
                                    isOpen: true,
                                    mode: 'display',
                                    targetRowIndex: idx,
                                    currentBarcode: row.barcode,
                                    unitLabel: row.unit,
                                  })
                                }
                                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 shrink-0"
                                title="แสดงบาร์โค้ดผ่านมือถือ"
                              >
                                <Barcode className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="sm:col-span-3">
                              <SearchableDropdown
                                value={row.unit}
                                onChange={(val) =>
                                  handleUpdateSellingUnitRow(idx, 'unit', val)
                                }
                                options={unitOptions}
                                allowCustomValue={true}
                                placeholder="เช่น ชิ้น, แพ็ค, ลัง"
                              />
                            </div>

                            <div className="sm:col-span-3 flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                required
                                data-allow-scanner="false"
                                value={row.stock_deduct_qty}
                                onChange={(e) =>
                                  handleUpdateSellingUnitRow(
                                    idx,
                                    'stock_deduct_qty',
                                    e.target.value
                                  )
                                }
                                placeholder="จำนวนที่ตัดสต็อก"
                                className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50/30 text-xs font-extrabold text-emerald-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                                {form.unit || 'ชิ้น'}
                              </span>
                            </div>

                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveSellingUnitRow(idx)}
                                className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 flex items-center justify-center transition-colors"
                                title="ลบหน่วยนับแถวนี้"
                              >
                                <Minus className="w-4 h-4 stroke-[2.5]" />
                              </button>
                            </div>
                          </div>

                          {rowBarcodeErr && (
                            <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{rowBarcodeErr}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddSellingUnitRow}
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/60 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>เพิ่มการขายสินค้าหลายหน่วยนับ (เช่น ชิ้น / แพ็ค / ลัง)</span>
                </button>
              </div>
            )}
          </div>

          {/* 7. Session รูปภาพสินค้า พร้อมปุ่ม Toggle Switch เปิด/ปิด และเลือกได้ 2 วิธี (1.อัพโหลดภาพ 2.จากURL) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    รูปภาพสินค้า (Image Session)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    เปิดสวิตช์เพื่อใส่รูปภาพสินค้า (เลือกอัปโหลดภาพ หรือใส่จาก URL)
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isImageSessionEnabled}
                onClick={() => setIsImageSessionEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  isImageSessionEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
                title="เปิด/ปิดการใช้งานส่วนรูปภาพสินค้า"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                    isImageSessionEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isImageSessionEnabled && (
              <div className="pt-2 border-t border-slate-200/80 space-y-3">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-200/70">
                  <button
                    type="button"
                    onClick={() => setImageInputMethod('upload')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      imageInputMethod === 'upload'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>1. อัพโหลดภาพ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageInputMethod('url')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      imageInputMethod === 'url'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>2. จาก URL</span>
                  </button>
                </div>

                {imageInputMethod === 'upload' ? (
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImageFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:flex-1 py-4 px-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/40 text-slate-700 text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-indigo-600" />
                      <span>คลิกเพื่อเลือกไฟล์รูปภาพจากเครื่องหรือมือถือ</span>
                      <span className="text-[10px] font-normal text-slate-400">
                        รองรับไฟล์ JPG, PNG, WEBP (ย่อขนาดอัตโนมัติ)
                      </span>
                    </button>

                    {form.image_url && (
                      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shrink-0">
                        <img
                          src={form.image_url}
                          alt="Preview"
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, image_url: '' })}
                          className="p-2 rounded-xl text-rose-600 hover:bg-rose-50"
                          title="ลบรูปภาพ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <input
                        type="url"
                        data-allow-scanner="false"
                        value={
                          form.image_url?.startsWith('data:image')
                            ? ''
                            : form.image_url
                        }
                        onChange={(e) =>
                          setForm({ ...form, image_url: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="วางลิงก์รูปภาพ เช่น https://images.unsplash.com/..."
                      />
                    </div>
                    {form.image_url && !form.image_url.startsWith('data:image') && (
                      <img
                        src={form.image_url}
                        alt="URL Preview"
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ปุ่มบันทึก */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-700"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || duplicateValidation.hasAnyError}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-indigo-600/20"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลสินค้า'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Modal สแกนบาร์โค้ดผ่านมือถือ / แสดงบาร์โค้ดผ่านมือถือ */}
      <MobileBarcodeModal
        isOpen={barcodeModalConfig.isOpen}
        initialMode={barcodeModalConfig.mode}
        initialBarcode={barcodeModalConfig.currentBarcode}
        productName={form.name || 'สินค้าใหม่'}
        unitLabel={barcodeModalConfig.unitLabel}
        onClose={() =>
          setBarcodeModalConfig((prev) => ({ ...prev, isOpen: false }))
        }
        onSelectBarcode={(scannedCode) => {
          if (barcodeModalConfig.targetRowIndex === null) {
            setForm((prev) => ({ ...prev, barcode: scannedCode }));
          } else {
            handleUpdateSellingUnitRow(
              barcodeModalConfig.targetRowIndex,
              'barcode',
              scannedCode
            );
          }
        }}
      />
    </div>
  );
}
