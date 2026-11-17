import React, { useEffect, useMemo, useState } from 'react';
import { X, KeyRound, Loader2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { ROLES, hasPermission } from '../../utils/rbac';

/**
 * หน้าต่างขออนุมัติด้วย PIN ผู้จัดการ/ผู้ดูแลระบบ (เช่น เปิดลิ้นชัก ยกเลิกบิล)
 * - แสดงเฉพาะผู้ใช้ที่มีสิทธิ์ permission
 * - อนุมัติแล้วเรียก onApproved(user) (await ได้ ระหว่างทำงานจะล็อกปุ่ม)
 */
export default function ApproverPinModal({
  isOpen,
  title = 'ขออนุมัติ',
  description = '',
  permission,
  confirmLabel = 'อนุมัติ',
  danger = false,
  onApproved,
  onClose,
}) {
  const { users, currentUser, verifyApprover } = usePOS();
  const approvers = useMemo(
    () => users.filter((u) => u.is_active && hasPermission(u, permission)),
    [users, permission]
  );
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const self = approvers.find((u) => u.id === currentUser?.id);
    setApproverId(self?.id || approvers[0]?.id || '');
    setPin('');
    setError('');
    setWorking(false);
    // ตั้งค่าเริ่มต้นเฉพาะตอนเปิดหน้าต่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (working) return;
    const approver = verifyApprover(approverId, pin, permission);
    if (!approver) {
      setError('PIN ไม่ถูกต้อง หรือผู้ใช้นี้ไม่มีสิทธิ์อนุมัติ');
      setPin('');
      return;
    }
    setWorking(true);
    try {
      await onApproved?.(approver);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-900/75 select-none">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-slate-900 text-sm">
            <KeyRound className="w-4 h-4 text-indigo-600" /> {title}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {description && <p className="text-xs text-slate-600 leading-relaxed">{description}</p>}

          {approvers.length === 0 ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              ยังไม่มีผู้จัดการหรือผู้ดูแลระบบที่อนุมัติได้ กรุณาเพิ่มผู้ใช้ที่หน้าตั้งค่า › ผู้ใช้งาน
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">ผู้อนุมัติ</span>
                <select
                  value={approverId}
                  onChange={(e) => {
                    setApproverId(e.target.value);
                    setError('');
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                >
                  {approvers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLES[u.role]?.label || u.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">PIN ผู้อนุมัติ</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ''));
                    setError('');
                  }}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-center text-xl tracking-[0.5em] font-bold"
                  placeholder="••••"
                />
              </label>
              {error && <div className="text-xs font-bold text-rose-600">{error}</div>}
            </>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-slate-300 text-sm font-bold text-slate-600 hover:bg-white"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={working || approvers.length === 0 || pin.length < 4}
            className={`flex-1 h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:bg-slate-300 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {working && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
