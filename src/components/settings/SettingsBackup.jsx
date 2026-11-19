import React, { useRef, useState } from 'react';
import { ArchiveRestore, Download, Copy, Upload, RotateCcw, FileJson } from 'lucide-react';
import SettingsCard from './SettingsCard';
import ConfirmModal from '../common/ConfirmModal';
import { usePOS } from '../../context/POSContext';
import {
  SHARED_SHOP_SETTING_KEYS,
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_DEVICE_PRINTER_SETTINGS,
} from '../../services/printerService';
import {
  SETTINGS_GROUPS,
  DEVICE_GROUP,
  backupFileName,
  buildSettingsBackup,
  getGroupDefaults,
  parseSettingsBackup,
  selectBackupChanges,
} from '../../utils/settingsBackup';
import { formatDateTime } from '../../utils/formatters';

const DEVICE_KEYS = Object.keys(DEFAULT_DEVICE_PRINTER_SETTINGS);
const KEY_OPTIONS = { sharedKeys: SHARED_SHOP_SETTING_KEYS, deviceKeys: DEVICE_KEYS };
const GROUP_LABELS = Object.fromEntries([...SETTINGS_GROUPS, DEVICE_GROUP].map((g) => [g.id, g.label]));

/**
 * สำรอง / ย้าย / คืนค่าเริ่มต้น ค่าตั้งร้าน
 * - ส่งออกเป็นไฟล์ JSON หรือคัดลอกเป็นข้อความ (แอป Android บางเครื่องดาวน์โหลดไฟล์ไม่ได้)
 * - นำเข้าจากไฟล์หรือวางข้อความ เลือกได้ทีละหมวด
 * - คืนค่าเริ่มต้นทีละหมวด
 */
export default function SettingsBackup() {
  const { printerSettings, updatePrinterSettings, showToast, appVersion } = usePOS();
  const fileRef = useRef(null);
  const [includeDevice, setIncludeDevice] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsed, setParsed] = useState(null); // ผลอ่านไฟล์สำรอง
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [confirm, setConfirm] = useState(null); // { title, message, onConfirm }

  const backupText = () =>
    JSON.stringify(
      buildSettingsBackup(printerSettings, { ...KEY_OPTIONS, includeDevice, appVersion }),
      null,
      2
    );

  const handleDownload = () => {
    try {
      const blob = new Blob([backupText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName(printerSettings.shopName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('ดาวน์โหลดไฟล์สำรองค่าตั้งแล้ว', 'success');
    } catch {
      showToast('ดาวน์โหลดไม่ได้ ให้ใช้ปุ่ม "คัดลอกเป็นข้อความ" แทน', 'warning');
    }
  };

  const handleCopy = async () => {
    const text = backupText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('คัดลอกค่าตั้งแล้ว นำไปวางในช่องนำเข้าของเครื่องปลายทางได้เลย', 'success');
    } catch {
      // คลิปบอร์ดใช้ไม่ได้ (เช่น http ในวง LAN): ใส่ข้อความในช่องให้คัดลอกเอง
      setImportText(text);
      showToast('คัดลอกอัตโนมัติไม่ได้ ข้อความอยู่ในช่องนำเข้าด้านล่าง ให้คัดลอกเอง', 'warning');
    }
  };

  const readBackup = (text) => {
    const result = parseSettingsBackup(text, KEY_OPTIONS);
    if (!result.ok) {
      setParsed(null);
      showToast(result.error, 'error');
      return;
    }
    setParsed(result);
    // ค่าตั้งเฉพาะเครื่องไม่เลือกให้อัตโนมัติ (เครื่องปลายทางอาจใช้เครื่องพิมพ์ต่างกัน)
    setSelectedGroups(result.groups.filter((g) => g !== DEVICE_GROUP.id));
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
      readBackup(reader.result);
    };
    reader.onerror = () => showToast('อ่านไฟล์ไม่สำเร็จ', 'error');
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyImport = () => {
    const { shopChanges, deviceChanges } = selectBackupChanges(parsed.backup, selectedGroups);
    const changes = { ...shopChanges, ...deviceChanges };
    if (Object.keys(changes).length === 0) {
      showToast('ยังไม่ได้เลือกหมวดที่จะนำเข้า', 'error');
      return;
    }
    setConfirm({
      title: 'นำเข้าค่าตั้ง?',
      message: `ค่าตั้งปัจจุบันในหมวด ${selectedGroups.map((g) => GROUP_LABELS[g]).join(', ')} จะถูกแทนที่ด้วยค่าจากไฟล์ (ค่าตั้งร้านจะซิงค์ไปทุกเครื่อง)`,
      onConfirm: () => {
        updatePrinterSettings(changes);
        setParsed(null);
        setImportText('');
        showToast('นำเข้าค่าตั้งเรียบร้อย', 'success');
      },
    });
  };

  const askReset = (group) => {
    setConfirm({
      title: `คืนค่าเริ่มต้น: ${group.label}?`,
      message: 'ค่าตั้งในหมวดนี้จะกลับเป็นค่าเริ่มต้นของระบบ และซิงค์ไปทุกเครื่อง แนะนำให้ส่งออกไฟล์สำรองไว้ก่อน',
      onConfirm: () => {
        updatePrinterSettings(getGroupDefaults(group.id, DEFAULT_SHOP_SETTINGS));
        showToast(`คืนค่าเริ่มต้นหมวด ${group.label} แล้ว`, 'success');
      },
    });
  };

  const askResetDevice = () => {
    setConfirm({
      title: 'คืนค่าเริ่มต้น: ค่าตั้งเครื่องนี้?',
      message: 'ค่าตั้งเครื่องพิมพ์และลิ้นชักของเครื่องนี้จะกลับเป็นค่าเริ่มต้น (ไม่กระทบเครื่องอื่น)',
      onConfirm: () => {
        updatePrinterSettings({ ...DEFAULT_DEVICE_PRINTER_SETTINGS });
        showToast('คืนค่าเริ่มต้นค่าตั้งเครื่องนี้แล้ว', 'success');
      },
    });
  };

  return (
    <div className="space-y-3.5">
      {/* ส่งออก */}
      <SettingsCard
        icon={ArchiveRestore}
        title="สำรอง & ย้ายค่าตั้ง"
        description="ส่งออกค่าตั้งเก็บไว้ หรือนำไปตั้งเครื่องใหม่/สาขาใหม่ได้ทันที (ไม่รวมข้อมูลสินค้า ลูกค้า และบิล)"
      >
        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={includeDevice}
            onChange={(e) => setIncludeDevice(e.target.checked)}
            className="mt-0.5 accent-indigo-600"
          />
          <span>
            <span className="font-bold">รวมค่าตั้งเครื่องนี้ด้วย</span>
            <span className="block text-[11px] text-slate-500">ขนาดกระดาษ การเชื่อมต่อเครื่องพิมพ์ ลิ้นชัก (ไม่รวมรหัสเครื่อง)</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> ดาวน์โหลดไฟล์สำรอง
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <Copy className="w-4 h-4" /> คัดลอกเป็นข้อความ
          </button>
        </div>
      </SettingsCard>

      {/* นำเข้า */}
      <SettingsCard icon={Upload} title="นำเข้าค่าตั้ง" description="เลือกไฟล์สำรอง หรือวางข้อความที่คัดลอกมา แล้วเลือกหมวดที่จะนำเข้า">
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <FileJson className="w-4 h-4" /> เลือกไฟล์สำรอง
          </button>
        </div>
        <textarea
          rows={4}
          data-allow-scanner="false"
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setParsed(null);
          }}
          placeholder="หรือวางข้อความค่าตั้งที่คัดลอกมาที่นี่..."
          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {!parsed && importText.trim() && (
          <button
            type="button"
            onClick={() => readBackup(importText)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold"
          >
            ตรวจข้อความ
          </button>
        )}

        {parsed && (
          <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
            <div className="text-[11px] text-slate-600">
              ไฟล์จาก {parsed.backup.appVersion || 'ไม่ทราบเวอร์ชัน'}
              {parsed.backup.exportedAt && <> • ส่งออกเมื่อ {formatDateTime(parsed.backup.exportedAt)}</>}
              {parsed.backup.shop?.shopName && <> • ร้าน {parsed.backup.shop.shopName}</>}
            </div>
            <div className="text-xs font-extrabold text-slate-800">เลือกหมวดที่จะนำเข้า</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {parsed.groups.map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(id)}
                    onChange={(e) =>
                      setSelectedGroups((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((g) => g !== id)
                      )
                    }
                    className="accent-indigo-600"
                  />
                  {GROUP_LABELS[id]}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selectedGroups.length === 0}
                onClick={applyImport}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> นำเข้าค่าตั้งที่เลือก
              </button>
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setImportText('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* คืนค่าเริ่มต้นทีละหมวด */}
      <SettingsCard icon={RotateCcw} title="คืนค่าเริ่มต้น" description="ล้างค่าตั้งกลับเป็นค่าเริ่มต้นของระบบทีละหมวด">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SETTINGS_GROUPS.map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
            >
              <span className="text-xs font-bold text-slate-700">{group.label}</span>
              <button
                type="button"
                onClick={() => askReset(group)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-[11px] font-bold text-slate-600 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> คืนค่า
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-xs font-bold text-slate-700">{DEVICE_GROUP.label}</span>
            <button
              type="button"
              onClick={askResetDevice}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-[11px] font-bold text-slate-600 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> คืนค่า
            </button>
          </div>
        </div>
      </SettingsCard>

      <ConfirmModal
        isOpen={Boolean(confirm)}
        variant="warning"
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmText="ยืนยัน"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.onConfirm;
          setConfirm(null);
          action?.();
        }}
      />
    </div>
  );
}
