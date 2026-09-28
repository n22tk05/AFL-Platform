'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminApiError, createAdminReviewSession, type AdminReviewSession, type AdminReviewState } from '@/modules/forms/services/form-api.client';

const empty: AdminReviewState = { workflow: null, editor: '', dirty: false, busy: false, error: null, message: '' };

export default function AdminReviewPage() {
  const params = useParams<{ id: string }>();
  const formCode = params.id;
  const [key, setKey] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [state, setState] = useState<AdminReviewState>(empty);
  const [performedBy, setPerformedBy] = useState('');
  const [note, setNote] = useState('');
  const current = useRef<AdminReviewSession | null>(null);

  useEffect(() => {
    if (!activeKey) { current.current?.invalidate(); current.current = null; setState(empty); return; }
    const session = createAdminReviewSession(formCode, activeKey);
    current.current?.invalidate();
    current.current = session;
    setState({ ...empty, busy: true });
    void session.load().then(result => {
      if (!result.stale && current.current === session) setState(result.state);
    });
    return () => {
      session.invalidate();
      if (current.current === session) current.current = null;
    };
  }, [formCode, activeKey]);

  const visibleState = current.current?.isBoundTo(formCode, activeKey) ? state : empty;
  const workflow = visibleState.workflow;
  const isActive = String(workflow?.status ?? '').toUpperCase() === 'ACTIVE';
  const editable = !!workflow && !isActive && ['DRAFT', 'PENDING_REVIEW'].includes(String(workflow.status).toUpperCase());
  const session = () => current.current;
  async function save() {
    const owner = session(); if (!owner) return;
    const pending = owner.save();
    setState(owner.snapshot());
    const result = await pending;
    if (!result.stale && current.current === owner) setState(result.state);
  }
  async function approve() {
    const owner = session(); if (!owner) return;
    const pending = owner.approve({ performedBy, note });
    setState(owner.snapshot());
    const result = await pending;
    if (!result.stale && current.current === owner) setState(result.state);
  }
  function updateEditor(value: string) {
    const owner = session();
    if (owner) setState(owner.setEditor(value));
  }

  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold">Duyệt biểu mẫu</h1><p className="text-sm text-slate-600">Mã biểu mẫu: <code>{formCode}</code></p></div>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setActiveKey(key); }}><label className="sr-only" htmlFor="admin-key">Admin key</label><input id="admin-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Admin key" className="min-w-64 rounded border p-2" /><button type="submit" disabled={!key.trim() || visibleState.busy} className="rounded bg-slate-900 px-4 py-2 text-white">Tải workflow</button></form>
    {visibleState.busy && <p role="status">Đang xử lý…</p>}{visibleState.error !== null && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{formatError(visibleState.error)}</p>}{visibleState.message && <p role="status" className="text-emerald-800">{visibleState.message}</p>}
    {workflow && <><div className="rounded bg-white p-4"><p className="font-bold">{workflow.formTitle}</p><p>Trạng thái: <strong>{workflow.status}</strong> · {workflow.steps.length} bước</p>{isActive && <p className="mt-2 text-amber-800">Workflow ACTIVE ở chế độ chỉ xem.</p>}</div>
      <label className="block font-semibold" htmlFor="workflow-editor">Workflow JSON {editable ? '(draft/pending)' : '(view only)'}</label><textarea id="workflow-editor" aria-label="Workflow JSON" readOnly={!editable || visibleState.busy} value={visibleState.editor} onChange={event => updateEditor(event.target.value)} spellCheck={false} className="min-h-96 w-full rounded border bg-white p-3 font-mono text-sm" />
      {editable && <><button type="button" onClick={save} disabled={visibleState.busy || !visibleState.dirty} className="rounded bg-emerald-800 px-4 py-2 text-white">Lưu thay đổi</button><div className="grid gap-2 sm:grid-cols-2"><label>Người duyệt<input value={performedBy} onChange={event => setPerformedBy(event.target.value)} maxLength={120} className="mt-1 block w-full rounded border p-2" /></label><label>Ghi chú<input value={note} onChange={event => setNote(event.target.value)} maxLength={1000} className="mt-1 block w-full rounded border p-2" /></label></div><button type="button" onClick={approve} disabled={visibleState.busy || visibleState.dirty || !performedBy.trim()} className="rounded bg-blue-800 px-4 py-2 text-white">Phê duyệt</button></>}
    </>}
  </section>;
}

function formatError(reason: unknown) {
  if (reason instanceof AdminApiError && reason.isConfigurationError) return 'Server configuration problem: ADMIN_KEY_UNCONFIGURED. Configure the server admin key.';
  if (reason instanceof AdminApiError && reason.isUnauthorized) return `Admin key rejected (HTTP ${reason.status}, ${reason.code}).`;
  return reason instanceof AdminApiError ? `${reason.message} (HTTP ${reason.status}, ${reason.code})` : reason instanceof Error ? reason.message : String(reason);
}
