import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Camera,
  Barcode,
  Smartphone,
  RefreshCw,
  Check,
  Upload,
  Copy,
  Download,
  Sparkles,
  ScanLine,
} from 'lucide-react';
import { encodeCode128B } from '../../utils/barcodeGenerator';
import { playScanSuccessBeep } from '../../utils/soundAlert';

/**
 * MobileBarcodeModal (version beta 0.1.4):
 * รองรับทั้ง 2 โหมดในหน้าต่างเดียว:
 * 1. โหมด "สแกนบาร์โค้ดผ่านมือถือ" (Camera Live Scan / ถ่ายภาพบาร์โค้ดจากมือถือ / ยิงสแกนผ่านมือถือ)
 * 2. โหมด "แสดงบาร์โค้ดผ่านมือถือ" (สร้างและแสดงรูปบาร์โค้ด 1D มาตรฐาน Code-128B บนหน้าจอมือถือเพื่อให้เครื่องสแกนยิงอ่านได้จริง)
 */
export default function MobileBarcodeModal({
  isOpen,
  onClose,
  initialMode = 'scan', // 'scan' | 'display'
  initialBarcode = '',
  productName = '',
  unitLabel = '',
  onSelectBarcode,
}) {
  const [activeTab, setActiveTab] = useState(initialMode);
  const [barcodeText, setBarcodeText] = useState(initialBarcode || '');
  const [cameraError, setCameraError] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [copied, setCopied] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode || 'scan');
      setBarcodeText(initialBarcode || '');
      setCameraError('');
      setCopied(false);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, initialMode, initialBarcode]);

  useEffect(() => {
    if (isOpen && activeTab === 'scan') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, facingMode]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async (targetFacing = 'environment') => {
    stopCamera();
    setCameraError('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้องโดยตรง สามารถกดปุ่ม "ถ่ายรูปบาร์โค้ดจากมือถือ" หรือพิมพ์รหัสด้านล่างแทนได้'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);

      // หากเบราว์เซอร์รองรับ BarcodeDetector API (เช่น Chrome บน Android / Sunmi / Edge)
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: [
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'qr_code',
          ],
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const detectedCode = barcodes[0].rawValue?.trim();
              if (detectedCode) {
                playScanSuccessBeep();
                setBarcodeText(detectedCode);
                stopCamera();
                if (onSelectBarcode) {
                  onSelectBarcode(detectedCode);
                  onClose();
                }
              }
            }
          } catch {
            // ข้ามเฟรมที่อ่านไม่ได้
          }
        }, 250);
      }
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError(
        'ไม่สามารถเข้าถึงกล้องมือถือได้ (อาจยังไม่ได้อนุญาตสิทธิ์กล้อง) คุณสามารถกด "ถ่ายภาพบาร์โค้ดผ่านมือถือ" ด้านล่างได้ทันที'
      );
    }
  };

  // รองรับการถ่ายภาพจากกล้องมือถือหรือเลือกรูปบาร์โค้ดมาถอดรหัส
  const handleImageFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if ('BarcodeDetector' in window) {
        const bitmap = await createImageBitmap(file);
        const detector = new window.BarcodeDetector({
          formats: [
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'qr_code',
          ],
        });
        const results = await detector.detect(bitmap);
        if (results && results.length > 0 && results[0].rawValue) {
          const detected = results[0].rawValue.trim();
          playScanSuccessBeep();
          setBarcodeText(detected);
          if (onSelectBarcode) {
            onSelectBarcode(detected);
            onClose();
          }
          return;
        }
      }
      setCameraError(
        'ไม่พบรหัสบาร์โค้ดที่ชัดเจนในรูปภาพ กรุณาถ่ายให้เห็นเส้นบาร์โค้ดชัดเจน หรือกรอกรหัสด้านล่าง'
      );
    } catch {
      setCameraError('ไม่สามารถอ่านบาร์โค้ดจากไฟล์ภาพนี้ได้ กรุณาลองอีกครั้ง');
    } finally {
      e.target.value = '';
    }
  };

  // สร้างรหัสบาร์โค้ด EAN-13 อัตโนมัติสำหรับสินค้าที่ไม่มีบาร์โค้ด
  const handleGenerateRandomBarcode = () => {
    const random9 = Math.floor(100000000 + Math.random() * 900000000);
    const base12 = `885${random9}`;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = Number(base12[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const ean13 = `${base12}${checkDigit}`;
    playScanSuccessBeep();
    setBarcodeText(ean13);
  };

  const handleConfirmUseBarcode = (e) => {
    if (e) e.preventDefault();
    const clean = barcodeText.trim();
    if (!clean) return;
    playScanSuccessBeep();
    if (onSelectBarcode) {
      onSelectBarcode(clean);
    }
    onClose();
  };

  const handleCopyBarcode = async () => {
    if (!barcodeText.trim()) return;
    try {
      await navigator.clipboard.writeText(barcodeText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  // ดาวน์โหลดรูปบาร์โค้ดเก็บไว้ในมือถือ
  const handleDownloadBarcodePng = () => {
    const code = barcodeText.trim() || '8850000000000';
    const bits = encodeCode128B(code);
    if (!bits) return;

    const canvas = document.createElement('canvas');
    const barWidth = 3;
    const quietZone = 36;
    const width = bits.length * barWidth + quietZone * 2;
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f172a';
    if (productName) {
      ctx.font = 'bold 16px Prompt, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${productName}${unitLabel ? ` (${unitLabel})` : ''}`.slice(0, 38),
        width / 2,
        30
      );
    }

    const barTop = 44;
    const barHeight = 124;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') {
        ctx.fillRect(quietZone + i * barWidth, barTop, barWidth, barHeight);
      }
    }

    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, width / 2, barTop + barHeight + 30);

    const link = document.createElement('a');
    link.download = `barcode-${code}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const encodedBits = useMemo(() => {
    return encodeCode128B(barcodeText.trim() || '8850000000000');
  }, [barcodeText]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/75">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94dvh]">
        {/* ส่วนหัว Modal */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                ระบบสแกนและแสดงบาร์โค้ดผ่านมือถือ
              </h3>
              {productName && (
                <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                  {productName} {unitLabel ? `• หน่วย: ${unitLabel}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* แท็บสลับโหมด: สแกนบาร์โค้ดผ่านมือถือ vs แสดงบาร์โค้ดผ่านมือถือ */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-200 grid grid-cols-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'scan'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/70'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>สแกนบาร์โค้ดมือถือ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('display')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'display'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/70'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>แสดงบาร์โค้ดมือถือ</span>
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {activeTab === 'scan' ? (
            /* โหมด 1: สแกนบาร์โค้ดผ่านกล้องมือถือ */
            <div className="space-y-3.5">
              <div className="relative w-full h-52 sm:h-56 rounded-2xl bg-slate-950 overflow-hidden border-2 border-indigo-500/40 flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    isCameraActive ? 'block' : 'hidden'
                  }`}
                />

                {/* กรอบเล็งบาร์โค้ด (Laser Viewfinder) */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                    <div className="w-full max-w-[260px] h-28 rounded-2xl border-2 border-emerald-400/90 relative shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]">
                      <div className="absolute inset-x-2 top-1/2 h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                    </div>
                    <span className="mt-2 px-2.5 py-0.5 rounded-full bg-slate-900/80 text-white text-[11px] font-semibold">
                      นำบาร์โค้ดมาวางในกรอบสีเขียวเพื่อสแกนอัตโนมัติ
                    </span>
                  </div>
                )}

                {!isCameraActive && (
                  <div className="p-5 text-center space-y-2 text-slate-300">
                    <ScanLine className="w-10 h-10 text-indigo-400 mx-auto" />
                    <p className="text-xs font-medium leading-relaxed">
                      {cameraError || 'กำลังเตรียมกล้องมือถือสำหรับสแกนบาร์โค้ด...'}
                    </p>
                  </div>
                )}

                {/* ปุ่มสลับกล้องหน้า/หลัง */}
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((prev) =>
                      prev === 'environment' ? 'user' : 'environment'
                    )
                  }
                  className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 border border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>สลับกล้อง</span>
                </button>
              </div>

              {/* ปุ่มถ่ายภาพบาร์โค้ดจากกล้องมือถือโดยตรง หรืออัปโหลดรูปบาร์โค้ด */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>ถ่ายรูป/เลือกรูปบาร์โค้ด</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateRandomBarcode}
                  className="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>สุ่มสร้างบาร์โค้ด 13 หลัก</span>
                </button>
              </div>
            </div>
          ) : (
            /* โหมด 2: แสดงบาร์โค้ดผ่านหน้าจอมือถือ (Scannable 1D Barcode Card) */
            <div className="space-y-3">
              <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-900 shadow-sm text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>บาร์โค้ดสำหรับแสดงผ่านหน้าจอมือถือ</span>
                </div>

                {productName && (
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                    {productName} {unitLabel ? `(${unitLabel})` : ''}
                  </div>
                )}

                {/* รูปบาร์โค้ด 1D มาตรฐาน Code-128B คมชัดสูง สแกนผ่านจอมือถือได้จริง */}
                <div className="py-3 px-2 bg-white rounded-xl flex items-center justify-center overflow-x-auto">
                  {encodedBits ? (
                    <svg
                      viewBox={`0 0 ${encodedBits.length * 2 + 24} 90`}
                      className="w-full max-w-[320px] h-24"
                       preserveAspectRatio="xMidYMid meet"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={encodedBits.length * 2 + 24}
                        height="90"
                        fill="#FFFFFF"
                      />
                      {encodedBits.split('').map((bit, idx) =>
                        bit === '1' ? (
                          <rect
                            key={idx}
                            x={12 + idx * 2}
                            y="6"
                            width="2"
                            height="78"
                            fill="#000000"
                          />
                        ) : null
                      )}
                    </svg>
                  ) : (
                    <div className="text-xs text-slate-400 py-8">
                      กรุณาระบุเลขบาร์โค้ดด้านล่าง
                    </div>
                  )}
                </div>

                <div className="font-mono text-base sm:text-lg font-extrabold tracking-widest text-slate-900">
                  {barcodeText.trim() || '8850000000000'}
                </div>
                <p className="text-[11px] text-slate-500">
                  หันหน้าจอมือถือนี้เข้าหาเครื่องยิงบาร์โค้ด หรือกล้อง POS เพื่อสแกนได้ทันที
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyBarcode}
                  className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'คัดลอกเลขแล้ว!' : 'คัดลอกเลขบาร์โค้ด'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBarcodePng}
                  className="py-2 px-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-700 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>บันทึกรูปลงมือถือ</span>
                </button>
              </div>
            </div>
          )}

          {/* ช่องตรวจสอบ / แก้ไขรหัสบาร์โค้ด และปุ่มตกลง */}
          <form onSubmit={handleConfirmUseBarcode} className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                เลขบาร์โค้ดที่สแกนได้ / ต้องการใช้งาน
              </label>
              <input
                type="text"
                data-allow-scanner="false"
                value={barcodeText}
                onChange={(e) => setBarcodeText(e.target.value)}
                placeholder="สแกนหรือพิมพ์เลขบาร์โค้ด เช่น 8851959132012"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600"
              >
                ปิดหน้าต่าง
              </button>
              {onSelectBarcode && (
                <button
                  type="submit"
                  disabled={!barcodeText.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>ใช้เลขบาร์โค้ดนี้</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

