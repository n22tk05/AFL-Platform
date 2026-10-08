'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCitizenForms, type CitizenFormOption } from '@/modules/forms/services/citizen-workflow.client';
import { APP_ROUTES } from '@/shared/routes';

export default function CitizenHomePage() {
  const [forms, setForms] = useState<CitizenFormOption[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort(); controller = new AbortController();
      const signal = controller.signal;
      return listCitizenForms({ signal }).then(result => {
        if (!signal.aborted) { setForms(result.forms); setUnavailable(result.offline); }
      }).catch(() => { if (!signal.aborted) { setForms([]); setUnavailable(true); } });
    };
    void load(); window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); };
  }, []);
  return <section className="p-5 space-y-5">
    <h1 className="text-2xl font-bold">Bác chọn biểu mẫu cần kê khai</h1>
    <Link className="block p-4 bg-emerald-800 text-white rounded" href={APP_ROUTES.scan}>Chụp phôi và chọn biểu mẫu</Link>
    {unavailable && <p role="alert">Máy chủ chưa khả dụng. Bác vui lòng thử lại; không dùng kịch bản mẫu thay thế.</p>}
    <ul>{forms.map(form => <li key={form.formCode}><Link className="block border rounded p-4 mb-3" href={APP_ROUTES.citizenGuide(form.formCode)}>
      {form.formCode} — {form.formTitle}
    </Link></li>)}</ul>
  </section>;
}
