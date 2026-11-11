import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { AlertCircle } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { buildPromptPayPayload, maskPromptPayId } from '../../utils/promptpay';
import { formatCurrency } from '../../utils/formatters';

/**
 * แสดง Thai QR PromptPay ตามยอดเงินจริง (Dynamic QR)
 * ใช้หมายเลขพร้อมเพย์ของร้านจากหน้าตั้งค่าเครื่องพิมพ์/ข้อมูลร้าน
 */
export default function PromptPayQR({ amount, size = 160 }) {
  const { printerSettings } = usePOS();
  const promptpayId = printerSettings?.promptpayId || '';
  const payload = buildPromptPayPayload(promptpayId, amount);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setQrDataUrl('');
      return undefined;
    }
    QRCode.toDataURL(payload, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  if (!payload) {
    return (
      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-left text-xs">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-amber-900">ยังไม่ได้ตั้งค่าหมายเลขพร้อมเพย์ของร้าน</div>
          <p className="text-amber-800 mt-0.5">
            ไปที่ ตั้งค่าเครื่องพิมพ์ › 3. รับชำระเงิน แล้วใส่เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center space-y-1.5">
      <div className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold">
        THAI QR PROMPTPAY
      </div>
      <div
        className="bg-white p-2 rounded-2xl border-2 border-indigo-600 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR พร้อมเพย์ ยอด ${formatCurrency(amount)}`}
            className="w-full h-full"
          />
        ) : (
          <span className="text-xs text-slate-400">กำลังสร้าง QR...</span>
        )}
      </div>
      <p className="text-xs font-semibold text-slate-700">
        สแกนเพื่อชำระยอด{' '}
        <span className="text-indigo-700 font-bold">{formatCurrency(amount)}</span>
      </p>
      <p className="text-[11px] text-slate-500">พร้อมเพย์: {maskPromptPayId(promptpayId)}</p>
    </div>
  );
}
