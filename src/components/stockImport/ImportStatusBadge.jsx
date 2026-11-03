import React from 'react';
import { Clock, Truck, CheckCircle2, XCircle } from 'lucide-react';

/**
 * ข้อมูลแสดงผลของสถานะใบนำเข้า: รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ (หรือยกเลิก)
 */
export const IMPORT_STATUS_META = {
  pending: {
    label: 'รออนุมัติ',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  in_transit: {
    label: 'ระหว่างขนส่ง',
    icon: Truck,
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  completed: {
    label: 'นำเข้าสำเร็จ',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  cancelled: {
    label: 'ยกเลิก',
    icon: XCircle,
    className: 'bg-slate-100 text-slate-500 border-slate-200',
  },
};

// ลำดับขั้นตอนหลักของใบนำเข้า (ไม่รวมยกเลิก)
export const IMPORT_STATUS_FLOW = ['pending', 'in_transit', 'completed'];

export default function ImportStatusBadge({ status }) {
  const meta = IMPORT_STATUS_META[status] || IMPORT_STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-extrabold whitespace-nowrap ${meta.className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}
