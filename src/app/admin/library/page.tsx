'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminApiError, listAdminForms } from '@/modules/forms/client';
import type { AdminFormSummary } from '@/modules/forms/types/form.types';

export default function AdminLibraryPage() {
  const [key, setKey] = useState('');
  const [submittedKey, setSubmittedKey] = useState('');
  const [forms, setForms] = useState<AdminFormSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!submittedKey) return;
    let active = true;
    setLoading(true); setError(null); setForms(null);
    listAdminForms(submittedKey).then(result => { if (active) setForms(result.forms); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason : new Error(String(reason))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submittedKey]);
  const filtered = useMemo(() => (forms ?? []).filter(form => `${form.formCode} ${form.formTitle} ${form.status}`.toLowerCase().includes(query.toLowerCase())), [forms, query]);
  const errorText = error instanceof AdminApiError && error.isConfigurationError
    ? 'Server configuration problem: ADMIN_KEY_UNCONFIGURED. Configure the server admin key.'
    : error instanceof AdminApiError && error.isUnauthorized ? 'The admin key was rejected (401).'
      : error ? `${error.message}${error instanceof AdminApiError ? ` (HTTP ${error.status}, ${error.code})` : ''}` : '';
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold">Thư viện biểu mẫu</h1><p className="text-sm text-slate-600">Danh sách lấy từ API quản trị được bảo vệ.</p></div>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSubmittedKey(key); }}>
      <label className="sr-only" htmlFor="admin-key">Admin key</label><input id="admin-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Admin key" className="min-w-64 rounded border p-2" />
      <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit" disabled={!key.trim() || loading}>Kết nối</button>
    </form>
    {loading && <p role="status">Đang tải biểu mẫu…</p>}
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{errorText}</p>}
    {forms && <><label className="block">Lọc biểu mẫu<input className="ml-2 rounded border p-2" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {forms.length === 0 ? <p>Không có biểu mẫu từ máy chủ.</p> : filtered.length === 0 ? <p>Không tìm thấy biểu mẫu phù hợp.</p> : <ul className="grid gap-3 md:grid-cols-2">{filtered.map(form => <li key={form.formId} className="rounded border bg-white p-4"><p className="font-bold">{form.formTitle}</p><p className="text-sm">{form.formCode} · {form.status} · v{form.version}</p><p className="text-sm text-slate-600">{form.stepCount} bước</p><Link className="mt-3 inline-block text-emerald-800 underline" href={`/admin/review/${encodeURIComponent(form.formCode)}`}>Mở duyệt</Link></li>)}</ul>}</>}
  </section>;
}
