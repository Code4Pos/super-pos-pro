import React, { useState, useMemo } from 'react';
import {
  Building2,
  UserPlus,
  Edit3,
  Phone,
  MapPin,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import SearchableDropdown from '../common/SearchableDropdown';
import SupplierModal, { formatSupplierAddress } from '../inventory/SupplierModal';

/**
 * Page 2: เลือกผู้ผลิต
 * Dropdown พิมพ์ค้นหาได้ + ลงทะเบียนผู้ผลิต + รายชื่อผู้ผลิตทั้งหมด (คลิกเพื่อเลือก)
 */
export default function SupplierStepView({
  suppliers = [],
  selectedSupplierId,
  onSelect,
  onBack,
  onNext,
}) {
  const [supplierModal, setSupplierModal] = useState({ isOpen: false, supplier: null });

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.province ? `จ.${s.province} • ${s.phone || '-'}` : s.phone || '',
      searchText: `${s.name} ${s.phone} ${s.province} ${s.amphoe} ${s.tambon}`,
    }));
  }, [suppliers]);

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
      {/* ส่วนเลือกผู้ผลิตด้วย Dropdown ค้นหาได้ */}
      <div className="p-4 border-b border-slate-200 space-y-3 shrink-0 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
            เลือกผู้ผลิต (บริษัทหรือร้านค้าที่ขายของให้เรา)
          </h2>
          <button
            type="button"
            onClick={() => setSupplierModal({ isOpen: true, supplier: null })}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>ลงทะเบียนผู้ผลิต</span>
          </button>
        </div>

        <SearchableDropdown
          value={selectedSupplierId}
          onChange={(val) => onSelect(val)}
          options={supplierOptions}
          icon={Building2}
          placeholder="พิมพ์ค้นหาชื่อผู้ผลิต, เบอร์โทร หรือจังหวัด..."
        />
      </div>

      {/* รายชื่อผู้ผลิตทั้งหมด */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[11px] font-extrabold text-slate-500 mb-2">
          รายชื่อผู้ผลิต ({suppliers.length})
        </div>
        {suppliers.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Building2 className="w-9 h-9 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-600">ยังไม่มีผู้ผลิตในระบบ</div>
            <p className="text-xs text-slate-400">
              กดปุ่ม &ldquo;ลงทะเบียนผู้ผลิต&rdquo; เพื่อเพิ่มผู้ผลิตรายแรก
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {suppliers.map((s) => {
              const isSelected = s.id === selectedSupplierId;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      )}
                      <span className="text-xs font-extrabold text-slate-900 truncate">
                        {s.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSupplierModal({ isOpen: true, supplier: s });
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-white shrink-0"
                      title="แก้ไขข้อมูลผู้ผลิต"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {formatSupplierAddress(s) && (
                    <div className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-500">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{formatSupplierAddress(s)}</span>
                    </div>
                  )}
                  {s.phone && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-700">
                      <Phone className="w-3 h-3" />
                      {s.phone}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* แถบปุ่มย้อนกลับ / ถัดไป */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="text-xs min-w-0">
          {selectedSupplier ? (
            <span className="text-slate-600">
              ผู้ผลิตที่เลือก:{' '}
              <strong className="text-slate-900">{selectedSupplier.name}</strong>
            </span>
          ) : (
            <span className="font-bold text-amber-700">กรุณาเลือกผู้ผลิตก่อนไปขั้นตอนถัดไป</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับรายการใบนำเข้า</span>
          </button>
          <button
            type="button"
            disabled={!selectedSupplier}
            onClick={onNext}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <span>ถัดไป: นำเข้าสินค้า</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SupplierModal
        isOpen={supplierModal.isOpen}
        supplier={supplierModal.supplier}
        onClose={() => setSupplierModal({ isOpen: false, supplier: null })}
        onSaved={(saved) => onSelect(saved.id)}
      />
    </div>
  );
}
