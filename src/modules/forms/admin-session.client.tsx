'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const AdminSessionContext = createContext({ adminKey: '', setAdminKey: (_value: string) => {} });

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKeyState] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('afl_admin_key');
      if (stored) {
        setAdminKeyState(stored);
      }
    }
  }, []);

  const setAdminKey = (value: string) => {
    setAdminKeyState(value);
    if (typeof window !== 'undefined') {
      if (value) {
        sessionStorage.setItem('afl_admin_key', value);
      } else {
        sessionStorage.removeItem('afl_admin_key');
      }
    }
  };

  return <AdminSessionContext.Provider value={{ adminKey, setAdminKey }}>{children}</AdminSessionContext.Provider>;
}

export const useAdminSession = () => useContext(AdminSessionContext);

export function AdminKeyInput() {
  const { adminKey, setAdminKey } = useAdminSession();
  return <label className="block text-sm font-semibold p-3">Khóa quản trị (chỉ giữ trong phiên hiện tại)
    <input className="block w-full border rounded p-2 text-slate-900" type="password" autoComplete="off"
      value={adminKey} onChange={event => setAdminKey(event.target.value)} />
  </label>;
}
