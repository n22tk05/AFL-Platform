import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 text-slate-900"><header className="bg-slate-900 px-6 py-4 text-white"><strong>AFL · Admin biểu mẫu</strong></header><main className="mx-auto max-w-6xl p-5 sm:p-8">{children}</main></div>;
}
