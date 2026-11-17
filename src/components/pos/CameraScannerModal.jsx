import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, ScanLine } from 'lucide-react';

// รูปแบบบาร์โค้ดที่ใช้กับสินค้าทั่วไป
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];
// สแกนรหัสเดิมซ้ำได้หลังเว้นช่วงนี้ (กันกล้องอ่านชิ้นเดียวซ้ำหลายครั้ง)
const SAME_CODE_COOLDOWN_MS = 1500;
// อ่านภาพทุก 250 มิลลิวินาที (ประหยัดเครื่องที่สเปกต่ำ)
const NATIVE_SCAN_INTERVAL_MS = 250;

function cameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตการใช้กล้องในการตั้งค่าแอป/เบราว์เซอร์';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'ไม่พบกล้องในเครื่องนี้';
  if (name === 'NotReadableError') return 'กล้องถูกใช้งานโดยแอปอื่นอยู่';
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
    return 'เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดผ่าน https หรือในแอป)';
  }
  return err?.message || 'เปิดกล้องไม่สำเร็จ';
}

/**
 * สแกนบาร์โค้ดด้วยกล้องมือถือ (ใช้ได้ทั้งเว็บและแอป Android)
 * - ใช้ BarcodeDetector ของเครื่องถ้ามี ไม่งั้นใช้ ZXing (โหลดเมื่อเปิดกล้องครั้งแรกเท่านั้น)
 * - สแกนต่อเนื่องได้หลายชิ้น เรียก onDetected(code) ทุกครั้งที่อ่านได้ ถ้าคืน false (ไม่พบสินค้า) จะปิดกล้อง
 */
export default function CameraScannerModal({ isOpen, onClose, onDetected }) {
  const videoRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');

  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    let stream = null;
    let timer = null;
    let zxingControls = null;
    let lastHit = { code: '', at: 0 };

    setStatus('starting');
    setError('');
    setLastCode('');

    const stopAll = () => {
      if (timer) clearInterval(timer);
      timer = null;
      try {
        zxingControls?.stop();
      } catch {
        // ignore
      }
      zxingControls = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      const video = videoRef.current;
      if (video?.srcObject) {
        video.srcObject.getTracks?.().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };

    const handleCode = (raw) => {
      const code = String(raw || '').trim();
      if (!code || cancelled) return;
      const now = Date.now();
      if (code === lastHit.code && now - lastHit.at < SAME_CODE_COOLDOWN_MS) return;
      lastHit = { code, at: now };
      setLastCode(code);
      const ok = onDetectedRef.current?.(code);
      if (ok === false) {
        // ไม่พบสินค้า: ปิดกล้องเพื่อให้เห็นหน้าต่างแจ้งเตือน
        stopAll();
        onClose();
      }
    };

    const start = async () => {
      try {
        const constraints = {
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        let detector = null;
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const supported = await window.BarcodeDetector.getSupportedFormats();
            const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
            if (formats.length > 0) detector = new window.BarcodeDetector({ formats });
          } catch {
            detector = null;
          }
        }

        if (detector) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) return stopAll();
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play();
          setStatus('scanning');
          let busy = false;
          timer = setInterval(async () => {
            if (busy || cancelled || video.readyState < 2) return;
            busy = true;
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0) handleCode(codes[0].rawValue);
            } catch {
              // ข้ามเฟรมที่อ่านไม่ได้
            } finally {
              busy = false;
            }
          }, NATIVE_SCAN_INTERVAL_MS);
          return;
        }

        // เครื่องที่ไม่มี BarcodeDetector: ใช้ ZXing
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200 });
        zxingControls = await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
          if (result) handleCode(result.getText());
        });
        if (cancelled) return stopAll();
        setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        stopAll();
        setError(cameraErrorMessage(err));
        setStatus('error');
      }
    };

    start();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Camera className="w-4 h-4" /> สแกนบาร์โค้ดด้วยกล้อง
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-3 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold"
        >
          <X className="w-4 h-4" /> ปิด
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden flex items-center justify-center">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[78%] max-w-sm h-36 border-2 border-emerald-400 rounded-2xl" />
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
            <Loader2 className="w-7 h-7 animate-spin" /> กำลังเปิดกล้อง...
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-rose-300 font-bold text-sm">{error}</div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 rounded-xl bg-white text-slate-900 font-bold text-sm"
            >
              ปิด
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3 shrink-0 text-center text-xs text-slate-300 safe-area-pb">
        {lastCode ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold">
            <ScanLine className="w-4 h-4" /> สแกนล่าสุด: <span className="font-mono">{lastCode}</span>
          </span>
        ) : (
          'เล็งบาร์โค้ดให้อยู่ในกรอบ สแกนต่อได้หลายชิ้น กด "ปิด" เมื่อเสร็จ'
        )}
      </div>
    </div>
  );
}
