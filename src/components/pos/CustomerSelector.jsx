import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  X,
  QrCode,
  Check,
  ChevronDown,
  ScanLine,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * CustomerSelector:
 * - สามารถพิมพ์ค้นหาชื่อ, เบอร์โทร, รหัสลูกค้า หรือชื่อร้านค้าย่อยได้
 * - รองรับการยิงบาร์โค้ด / สแกน QR Code รหัสสมาชิก (กด Enter เพื่อเลือกลูกค้าทันที)
 * - มีปุ่มไอคอนกากบาท (X) ด้านหลังช่องสำหรับลบ/ยกเลิกการเลือกลูกค้า
 */
export default function CustomerSelector({
  placeholder = 'ค้นหาลูกค้า หรือสแกนรหัส/QR สมาชิก...',
  requiredWarning = false,
}) {
  const { customers, selectedCustomer, selectCustomer, showToast } = usePOS();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const containerRef = useRef(null);
  const scanInputRef = useRef(null);

  // ปิด dropdown เมื่อคลิกด้านนอก
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isScanModalOpen && scanInputRef.current) {
      setTimeout(() => scanInputRef.current?.focus(), 80);
    }
  }, [isScanModalOpen]);

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.shop_name?.toLowerCase().includes(q)
    );
  }, [customers, query]);

  // รองรับการสแกนบาร์โค้ดหรือ QR Code ในช่องค้นหาแล้วกด Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      e.stopPropagation();
      const q = query.trim().toLowerCase();
      const exactMatch =
        customers.find(
          (c) =>
            c.code?.toLowerCase() === q ||
            c.phone?.replace(/-/g, '') === q.replace(/-/g, '')
        ) || (filteredCustomers.length === 1 ? filteredCustomers[0] : null);

      if (exactMatch) {
        selectCustomer(exactMatch);
        setQuery('');
        setIsOpen(false);
      } else {
        showToast('ไม่พบรหัสลูกค้าที่สแกนหรือค้นหา', 'warning');
      }
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setQuery('');
    if (selectedCustomer) {
      selectCustomer(null);
      showToast('ล้างการเลือกลูกค้ากลับเป็นลูกค้าทั่วไปแล้ว', 'info');
    }
  };

  const handleScanConfirm = (e) => {
    e.preventDefault();
    const q = scanInput.trim().toLowerCase();
    if (!q) return;
    const found = customers.find(
      (c) =>
        c.code?.toLowerCase() === q ||
        c.phone?.replace(/-/g, '') === q.replace(/-/g, '') ||
        c.name?.toLowerCase().includes(q)
    );
    if (found) {
      selectCustomer(found);
      setScanInput('');
      setIsScanModalOpen(false);
    } else {
      showToast(`ไม่พบรหัสสมาชิก "${scanInput}"`, 'error');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center rounded-xl border transition-all bg-slate-50/90 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500 ${
          requiredWarning && !selectedCustomer
            ? 'border-rose-400 bg-rose-50/40 ring-2 ring-rose-500/20'
            : selectedCustomer
            ? 'border-indigo-300 bg-indigo-50/40'
            : 'border-slate-200'
        }`}
      >
        <div className="pl-3 pr-1.5 text-slate-400 shrink-0">
          <Users
            className={`w-4 h-4 ${
              selectedCustomer ? 'text-indigo-600' : 'text-slate-400'
            }`}
          />
        </div>

        {/* ช่องพิมพ์ค้นหา หรือแสดงชื่อลูกค้าที่เลือก */}
        <input
          type="text"
          data-allow-scanner="false"
          value={
            isOpen
              ? query
              : selectedCustomer
              ? `${selectedCustomer.customer_type === 'wholesale' ? '⭐ ' : '👤 '}${selectedCustomer.name} (${selectedCustomer.code})`
              : query
          }
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full py-2 px-1.5 bg-transparent text-xs font-semibold focus:outline-none truncate ${
            selectedCustomer && !isOpen ? 'text-indigo-950' : 'text-slate-800'
          }`}
        />

        {/* ปุ่มกากบาท (X) ด้านหลังช่องสำหรับลบ/ล้างค่า */}
        {(selectedCustomer || query) && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
            title="ลบข้อมูลลูกค้าที่เลือก"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}

        {/* ปุ่มเปิดกล้อง/สแกน QR หรือ Barcode ลูกค้า */}
        <button
          type="button"
          onClick={() => setIsScanModalOpen(true)}
          className="p-1.5 mr-1 text-indigo-600 hover:bg-indigo-100/80 rounded-lg transition-colors shrink-0"
          title="สแกนบาร์โค้ด / QR Code รหัสสมาชิก"
        >
          <QrCode className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="pr-2.5 pl-0.5 text-slate-400 hover:text-slate-600 shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* รายการ Dropdown ผลลัพธ์การค้นหา */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-40 max-h-60 overflow-y-auto divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => {
              selectCustomer(null);
              setQuery('');
              setIsOpen(false);
            }}
            className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-slate-50 ${
              !selectedCustomer ? 'bg-indigo-50/50 font-bold text-indigo-700' : 'text-slate-600'
            }`}
          >
            <span>👤 ลูกค้าทั่วไป (Walk-in Customer)</span>
            {!selectedCustomer && <Check className="w-3.5 h-3.5 text-indigo-600" />}
          </button>

          {filteredCustomers.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              ไม่พบรายชื่อลูกค้าที่ตรงกับ &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCustomers.map((c) => {
              const isSelected = selectedCustomer?.id === c.id;
              const isWholesale = c.customer_type === 'wholesale';
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    selectCustomer(c);
                    setQuery('');
                    setIsOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-indigo-50/60 transition-colors ${
                    isSelected ? 'bg-indigo-50 font-bold' : ''
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 truncate">
                        {c.name}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          isWholesale
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isWholesale ? '⭐ ขายส่ง/ยี่ปั๊ว' : 'ขายปลีก'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      รหัส: {c.code} • โทร: {c.phone || '-'}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Modal สแกนบาร์โค้ด / QR Code สมาชิก */}
      {isScanModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm">
                  สแกนบาร์โค้ด / QR Code ลูกค้า
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScanConfirm} className="p-5 space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center text-center space-y-2">
                <QrCode className="w-14 h-14 text-indigo-600 stroke-1.5 animate-pulse" />
                <p className="text-xs font-semibold text-indigo-950">
                  ยิงเครื่องสแกนบาร์โค้ด หรือสแกน QR Code บัตรสมาชิก
                </p>
                <input
                  ref={scanInputRef}
                  type="text"
                  data-allow-scanner="false"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="เช่น CUS-001 หรือเบอร์โทร..."
                  className="w-full px-3.5 py-2 rounded-xl border border-indigo-300 bg-white text-center font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {/* ปุ่มจำลองสแกนบัตรสมาชิกลูกค้าด่วน */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500">
                  คลิกเพื่อจำลองสแกน QR สมาชิกในระบบ:
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        selectCustomer(c);
                        setIsScanModalOpen(false);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-left text-xs flex items-center justify-between transition-colors"
                    >
                      <span className="font-semibold text-slate-800 truncate">
                        {c.name}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-indigo-600 shrink-0 ml-2">
                        [{c.code}]
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsScanModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  ปิด
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                >
                  ตกลง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

