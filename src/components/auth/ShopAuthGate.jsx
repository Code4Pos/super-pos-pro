import React, { useEffect, useState } from 'react';
import { Store, Loader2, WifiOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * ล็อกอินบัญชีร้าน (Supabase Auth) ก่อนเข้าแอป เมื่อใช้ฐานข้อมูลจริง (beta 0.3.6)
 * - ล็อกอินครั้งเดียวต่อเครื่อง Supabase เก็บ session ไว้ในเครื่องและต่ออายุเอง (ใช้ตอนออฟไลน์ได้)
 * - ฐานข้อมูลเปิด RLS แบบ "ต้องล็อกอิน" (supabase/lockdown-rls.sql) จึงอ่าน/เขียนข้อมูลได้เฉพาะเครื่องที่ล็อกอินแล้ว
 * - ล็อกอินพนักงานด้วย PIN (LoginScreen) ยังทำงานต่อจากนี้ตามเดิม
 * - โหมดสาธิต (ไม่ได้ตั้งค่า Supabase) ไม่ต้องล็อกอิน
 */
export default function ShopAuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = กำลังตรวจสอบ

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => active && setSession(data?.session || null))
      .catch(() => active && setSession(null));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });
    return () => {
      active = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  if (!supabase) return children;
  if (session === undefined) {
    return (
      <div className="h-[100dvh] w-screen flex items-center justify-center bg-slate-900 text-slate-300 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบบัญชีร้าน...
      </div>
    );
  }
  if (!session) return <ShopLoginForm />;
  // key: ล็อกอินบัญชีใหม่ = โหลดข้อมูลใหม่ทั้งหมด
  return <React.Fragment key={session.user?.id}>{children}</React.Fragment>;
}

function ShopLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage(
          /invalid login credentials/i.test(error.message)
            ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
            : /fetch|network/i.test(error.message)
            ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'
            : error.message
        );
      }
    } catch (err) {
      setMessage(err?.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-screen flex items-center justify-center bg-slate-900 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-3xl overflow-hidden">
        <div className="px-6 py-5 bg-indigo-600 text-white text-center">
          <Store className="w-8 h-8 mx-auto mb-1.5" />
          <h1 className="text-lg font-extrabold">SiamPOS Pro</h1>
          <p className="text-xs text-indigo-100">เข้าสู่ระบบบัญชีร้าน (ครั้งแรกของเครื่องนี้)</p>
        </div>
        <div className="p-5 space-y-3">
          {offline && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 shrink-0" /> ไม่มีอินเทอร์เน็ต ต้องเชื่อมต่อเพื่อล็อกอินครั้งแรก
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-600">อีเมลบัญชีร้าน</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-600">รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          {message && <div className="text-xs font-bold text-rose-600">{message}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            เข้าสู่ระบบ
          </button>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            บัญชีร้านสร้างโดยเจ้าของร้านที่ Supabase &gt; Authentication &gt; Users ล็อกอินครั้งเดียวต่อเครื่อง
            จากนั้นพนักงานเข้าใช้งานด้วย PIN ตามปกติ
          </p>
        </div>
      </form>
    </div>
  );
}

/**
 * ออกจากระบบบัญชีร้านในเครื่องนี้ (กลับไปหน้าล็อกอินบัญชีร้าน)
 */
export async function signOutShop() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * อีเมลบัญชีร้านที่ล็อกอินอยู่ในเครื่องนี้ (ไม่มี = '')
 */
export async function getShopAccountEmail() {
  if (!supabase) return '';
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.email || '';
  } catch {
    return '';
  }
}
