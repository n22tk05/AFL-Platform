'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminKeyInput, useAdminSession } from '@/modules/forms/admin-session.client';
import { createAdminReviewSession, parseReviewWorkflowEditor, type AdminReviewSession, type AdminReviewState } from '@/modules/forms/services/form-api.client';
import { AdminStepEditor } from '@/components/admin/AdminStepEditor';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import type { WorkflowStep } from '@/shared/contracts';
import { APP_ROUTES } from '@/shared/routes';
import { useTemplatePreview } from '@/modules/forms/hooks/use-template-preview';
import { requestStepAudio } from '@/modules/voice-ai/services/tts.client';

export default function AdminReviewPage() {
  const params = useParams();
  const formCode = String(params?.id ?? '');
  const { adminKey } = useAdminSession();
  const sessionRef = useRef<AdminReviewSession | null>(null);
  const [state, setState] = useState<AdminReviewState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewer, setReviewer] = useState('');
  const [region, setRegion] = useState<'NORTH' | 'SOUTH'>('NORTH');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const ttsRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const session = createAdminReviewSession(formCode, adminKey);
    sessionRef.current = session; setState(null); setConfirmed(false); setCurrentIndex(0);
    if (adminKey.trim()) session.load().then(result => { if (!result.stale && sessionRef.current === session) setState(result.state); });
    return () => { session.invalidate(); };
  }, [formCode, adminKey]);
  const workflow = state?.workflow;
  const preview = useTemplatePreview(formCode, workflow?.pages, adminKey);
  useEffect(() => {
    ttsRequest.current?.abort(); setTtsBusy(false); setTtsError('');
    return () => { ttsRequest.current?.abort(); };
  }, [formCode, adminKey, currentIndex, region, state?.editor]);
  const edited = state?.editor ? parseReviewWorkflowEditor(state.editor) : workflow;
  const step = edited?.steps?.[currentIndex];
  const editable = workflow && ['DRAFT', 'PENDING_REVIEW'].includes(String(workflow.status).toUpperCase());
  const updateStep = (updated: WorkflowStep) => {
    if (!edited || !sessionRef.current || !editable || state?.busy || ttsBusy) return;
    const baseline = edited.steps[currentIndex];
    const steps = edited.steps.map((existing, index) => index === currentIndex
      ? { ...updated, stepIndex: index + 1, boxId: existing.boxId, pageNumber: existing.pageNumber,
        audioUrl: updated.voiceGuidance !== baseline.voiceGuidance ? '' : updated.audioUrl } : existing);
    setState(sessionRef.current.setEditor(JSON.stringify({ ...edited, steps }, null, 2))); setConfirmed(false);
  };
  const generateAudio = async () => {
    const session = sessionRef.current;
    if (!session || !edited || !step || !editable || state?.busy || ttsBusy) return;
    const snapshot = session.snapshot().editor;
    const controller = new AbortController(); ttsRequest.current = controller;
    setTtsBusy(true); setTtsError('');
    try {
      const audioUrl = await requestStepAudio(step.voiceGuidance, step.stepIndex, region, adminKey, { signal: controller.signal });
      if (controller.signal.aborted || sessionRef.current !== session || session.snapshot().editor !== snapshot) return;
      setState(session.setEditor(JSON.stringify({ ...edited, steps: edited.steps.map((existing, index) => index === currentIndex ? { ...existing, audioUrl } : existing) }, null, 2)));
      setConfirmed(false);
    } catch (reason) {
      if (!controller.signal.aborted) setTtsError(reason instanceof Error ? reason.message : 'TTS chưa khả dụng; chưa tạo audio.');
    } finally { if (ttsRequest.current === controller && !controller.signal.aborted) setTtsBusy(false); }
  };
  const act = async (action: 'save' | 'approve') => {
    const session = sessionRef.current;
    if (!session) return;
    const pending = action === 'save' ? session.save() : session.approve({ performedBy: reviewer, note: 'Đã đối soát nội dung và ô nhập.' });
    setState(session.snapshot());
    const result = await pending;
    if (!result.stale && sessionRef.current === session) { setState(result.state); setConfirmed(false); }
  };
  return <section className="w-full p-4 space-y-3">
    <Link href={APP_ROUTES.library} className="underline">Về thư viện</Link><h1 className="text-xl font-bold">Đối soát {formCode}</h1><AdminKeyInput />
    {Boolean(state?.error) && <p role="alert" className="text-red-800">{state?.error instanceof Error ? state.error.message : 'Yêu cầu thất bại.'}</p>}
    {state?.message && <p role="status">{state.message}</p>}
    {preview.error && <p role="alert">Không tải được ảnh phôi: {preview.error}</p>}
    {ttsError && <p role="alert">{ttsError}</p>}
    {workflow && !edited && <p role="alert">JSON workflow chưa có cấu trúc hợp lệ; sửa JSON trước khi lưu hoặc đối soát.</p>}
    {workflow && <>
      <p>Trạng thái máy chủ: {String(workflow.status).toUpperCase()}</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <fieldset disabled={!editable || state?.busy || ttsBusy}>
        {step && preview.pages.length ? <AdminVisualTwinEditor pages={preview.pages} currentPageNumber={step.pageNumber ?? 1}
          onPageChange={() => {}} fieldLabel={step.label} highlightCoords={step.highlightCoords}
          onCoordsChange={coords => updateStep({ ...step, highlightCoords: coords })} /> : <p>Chưa có ảnh phôi trên máy chủ; không thay bằng ảnh mẫu khác.</p>}
        </fieldset>
        <fieldset disabled={!editable || state?.busy || ttsBusy}>
          {edited?.steps && <AdminStepEditor steps={edited.steps} currentStepIndex={currentIndex} onSelectStep={setCurrentIndex}
            onUpdateStep={updateStep} allowStructureChanges={false} onInsertStep={() => {}} onDeleteStep={() => {}} />}
        </fieldset>
      </div>
      <fieldset disabled={!editable || state?.busy || ttsBusy}>
        <label>Giọng đọc cho bước đang chọn<select className="border p-2 ml-2" value={region} onChange={event => setRegion(event.target.value as typeof region)}>
          <option value="NORTH">Bắc</option><option value="SOUTH">Nam</option></select></label>
        <button className="border rounded p-3 ml-2" disabled={!step} onClick={() => void generateAudio()}>Tạo MP3 theo nội dung hiện tại</button>
      </fieldset>
      {ttsBusy && <p role="status">Đang tạo audio…</p>}
      {step?.audioUrl && <audio controls src={step.audioUrl} aria-label="Nghe thử bước đang chọn" />}
      <p>MP3 mới cần được lưu cùng workflow. Nếu chưa tạo được MP3, công dân đọc đúng text bằng giọng của trình duyệt.</p>
      <p>Thêm/xóa ô phải được thực hiện ở manifest trước khi sinh lại kịch bản; không đổi boxId trong bước hướng dẫn.</p>
      <details><summary>Kiểm tra JSON workflow</summary><textarea aria-label="Workflow JSON" className="w-full h-64 border font-mono text-xs"
        disabled={!editable || state?.busy || ttsBusy} value={state?.editor ?? ''} onChange={event => {
          if (sessionRef.current) setState(sessionRef.current.setEditor(event.target.value)); setConfirmed(false);
        }} /></details>
      <button className="border rounded p-3" disabled={!editable || !state?.dirty || state.busy || ttsBusy} onClick={() => void act('save')}>Lưu thay đổi trên máy chủ</button>
      <label className="block"><input type="checkbox" checked={confirmed} disabled={!editable || state?.dirty || state?.busy || ttsBusy}
        onChange={event => setConfirmed(event.target.checked)} /> Tôi đã đối soát toàn bộ nhãn, tọa độ, hướng dẫn và căn cứ.</label>
      <label className="block">Tên người đối soát (thông tin mô tả)<input className="border p-2 ml-2" value={reviewer} onChange={event => setReviewer(event.target.value)} /></label>
      <button className="bg-emerald-800 text-white rounded p-3" disabled={!editable || !confirmed || state?.dirty || state?.busy || ttsBusy}
        onClick={() => void act('approve')}>Phê duyệt qua API</button>
    </>}
  </section>;
}
