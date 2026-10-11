'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

type ToastKind = 'pending' | 'success' | 'error';
type ToastState = { id: number; kind: ToastKind; title: string; detail?: string };
type ToastActions = {
  showPending: (title: string, detail?: string) => number;
  updatePending: (id: number | null, detail: string) => void;
  showSuccess: (id: number | null, title: string, detail?: string) => void;
  showError: (id: number | null, title: string, detail?: string) => void;
  dismiss: (id?: number | null) => void;
};

const ToastContext = createContext<ToastActions | null>(null);

export function OperationToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const activeId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const showPending = useCallback((title: string, detail?: string) => {
    clearTimer();
    const id = ++nextId.current;
    activeId.current = id;
    setToast({ id, kind: 'pending', title, detail });
    return id;
  }, [clearTimer]);

  const updatePending = useCallback((id: number | null, detail: string) => {
    if (id === null) return;
    setToast(current => current?.id === id && current.kind === 'pending' ? { ...current, detail } : current);
  }, []);

  const finish = useCallback((id: number | null, kind: 'success' | 'error', title: string, detail?: string) => {
    if (id === null || activeId.current !== id) return;
    clearTimer();
    setToast(current => current?.id === id ? { ...current, kind, title, detail } : current);
    timer.current = setTimeout(() => {
      if (activeId.current === id) activeId.current = null;
      setToast(current => current?.id === id ? null : current);
    }, kind === 'error' ? 7000 : 4500);
  }, [clearTimer]);

  const showSuccess = useCallback((id: number | null, title: string, detail?: string) => finish(id, 'success', title, detail), [finish]);
  const showError = useCallback((id: number | null, title: string, detail?: string) => finish(id, 'error', title, detail), [finish]);
  const dismiss = useCallback((id?: number | null) => {
    if (id === null) return;
    if (id !== undefined && activeId.current !== id) return;
    activeId.current = null;
    clearTimer();
    if (id === undefined) setToast(null);
    else setToast(current => current?.id === id ? null : current);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const actions = { showPending, updatePending, showSuccess, showError, dismiss };
  const Icon = toast?.kind === 'success' ? CheckCircle2 : toast?.kind === 'error' ? AlertCircle : LoaderCircle;

  return <ToastContext.Provider value={actions}>
    {children}
    {toast && <div className="fixed bottom-4 right-4 z-[100] w-[min(24rem,calc(100vw-2rem))]" aria-live="polite">
      <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur ${
        toast.kind === 'success' ? 'border-emerald-200 bg-emerald-50/95 text-emerald-950' :
        toast.kind === 'error' ? 'border-red-200 bg-red-50/95 text-red-950' : 'border-sky-200 bg-white/95 text-slate-900'
      }`}>
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${toast.kind === 'pending' ? 'animate-spin text-sky-700' : toast.kind === 'success' ? 'text-emerald-700' : 'text-red-700'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">{toast.title}</p>
          {toast.detail && <p className="mt-1 break-words text-xs leading-relaxed opacity-85">{toast.detail}</p>}
        </div>
        {toast.kind !== 'pending' && <button type="button" className="-mr-1 -mt-1 rounded-lg p-1 opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Đóng thông báo" onClick={() => dismiss(toast.id)}>
          <X className="h-4 w-4" />
        </button>}
      </div>
    </div>}
  </ToastContext.Provider>;
}

export function useOperationToast(): ToastActions {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useOperationToast must be used within OperationToastProvider');
  return context;
}
