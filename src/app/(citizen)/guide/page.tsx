"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { documentSession, prerequisiteValue } from "@/modules/documents/session";
import { capturedFormSession, clearCitizenSession, discardLegacyCitizenStorage, type CapturedFormImage } from '@/modules/forms/citizen-session';
import { loadCitizenWorkflow, resolveCitizenFormCode, type CitizenWorkflow } from '@/modules/forms/services/citizen-workflow.client';
import { canonicalFormCode } from '@/modules/forms/client';
import { APP_ROUTES } from '@/shared/routes';
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { WorkflowStep, FormWorkflow } from "@/shared/contracts";
import { VisualTwin } from "@/components/mobile/VisualTwin";
import { RedTextExample } from "@/components/mobile/RedTextExample";
import { StepHeader } from "@/components/mobile/StepHeader";
import { VoiceAssistantPanel } from "@/components/mobile/VoiceAssistantPanel";

function GuideContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("templateId") ?? null;
  const requestedCode = searchParams?.get('formCode') ?? null;
  const requestKey = JSON.stringify([requestedCode, templateId]);
  const [loaded, setLoaded] = useState<{ key: string; data: CitizenWorkflow | null; code: string | null; loading: boolean; error: string }>({ key: '', data: null, code: null, loading: true, error: '' });
  const [refresh, setRefresh] = useState(0);
  const [capture, setCapture] = useState<CapturedFormImage | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  useEffect(() => {
    const abort = new AbortController();
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Live forms remain available. */ }
    const code = resolveCitizenFormCode(requestedCode, templateId, storage);
    setLoaded({ key: requestKey, data: null, code, loading: !!code, error: code ? '' : 'Không tìm thấy biểu mẫu đã chọn. Bác hãy chọn lại đúng tên biểu mẫu.' });
    setCurrentStepIndex(0);
    if (code) loadCitizenWorkflow(code, { templateId, storage, signal: abort.signal }).then(data => {
      if (!abort.signal.aborted) {
        capturedFormSession.selectForm(code);
        setLoaded({ key: requestKey, data, code, loading: false, error: '' });
      }
    }).catch(() => {
      if (!abort.signal.aborted) setLoaded({ key: requestKey, data: null, code, loading: false, error: 'Chưa có hướng dẫn đã xuất bản cho biểu mẫu này. Bác có thể thử lại hoặc chọn biểu mẫu khác.' });
    });
    return () => abort.abort();
  }, [requestKey, requestedCode, templateId, refresh]);
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key?.startsWith('afl_workflow_published_')) return;
      if (templateId && e.key === `afl_workflow_published_${templateId}`) { setRefresh(value => value + 1); return; }
      try { if (e.newValue && canonicalFormCode(JSON.parse(e.newValue).formCode) === loaded.code) setRefresh(value => value + 1); }
      catch { /* Untrusted browser metadata is revalidated by the loader. */ }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [templateId, loaded.code]);

  // Đọc dữ liệu chứng từ tiên quyết (Biên bản phạt / Sổ đỏ) từ Session RAM (Nghị định 13)
  const [prerequisiteFields, setPrerequisiteFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    try { discardLegacyCitizenStorage(sessionStorage); } catch { /* Discard legacy data. */ }
    const refresh = () => setPrerequisiteFields(documentSession.read());
    refresh();
    return documentSession.subscribe(refresh);
  }, []);

  useEffect(() => {
    const update = () => setCapture(loaded.code ? capturedFormSession.read(loaded.code) : null);
    update(); return capturedFormSession.subscribe(update);
  }, [loaded.code]);

  const workflow: FormWorkflow | null = loaded.key === requestKey ? loaded.data?.workflow ?? null : null;

  const steps: WorkflowStep[] = workflow?.steps || [];
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex];

  const effectiveExampleText = useMemo(() => {
    if (!currentStep) return "";
    if (currentStep.requiresPrerequisiteDoc) {
      const value = prerequisiteValue(prerequisiteFields, currentStep.sourceFieldFromPrerequisite);
      return value?.toUpperCase() ?? "CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT";
    }
    return currentStep.exampleRedText || "";
  }, [currentStep, prerequisiteFields]);

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      clearCitizenSession();
      alert(`Chúc mừng bác đã hoàn thành toàn bộ ${workflow?.formTitleVi || workflow?.formTitle || "tờ khai"}!`);
    }
  };

  if (!currentStep || !workflow) {
    return (
      <div className="p-6 text-center text-slate-700 space-y-4">
        <p role="status">{loaded.key !== requestKey || loaded.loading ? 'Đang tải hướng dẫn đúng biểu mẫu…' : loaded.error}</p>
        {!loaded.loading && <button className="min-h-14 font-bold underline" onClick={() => setRefresh(value => value + 1)}>Thử tải lại hướng dẫn</button>}
        <Link className="block min-h-14 font-bold underline" href={APP_ROUTES.scan}>Chọn lại biểu mẫu</Link>
      </div>
    );
  }

  const currentPageNumber = currentStep.pageNumber || 1;

  return (
    <div className="flex flex-col flex-1 pb-24 no-scrollbar">
      {/* Khung nội dung cuộn */}
      <div className="p-4 flex flex-col gap-4">
        <h2 className="text-xl font-bold">{workflow.formTitleVi || workflow.formTitle}</h2>
        {loaded.data?.source !== 'live' && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          {loaded.data?.source === 'demo' ? 'Đang dùng hướng dẫn mẫu minh họa, chưa tải được bản xuất bản từ máy chủ.' : 'Đang dùng bản đã xuất bản trên trình duyệt này, chưa xác minh bản mới nhất trên máy chủ.'}
        </p>}
        {capture && <details className="rounded-xl border border-slate-300 bg-white p-3">
          <summary className="min-h-14 font-bold cursor-pointer">Ảnh tờ khai vừa chụp, chỉ giữ trong phiên</summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={capture.image} alt="Ảnh tờ khai của phiên hiện tại" className="w-full h-auto" />
          <p className="text-sm">Ảnh để bác đối chiếu. Vị trí ô hướng dẫn bên dưới thuộc bản mẫu đã chọn.</p>
        </details>}
        {/* 1. Tiêu đề bước & Thanh tiến trình */}
        <StepHeader
          currentIndex={currentStepIndex}
          totalSteps={totalSteps}
          sectionName={currentStep.sectionName}
          fieldLabel={currentStep.label}
          requiresPrerequisiteDoc={currentStep.requiresPrerequisiteDoc}
          legalWarningFlag={currentStep.legalWarningFlag}
        />

        {/* 2. Bản sao thị giác đa trang & Viền sáng nhấp nháy (FR-2) */}
        <VisualTwin
          pages={workflow.pages || []}
          currentPageNumber={currentPageNumber}
          highlightCoords={currentStep.highlightCoords}
          fieldLabel={currentStep.label}
          stepNumber={currentStepIndex + 1}
        />

        {/* 3. Bộ điều khiển Trợ lý Giọng nói (Loa 0.9x + Micro Push-to-Talk + FAQ Chips) */}
        <VoiceAssistantPanel
          key={`${workflow.formCode}:${currentStepIndex}:${refresh}`}
          voiceGuidance={currentStep.voiceGuidance}
          audioUrl={currentStep.audioUrl}
          faqs={currentStep.faqs}
          formCode={workflow.formCode}
          stepIndex={currentStep.stepIndex || (currentStepIndex + 1)}
        />

        {/* 4. Chữ mẫu in hoa màu đỏ tương phản cao #D32F2F (FR-5) */}
        <RedTextExample
          exampleText={effectiveExampleText}
          fieldNote={
            currentStep.requiresPrerequisiteDoc && prerequisiteValue(prerequisiteFields, currentStep.sourceFieldFromPrerequisite)
              ? "Thông tin chứng từ đã được duyệt và lưu trong phiên. Bác đối chiếu trước khi viết."
              : currentStep.faqs?.[0]?.answer
          }
        />
        {currentStep.requiresPrerequisiteDoc && <Link className="min-h-14 rounded-xl border border-emerald-700 p-3 font-bold text-center" href={`${APP_ROUTES.scanDocument}?formCode=${encodeURIComponent(workflow.formCode)}${templateId ? `&templateId=${encodeURIComponent(templateId)}` : ''}`}>Đọc và duyệt chứng từ trước khi điền</Link>}
      </div>

      {/* Thanh điều hướng cố định dưới đáy (Sticky Bottom Bar >= 56dp) */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t-2 border-slate-300 px-4 py-3 flex items-center justify-between gap-3 z-40 shadow-lg">
        {/* Nút Dòng trước */}
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={currentStepIndex === 0}
          className="min-h-touch-lg px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 border-2 border-slate-300 rounded-xl font-extrabold text-base flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm"
          aria-label="Quay lại dòng trước"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="hidden sm:inline">Dòng trước</span>
        </button>

        {/* Hiển thị số bước & trang nhanh */}
        <div className="text-center">
          <div className="font-black text-sm text-slate-800">
            Dòng {currentStepIndex + 1} / {totalSteps}
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            Trang {currentPageNumber}
          </div>
        </div>

        {/* Nút Dòng tiếp theo / Hoàn thành */}
        <button
          type="button"
          onClick={handleNextStep}
          className="min-h-touch-lg bg-afl-green flex-1 px-5 hover:bg-afl-green-dark text-white border-2 border-afl-green rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
          aria-label={
            currentStepIndex === totalSteps - 1
              ? "Hoàn tất biểu mẫu"
              : "Chuyển sang dòng tiếp theo"
          }
        >
          {currentStepIndex === totalSteps - 1 ? (
            <>
              <CheckCircle className="w-6 h-6" />
              <span>Hoàn Thành</span>
            </>
          ) : (
            <>
              <span>Dòng Tiếp Theo</span>
              <ChevronRight className="w-6 h-6" />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-600 font-bold">Đang tải hướng dẫn...</div>}>
      <GuideContent />
    </Suspense>
  );
}
