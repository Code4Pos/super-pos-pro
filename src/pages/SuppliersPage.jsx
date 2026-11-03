import React, { useState, useMemo } from 'react';
import { Building2, UserPlus, Search, Edit3, Trash2, Phone } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SupplierModal, { formatSupplierAddress } from '../components/inventory/SupplierModal';
import ConfirmModal from '../components/common/ConfirmModal';
import { formatCurrency, formatNumber } from '../utils/formatters';

/**
 * หน้าจัดการผู้ผลิต (เมนูบริหาร)
 * ลงทะเบียน แก้ไข ลบ และดูสรุปยอดนำเข้าของผู้ผลิตแต่ละราย
 */
export default function SuppliersPage() {
  const { suppliers = [], stockImports = [], deleteSupplier } = usePOS();
  const [search, setSearch] = useState('');
  const [supplierModal, setSupplierModal] = useState({ isOpen: false, supplier: null });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // สรุปจำนวนใบนำเข้าและยอดนำเข้าสำเร็จของผู้ผลิตแต่ละราย
  const importStatsBySupplier = useMemo(() => {
    const stats = new Map();
    stockImports.forEach((imp) => {
      if (!imp.supplier_id) return;
      const prev = stats.get(imp.supplier_id) || { count: 0, completedTotal: 0 };
      stats.set(imp.supplier_id, {
        count: prev.count + 1,
        completedTotal:
          prev.completedTotal +
          (imp.status === 'completed' ? Number(imp.grand_total) || 0 : 0),
      });
    });
    return stats;
  }, [stockImports]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      `${s.name} ${s.phone} ${formatSupplierAddress(s)}`.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      {/* แถบหัวข้อเพจ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
              จัดการผู้ผลิต (Suppliers)
            </h1>
            <p className="text-xs text-slate-500">
              บริษัทหรือร้านค้าที่ขายสินค้าให้เรา ทั้งหมด {formatNumber(suppliers.length)} ราย
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, เบอร์โทร หรือจังหวัด..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setSupplierModal({ isOpen: true, supplier: null })}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>ลงทะเบียนผู้ผลิต</span>
          </button>
        </div>
      </div>

      {/* ตารางรายชื่อผู้ผลิต */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto shadow-2xs">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
            <tr>
              <th className="py-2.5 px-3">ชื่อผู้ผลิต</th>
              <th className="py-2.5 px-3">ที่อยู่</th>
              <th className="py-2.5 px-3">เบอร์โทร</th>
              <th className="py-2.5 px-3 text-center">ใบนำเข้า</th>
              <th className="py-2.5 px-3 text-right">ยอดนำเข้าสำเร็จ</th>
              <th className="py-2.5 px-3 text-center w-28">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 text-xs">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="w-9 h-9 text-slate-300" />
                    <span className="font-bold text-slate-600">
                      {suppliers.length === 0 ? 'ยังไม่มีผู้ผลิตในระบบ' : 'ไม่พบผู้ผลิตที่ค้นหา'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((s) => {
                const stats = importStatsBySupplier.get(s.id) || { count: 0, completedTotal: 0 };
                return (
                  <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{s.name}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                      {formatSupplierAddress(s) || '-'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {s.phone ? (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700">
                          <Phone className="w-3 h-3" />
                          {s.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                      {formatNumber(stats.count)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                      {formatCurrency(stats.completedTotal)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSupplierModal({ isOpen: true, supplier: s })}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-slate-600 transition-colors"
                          title="แก้ไขข้อมูลผู้ผลิต"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-colors"
                          title="ลบผู้ผลิต"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SupplierModal
        isOpen={supplierModal.isOpen}
        supplier={supplierModal.supplier}
        onClose={() => setSupplierModal({ isOpen: false, supplier: null })}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="ลบผู้ผลิตนี้?"
        message={`ลบ "${deleteTarget?.name || ''}" ออกจากรายชื่อผู้ผลิต (ใบนำเข้าเดิมยังเก็บชื่อผู้ผลิตไว้ตามเดิม)`}
        confirmText="ลบผู้ผลิต"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          await deleteSupplier(target.id);
        }}
      />
    </div>
  );
}
