import { createContext, useContext } from 'react';

/**
 * สาขาที่เลือกอยู่และสิทธิ์ของบัญชี (beta 0.5.0) — ให้ค่าโดย BranchGate ที่ครอบแอปใน main.jsx / main-admin.jsx
 * enabled = false: ยังไม่ได้รัน Migration beta 0.5.0 หรือเปิดครั้งแรกตอนออฟไลน์ (ทำงานแบบเดิม ไม่มีสาขา)
 */
export const BranchContext = createContext({
  enabled: false,
  offline: false,
  access: null,
  branch: null,
  branches: [],
  role: null,
  isOwner: false,
  canManageAccounts: false,
  openPicker: () => {},
  refresh: async () => {},
});

export function useBranch() {
  return useContext(BranchContext);
}
