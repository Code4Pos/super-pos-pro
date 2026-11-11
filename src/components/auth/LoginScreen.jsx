import React, { useState } from 'react';
import { Lock, UserCircle2, Delete, ArrowLeft } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { ROLES } from '../../utils/rbac';

/**
 * หน้าล็อกอินพนักงาน: เลือกชื่อ แล้วใส่ PIN 4-6 หลักด้วยแป้นตัวเลข (เหมาะกับจอสัมผัส)
 */
export default function LoginScreen() {
  const { users, login, printerSettings } = usePOS();
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');

  const activeUsers = users.filter((u) => u.is_active);

  const submitPin = (value) => {
    const result = login(selectedUser.id, value);
    if (!result.ok) {
      setMessage(result.message);
      setPin('');
    }
  };

  const pressDigit = (d) => {
    setMessage('');
    setPin((prev) => (prev.length >= 6 ? prev : prev + d));
  };

  return (
    <div className="h-[100dvh] w-screen flex items-center justify-center bg-slate-900 p-4 select-none">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 bg-indigo-600 text-white text-center">
          <Lock className="w-8 h-8 mx-auto mb-1.5" />
          <h1 className="text-lg font-extrabold">{printerSettings?.shopName || 'SiamPOS Pro'}</h1>
          <p className="text-xs text-indigo-100">เข้าสู่ระบบพนักงาน</p>
        </div>

        {!selectedUser ? (
          <div className="p-5 space-y-2 max-h-[60dvh] overflow-y-auto">
            <div className="text-xs font-bold text-slate-500">เลือกชื่อผู้ใช้งาน</div>
            {activeUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelectedUser(u);
                  setPin('');
                  setMessage('');
                }}
                className="w-full p-3 rounded-2xl border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 flex items-center gap-3 text-left"
              >
                <UserCircle2 className="w-9 h-9 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-sm font-extrabold text-slate-900">{u.name}</div>
                  <div className="text-[11px] text-slate-500">{ROLES[u.role]?.label || u.role}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                เปลี่ยนผู้ใช้
              </button>
              <div className="text-right">
                <div className="text-sm font-extrabold text-slate-900">{selectedUser.name}</div>
                <div className="text-[11px] text-slate-500">{ROLES[selectedUser.role]?.label}</div>
              </div>
            </div>

            <div className="flex justify-center gap-2.5 py-1">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 ${
                    i < pin.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                  }`}
                />
              ))}
            </div>
            <div className="h-4 text-center text-xs font-bold text-rose-600">{message}</div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressDigit(d)}
                  className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-2xl font-extrabold text-slate-800"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin((prev) => prev.slice(0, -1))}
                className="h-14 rounded-2xl bg-amber-50 border border-amber-300 text-amber-800 flex items-center justify-center"
                title="ลบ"
              >
                <Delete className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-2xl font-extrabold text-slate-800"
              >
                0
              </button>
              <button
                type="button"
                disabled={pin.length < 4}
                onClick={() => submitPin(pin)}
                className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-extrabold"
              >
                เข้าสู่ระบบ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
