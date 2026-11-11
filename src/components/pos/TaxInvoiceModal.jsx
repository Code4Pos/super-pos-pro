import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, Printer, AlertTriangle, FileMinus, FilePlus } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import TaxNoteModal from './TaxNoteModal';
import { printerService } from '../../services/printerService';
import { calculateOrderVat } from '../../utils/tax';
import { isValidThaiTaxId } from '../../utils/credit';
import { formatCurrency } from '../../utils/formatters';

/**
 * ออก / พิมพ์ซ้ำ ใบกำกับภาษีเต็มรูปแบบจากบิลขาย
 * บิลหนึ่งออกใบกำกับเต็มรูปได้ครั้งเดียว ครั้งต่อไปจะเป็นการพิมพ์ซ้ำ (ต้นฉบับ/สำเนา)
 */
export default function TaxInvoiceModal({ order, onClose }) {
  const { customers, taxInvoices = [], createTaxInvoice, printerSettings, taxNotes = [] } = usePOS();
  const [noteType, setNoteType] = useState(null); // 'credit' | 'debit' | null
  const [form, setForm] = useState({ buyer_name: '', buyer_tax_id: '', buyer_branch: '00000', buyer_address: '' });
  const [saving, setSaving] = useState(false);

  const existing = useMemo(
    () =>
      order
        ? taxInvoices.find((t) => t.order_number === order.order_number && t.status !== 'cancelled')
        : null,
    [order, taxInvoices]
  );

  // เติมข้อมูลผู้ซื้อจากข้อมูลลูกค้าของบิล (ถ้ามี)
  useEffect(() => {
    if (!order) return;
    const customer = customers.find((c) => c.id === order.customer_id);
    setForm({
      buyer_name: customer?.shop_name || customer?.name || order.customer_name || '',
      buyer_tax_id: customer?.tax_id || '',
      buyer_branch: customer?.branch_number || '00000',
      buyer_address: customer?.address || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (!order) return null;

  const vat = calculateOrderVat(order);
  const shopReady = printerSettings?.vatRegistered && isValidThaiTaxId(printerSettings?.shopTaxId);
  const taxIdInvalid = form.buyer_tax_id !== '' && !isValidThaiTaxId(form.buyer_tax_id);
  const canIssue =
    shopReady && !saving && form.buyer_name.trim() !== '' && form.buyer_address.trim() !== '' && !taxIdInvalid;

  const handleIssue = async () => {
    if (!canIssue) return;
    setSaving(true);
    try {
      const saved = await createTaxInvoice({ order, ...form });
      if (saved) printerService.printTaxInvoice(saved, 'ต้นฉบับ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="font-bold text-sm truncate">ใบกำกับภาษีเต็มรูป • บิล {order.order_number}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">มูลค่าก่อนภาษี</div>
              <div className="font-extrabold text-slate-900">{formatCurrency(vat.base)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">VAT 7%</div>
              <div className="font-extrabold text-slate-900">{formatCurrency(vat.vat)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
              <div className="text-indigo-700">รวมทั้งสิ้น</div>
              <div className="font-extrabold text-indigo-700">{formatCurrency(vat.total)}</div>
            </div>
          </div>

          {existing ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                <div className="font-bold text-emerald-800">
                  ออกใบกำกับภาษีแล้ว เลขที่ <span className="font-mono">{existing.invoice_number}</span>
                </div>
                <div className="text-emerald-700 mt-0.5">
                  ผู้ซื้อ: {existing.buyer_name} {existing.buyer_tax_id && `(${existing.buyer_tax_id})`}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => printerService.printTaxInvoice(existing, 'ต้นฉบับ')}
                  className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์ต้นฉบับ</span>
                </button>
                <button
                  type="button"
                  onClick={() => printerService.printTaxInvoice(existing, 'สำเนา')}
                  className="py-2.5 rounded-xl border border-indigo-600 text-indigo-700 hover:bg-indigo-50 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์สำเนา</span>
                </button>
              </div>

              {/* ใบลดหนี้ / ใบเพิ่มหนี้ ที่อ้างอิงใบกำกับนี้ */}
              {order.status === 'voided' && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                  บิลนี้ถูกยกเลิกแล้ว ต้องออกใบลดหนี้เต็มจำนวนเพื่อยกเลิกภาษีขาย
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNoteType('credit')}
                  className="py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <FileMinus className="w-4 h-4" />
                  <span>ออกใบลดหนี้</span>
                </button>
                <button
                  type="button"
                  disabled={order.status === 'voided'}
                  onClick={() => setNoteType('debit')}
                  className="py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-800 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>ออกใบเพิ่มหนี้</span>
                </button>
              </div>
              {taxNotes.filter((n) => n.invoice_number === existing.invoice_number).length > 0 && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                  {taxNotes
                    .filter((n) => n.invoice_number === existing.invoice_number)
                    .map((n) => (
                      <div key={n.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-slate-900">{n.note_number}</div>
                          <div className="text-slate-500 truncate">
                            {n.note_type === 'credit' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'} • {n.reason}
                          </div>
                        </div>
                        <span className={`font-extrabold ${n.note_type === 'credit' ? 'text-rose-600' : 'text-amber-700'}`}>
                          {n.note_type === 'credit' ? '-' : '+'}
                          {formatCurrency(n.total_amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => printerService.printTaxNote(n, 'สำเนา')}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600"
                          title="พิมพ์สำเนา"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!shopReady && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    ต้องตั้งค่าร้านเป็น "จดทะเบียน VAT" และใส่เลขผู้เสียภาษีของร้านก่อน (ตั้งค่าเครื่องพิมพ์ › 4. ข้อมูลร้าน & ภาษี)
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้ซื้อ / บริษัท *</label>
                <input
                  type="text"
                  data-allow-scanner="false"
                  value={form.buyer_name}
                  onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    data-allow-scanner="false"
                    maxLength={13}
                    value={form.buyer_tax_id}
                    onChange={(e) => setForm({ ...form, buyer_tax_id: e.target.value.replace(/\D/g, '') })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                      taxIdInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">สาขา</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    data-allow-scanner="false"
                    maxLength={5}
                    value={form.buyer_branch}
                    onChange={(e) => setForm({ ...form, buyer_branch: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>
              {taxIdInvalid && (
                <p className="text-[11px] font-bold text-rose-600 -mt-1.5">เลขผู้เสียภาษีไม่ถูกต้อง</p>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ที่อยู่ผู้ซื้อ *</label>
                <textarea
                  rows={2}
                  data-allow-scanner="false"
                  value={form.buyer_address}
                  onChange={(e) => setForm({ ...form, buyer_address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <button
                type="button"
                disabled={!canIssue}
                onClick={handleIssue}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>{saving ? 'กำลังออกเลขที่...' : 'ออกใบกำกับภาษีและพิมพ์ต้นฉบับ'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {existing && noteType && (
        <TaxNoteModal invoice={existing} noteType={noteType} onClose={() => setNoteType(null)} />
      )}
    </div>
  );
}
