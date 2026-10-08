'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminKeyInput, useAdminSession } from '@/modules/forms/admin-session.client';
import { listAdminForms } from '@/modules/forms/services/form-api.client';
import { formErrorMessage } from '@/modules/forms/services/form-feedback.client';
import type { AdminFormSummary } from '@/modules/forms/types/form.types';
import { FormUploadModal } from '@/components/admin/FormUploadModal';
import { FormQrModal } from '@/components/admin/FormQrModal';
import { APP_ROUTES } from '@/shared/routes';

export default function AdminLibraryPage() {
  const { adminKey } = useAdminSession();
  const [forms, setForms] = useState<AdminFormSummary[]>([]);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [qrForm, setQrForm] = useState<AdminFormSummary | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setForms([]); setError('');
    if (adminKey.trim()) listAdminForms(adminKey).then(result => {
      if (current) setForms(result.forms);
    }).catch(reason => { if (current) setError(formErrorMessage(reason, 'Không nạp được danh sách biểu mẫu. Vui lòng thử lại.')); });
    return () => { current = false; };
  }, [adminKey, refresh]);
  return <section className="w-full max-w-6xl mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-bold">Thư viện biểu mẫu trên máy chủ</h1><AdminKeyInput />
    <div className="flex gap-3"><button className="border rounded p-3" onClick={() => setRefresh(value => value + 1)}>Nạp lại</button>
      <button className="bg-emerald-800 text-white rounded p-3" onClick={() => setUploadOpen(true)}>Thêm phôi trống</button></div>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!adminKey && <p>Nhập khóa quản trị để đọc dữ liệu thật. Không dùng dữ liệu mẫu thay thế.</p>}
    <ul className="space-y-3">{forms.map(form => <li key={form.formId} className="bg-white rounded border p-4 flex flex-wrap gap-3 items-center">
      <div className="flex-1"><strong>{form.formCode} — {form.formTitle}</strong><p>{form.status.toUpperCase()} · {form.stepCount} bước · v{form.version}</p></div>
      <Link className="underline p-2" href={APP_ROUTES.review(form.formCode)}>Đối soát</Link>
      {form.status.toUpperCase() === 'ACTIVE' && <button className="border rounded p-2" onClick={() => setQrForm(form)}>QR cho công dân</button>}
    </li>)}</ul>
    <FormUploadModal isOpen={uploadOpen} onClose={() => { setUploadOpen(false); setRefresh(value => value + 1); }} />
    {qrForm && <FormQrModal isOpen onClose={() => setQrForm(null)} templateId={qrForm.formId} formCode={qrForm.formCode} formTitle={qrForm.formTitle} />}
  </section>;
}
