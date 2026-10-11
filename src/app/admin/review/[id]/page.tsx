'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminKeyInput, useAdminSession } from '@/modules/forms/admin-session.client';
import { createAdminReviewSession, parseReviewWorkflowEditor, type AdminReviewSession, type AdminReviewState } from '@/modules/forms/services/form-api.client';
import { AdminStepEditor } from '@/components/admin/AdminStepEditor';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import type { WorkflowStep } from '@/shared/contracts';
import { INPUT_KINDS } from '@/modules/forms/services/form-field-metadata';
import { APP_ROUTES } from '@/shared/routes';
import { useTemplatePreview } from '@/modules/forms/hooks/use-template-preview';
import { requestStepAudio } from '@/modules/voice-ai/services/tts.client';
import { contentAddressedAudioUrlOrEmpty } from '@/modules/voice-ai/services/audio-url.service';
import { useOperationToast } from '@/components/OperationToastProvider';
import { Volume2, Zap, StopCircle, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminReviewPage() {
  const params = useParams();
  const formCode = String(params?.id ?? '');
  const { adminKey } = useAdminSession();
  const { showPending, updatePending, showSuccess, showError, dismiss } = useOperationToast();
  const sessionRef = useRef<AdminReviewSession | null>(null);
  const [state, setState] = useState<AdminReviewState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [regionIndex, setRegionIndex] = useState(0);
  useEffect(() => { setRegionIndex(0); }, [currentIndex, formCode]);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewer, setReviewer] = useState('');
  const [region, setRegion] = useState<'NORTH' | 'SOUTH'>('NORTH');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [batchProgress, setBatchProgress] = useState<{
    active: boolean;
    current: number;
    total: number;
    failed: number;
  }>({ active: false, current: 0, total: 0, failed: 0 });
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
    if (!batchProgress.active) {
      ttsRequest.current?.abort(); setTtsBusy(false); setTtsError('');
    }
    return () => { ttsRequest.current?.abort(); };
  }, [formCode, adminKey, currentIndex, region, state?.editor, batchProgress.active]);

  const edited = state?.editor ? parseReviewWorkflowEditor(state.editor) : workflow;
  const step = edited?.steps?.[currentIndex];
  const editable = workflow && ['DRAFT', 'PENDING_REVIEW', 'ACTIVE'].includes(String(workflow.status).toUpperCase());

  const totalStepsCount = edited?.steps?.length ?? 0;
  const audioStepsCount = edited?.steps?.filter(s => Boolean(s.audioUrl)).length ?? 0;
  const missingAudioCount = totalStepsCount - audioStepsCount;
  const coveragePercent = totalStepsCount > 0 ? Math.round((audioStepsCount / totalStepsCount) * 100) : 0;

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
    const toastId = showPending('Đang tạo âm thanh', `Đang tổng hợp MP3 cho bước ${step.stepIndex}.`);
    try {
      const audioUrl = await requestStepAudio(step.voiceGuidance, step.stepIndex, region, adminKey, { signal: controller.signal });
      if (controller.signal.aborted || sessionRef.current !== session || session.snapshot().editor !== snapshot) return;
      setState(session.setEditor(JSON.stringify({ ...edited, steps: edited.steps.map((existing, index) => index === currentIndex ? { ...existing, audioUrl } : existing) }, null, 2)));
      setConfirmed(false);
      showSuccess(toastId, 'Đã tạo âm thanh', `MP3 cho bước ${step.stepIndex} đã sẵn sàng phát.`);
    } catch (reason) {
      if (!controller.signal.aborted) {
        const message = reason instanceof Error ? reason.message : 'TTS chưa khả dụng; chưa tạo audio.';
        setTtsError(message);
        showError(toastId, 'Tạo âm thanh thất bại', message);
      }
    } finally {
      if (controller.signal.aborted) dismiss(toastId);
      if (ttsRequest.current === controller && !controller.signal.aborted) setTtsBusy(false);
    }
  };

  const generateBatchAudio = async (onlyMissing = false) => {
    const session = sessionRef.current;
    if (!session || !edited || !edited.steps?.length || !editable || state?.busy || ttsBusy || batchProgress.active) return;
    const targetSteps = edited.steps
      .map((item, idx) => ({ step: item, index: idx }))
      .filter(({ step: s }) => !onlyMissing || !s.audioUrl);

    if (!targetSteps.length) {
      alert('Tất cả các bước đều đã có file âm thanh!');
      return;
    }

    const controller = new AbortController();
    ttsRequest.current = controller;
    setTtsBusy(true);
    setTtsError('');
    setBatchProgress({ active: true, current: 0, total: targetSteps.length, failed: 0 });
    const toastId = showPending('Đang tạo âm thanh hàng loạt', `0/${targetSteps.length} bước đã xử lý.`);

    let currentSteps = [...edited.steps];
    let failedCount = 0;

    for (let i = 0; i < targetSteps.length; i++) {
      if (controller.signal.aborted) break;
      const { step: target, index: stepIdx } = targetSteps[i];
      setBatchProgress({ active: true, current: i + 1, total: targetSteps.length, failed: failedCount });
      updatePending(toastId, `Đang tạo MP3 bước ${target.stepIndex} (${i + 1}/${targetSteps.length}).`);

      try {
        const audioUrl = await requestStepAudio(target.voiceGuidance, target.stepIndex, region, adminKey, { signal: controller.signal });
        if (controller.signal.aborted) break;
        currentSteps = currentSteps.map((s, idx) => idx === stepIdx ? { ...s, audioUrl } : s);
        setState(session.setEditor(JSON.stringify({ ...edited, steps: currentSteps }, null, 2)));
      } catch (err) {
        if (controller.signal.aborted) break;
        failedCount++;
        console.warn(`Lỗi tạo audio cho bước ${target.stepIndex}:`, err);
      }
    }

    setBatchProgress({ active: false, current: targetSteps.length, total: targetSteps.length, failed: failedCount });
    setTtsBusy(false);
    setConfirmed(false);
    if (controller.signal.aborted) dismiss(toastId);
    else if (failedCount) showError(toastId, 'Đã tạo âm thanh một phần', `Thành công ${targetSteps.length - failedCount}/${targetSteps.length} bước; ${failedCount} bước lỗi. Hãy thử lại các bước còn thiếu.`);
    else showSuccess(toastId, 'Đã tạo âm thanh', `Tạo MP3 thành công cho ${targetSteps.length} bước.`);
  };

  const abortBatchAudio = () => {
    ttsRequest.current?.abort();
    setBatchProgress(p => ({ ...p, active: false }));
    setTtsBusy(false);
    dismiss();
  };

  const act = async (action: 'save' | 'approve') => {
    const session = sessionRef.current;
    if (!session) return;
    const toastId = showPending(action === 'save' ? 'Đang lưu kịch bản' : 'Đang phê duyệt và kích hoạt biểu mẫu',
      action === 'save' ? 'Đang lưu thay đổi và đọc lại dữ liệu từ máy chủ.' : 'Đang kiểm tra điều kiện và cập nhật trạng thái ACTIVE.');
    const pending = action === 'save' ? session.save() : session.approve({ performedBy: reviewer, note: 'Đã đối soát nội dung và ô nhập.' });
    setState(session.snapshot());
    let result: Awaited<typeof pending>;
    try {
      result = await pending;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Yêu cầu thất bại do lỗi không xác định.';
      showError(toastId, action === 'save' ? 'Lưu kịch bản thất bại' : 'Không thể kích hoạt biểu mẫu', message);
      return;
    }
    if (result.stale || sessionRef.current !== session) { dismiss(toastId); return; }
    setState(result.state);
    setConfirmed(false);
    if (result.state.error) {
      const message = result.state.error instanceof Error ? result.state.error.message : 'Yêu cầu bị từ chối; dữ liệu chưa được cập nhật.';
      showError(toastId, action === 'save' ? 'Lưu kịch bản thất bại' : 'Không thể kích hoạt biểu mẫu', message);
    } else if (action === 'approve' && String(result.state.workflow?.status).toUpperCase() !== 'ACTIVE') {
      showError(toastId, 'Chưa kích hoạt biểu mẫu', 'Máy chủ chưa xác nhận trạng thái ACTIVE. Hãy kiểm tra các điều kiện phê duyệt.');
    } else {
      showSuccess(toastId, action === 'save' ? 'Đã lưu kịch bản' : 'Biểu mẫu đã ACTIVE',
        action === 'save' ? 'Thay đổi đã được lưu và đối chiếu lại từ máy chủ.' : 'Phê duyệt đã được máy chủ xác nhận.');
    }
  };

  return <section className="w-full max-w-6xl mx-auto p-4 space-y-4">
    <div className="flex items-center justify-between border-b pb-3">
      <div>
        <Link href={APP_ROUTES.library} className="text-xs font-bold text-emerald-800 hover:underline">← Về thư viện biểu mẫu</Link>
        <h1 className="text-xl font-black text-slate-900">Đối soát kịch bản: {formCode}</h1>
      </div>
      {workflow && (
        <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${
          String(workflow.status).toUpperCase() === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {String(workflow.status).toUpperCase()}
        </span>
      )}
    </div>

    <AdminKeyInput />
    {Boolean(state?.error) && <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold">{state?.error instanceof Error ? state.error.message : 'Yêu cầu thất bại.'}</p>}
    {state?.message && <p role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">{state.message}</p>}
    {preview.error && <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold">Không tải được ảnh phôi: {preview.error}</p>}
    {ttsError && <p role="alert" className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold">{ttsError}</p>}
    {workflow && !edited && <p role="alert" className="text-red-800 text-xs font-bold">JSON workflow chưa có cấu trúc hợp lệ; sửa JSON trước khi lưu hoặc đối soát.</p>}

    {workflow && <>
      {/* Khung trực quan hóa độ phủ âm thanh và thao tác hàng loạt */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-700" />
            <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">Chỉ số bao phủ giọng đọc:</span>
            <span className="font-mono text-xs font-black text-slate-900">{audioStepsCount}/{totalStepsCount} bước ({coveragePercent}%)</span>
          </div>
          <div className="w-full max-w-md bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${coveragePercent === 100 ? 'bg-emerald-600' : coveragePercent > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          {batchProgress.active && (
            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-pulse">
              <Zap className="w-3.5 h-3.5" />
              Đang sinh âm thanh: bước {batchProgress.current}/{batchProgress.total} {batchProgress.failed > 0 ? `(thất bại: ${batchProgress.failed})` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {batchProgress.active ? (
            <button
              type="button"
              onClick={abortBatchAudio}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <StopCircle className="w-4 h-4" />
              <span>Dừng sinh audio</span>
            </button>
          ) : (
            <>
              {missingAudioCount > 0 && (
                <button
                  type="button"
                  disabled={!editable || state?.busy || ttsBusy}
                  onClick={() => void generateBatchAudio(true)}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Zap className="w-4 h-4" />
                  <span>⚡ Bổ sung MP3 còn thiếu ({missingAudioCount} bước)</span>
                </button>
              )}
              <button
                type="button"
                disabled={!editable || state?.busy || ttsBusy}
                onClick={() => void generateBatchAudio(false)}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Zap className="w-4 h-4" />
                <span>⚡ Tạo MP3 toàn bộ ({totalStepsCount} bước)</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 min-w-0 w-full">
        <fieldset disabled={!editable || state?.busy || ttsBusy} className="space-y-3 min-w-0 w-full">
          <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border">
            {step?.highlightRegions && <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Vùng đối soát:</span>
              <select aria-label="Vùng cần đối soát" className="border rounded-lg p-1.5 text-xs font-semibold" value={regionIndex} onChange={event => setRegionIndex(Number(event.target.value))}>
                {step.highlightRegions.map((item, index) => <option key={item.regionId} value={index}>Vùng {index + 1}</option>)}
              </select>
            </label>}
            {step?.inputKind && <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Loại ô:</span>
              <select aria-label="Loại trường" className="border rounded-lg p-1.5 text-xs font-semibold" value={step.inputKind} onChange={event => updateStep({ ...step, inputKind: event.target.value as typeof step.inputKind })}>
                {INPUT_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </label>}
          </div>

          {step && preview.pages.length ? <AdminVisualTwinEditor pages={preview.pages} currentPageNumber={step.pageNumber ?? 1}
            onPageChange={() => {}} fieldLabel={step.label} highlightCoords={step.highlightRegions?.[regionIndex]?.normalizedCoords ?? step.highlightCoords}
            onCoordsChange={coords => updateStep({ ...step, highlightCoords: regionIndex === 0 ? coords : step.highlightCoords,
              highlightRegions: step.highlightRegions?.map((item, index) => index === regionIndex ? { ...item, normalizedCoords: coords } : item) })} /> : <p className="text-xs text-slate-500">Chưa có ảnh phôi trên máy chủ; không thay bằng ảnh mẫu khác.</p>}
        </fieldset>

        <fieldset disabled={!editable || state?.busy || ttsBusy} className="min-w-0 w-full">
          {edited?.steps && <AdminStepEditor steps={edited.steps} currentStepIndex={currentIndex} onSelectStep={setCurrentIndex}
            onUpdateStep={updateStep} allowStructureChanges={false} onInsertStep={() => {}} onDeleteStep={() => {}} />}
        </fieldset>
      </div>

      <fieldset disabled={!editable || state?.busy || ttsBusy} className="bg-white p-4 rounded-xl border space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-slate-700">Giọng đọc bước hiện tại:
            <select className="border rounded-lg p-1.5 ml-2 text-xs" value={region} onChange={event => setRegion(event.target.value as typeof region)}>
              <option value="NORTH">Miền Bắc</option>
              <option value="SOUTH">Miền Nam</option>
            </select>
          </label>
          <button
            type="button"
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg font-bold text-xs"
            disabled={!step}
            onClick={() => void generateAudio()}
          >
            Tạo MP3 cho bước này
          </button>
        </div>
        {ttsBusy && !batchProgress.active && <p role="status" className="text-xs font-bold text-emerald-800 animate-pulse">Đang tạo audio cho bước hiện tại…</p>}
        {step?.audioUrl && <div className="flex items-center gap-2 pt-1"><audio controls src={contentAddressedAudioUrlOrEmpty(step.audioUrl)} aria-label="Nghe thử bước đang chọn" className="h-8" /></div>}
      </fieldset>

      <details className="bg-slate-50 p-3 rounded-xl border text-xs">
        <summary className="font-bold cursor-pointer text-slate-700">Kiểm tra JSON workflow</summary>
        <textarea
          aria-label="Workflow JSON"
          className="w-full h-64 border rounded-lg font-mono text-xs p-2 mt-2"
          disabled={!editable || state?.busy || ttsBusy}
          value={state?.editor ?? ''}
          onChange={event => {
            if (sessionRef.current) setState(sessionRef.current.setEditor(event.target.value));
            setConfirmed(false);
          }}
        />
      </details>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t">
        <button
          type="button"
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border rounded-xl font-bold text-xs disabled:opacity-50"
          disabled={!editable || !state?.dirty || state.busy || ttsBusy}
          onClick={() => void act('save')}
        >
          Lưu thay đổi trên máy chủ
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!editable || state?.dirty || state?.busy || ttsBusy}
              onChange={event => setConfirmed(event.target.checked)}
              className="rounded"
            />
            Tôi đã đối soát toàn bộ nhãn, tọa độ, hướng dẫn và căn cứ.
          </label>
          <input
            placeholder="Tên người đối soát..."
            className="border rounded-lg p-2 text-xs font-medium"
            value={reviewer}
            onChange={event => setReviewer(event.target.value)}
          />
          <button
            type="button"
            className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-black text-xs disabled:opacity-50 shadow-sm"
            disabled={!editable || !confirmed || state?.dirty || state?.busy || ttsBusy || String(workflow?.status).toUpperCase() === 'ACTIVE'}
            onClick={() => void act('approve')}
          >
            {String(workflow?.status).toUpperCase() === 'ACTIVE' ? 'Đã kích hoạt (ACTIVE)' : 'Phê duyệt biểu mẫu'}
          </button>
        </div>
      </div>
    </>}
  </section>;
}
