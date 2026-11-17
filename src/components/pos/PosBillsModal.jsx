import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Loader2, ReceiptText, Printer, FileText, Ban, ChevronLeft, RefreshCw, WifiOff } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printerService } from '../../services/printerService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { describeOrderPayments } from '../../utils/payments';
import ApproverPinModal from './ApproverPinModal';

const PAGE_SIZE = 100;

/**
 * หน้าต่างประวัติบิลในหน้าขาย (ไม่ต้องสลับไปหลังร้าน)
 * - โหลดข้อมูลเมื่อเปิดหน้าต่างเท่านั้น / ค้นหาด้วยเลขที่บิลหรือชื่อลูกค้า (ค้นในฐานข้อมูล)
 * - ดูตัวอย่างใบเสร็จ พิมพ์ซ้ำ และยกเลิกบิล (ต้องใช้ PIN ผู้จัดการ/ผู้ดูแลระบบ)
 */
export default function PosBillsModal({ isOpen, onClose }) {
  const { fetchRecentOrders, voidOrder, authEnabled, showToast } = usePOS();
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isVoidApprovalOpen, setIsVoidApprovalOpen] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(
    async (text) => {
      const requestId = ++requestRef.current;
      setLoading(true);
      try {
        const result = await fetchRecentOrders(text, PAGE_SIZE);
        if (requestId !== requestRef.current) return;
        setOrders(result.orders);
        setOffline(result.offline);
      } catch (err) {
        if (requestId === requestRef.current) showToast(`โหลดประวัติบิลไม่สำเร็จ: ${err.message}`, 'error');
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [fetchRecentOrders, showToast]
  );

  // เปิดหน้าต่าง = โหลดบิลล่าสุด / ปิด = ล้างข้อมูลทิ้ง
  useEffect(() => {
    if (!isOpen) {
      requestRef.current += 1;
      setOrders([]);
      setSelectedId(null);
      setSearch('');
      return;
    }
    load('');
  }, [isOpen, load]);

  // ค้นหาเมื่อหยุดพิมพ์
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => load(search), search ? 400 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!isOpen) return null;

  const selected = orders.find((o) => o.id === selectedId) || null;

  const doVoid = async () => {
    if (!selected) return;
    try {
      const updated = await voidOrder(selected);
      setOrders((prev) =>
        prev.map((o) => (o.id === selected.id ? { ...o, ...(updated || {}), status: 'voided' } : o))
      );
      setIsVoidApprovalOpen(false);
    } catch (err) {
      showToast(`ยกเลิกบิลไม่สำเร็จ: ${err.message}`, 'error');
    }
  };

  const handleVoidClick = () => {
    if (!selected || selected.status === 'voided') return;
    if (authEnabled) {
      setIsVoidApprovalOpen(true);
      return;
    }
    // ยังไม่ได้ตั้งผู้ใช้ (ไม่มี PIN) = ยืนยันอย่างเดียว
    if (window.confirm(`ยืนยันยกเลิกบิล ${selected.order_number}? สต็อกจะถูกคืนกลับ`)) doVoid();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/75 select-none">
      <div className="bg-white w-full sm:max-w-5xl sm:rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full sm:h-[85vh]">
        {/* หัวหน้าต่าง */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 flex items-center gap-2 shrink-0">
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
              title="กลับไปรายการบิล"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <ReceiptText className="w-5 h-5 text-indigo-600 shrink-0" />
          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex-1 truncate">ประวัติบิล</h3>
          {offline && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
              <WifiOff className="w-3 h-3" /> ข้อมูลในเครื่อง
            </span>
          )}
          <button
            type="button"
            onClick={() => load(search)}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="โหลดใหม่"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* รายการบิล */}
          <div className={`w-full md:w-80 lg:w-96 md:border-r border-slate-200 flex-col min-h-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-2.5 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่บิล หรือชื่อลูกค้า..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && orders.length === 0 ? (
                <div className="p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดบิล...
                </div>
              ) : orders.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">ไม่พบบิล</div>
              ) : (
                orders.map((o) => {
                  const isVoided = o.status === 'voided';
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className={`w-full px-3 py-2.5 border-b border-slate-100 text-left flex items-center gap-2 ${
                        o.id === selectedId ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono font-bold text-xs truncate ${isVoided ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            {o.order_number}
                          </span>
                          {isVoided && (
                            <span className="px-1.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold shrink-0">ยกเลิก</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {formatDateTime(o.created_at)} • {o.customer_name || 'ลูกค้าทั่วไป'}
                        </div>
                      </div>
                      <div className={`font-extrabold text-sm shrink-0 ${isVoided ? 'text-slate-400' : 'text-indigo-700'}`}>
                        {formatCurrency(o.grand_total)}
                      </div>
                    </button>
                  );
                })
              )}
              {orders.length >= PAGE_SIZE && (
                <div className="p-2 text-center text-[11px] text-slate-400">
                  แสดง {PAGE_SIZE} บิลล่าสุด พิมพ์ค้นหาเพื่อหาบิลที่เก่ากว่า
                </div>
              )}
            </div>
          </div>

          {/* รายละเอียด / ตัวอย่างใบเสร็จ */}
          <div className={`flex-1 flex-col min-h-0 bg-slate-100 ${selected ? 'flex' : 'hidden md:flex'}`}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-6 text-center">
                เลือกบิลทางซ้ายเพื่อดูตัวอย่างใบเสร็จ
              </div>
            ) : (
              <>
                <div className="px-3 py-2 bg-white border-b border-slate-200 text-xs text-slate-600 shrink-0">
                  <span className="font-bold text-slate-900">{selected.order_number}</span> • ชำระโดย{' '}
                  {describeOrderPayments(selected, formatCurrency)}
                  {selected.created_by_name && <> • พนักงาน {selected.created_by_name}</>}
                </div>
                <div className="flex-1 overflow-auto p-3 flex justify-center">
                  <iframe
                    title="ตัวอย่างใบเสร็จ"
                    srcDoc={printerService.getThermalReceiptHtml(selected)}
                    sandbox=""
                    className="w-[320px] max-w-full h-full min-h-[420px] bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="p-2.5 bg-white border-t border-slate-200 grid grid-cols-3 gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => printerService.printThermalReceipt(selected)}
                    className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" /> พิมพ์ซ้ำ
                  </button>
                  <button
                    type="button"
                    onClick={() => printerService.printA4Receipt(selected)}
                    className="h-11 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" /> A4
                  </button>
                  <button
                    type="button"
                    onClick={handleVoidClick}
                    disabled={selected.status === 'voided'}
                    className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-4 h-4" /> {selected.status === 'voided' ? 'ยกเลิกแล้ว' : 'ยกเลิกบิล'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ApproverPinModal
        isOpen={isVoidApprovalOpen}
        title="อนุมัติยกเลิกบิล"
        description={
          selected
            ? `ยกเลิกบิล ${selected.order_number} ยอด ${formatCurrency(selected.grand_total)} สต็อกจะถูกคืนกลับ ต้องใช้ PIN ผู้จัดการหรือผู้ดูแลระบบ`
            : ''
        }
        permission="void_order"
        confirmLabel="ยกเลิกบิล"
        danger
        onApproved={doVoid}
        onClose={() => setIsVoidApprovalOpen(false)}
      />
    </div>
  );
}
