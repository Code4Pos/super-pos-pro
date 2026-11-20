import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, Loader2, RotateCcw, Eraser, Trash2, Factory, FileJson } from 'lucide-react';
import SettingsCard from './SettingsCard';
import DangerActionModal from './DangerActionModal';
import { usePOS } from '../../context/POSContext';
import { SHOP_BACKUP_TYPE } from '../../services/posService';
import { downloadJsonFile, readFileAsText, shopBackupFileName } from '../../utils/download';
import { formatDateTime, formatNumber } from '../../utils/formatters';

const RESET_LEVELS = [
  {
    level: 1,
    icon: Eraser,
    title: 'ล้างข้อมูลการขาย',
    summary: 'เริ่มรอบบัญชีใหม่',
    removes: 'บิลขาย ใบกำกับ/ลดหนี้/เพิ่มหนี้ ใบรับชำระ ใบวางบิล ประวัติสต็อก ใบนำเข้า ใบโอน ใบตรวจนับ ใบสั่งขาย',
    keeps: 'สินค้าและยอดสต็อกปัจจุบัน ลูกค้า (ยอดซื้อสะสม/แต้มเป็น 0) ผู้ผลิต ค่าตั้ง ผู้ใช้ทุกคน',
    actionLabel: 'ล้างข้อมูลการขาย',
  },
  {
    level: 2,
    icon: Trash2,
    title: 'รีเซ็ตร้าน',
    summary: 'ล้างข้อมูลทั้งหมด เริ่มกรอกใหม่',
    removes: 'ทุกอย่างในข้อ 1 + สินค้า หมวดหมู่ หน่วย ลูกค้า ผู้ผลิต คลัง ล็อต กฎราคา และผู้ใช้ที่ไม่ใช่ผู้ดูแลระบบ',
    keeps: 'ค่าตั้งร้านทั้งหมด และบัญชีผู้ดูแลระบบ',
    actionLabel: 'รีเซ็ตร้าน',
  },
  {
    level: 3,
    icon: Factory,
    title: 'คืนค่าโรงงาน',
    summary: 'เหมือนติดตั้งใหม่ แล้วสร้างร้านใหม่',
    removes: 'ทุกอย่าง รวมค่าตั้งร้าน ผู้ใช้ และสิทธิ์ทั้งหมด',
    keeps: 'การเชื่อมต่อ Server บัญชีล็อกอินร้าน และรหัสเครื่อง',
    actionLabel: 'คืนค่าโรงงาน',
  },
];

/**
 * รีเซ็ตร้าน 3 ระดับ + สำรอง/กู้คืนข้อมูลทั้งร้าน (เฉพาะผู้ดูแลระบบ)
 */
export default function ShopResetSettings() {
  const { dbMode, isOffline, pendingSyncCount, exportShopBackup, restoreShopBackup, resetShop, showToast } = usePOS();
  const fileRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null); // ไฟล์สำรองที่อ่านแล้ว
  const [action, setAction] = useState(null); // { title, description, actionLabel, onRun }

  const isSupabase = dbMode === 'supabase';
  // ฐานข้อมูลจริง: ต้องออนไลน์และไม่มีรายการรอซิงค์ ไม่งั้นข้อมูลที่ยังไม่ขึ้นฐานข้อมูลจะหาย
  const blockedReason = isSupabase
    ? isOffline
      ? 'ออฟไลน์อยู่ ต้องเชื่อมต่ออินเทอร์เน็ตก่อน'
      : pendingSyncCount > 0
      ? `มี ${pendingSyncCount} รายการรอซิงค์ กรุณาซิงค์ให้เสร็จก่อน`
      : ''
    : '';

  const handleExport = async () => {
    setExporting(true);
    try {
      const backup = await exportShopBackup();
      const ok = downloadJsonFile(shopBackupFileName(backup.shopName), backup);
      if (!ok) throw new Error('เบราว์เซอร์นี้ดาวน์โหลดไฟล์ไม่ได้ กรุณาใช้เบราว์เซอร์บนคอมพิวเตอร์');
      setLastExport(backup);
      showToast('ดาวน์โหลดไฟล์สำรองข้อมูลทั้งร้านแล้ว', 'success');
    } catch (err) {
      showToast(`สำรองข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handlePickFile = async (file) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await readFileAsText(file));
      if (data?.type !== SHOP_BACKUP_TYPE || !data.tables) throw new Error('ไม่ใช่ไฟล์สำรองข้อมูลร้านของ SiamPOS Pro');
      if (data.mode !== (isSupabase ? 'supabase' : 'demo')) {
        throw new Error(isSupabase ? 'ไฟล์นี้สำรองจากโหมด Demo' : 'ไฟล์นี้สำรองจากฐานข้อมูลจริง');
      }
      setRestoreFile(data);
    } catch (err) {
      setRestoreFile(null);
      showToast(err.message.startsWith('Unexpected') ? 'ไฟล์ไม่ใช่ JSON' : err.message, 'error');
    }
  };

  const askRestore = () => {
    setAction({
      title: 'กู้คืนข้อมูลทั้งร้าน',
      description: `ข้อมูลทั้งหมดของร้านตอนนี้ (รวมผู้ใช้และค่าตั้ง) จะถูกลบ แล้วแทนที่ด้วยข้อมูลจากไฟล์สำรองของ "${restoreFile.shopName || '-'}" (${formatDateTime(restoreFile.exportedAt)}) ทุกเครื่องจะโหลดข้อมูลใหม่`,
      actionLabel: 'กู้คืนข้อมูลจากไฟล์',
      onRun: async () => {
        const result = await restoreShopBackup(restoreFile);
        setRestoreFile(null);
        return result;
      },
    });
  };

  const askReset = (item) => {
    setAction({
      title: item.title,
      description: (
        <div className="space-y-1.5">
          <div>
            <span className="font-bold text-rose-700">ลบ: </span>
            {item.removes}
          </div>
          <div>
            <span className="font-bold text-emerald-700">เก็บไว้: </span>
            {item.keeps}
          </div>
          {isSupabase && <div className="font-bold">มีผลกับทุกเครื่องที่ใช้ร้านนี้ และย้อนกลับไม่ได้</div>}
        </div>
      ),
      actionLabel: item.actionLabel,
      onRun: () => resetShop(item.level),
    });
  };

  const totalRows = (counts = {}) => Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);

  return (
    <div className="space-y-3.5">
      {/* สำรองข้อมูลทั้งร้าน */}
      <SettingsCard
        icon={DatabaseBackup}
        title="สำรองข้อมูลทั้งร้าน"
        description="สินค้า ลูกค้า บิล เอกสาร สต็อก ผู้ใช้ และค่าตั้งร้าน รวมเป็นไฟล์เดียว"
      >
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
          ไฟล์สำรองมีข้อมูลลูกค้าและ PIN (แบบเข้ารหัส) ของพนักงาน เก็บไว้ในที่ปลอดภัย / ในแอป Android
          บางเครื่องดาวน์โหลดไฟล์ไม่ได้ ให้สำรองจากเบราว์เซอร์บนคอมพิวเตอร์
        </div>
        <button
          type="button"
          disabled={exporting || (isSupabase && isOffline)}
          onClick={handleExport}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'กำลังรวบรวมข้อมูล...' : 'ดาวน์โหลดไฟล์สำรองข้อมูลทั้งร้าน'}
        </button>
        {lastExport && (
          <div className="text-[11px] text-slate-600">
            สำรองล่าสุด {formatDateTime(lastExport.exportedAt)} • {formatNumber(totalRows(lastExport.counts))} แถว
            {lastExport.skipped?.length > 0 && <> • ข้ามตารางที่ยังไม่มี: {lastExport.skipped.join(', ')}</>}
          </div>
        )}
      </SettingsCard>

      {/* กู้คืนข้อมูลทั้งร้าน */}
      <SettingsCard icon={Upload} title="กู้คืนข้อมูลทั้งร้าน" description="แทนที่ข้อมูลทั้งร้านด้วยข้อมูลจากไฟล์สำรอง">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => handlePickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
        >
          <FileJson className="w-4 h-4" /> เลือกไฟล์สำรอง
        </button>
        {restoreFile && (
          <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2 text-[11px] text-slate-700">
            <div>
              ร้าน <span className="font-bold">{restoreFile.shopName || '-'}</span> • สำรองเมื่อ{' '}
              {formatDateTime(restoreFile.exportedAt)} • {restoreFile.appVersion || '-'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 font-mono">
              {Object.entries(restoreFile.counts || {})
                .filter(([, n]) => n > 0)
                .map(([table, n]) => (
                  <span key={table}>
                    {table}: {formatNumber(n)}
                  </span>
                ))}
            </div>
            <button
              type="button"
              disabled={Boolean(blockedReason)}
              onClick={askRestore}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> กู้คืนข้อมูลจากไฟล์นี้
            </button>
          </div>
        )}
      </SettingsCard>

      {/* รีเซ็ตร้าน 3 ระดับ */}
      <SettingsCard icon={RotateCcw} title="รีเซ็ตร้าน" description="ลบข้อมูลถาวร ระบบจะถามให้สำรองข้อมูลก่อนทุกครั้ง">
        {blockedReason && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            ยังรีเซ็ต/กู้คืนไม่ได้: {blockedReason}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {RESET_LEVELS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.level} className="p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      ระดับ {item.level}: {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.summary}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600 leading-relaxed flex-1">
                  <div>
                    <span className="font-bold text-rose-700">ลบ: </span>
                    {item.removes}
                  </div>
                  <div className="mt-1">
                    <span className="font-bold text-emerald-700">เก็บ: </span>
                    {item.keeps}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={Boolean(blockedReason)}
                  onClick={() => askReset(item)}
                  className="h-9 rounded-xl border border-rose-300 bg-white hover:bg-rose-600 hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-rose-700 text-rose-700 text-xs font-bold"
                >
                  {item.actionLabel}...
                </button>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <DangerActionModal
        isOpen={Boolean(action)}
        title={action?.title}
        description={action?.description}
        actionLabel={action?.actionLabel}
        onRun={action?.onRun || (async () => null)}
        onClose={() => setAction(null)}
      />
    </div>
  );
}
