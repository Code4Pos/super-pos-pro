import React, { useState } from 'react';
import { X, FileText, Edit3, Truck, PackageCheck, XCircle, Check, Printer } from 'lucide-react';
import ConfirmModal from '../common/ConfirmModal';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import ImportStatusBadge, { IMPORT_STATUS_META, IMPORT_STATUS_FLOW } from './ImportStatusBadge';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/formatters';

// ข้อความยืนยันก่อนเปลี่ยนสถานะ
const STATUS_ACTION_CONFIRM = {
  in_transit: {
    title: 'อนุมัติใบนำเข้า?',
    message: 'สถานะจะเปลี่ยนเป็น "ระหว่างขนส่ง" (ยังไม่เพิ่มสต็อก จนกว่าจะยืนยันรับสินค้า)',
    confirmText: 'อนุมัติ',
    variant: 'warning',
  },
  completed: {
    title: 'ยืนยันรับสินค้าเข้าคลัง?',
    message: 'ระบบจะเพิ่มสต็อกและอัปเดตราคาต้นทุนทันที แล้วเปลี่ยนสถานะเป็น "นำเข้าสำเร็จ"',
    confirmText: 'รับสินค้าเข้าคลัง',
    variant: 'warning',
  },
  cancelled: {
    title: 'ยกเลิกใบนำเข้านี้?',
    message: 'ใบนำเข้าที่ยกเลิกแล้วจะไม่สามารถนำกลับมาใช้ได้ และจะไม่มีการเพิ่มสต็อก',
    confirmText: 'ยกเลิกใบนำเข้า',
    variant: 'danger',
  },
};

/**
 * Modal ตรวจสอบใบนำเข้า: แสดงรายละเอียด ขั้นตอนสถานะ และปุ่มเปลี่ยนสถานะ
 */
export default function ImportDetailModal({ importDoc, onClose, onEdit, onChangeStatus }) {
  const { suppliers = [] } = usePOS();
  const [pendingAction, setPendingAction] = useState(null);

  if (!importDoc) return null;

  const status = importDoc.status;
  const historyAt = (key) =>
    [...(importDoc.status_history || [])].reverse().find((h) => h.status === key)?.at;
  const currentFlowIndex = IMPORT_STATUS_FLOW.indexOf(status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="text-sm font-bold font-mono">{importDoc.import_number}</h3>
            <ImportStatusBadge status={status} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                printerService.printPurchaseOrder(
                  importDoc,
                  suppliers.find((s) => s.id === importDoc.supplier_id) || null
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1"
              title="พิมพ์ใบสั่งซื้อ (PO) ขนาด A4"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">พิมพ์ PO</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* ขั้นตอนสถานะ: รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ */}
          {status === 'cancelled' ? (
            <div className="px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600">
              ใบนำเข้านี้ถูกยกเลิกเมื่อ {formatDateTime(historyAt('cancelled'))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {IMPORT_STATUS_FLOW.map((key, idx) => {
                const meta = IMPORT_STATUS_META[key];
                const Icon = meta.icon;
                const isDone = idx <= currentFlowIndex;
                const at = historyAt(key);
                return (
                  <div
                    key={key}
                    className={`p-2.5 rounded-xl border text-center ${
                      isDone ? meta.className : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-extrabold">
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                      <span>{meta.label}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">
                      {at ? formatDateTime(at) : isDone ? 'ข้ามขั้นตอน' : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ข้อมูลใบนำเข้า */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-semibold">ผู้ผลิต</div>
              <div className="font-extrabold text-slate-900">{importDoc.supplier_name}</div>
              {importDoc.supplier_phone && (
                <div className="font-mono text-indigo-700">{importDoc.supplier_phone}</div>
              )}
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-semibold">วันที่สร้างใบนำเข้า</div>
              <div className="font-extrabold text-slate-900">
                {formatDateTime(importDoc.created_at)}
              </div>
              {importDoc.note && <div className="text-slate-500">หมายเหตุ: {importDoc.note}</div>}
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-emerald-700 font-semibold">ยอดรวมสุทธิ</div>
              <div className="text-base font-extrabold text-emerald-700">
                {formatCurrency(importDoc.grand_total)}
              </div>
              <div className="text-emerald-700/80">
                {formatNumber((importDoc.items || []).length)} รายการ •{' '}
                {formatNumber(importDoc.total_items)} หน่วย
              </div>
            </div>
          </div>

          {/* รายการสินค้า */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs min-w-[640px]">
              <thead className="bg-slate-100 text-slate-500">
                <tr>
                  <th className="py-2 px-3">รหัสบาร์โค้ด / รหัสสินค้า</th>
                  <th className="py-2 px-3">ชื่อสินค้า</th>
                  <th className="py-2 px-3 text-center">จำนวน</th>
                  <th className="py-2 px-3 text-right">ราคานำเข้า</th>
                  <th className="py-2 px-3 text-right">ส่วนลดรวม</th>
                  <th className="py-2 px-3 text-right">ยอดรวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(importDoc.items || []).map((it, idx) => (
                  <tr key={it.row_id || idx}>
                    <td className="py-2 px-3 font-mono font-bold text-slate-700">
                      {it.barcode_or_sku}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{it.product_name}</td>
                    <td className="py-2 px-3 text-center font-bold text-indigo-700">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700">
                      {formatCurrency(it.import_price)}
                    </td>
                    <td className="py-2 px-3 text-right text-rose-600">
                      {formatCurrency(it.total_discount)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {formatCurrency(it.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ปุ่มเปลี่ยนสถานะตามขั้นตอน */}
        {(status === 'pending' || status === 'in_transit') && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingAction('cancelled')}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>ยกเลิกใบนำเข้า</span>
            </button>

            <div className="flex items-center gap-2">
              {status === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(importDoc)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>แก้ไข</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAction('in_transit')}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Truck className="w-4 h-4" />
                    <span>อนุมัติ (ระหว่างขนส่ง)</span>
                  </button>
                </>
              )}
              {status === 'in_transit' && (
                <button
                  type="button"
                  onClick={() => setPendingAction('completed')}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>รับสินค้าเข้าคลัง (นำเข้าสำเร็จ)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingAction)}
        {...(STATUS_ACTION_CONFIRM[pendingAction] || {})}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const next = pendingAction;
          setPendingAction(null);
          onChangeStatus(importDoc, next);
        }}
      />
    </div>
  );
}
