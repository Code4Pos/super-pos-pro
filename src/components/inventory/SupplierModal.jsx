import React, { useState, useEffect, useMemo } from 'react';
import { Building2, MapPin, Save, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import SearchableDropdown from '../common/SearchableDropdown';
import {
  getProvinceOptions,
  getAmphoeOptions,
  getTambonOptions,
  resolvePostalCode,
} from '../../data/thaiAddressData';

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

/**
 * Modal ลงทะเบียน/แก้ไขผู้ผลิต (ชื่อ, ที่อยู่, ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์อัตโนมัติ, เบอร์โทร)
 * ใช้ร่วมกันระหว่างหน้านำเข้าสินค้าและหน้าจัดการผู้ผลิต
 */
export default function SupplierModal({ isOpen, supplier = null, onClose, onSaved }) {
  const { saveSupplier, showToast } = usePOS();
  const [supplierForm, setSupplierForm] = useState(DEFAULT_SUPPLIER_FORM);
  const [saving, setSaving] = useState(false);

  // เติมข้อมูลเดิมเมื่อเปิดเพื่อแก้ไข หรือล้างฟอร์มเมื่อลงทะเบียนใหม่
  useEffect(() => {
    if (!isOpen) return;
    setSupplierForm(
      supplier
        ? {
            id: supplier.id,
            name: supplier.name || '',
            address: supplier.address || '',
            tambon: supplier.tambon || '',
            amphoe: supplier.amphoe || '',
            province: supplier.province || '',
            zipcode: supplier.zipcode || '',
            phone: supplier.phone || '',
            created_at: supplier.created_at,
          }
        : DEFAULT_SUPPLIER_FORM
    );
  }, [isOpen, supplier]);

  // ข้อมูล Dropdown จังหวัด / อำเภอ / ตำบล ของประเทศไทยทั้งหมด
  const provinceOptions = useMemo(() => getProvinceOptions(), []);
  const amphoeOptions = useMemo(
    () => getAmphoeOptions(supplierForm.province),
    [supplierForm.province]
  );
  const tambonOptions = useMemo(
    () => getTambonOptions(supplierForm.province, supplierForm.amphoe),
    [supplierForm.province, supplierForm.amphoe]
  );

  if (!isOpen) return null;

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast('กรุณาระบุชื่อผู้ผลิต', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSupplier(supplierForm);
      onSaved?.(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60">
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
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
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
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                placeholder="เช่น บริษัท สยามดิสทริบิวชั่น จำกัด"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1">เบอร์โทร</label>
              <input
                type="text"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
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
              onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
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
                onChange={(e) => setSupplierForm({ ...supplierForm, zipcode: e.target.value })}
                placeholder="รหัสไปรษณีย์ 5 หลัก"
                className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50/40 text-xs font-mono font-extrabold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลผู้ผลิต'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * รวมที่อยู่ผู้ผลิตเป็นข้อความบรรทัดเดียว
 */
export function formatSupplierAddress(supplier) {
  if (!supplier) return '';
  return [
    supplier.address,
    supplier.tambon && `ต.${supplier.tambon}`,
    supplier.amphoe && `อ.${supplier.amphoe}`,
    supplier.province && `จ.${supplier.province}`,
    supplier.zipcode,
  ]
    .filter(Boolean)
    .join(' ');
}
