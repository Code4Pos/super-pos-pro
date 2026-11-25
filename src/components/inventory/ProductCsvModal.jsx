import React, { useMemo, useRef, useState } from 'react';
import { X, FileSpreadsheet, Download, Upload, Copy, AlertTriangle, CheckCircle2, Loader2, FileDown } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ApproverPinModal from '../pos/ApproverPinModal';
import {
  buildProductCsv,
  buildProductCsvTemplate,
  decodeCsvBuffer,
  parseCsv,
  planProductImport,
} from '../../utils/productCsv';
import { formatNumber } from '../../utils/formatters';

const ACTION_META = {
  create: { label: 'เพิ่มใหม่', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  update: { label: 'อัปเดต', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  unchanged: { label: 'ไม่เปลี่ยน', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  error: { label: 'ผิดพลาด', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const MAX_PREVIEW_ROWS = 300;

// ชื่อช่องที่เปลี่ยน (แสดงในตารางตรวจสอบ)
const CHANGE_LABELS = {
  name: 'ชื่อ',
  barcode: 'บาร์โค้ด',
  unit: 'หน่วย',
  cost_price: 'ทุน',
  retail_price: 'ปลีก',
  is_wholesale_enabled: 'เปิดราคาส่ง',
  wholesale_price: 'ส่ง',
  wholesale_min_qty: 'ขั้นต่ำส่ง',
  min_stock: 'จุดเตือน',
  pack_size: 'ขนาดบรรจุ',
  is_active: 'เปิดขาย',
  category_id: 'หมวดหมู่',
  category_name: 'หมวดหมู่ใหม่',
  linked_sku: 'สินค้าหลัก',
  linked_deduct_qty: 'ตัดต่อหน่วย',
};

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * นำเข้า / ส่งออกข้อมูลสินค้าด้วยไฟล์ CSV (beta 0.4.1)
 * filteredProducts = สินค้าที่กรองอยู่ในหน้าคลังสินค้า (ใช้กับตัวเลือก "ส่งออกเฉพาะที่กรอง")
 */
export default function ProductCsvModal({ onClose, filteredProducts = [] }) {
  const {
    products,
    trashedProducts = [],
    categories,
    units,
    importProductsCsv,
    showToast,
    dbMode,
    isOffline,
    authEnabled,
    can,
  } = usePOS();
  const [tab, setTab] = useState('export');
  const [exportScope, setExportScope] = useState('all');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState(null); // ผลจาก parseCsv
  const [updateStock, setUpdateStock] = useState(false);
  const [rowFilter, setRowFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [askPin, setAskPin] = useState(false);
  const fileInputRef = useRef(null);

  const exportList = exportScope === 'filtered' ? filteredProducts : products;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const needsOnline = dbMode === 'supabase' && isOffline;

  const plan = useMemo(
    () => (rows ? planProductImport(rows, { products, trashedProducts, categories, units }, { updateStock }) : null),
    [rows, products, trashedProducts, categories, units, updateStock]
  );
  const toApply = plan ? plan.summary.create + plan.summary.update : 0;
  const visibleRows = useMemo(() => {
    if (!plan) return [];
    const list = rowFilter === 'all' ? plan.rows : plan.rows.filter((r) => r.action === rowFilter);
    return list.slice(0, MAX_PREVIEW_ROWS);
  }, [plan, rowFilter]);
  // ลดสต็อกตามไฟล์ = ต้องผู้มีสิทธิ์อนุมัติลดสต็อก (แบบเดียวกับการปรับลดสต็อก)
  const needsApproval = Boolean(plan?.stockDecreases) && authEnabled && !can('approve_stock');

  const handleExport = () => {
    downloadText(buildProductCsv(exportList, categories), `สินค้า-${dateStamp}.csv`);
    showToast(`ส่งออกสินค้า ${exportList.length} รายการ`, 'success');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildProductCsv(exportList, categories));
      showToast('คัดลอกข้อมูล CSV แล้ว วางในไฟล์ .csv หรือ Excel ได้', 'success');
    } catch {
      showToast('คัดลอกไม่ได้ในเครื่องนี้', 'error');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setResult(null);
    setRowFilter('all');
    try {
      const text = decodeCsvBuffer(await file.arrayBuffer());
      setRows(parseCsv(text));
      setFileName(file.name);
    } catch (err) {
      showToast(`อ่านไฟล์ไม่ได้: ${err.message}`, 'error');
      setRows(null);
    }
  };

  const runImport = async (approvedBy = '') => {
    setImporting(true);
    setProgress({ done: 0, total: toApply });
    try {
      const res = await importProductsCsv(plan, {
        approvedBy,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      setRows(null);
      setFileName('');
    } catch (err) {
      showToast(err.message || 'นำเข้าไม่สำเร็จ', 'error');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const handleImport = () => {
    if (!plan || toApply === 0) return;
    if (needsApproval) {
      setAskPin(true);
      return;
    }
    runImport();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94dvh] flex flex-col overflow-hidden border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 className="text-sm font-extrabold text-slate-900 truncate">นำเข้า / ส่งออกสินค้า (CSV)</h2>
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
            {[
              ['export', 'ส่งออก', Download],
              ['import', 'นำเข้า', Upload],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                disabled={importing}
                onClick={() => setTab(id)}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                  tab === id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {tab === 'export' ? (
            <>
              <div className="space-y-1.5">
                {[
                  ['all', `สินค้าทั้งหมด (${formatNumber(products.length)} รายการ)`],
                  ['filtered', `เฉพาะที่ค้นหา/กรองอยู่ในหน้าคลังสินค้า (${formatNumber(filteredProducts.length)} รายการ)`],
                ].map(([id, label]) => (
                  <label key={id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="csv-export-scope"
                      checked={exportScope === id}
                      onChange={() => setExportScope(id)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-800">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exportList.length === 0}
                  onClick={handleExport}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> ดาวน์โหลดไฟล์ CSV
                </button>
                <button
                  type="button"
                  disabled={exportList.length === 0}
                  onClick={handleCopy}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1.5"
                >
                  <Copy className="w-4 h-4" /> คัดลอกข้อความ
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                เปิดด้วย Excel หรือ Google Sheets ได้ทันที (ภาษาไทยไม่เพี้ยน) • ไม่รวมหน่วยขายหลายบาร์โค้ดและราคาขายส่งขั้นบันได •
                ในแอปที่ดาวน์โหลดไฟล์ไม่ได้ ให้กด "คัดลอกข้อความ" แล้ววางในไฟล์ .csv
              </p>
            </>
          ) : result ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs text-emerald-800">
                  <div className="font-extrabold">นำเข้าเสร็จแล้ว</div>
                  เพิ่มใหม่ {formatNumber(result.created)} • อัปเดต {formatNumber(result.updated)}
                  {result.failed.length > 0 && ` • ไม่สำเร็จ ${formatNumber(result.failed.length)}`}
                </div>
              </div>
              {result.failed.length > 0 && (
                <div className="border border-rose-200 rounded-xl divide-y divide-rose-100 max-h-60 overflow-y-auto">
                  {result.failed.map((f) => (
                    <div key={f.line} className="p-2 text-[11px] text-rose-700">
                      แถว {f.line} • {f.sku}: {f.error}
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setResult(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700"
              >
                นำเข้าไฟล์อื่น
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" /> {fileName ? 'เลือกไฟล์ใหม่' : 'เลือกไฟล์ CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(buildProductCsvTemplate(), 'ตัวอย่างนำเข้าสินค้า.csv')}
                  className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4" /> ไฟล์ตัวอย่าง
                </button>
                {fileName && <span className="text-[11px] text-slate-500 truncate max-w-full">{fileName}</span>}
              </div>

              <label className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateStock}
                  onChange={(e) => setUpdateStock(e.target.checked)}
                  disabled={importing}
                  className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0"
                />
                <span className="text-xs text-slate-700">
                  <span className="font-bold">บันทึกสต็อกตามไฟล์</span> (สินค้าที่มีอยู่แล้ว) — ไม่ติ๊ก = ไม่แตะสต็อกเดิม
                  <span className="block text-[11px] text-slate-500">
                    สินค้าใหม่ใช้ยอดในไฟล์เป็นยอดยกมาเสมอ • สินค้ารองใช้สต็อกของสินค้าหลัก • บันทึกในประวัติความเคลื่อนไหวสต็อก
                  </span>
                </span>
              </label>

              {!plan ? (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  จับคู่สินค้าเดิมด้วย SKU • ช่องที่เว้นว่าง = คงค่าเดิม • หมวดหมู่/หน่วยที่ยังไม่มีจะสร้างให้อัตโนมัติ • สินค้าที่ไม่อยู่ในไฟล์ไม่ถูกแก้ไข •
                  รองรับไฟล์จาก Excel ทั้งแบบ "CSV UTF-8" และ CSV ภาษาไทยแบบเดิม
                </p>
              ) : plan.error ? (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {plan.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {['create', 'update', 'unchanged', 'error'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRowFilter(rowFilter === key ? 'all' : key)}
                        className={`p-2 rounded-xl border ${ACTION_META[key].className} ${rowFilter === key ? 'ring-2 ring-indigo-400' : ''}`}
                      >
                        <div className="text-[10px] font-bold">{ACTION_META[key].label}</div>
                        <div className="text-sm font-extrabold">{formatNumber(plan.summary[key])}</div>
                      </button>
                    ))}
                  </div>

                  {(plan.newCategories.length > 0 || plan.newUnits.length > 0) && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                      {plan.newCategories.length > 0 && <div>สร้างหมวดหมู่ใหม่: {plan.newCategories.join(', ')}</div>}
                      {plan.newUnits.length > 0 && <div>สร้างหน่วยใหม่: {plan.newUnits.join(', ')}</div>}
                    </div>
                  )}
                  {plan.unknownColumns.length > 0 && (
                    <div className="text-[11px] text-slate-500">ไม่ได้ใช้คอลัมน์: {plan.unknownColumns.join(', ')}</div>
                  )}
                  {plan.stockDecreases > 0 && (
                    <div className="text-[11px] font-bold text-rose-700">
                      มี {formatNumber(plan.stockDecreases)} รายการที่สต็อกจะลดลง{needsApproval ? ' (ต้องใช้ PIN ผู้จัดการ)' : ''}
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full min-w-[620px] text-[11px]">
                      <thead className="bg-slate-100 text-slate-600 font-extrabold">
                        <tr>
                          <th className="py-2 px-2 text-left">แถว</th>
                          <th className="py-2 px-2 text-left">SKU / ชื่อ</th>
                          <th className="py-2 px-2 text-left">ผล</th>
                          <th className="py-2 px-2 text-left">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRows.map((r) => (
                          <tr key={r.line} className="align-top">
                            <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                            <td className="py-1.5 px-2">
                              <div className="font-mono font-bold text-slate-700">{r.sku || '-'}</div>
                              <div className="text-slate-500 truncate max-w-[200px]">{r.name}</div>
                            </td>
                            <td className="py-1.5 px-2">
                              <span className={`px-1.5 py-0.5 rounded-md border font-bold whitespace-nowrap ${ACTION_META[r.action].className}`}>
                                {ACTION_META[r.action].label}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-slate-600">
                              {r.action === 'error'
                                ? <span className="text-rose-600">{r.errors.join(' • ')}</span>
                                : [
                                    ...Object.keys(r.changes || {})
                                      .filter((k) => r.action === 'update' || ['category_name', 'linked_sku'].includes(k))
                                      .map((k) => CHANGE_LABELS[k] || k),
                                    r.stockTo !== null && r.stockTo !== undefined
                                      ? r.stockFrom !== null && r.stockFrom !== undefined
                                        ? `สต็อก ${formatNumber(r.stockFrom)} → ${formatNumber(r.stockTo)}`
                                        : `สต็อกตั้งต้น ${formatNumber(r.stockTo)}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {plan.rows.length > MAX_PREVIEW_ROWS && (
                    <p className="text-[11px] text-slate-400">แสดง {MAX_PREVIEW_ROWS} แถวแรก (กดการ์ดด้านบนเพื่อกรอง)</p>
                  )}
                </>
              )}

              {progress && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600"
                      style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">กำลังบันทึก… อย่าปิดหน้าต่างนี้</div>
                </div>
              )}
            </>
          )}
        </div>

        {tab === 'import' && !result && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-500">
              {needsOnline ? 'ต้องเชื่อมต่ออินเทอร์เน็ตก่อนนำเข้า' : plan && !plan.error ? `จะบันทึก ${formatNumber(toApply)} รายการ (ข้ามแถวที่ผิดพลาด)` : ''}
            </span>
            <button
              type="button"
              disabled={importing || !plan || Boolean(plan.error) || toApply === 0 || needsOnline}
              onClick={handleImport}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
            </button>
          </div>
        )}
      </div>

      <ApproverPinModal
        isOpen={askPin}
        title="อนุมัติลดสต็อกตามไฟล์"
        description={`ไฟล์นี้ทำให้สต็อก ${plan?.stockDecreases || 0} รายการลดลง ต้องใช้ PIN ผู้มีสิทธิ์อนุมัติลดสต็อก`}
        permission="approve_stock"
        confirmLabel="อนุมัติและนำเข้า"
        onApproved={async (approver) => {
          setAskPin(false);
          await runImport(approver?.name || '');
        }}
        onClose={() => setAskPin(false)}
      />
    </div>
  );
}
