'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminApiError, approveAdminWorkflow, readAdminWorkflow, saveAdminWorkflow } from '@/modules/forms/client';
import type { FormWorkflow } from '@/shared/contracts';

export default function AdminReviewPage() {
  const params = useParams<{ id: string }>();
  const formCode = params.id;
  const [key, setKey] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [editor, setEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!activeKey) return;
    let live = true;
    setBusy(true); setError(''); setWorkflow(null);
    readAdminWorkflow(formCode, activeKey).then(value => { if (live) { setWorkflow(value); setEditor(JSON.stringify(value, null, 2)); } })
      .catch(reason => { if (live) setError(formatError(reason)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [formCode, activeKey]);
  const isActive = String(workflow?.status ?? '').toUpperCase() === 'ACTIVE';
  const editable = !!workflow && !isActive && ['DRAFT', 'PENDING_REVIEW'].includes(String(workflow.status).toUpperCase());
  async function save() {
    if (!workflow || !editable) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const value = JSON.parse(editor) as FormWorkflow;
      if (value.formCode !== workflow.formCode) throw new Error('formCode cannot be changed.');
      const result = await saveAdminWorkflow(formCode, activeKey, value);
      const returned = result as FormWorkflow;
      const saved = returned && typeof returned === 'object' && 'steps' in returned ? returned : value;
      setWorkflow(saved); setEditor(JSON.stringify(saved, null, 2)); setMessage('Saved successfully.');
    } catch (reason) { setError(formatError(reason)); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!workflow || !editable || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await approveAdminWorkflow(formCode, activeKey, { performedBy, note });
      if (String(result.status).toUpperCase() !== 'ACTIVE') throw new Error('Approval response did not confirm ACTIVE status.');
      const updated: FormWorkflow = { ...workflow, status: 'ACTIVE' };
      setWorkflow(updated); setEditor(JSON.stringify(updated, null, 2)); setMessage('Workflow approved and ACTIVE.');
    } catch (reason) { setError(formatError(reason)); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold">Duyệt biểu mẫu</h1><p className="text-sm text-slate-600">Mã biểu mẫu: <code>{formCode}</code></p></div>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setActiveKey(key); }}><label className="sr-only" htmlFor="admin-key">Admin key</label><input id="admin-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Admin key" className="min-w-64 rounded border p-2" /><button type="submit" disabled={!key.trim() || busy} className="rounded bg-slate-900 px-4 py-2 text-white">Tải workflow</button></form>
    {busy && <p role="status">Đang xử lý…</p>}{error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}{message && <p role="status" className="text-emerald-800">{message}</p>}
    {workflow && <><div className="rounded bg-white p-4"><p className="font-bold">{workflow.formTitle}</p><p>Trạng thái: <strong>{workflow.status}</strong> · {workflow.steps.length} bước</p>{isActive && <p className="mt-2 text-amber-800">Workflow ACTIVE ở chế độ chỉ xem.</p>}</div>
      <label className="block font-semibold" htmlFor="workflow-editor">Workflow JSON {editable ? '(draft/pending)' : '(view only)'}</label><textarea id="workflow-editor" aria-label="Workflow JSON" readOnly={!editable} value={editor} onChange={event => setEditor(event.target.value)} spellCheck={false} className="min-h-96 w-full rounded border bg-white p-3 font-mono text-sm" />
      {editable && <><button type="button" onClick={save} disabled={busy} className="rounded bg-emerald-800 px-4 py-2 text-white">Lưu thay đổi</button><div className="grid gap-2 sm:grid-cols-2"><label>Người duyệt<input value={performedBy} onChange={event => setPerformedBy(event.target.value)} maxLength={120} className="mt-1 block w-full rounded border p-2" /></label><label>Ghi chú<input value={note} onChange={event => setNote(event.target.value)} maxLength={1000} className="mt-1 block w-full rounded border p-2" /></label></div><button type="button" onClick={approve} disabled={busy || !performedBy.trim()} className="rounded bg-blue-800 px-4 py-2 text-white">Phê duyệt</button></>}
    </>}
  </section>;
}

function formatError(reason: unknown) {
  if (reason instanceof AdminApiError && reason.isConfigurationError) return 'Server configuration problem: ADMIN_KEY_UNCONFIGURED. Configure the server admin key.';
  if (reason instanceof AdminApiError && reason.isUnauthorized) return `Admin key rejected (HTTP ${reason.status}, ${reason.code}).`;
  return reason instanceof AdminApiError ? `${reason.message} (HTTP ${reason.status}, ${reason.code})` : reason instanceof Error ? reason.message : String(reason);
}
