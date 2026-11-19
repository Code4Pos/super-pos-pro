import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, RotateCcw, Trash2, Lock } from 'lucide-react';
import SettingsCard, { FieldLabel, inputClass } from './SettingsCard';
import { usePOS } from '../../context/POSContext';
import {
  ALL_TABS,
  DEFAULT_ROLES,
  PERMISSION_LABELS,
  buildEffectiveRoles,
  normalizeRoleConfig,
} from '../../utils/rbac';
import { SIDEBAR_MENU_GROUPS } from '../layout/Sidebar';

// จัดกลุ่มเมนูตาม Sidebar เพื่อให้ติ๊กง่าย (เมนูที่ไม่อยู่ใน Sidebar ไปอยู่กลุ่ม "อื่นๆ")
function buildTabGroups() {
  const groups = [{ id: 'group-pos', label: 'หน้าร้าน', tabs: [{ id: 'pos', label: 'ขายหน้าร้าน (POS)' }] }];
  const covered = new Set(['pos']);
  SIDEBAR_MENU_GROUPS.forEach((group) => {
    const items = group.isDropdown ? group.children : [group];
    const tabs = items.filter((t) => ALL_TABS.includes(t.id)).map((t) => ({ id: t.id, label: t.label }));
    tabs.forEach((t) => covered.add(t.id));
    if (tabs.length > 0) groups.push({ id: group.id, label: group.isDropdown ? group.label : 'เมนูหลัก', tabs });
  });
  const rest = ALL_TABS.filter((t) => !covered.has(t)).map((t) => ({ id: t, label: t }));
  if (rest.length > 0) groups.push({ id: 'group-other', label: 'อื่นๆ', tabs: rest });
  return groups;
}

const TAB_GROUPS = buildTabGroups();

function makeCustomRoleId() {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * แก้สิทธิ์ตามบทบาท: ติ๊กเมนูที่เข้าได้และสิทธิ์การทำงาน ปรับบทบาทเริ่มต้นหรือสร้างบทบาทใหม่
 * บันทึกเป็นค่าตั้งร้าน rolePermissions (ซิงค์ทุกเครื่อง) — ผู้ดูแลระบบแก้ไม่ได้ (ทำได้ทุกอย่างเสมอ)
 */
export default function RolePermissionsEditor() {
  const { printerSettings, saveRoleConfig, users, showToast } = usePOS();
  const savedConfig = useMemo(
    () => normalizeRoleConfig(printerSettings.rolePermissions),
    [printerSettings.rolePermissions]
  );
  const [draft, setDraft] = useState(savedConfig);
  const [selectedId, setSelectedId] = useState('cashier');
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => setDraft(savedConfig), [savedConfig]);

  // ระหว่างพิมพ์ชื่อบทบาทใหม่ ชื่ออาจว่างชั่วคราว (แสดงเป็น "ไม่มีชื่อ" แทน ไม่ให้บทบาทหายจากรายการ)
  const roles = useMemo(() => {
    const displayDraft = Object.fromEntries(
      Object.entries(draft).map(([id, def]) => [
        id,
        def.custom && !String(def.label || '').trim() ? { ...def, label: '(ไม่มีชื่อ)' } : def,
      ])
    );
    return buildEffectiveRoles(displayDraft);
  }, [draft]);
  const selected = roles[selectedId] ? selectedId : 'cashier';
  const role = roles[selected];
  const isAdmin = selected === 'admin';
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedConfig);
  const userCountByRole = useMemo(() => {
    const counts = {};
    users.forEach((u) => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return counts;
  }, [users]);

  const hasTab = (tab) => role.tabs === '*' || role.tabs.includes(tab);
  const hasPerm = (perm) => role.permissions === '*' || role.permissions.includes(perm);

  // แก้บทบาทที่เลือก (ครั้งแรกที่แก้บทบาทเริ่มต้น = คัดลอกค่าปัจจุบันมาเป็นค่าที่ร้านปรับเอง)
  const updateRole = (changes) => {
    if (isAdmin) return;
    setDraft((prev) => {
      const current = prev[selected] || {
        tabs: [...role.tabs],
        permissions: [...role.permissions],
        ...(role.custom ? { custom: true, label: role.label, description: role.description } : {}),
      };
      return { ...prev, [selected]: { ...current, ...changes } };
    });
  };

  const toggleList = (list, value, checked) =>
    checked ? [...new Set([...list, value])] : list.filter((v) => v !== value);

  const toggleTab = (tab, checked) => updateRole({ tabs: toggleList(role.tabs, tab, checked) });
  const togglePerm = (perm, checked) => updateRole({ permissions: toggleList(role.permissions, perm, checked) });

  const setGroupTabs = (group, checked) => {
    let tabs = [...role.tabs];
    group.tabs.forEach((t) => {
      tabs = toggleList(tabs, t.id, checked);
    });
    updateRole({ tabs });
  };

  const handleAddRole = () => {
    const label = newRoleName.trim();
    if (!label) {
      showToast('กรุณาตั้งชื่อบทบาทใหม่', 'error');
      return;
    }
    if (Object.values(roles).some((r) => r.label === label)) {
      showToast('มีบทบาทชื่อนี้แล้ว', 'error');
      return;
    }
    // เริ่มจากสิทธิ์ของบทบาทที่เลือกอยู่ (ถ้าเลือกผู้ดูแลระบบ เริ่มจากว่าง)
    const id = makeCustomRoleId();
    setDraft((prev) => ({
      ...prev,
      [id]: {
        custom: true,
        label,
        description: '',
        tabs: isAdmin ? ['pos'] : [...role.tabs],
        permissions: isAdmin ? [] : [...role.permissions],
      },
    }));
    setSelectedId(id);
    setNewRoleName('');
  };

  const handleReset = () => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[selected];
      return next;
    });
  };

  const handleDelete = () => {
    if (userCountByRole[selected]) {
      showToast('ยังมีผู้ใช้งานในบทบาทนี้ ให้ย้ายผู้ใช้ไปบทบาทอื่นก่อน', 'error');
      return;
    }
    setDraft((prev) => {
      const next = { ...prev };
      delete next[selected];
      return next;
    });
    setSelectedId('cashier');
  };

  const handleSave = () => {
    if (Object.values(draft).some((def) => def.custom && !String(def.label || '').trim())) {
      showToast('กรุณาตั้งชื่อบทบาทให้ครบ', 'error');
      return;
    }
    // บทบาทที่ร้านสร้างเองแต่มีผู้ใช้อยู่ ห้ามหายไป
    const effective = buildEffectiveRoles(draft);
    const orphan = users.find((u) => !effective[u.role]);
    if (orphan) {
      showToast(`ผู้ใช้ "${orphan.name}" ใช้บทบาทที่ถูกลบ กรุณาย้ายบทบาทก่อน`, 'error');
      return;
    }
    saveRoleConfig(draft);
    showToast('บันทึกสิทธิ์ตามบทบาทเรียบร้อย', 'success');
  };

  return (
    <SettingsCard
      icon={ShieldCheck}
      title="บทบาท & สิทธิ์"
      description="เลือกบทบาทแล้วติ๊กเมนูที่เข้าได้และสิทธิ์การทำงาน ใช้ร่วมกันทุกเครื่อง"
      onSave={handleSave}
      canSave={isDirty}
      footer={
        isDirty ? (
          <button
            type="button"
            onClick={() => setDraft(savedConfig)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-700"
          >
            ยกเลิกการแก้ไข
          </button>
        ) : null
      }
    >
      {/* เลือกบทบาท */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(roles).map(([id, r]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedId(id)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
              id === selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {id === 'admin' && <Lock className="w-3 h-3" />}
            {r.label}
            {(r.customized || r.custom) && (
              <span className={`w-1.5 h-1.5 rounded-full ${id === selected ? 'bg-white' : 'bg-amber-500'}`} title="ร้านปรับเอง" />
            )}
            {userCountByRole[id] > 0 && (
              <span className={`text-[10px] ${id === selected ? 'text-indigo-100' : 'text-slate-400'}`}>
                ({userCountByRole[id]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* เพิ่มบทบาทใหม่ */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          data-allow-scanner="false"
          value={newRoleName}
          maxLength={40}
          onChange={(e) => setNewRoleName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
          placeholder="ชื่อบทบาทใหม่ เช่น พนักงานส่งของ"
          className={`${inputClass} max-w-xs`}
        />
        <button
          type="button"
          onClick={handleAddRole}
          className="px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 shrink-0"
          title="สร้างบทบาทใหม่ โดยคัดลอกสิทธิ์จากบทบาทที่เลือกอยู่"
        >
          <Plus className="w-3.5 h-3.5" /> เพิ่มบทบาท
        </button>
      </div>

      {isAdmin ? (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          ผู้ดูแลระบบทำได้ทุกอย่างเสมอ แก้ไขสิทธิ์ไม่ได้ (กันไม่ให้ล็อกตัวเองออกจากระบบ)
        </div>
      ) : (
        <>
          {/* ชื่อ/คำอธิบาย (เฉพาะบทบาทที่ร้านสร้างเอง) และปุ่มคืนค่า/ลบ */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            {role.custom ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                <div>
                  <FieldLabel>ชื่อบทบาท</FieldLabel>
                  <input
                    type="text"
                    data-allow-scanner="false"
                    maxLength={40}
                    value={draft[selected]?.label || ''}
                    onChange={(e) => updateRole({ label: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>คำอธิบาย</FieldLabel>
                  <input
                    type="text"
                    data-allow-scanner="false"
                    maxLength={120}
                    value={draft[selected]?.description || ''}
                    onChange={(e) => updateRole({ description: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <p className="flex-1 text-xs text-slate-500">{DEFAULT_ROLES[selected]?.description}</p>
            )}
            {role.custom ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบบทบาท
              </button>
            ) : (
              role.customized && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> คืนค่าเริ่มต้น
                </button>
              )
            )}
          </div>

          {/* เมนูที่เข้าได้ */}
          <div>
            <div className="text-xs font-extrabold text-slate-800 mb-1.5">เมนูที่เข้าได้</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TAB_GROUPS.map((group) => {
                const allOn = group.tabs.every((t) => hasTab(t.id));
                return (
                  <div key={group.id} className="rounded-xl border border-slate-200 p-2.5">
                    <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700 mb-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allOn}
                        onChange={(e) => setGroupTabs(group, e.target.checked)}
                        className="accent-indigo-600"
                      />
                      {group.label}
                    </label>
                    <div className="pl-5 space-y-0.5">
                      {group.tabs.map((t) => (
                        <label key={t.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasTab(t.id)}
                            onChange={(e) => toggleTab(t.id, e.target.checked)}
                            className="accent-indigo-600"
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* สิทธิ์การทำงาน */}
          <div>
            <div className="text-xs font-extrabold text-slate-800 mb-1.5">สิทธิ์การทำงาน</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Object.entries(PERMISSION_LABELS).map(([perm, label]) => (
                <label
                  key={perm}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white text-xs text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={hasPerm(perm)}
                    onChange={(e) => togglePerm(perm, e.target.checked)}
                    className="accent-indigo-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
