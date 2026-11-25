import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Building2, Plus, LogOut, ShieldCheck, WifiOff, Crown, RefreshCw, MapPin, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { branchService, MEMBER_ROLE_LABELS } from '../../services/branchService';
import { BranchContext } from '../../context/BranchContext';
import { formatBranchLabel } from '../../utils/branches';
import { signOutShop } from '../auth/ShopAuthGate';
import BranchFormModal from './BranchFormModal';

/**
 * ด่านเลือกสาขา (beta 0.5.0): ล็อกอิน → เลือกสาขา → เลือกโหมด
 * - ร้านยังไม่มี Owner = ให้บัญชีที่ล็อกอินกดยืนยันเป็นเจ้าของร้าน
 * - มีสาขาเดียว = เข้าเลย / เครื่องจำสาขาล่าสุดไว้
 * - ยังไม่ได้รัน Migration beta 0.5.0 หรือเปิดครั้งแรกตอนออฟไลน์ = ทำงานแบบเดิม (ไม่มีสาขา)
 */
export default function BranchGate({ children }) {
  const [state, setState] = useState({ phase: 'loading' });
  const [userId, setUserId] = useState('');
  const [current, setCurrent] = useState(() => branchService.getCurrentBranch());
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    let uid = '';
    let email = '';
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        uid = data?.session?.user?.id || '';
        email = data?.session?.user?.email || '';
      } catch {
        // ignore
      }
    }
    setUserId(uid);
    try {
      const res = await branchService.loadAccess(uid);
      setState({ phase: res.status, access: res.access, offline: Boolean(res.offline), sessionEmail: email });
    } catch (err) {
      setState({ phase: 'error', error: err?.message || 'โหลดข้อมูลสาขาไม่สำเร็จ', sessionEmail: email });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const access = state.access;
  const activeBranches = useMemo(() => (access?.branches || []).filter((b) => b.is_active), [access]);
  const validCurrent = useMemo(
    () => (current ? activeBranches.find((b) => b.code === current.code) || null : null),
    [current, activeBranches]
  );

  // สาขาเดียว = เลือกให้เลย / ข้อมูลสาขาที่จำไว้เปลี่ยน (ชื่อ ที่อยู่ บทบาท) = อัปเดตในเครื่อง
  useEffect(() => {
    if (state.phase !== 'ok' || !access || access.disabled) return;
    if (validCurrent) {
      if (
        validCurrent.name !== current.name ||
        validCurrent.role !== current.role ||
        validCurrent.address !== current.address ||
        validCurrent.phone !== current.phone
      ) {
        setCurrent(branchService.setCurrentBranch(validCurrent, userId));
      }
      return;
    }
    if (activeBranches.length === 1) {
      setCurrent(branchService.setCurrentBranch(activeBranches[0], userId));
    } else if (current && !state.offline) {
      // สาขาที่จำไว้ไม่มีสิทธิ์แล้ว
      branchService.clearCurrentBranch();
      setCurrent(null);
    }
  }, [state.phase, state.offline, access, validCurrent, activeBranches, current, userId]);

  const selectBranch = (branch) => {
    setCurrent(branchService.setCurrentBranch(branch, userId));
    setPicking(false);
  };

  const contextValue = useMemo(
    () => ({
      enabled: state.phase === 'ok' && Boolean(validCurrent),
      offline: Boolean(state.offline),
      demo: branchService.isDemo(),
      access,
      branch: validCurrent,
      branches: access?.branches || [],
      role: validCurrent?.role || null,
      isOwner: Boolean(access?.is_owner),
      canManageAccounts: Boolean(access?.is_owner || validCurrent?.role === 'admin'),
      openPicker: () => setPicking(true),
      refresh: load,
    }),
    [state.phase, state.offline, access, validCurrent, load]
  );

  if (state.phase === 'loading') {
    return (
      <FullScreen>
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูลสาขา...
        </div>
      </FullScreen>
    );
  }

  // ยังไม่ได้รัน Migration / ออฟไลน์ครั้งแรก: ทำงานแบบเดิม
  if (state.phase === 'unsupported' || state.phase === 'offline') {
    return children;
  }

  if (state.phase === 'error') {
    return (
      <MessageCard
        icon={<WifiOff className="w-8 h-8 mx-auto text-rose-500" />}
        title="โหลดข้อมูลสาขาไม่สำเร็จ"
        detail={state.error}
        actions={
          <>
            <button onClick={load} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> ลองใหม่
            </button>
            <LogoutButton />
          </>
        }
      />
    );
  }

  if (access.disabled) {
    return (
      <MessageCard
        icon={<ShieldCheck className="w-8 h-8 mx-auto text-rose-500" />}
        title="บัญชีนี้ถูกปิดใช้งาน"
        detail="ติดต่อเจ้าของร้านหรือผู้ดูแลสาขาเพื่อเปิดใช้งานอีกครั้ง"
        actions={<LogoutButton />}
      />
    );
  }

  if (!access.has_profile && !access.owner_exists) {
    return <ClaimOwnerScreen email={state.sessionEmail} onClaimed={load} />;
  }

  if (activeBranches.length === 0) {
    return (
      <MessageCard
        icon={<Building2 className="w-8 h-8 mx-auto text-amber-500" />}
        title="บัญชีนี้ยังไม่มีสิทธิ์เข้าสาขาใด"
        detail={`ให้เจ้าของร้านหรือผู้ดูแลสาขาเพิ่มบัญชี ${access.email || state.sessionEmail || ''} เข้าสาขาที่ ตั้งค่า › สาขาและบัญชี`}
        actions={
          <>
            <button onClick={load} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> ตรวจสอบอีกครั้ง
            </button>
            <LogoutButton />
          </>
        }
      />
    );
  }

  if (picking || !validCurrent) {
    return (
      <BranchPicker
        access={access}
        currentCode={validCurrent?.code}
        offline={state.offline}
        onSelect={selectBranch}
        onCancel={validCurrent ? () => setPicking(false) : null}
        onReload={load}
      />
    );
  }

  return (
    <BranchContext.Provider value={contextValue}>
      {/* key: เปลี่ยนสาขา = โหลดแอปใหม่ทั้งหมด */}
      <React.Fragment key={validCurrent.code}>{children}</React.Fragment>
    </BranchContext.Provider>
  );
}

function FullScreen({ children }) {
  return <div className="min-h-[100dvh] w-screen flex items-center justify-center bg-slate-900 p-4">{children}</div>;
}

function LogoutButton({ dark = false }) {
  if (!supabase) return null;
  return (
    <button
      onClick={async () => {
        branchService.clearCurrentBranch();
        await signOutShop();
      }}
      className={`flex-1 py-2.5 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 ${dark ? 'border-slate-600 text-slate-300 hover:text-white' : 'border-slate-300 text-slate-700'}`}
    >
      <LogOut className="w-4 h-4" /> ออกจากระบบ
    </button>
  );
}

function MessageCard({ icon, title, detail, actions }) {
  return (
    <FullScreen>
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center space-y-3">
        {icon}
        <h1 className="text-base font-extrabold text-slate-900">{title}</h1>
        {detail && <p className="text-xs text-slate-600 leading-relaxed break-words">{detail}</p>}
        <div className="flex gap-2 pt-1">{actions}</div>
      </div>
    </FullScreen>
  );
}

function ClaimOwnerScreen({ email, onClaimed }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleClaim = async () => {
    setSaving(true);
    setError('');
    try {
      await branchService.claimOwner(name);
      await onClaimed();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <FullScreen>
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden">
        <div className="px-6 py-5 bg-amber-500 text-slate-950 text-center">
          <Crown className="w-8 h-8 mx-auto mb-1.5" />
          <h1 className="text-lg font-extrabold">ตั้งเจ้าของร้าน (Owner)</h1>
          <p className="text-xs font-semibold">ระบบสาขาเปิดใช้ครั้งแรก ร้านยังไม่มีเจ้าของร้าน</p>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            ตั้งบัญชี <b className="text-slate-900 break-all">{email || 'ที่ล็อกอินอยู่'}</b> เป็นเจ้าของร้าน
            จัดการได้ทุกสาขาและทุกบัญชี ทำได้ครั้งเดียว ถ้าบัญชีนี้ใช้ร่วมกันหลายเครื่อง
            แนะนำให้สร้างบัญชีส่วนตัวให้พนักงานทีหลังที่ ตั้งค่า › สาขาและบัญชี
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-600">ชื่อที่แสดง</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น คุณสมชาย"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <button
            onClick={handleClaim}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            ยืนยัน ตั้งบัญชีนี้เป็นเจ้าของร้าน
          </button>
          <div className="flex">
            <LogoutButton />
          </div>
        </div>
      </div>
    </FullScreen>
  );
}

function BranchPicker({ access, currentCode, offline, onSelect, onCancel, onReload }) {
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const branches = access.branches || [];

  return (
    <div className="min-h-[100dvh] w-screen bg-slate-900 p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 text-white">
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-400" /> เลือกสาขา
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {access.display_name || access.email}
              {access.is_owner && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold">เจ้าของร้าน</span>}
            </p>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> กลับ
            </button>
          )}
        </div>

        {offline && (
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-1.5">
            <WifiOff className="w-4 h-4 shrink-0" /> ออฟไลน์: แสดงสาขาจากข้อมูลล่าสุดในเครื่อง
          </div>
        )}
        {notice && <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold">{notice}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {branches.map((b) => {
            const disabled = !b.is_active;
            const isCurrent = b.code === currentCode;
            return (
              <button
                key={b.code}
                disabled={disabled}
                onClick={() => onSelect(b)}
                className={`text-left p-4 rounded-2xl border-2 transition-colors ${
                  disabled
                    ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                    : isCurrent
                    ? 'bg-white border-indigo-500 text-slate-900'
                    : 'bg-white border-transparent hover:border-indigo-400 text-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold truncate">{b.name || formatBranchLabel(b.code)}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {b.code} · {formatBranchLabel(b.code)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      b.role === 'owner' ? 'bg-amber-100 text-amber-800' : b.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {MEMBER_ROLE_LABELS[b.role] || b.role}
                  </span>
                </div>
                {b.address && (
                  <p className="mt-2 text-[11px] text-slate-500 flex items-start gap-1 line-clamp-2">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" /> {b.address}
                  </p>
                )}
                <div className="mt-2 flex gap-1.5">
                  {isCurrent && <span className="text-[10px] font-bold text-indigo-600">● สาขาที่ใช้อยู่</span>}
                  {disabled && <span className="text-[10px] font-bold">ปิดใช้งาน</span>}
                </div>
              </button>
            );
          })}
          {access.is_owner && !offline && (
            <button
              onClick={() => setCreating(true)}
              className="p-4 rounded-2xl border-2 border-dashed border-slate-600 hover:border-indigo-400 text-slate-300 hover:text-white flex flex-col items-center justify-center gap-1 min-h-[110px]"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-bold">สร้างสาขาใหม่</span>
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <div className="w-44 flex">
            <LogoutButton dark />
          </div>
        </div>
      </div>

      {creating && (
        <BranchFormModal
          existingBranches={branches}
          onClose={() => setCreating(false)}
          onSaved={async (_saved, warning) => {
            setCreating(false);
            setNotice(warning || '');
            await onReload();
          }}
        />
      )}
    </div>
  );
}
