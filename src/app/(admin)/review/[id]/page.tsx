"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { FormWorkflow, WorkflowStep, NormalizedBoundingBox } from '@/shared/contracts';
import { MOCK_WORKFLOW_REGISTRY } from '@/config/app.config';
import { APP_ROUTES } from '@/shared/routes';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import { AdminStepEditor } from '@/components/admin/AdminStepEditor';
import { normalizeLocalWorkflow, publishLocalWorkflow, readLocalWorkflow, saveLocalDraft } from '@/modules/forms/services/local-workflow-store';
import { approveAdminWorkflow, readAdminWorkflow, saveAdminWorkflow } from '@/modules/forms/client';

export default function AdminReviewPage() {
  const router = useRouter(), params = useParams(), search = useSearchParams();
  const formId = typeof params?.id === 'string' ? params.id : '';
  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [stepIndex, setStepIndex] = useState(0), [page, setPage] = useState(1);
  const [reviewConfirmed, setReviewConfirmed] = useState(false), [blankConfirmed, setBlankConfirmed] = useState(false);
  const [adminKey, setAdminKey] = useState(''), [message, setMessage] = useState('');
  const [source, setSource] = useState(''), [busy, setBusy] = useState(false), [exportOpen, setExportOpen] = useState(false);
  const request = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current++; controller.current?.abort();
    setWorkflow(null); setBusy(false); setMessage(''); setAdminKey(''); setReviewConfirmed(false); setBlankConfirmed(false); setExportOpen(false);
    const stored = readLocalWorkflow(localStorage, formId);
    const fixture = MOCK_WORKFLOW_REGISTRY[formId];
    const loaded = stored ?? (fixture ? normalizeLocalWorkflow({ ...fixture, templateId: formId }, formId) : null);
    if (loaded) { setWorkflow(loaded); setSource(stored ? 'Biểu mẫu lưu trên trình duyệt này' : 'Biểu mẫu mẫu có sẵn, chưa xác minh trong database'); setPage(loaded.steps[0]?.pageNumber ?? 1); }
    else setMessage('Chưa có bản nháp cho ID này. Hãy tải phôi hoặc nhập khóa để nạp đúng biểu mẫu từ server.');
    setStepIndex(0);
    return () => { request.current++; controller.current?.abort(); };
  }, [formId]);

  const update = (next: FormWorkflow) => {
    if (busy) return;
    setWorkflow({ ...next, status: 'DRAFT', totalSteps: next.steps.length, steps: next.steps.map((s, i) => ({ ...s, stepIndex: i + 1 })) });
    setReviewConfirmed(false); setBlankConfirmed(false); setExportOpen(false); setMessage('Có thay đổi chưa lưu. Bản đang áp dụng không bị ghi đè.');
  };
  const saveDraft = () => {
    if (!workflow || busy) return false;
    try { setWorkflow(saveLocalDraft(localStorage, workflow)); setMessage('Đã lưu bản nháp trên trình duyệt này; chưa phê duyệt hoặc lưu vào database.'); return true; }
    catch { setMessage('Không lưu được bản nháp. Kiểm tra ảnh, tọa độ và dung lượng trình duyệt; bản đang áp dụng vẫn được giữ.'); return false; }
  };
  const insertStep = (after: number) => {
    if (!workflow) return;
    const base = workflow.steps[after];
    const newStep: WorkflowStep = { stepIndex: after + 2, boxId: `manual_${Date.now()}`, pageNumber: base?.pageNumber ?? page,
      sectionName: base?.sectionName ?? 'Cấu hình thủ công', label: 'Ô mới — cần đặt tên',
      voiceGuidance: 'Chuyên viên cần đối chiếu và viết hướng dẫn đúng với phôi.', audioUrl: '', exampleRedText: 'CẦN ĐỐI SOÁT',
      highlightCoords: [0.2, 0.2, 0.3, 0.7], faqs: [] };
    const steps = [...workflow.steps]; steps.splice(after + 1, 0, newStep); update({ ...workflow, steps }); setStepIndex(after + 1);
  };
  const fetcher = (signal: AbortSignal) => (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal });
  const loadServer = async () => {
    const code = search?.get('formCode') || workflow?.formCode;
    if (!code || !adminKey.trim() || busy) { setMessage('Cần mã biểu mẫu và khóa quản trị để nạp server.'); return; }
    const id = ++request.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setBusy(true); setMessage('Đang nạp biểu mẫu server...');
    try {
      const result = await readAdminWorkflow(code, adminKey, fetcher(abort.signal));
      if (id !== request.current || abort.signal.aborted) return;
      const checked = normalizeLocalWorkflow({ ...result, templateId: formId, status: String(result.status).toUpperCase() as FormWorkflow['status'] }, formId);
      if (!checked) throw new Error('INVALID_WORKFLOW');
      setWorkflow(checked); setStepIndex(0); setPage(checked.steps[0]?.pageNumber ?? 1); setSource('Database server'); setReviewConfirmed(false); setBlankConfirmed(false); setMessage('Đã nạp đúng biểu mẫu từ server.');
    } catch { if (id === request.current && !abort.signal.aborted) setMessage('Không nạp được server. Kiểm tra khóa, mã biểu mẫu và database; dữ liệu hiện tại được giữ.'); }
    finally { if (id === request.current) setBusy(false); }
  };
  const publish = async (local: boolean) => {
    if (!workflow || !reviewConfirmed || !blankConfirmed || busy) return;
    const id = ++request.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setBusy(true); setMessage('Đang kiểm tra và lưu...');
    try {
      if (local) {
        const published = publishLocalWorkflow(localStorage, workflow, { reviewConfirmed, blankTemplateConfirmed: blankConfirmed });
        if (id !== request.current) return;
        setWorkflow(published); setSource('Bản áp dụng cục bộ trên trình duyệt này'); setMessage('Đã áp dụng cục bộ. Đây không phải phê duyệt database hoặc phát hành cho thiết bị khác.'); setExportOpen(true);
      } else {
        if (!adminKey.trim()) throw new Error('MISSING_KEY');
        const draft = normalizeLocalWorkflow({ ...workflow, status: 'DRAFT' }, formId, false);
        if (!draft) throw new Error('INVALID_WORKFLOW');
        await saveAdminWorkflow(draft.formCode, adminKey, draft, fetcher(abort.signal));
        if (id !== request.current || abort.signal.aborted) return;
        const approved = await approveAdminWorkflow(draft.formCode, adminKey, { performedBy: 'Chuyên viên kiểm duyệt', note: 'Đã kiểm tra nội dung, tọa độ và phôi trống.' }, fetcher(abort.signal));
        if (id !== request.current || abort.signal.aborted) return;
        if (approved.status.toUpperCase() !== 'ACTIVE') throw new Error('NOT_APPROVED');
        setWorkflow({ ...draft, status: 'ACTIVE', publishedAt: approved.approvedAt }); setSource('Đã phê duyệt trong database'); setMessage('Server đã xác nhận phê duyệt ACTIVE.'); setExportOpen(true);
      }
    } catch { if (id === request.current && !abort.signal.aborted) setMessage('Chưa phê duyệt. Kiểm tra dữ liệu, khóa và database. Không tự chuyển sang áp dụng cục bộ khi server lỗi.'); }
    finally { if (id === request.current) setBusy(false); }
  };
  const download = () => {
    if (!workflow) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${formId}_v${workflow.version ?? 1}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const current = workflow?.steps[stepIndex];
  return <div className="w-full flex flex-col min-h-[calc(100vh-120px)]">
    <div className="p-4 bg-white border-b space-y-3">
      <div className="flex flex-wrap gap-3 items-center"><button disabled={busy} onClick={() => { if (!workflow || saveDraft()) router.push(APP_ROUTES.library); }}>Lưu nháp & về thư viện</button><h2 className="font-bold">{workflow?.formTitleVi || workflow?.formTitle || 'Đối soát biểu mẫu'}</h2><span>{workflow?.status ?? 'CHƯA NẠP'} · {source}</span></div>
      <p role="status" className="text-amber-900">{message}</p>
      <div className="flex flex-wrap gap-2"><input type="password" autoComplete="off" aria-label="Khóa quản trị" placeholder="Khóa quản trị (không lưu)" value={adminKey} onChange={e => setAdminKey(e.target.value)} disabled={busy} className="border p-2 rounded"/><button disabled={busy || !adminKey} onClick={loadServer}>Nạp từ server</button><button disabled={busy || !workflow} onClick={saveDraft}>Lưu bản nháp cục bộ</button></div>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)}/>Tôi đã đối soát nội dung, căn cứ pháp lý và tọa độ.</label>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={blankConfirmed} onChange={e => setBlankConfirmed(e.target.checked)}/>Đây là phôi trống không chứa dữ liệu công dân; cho phép lưu biểu mẫu.</label>
      <div className="flex gap-3 flex-wrap"><button className="bg-emerald-700 text-white p-2 rounded" disabled={busy || !current || !reviewConfirmed || !blankConfirmed || !adminKey} onClick={() => publish(false)}>Lưu & phê duyệt trên server</button><button className="border p-2 rounded" disabled={busy || !current || !reviewConfirmed || !blankConfirmed} onClick={() => publish(true)}>Áp dụng cục bộ trên trình duyệt này</button></div>
    </div>
    {!workflow ? <p className="p-8">ID này chưa có kịch bản. <button onClick={() => router.push(APP_ROUTES.library)}>Về thư viện tải phôi</button></p> : !current ? <div className="p-8"><p>Chưa có ô được cấu hình. Phôi được giữ để chuyên viên thêm bước và đặt tọa độ.</p>{workflow.pages?.[0] && <img src={workflow.pages[0].imageUrl} alt="Phôi trống cần cấu hình" className="max-h-96"/>}<button onClick={() => insertStep(-1)}>Thêm bước đầu tiên</button></div> : <div className="flex flex-col lg:flex-row flex-1 min-h-[600px]" aria-busy={busy}>
      <div className={`lg:w-3/5 min-h-[500px] ${busy ? 'pointer-events-none opacity-60' : ''}`}><AdminVisualTwinEditor pages={workflow.pages ?? []} currentPageNumber={page} onPageChange={setPage} highlightCoords={current.highlightCoords} onCoordsChange={(coords: NormalizedBoundingBox) => { const steps = [...workflow.steps]; steps[stepIndex] = { ...current, highlightCoords: coords }; update({ ...workflow, steps }); }} fieldLabel={current.label}/></div>
      <div className={`lg:w-2/5 min-h-[500px] ${busy ? 'pointer-events-none opacity-60' : ''}`}><AdminStepEditor steps={workflow.steps} currentStepIndex={stepIndex} onSelectStep={index => { setStepIndex(index); setPage(workflow.steps[index]?.pageNumber ?? 1); }} onUpdateStep={step => { const steps = [...workflow.steps]; steps[stepIndex] = step; update({ ...workflow, steps }); }} onInsertStep={insertStep} onDeleteStep={index => { update({ ...workflow, steps: workflow.steps.filter((_, i) => i !== index) }); setStepIndex(Math.max(0, index - 1)); }}/></div>
    </div>}
    {exportOpen && workflow && <div role="dialog" aria-label="Xuất kịch bản" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div className="bg-white p-5 rounded-xl max-w-3xl w-full"><h3>{source}</h3><textarea aria-label="Kịch bản JSON" readOnly value={JSON.stringify(workflow, null, 2)} className="w-full h-72 border text-xs"/><div className="flex gap-3"><button onClick={download}>Tải JSON</button><button onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(workflow, null, 2)); setMessage('Đã sao chép JSON.'); } catch { setMessage('Không sao chép được. Hãy tải JSON.'); } }}>Sao chép JSON</button><button onClick={() => setExportOpen(false)}>Đóng</button></div></div></div>}
  </div>;
}
