"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { documentSession, prerequisiteValue } from "@/modules/documents/session";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Home, FileText } from "lucide-react";
import { WorkflowStep, FormWorkflow, TargetActor } from "@/shared/contracts";
import { loadCitizenWorkflow, resolveCitizenFormCode } from '@/modules/forms/services/citizen-workflow.client';
import { citizenWorkflowFeedback } from '@/modules/forms/services/form-feedback.client';
import { clearCitizenSession } from '@/modules/forms/citizen-session';
import { VisualTwin } from "@/components/citizen/VisualTwin";
import { RedTextExample } from "@/components/citizen/RedTextExample";
import { StepHeader } from "@/components/citizen/StepHeader";
import { VoiceAssistantPanel } from "@/components/citizen/VoiceAssistantPanel";

function GuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formCode = resolveCitizenFormCode(searchParams?.get('formCode') ?? null, searchParams?.get('templateId') ?? null);

  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [actorFilter, setActorFilter] = useState<TargetActor>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  // Nạp kịch bản chỉ cho phép biểu mẫu ACTIVE
  useEffect(() => {
    let controller = new AbortController();
    const reloadWorkflow = async () => {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setWorkflow(null);
      setLoadError(null);
      setIsLoading(true);
      setCurrentStepIndex(0);
      try {
        if (formCode) {
          const result = await loadCitizenWorkflow(formCode, { signal });
          if (!signal.aborted) setWorkflow(result.workflow);
        }
      } catch (reason) {
        if (!signal.aborted) {
          setWorkflow(null);
          setLoadError(reason);
        }
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    };
    void reloadWorkflow();
    window.addEventListener('focus', reloadWorkflow);
    return () => {
      controller.abort();
      window.removeEventListener('focus', reloadWorkflow);
    };
  }, [formCode, retry]);

  // Đọc dữ liệu chứng từ tiên quyết (Biên bản phạt / Sổ đỏ) từ Session RAM (Nghị định 13)
  const [prerequisiteFields, setPrerequisiteFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem("afl_prerequisite_document_data");
    } catch {
      /* Discard legacy data. */
    }
    const refresh = () => setPrerequisiteFields(documentSession.read());
    refresh();
    return documentSession.subscribe(refresh);
  }, []);

  const rawSteps: WorkflowStep[] = workflow?.steps || [];
  const hasMultipleActors = useMemo(() => {
    if (!rawSteps.length) return false;
    const actors = new Set(rawSteps.map(s => s.targetActor).filter(Boolean));
    return actors.size > 1 || (actors.size === 1 && !actors.has('ALL'));
  }, [rawSteps]);

  const steps: WorkflowStep[] = useMemo(() => {
    if (actorFilter === 'ALL') return rawSteps;
    return rawSteps.filter(s => !s.targetActor || s.targetActor === 'ALL' || s.targetActor === actorFilter);
  }, [rawSteps, actorFilter]);

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-slate-500 font-bold text-sm min-h-[50vh]">
        Đang nạp kịch bản biểu mẫu...
      </div>
    );
  }

  // BẢO MẬT & NGHIỆP VỤ: Chặn hiển thị nếu biểu mẫu chưa ACTIVE hoặc không tồn tại
  if (!workflow) {
    const feedback = citizenWorkflowFeedback(loadError, !!formCode);
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 min-h-[50vh]">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 leading-snug">
          {feedback.title}
        </h2>
        <p className="text-sm text-slate-600 font-medium max-w-md">
          {feedback.message}
        </p>
        {feedback.retryable && (
          <button
            type="button"
            className="min-h-touch px-6 py-2.5 border rounded-xl font-bold"
            onClick={() => setRetry(value => value + 1)}
          >
            Thử lại
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/citizen")}
          className="min-h-touch px-6 py-2.5 bg-afl-green hover:bg-emerald-800 text-white rounded-xl font-black text-sm active:scale-95 transition-all shadow-md"
        >
          Quay về trang chính
        </button>
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="p-6 text-center text-slate-700 min-h-[50vh] flex items-center justify-center">
        Không tìm thấy dữ liệu quy trình biểu mẫu. Vui lòng kiểm tra lại.
      </div>
    );
  }

  const currentPageNumber = currentStep.pageNumber || 1;

  return (
    <div className="flex flex-col flex-1 pb-28 md:pb-32 no-scrollbar bg-slate-50 min-h-[calc(100vh-4rem)]">
      {/* THANH HEADER ĐIỀU HƯỚNG VỀ TRANG CHỦ CITIZEN */}
      <header className="sticky top-16 sm:top-20 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 shadow-xs">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          {/* NÚT VỀ TRANG CHỦ CITIZEN */}
          <button
            type="button"
            onClick={() => router.push("/citizen")}
            className="min-h-[42px] px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 active:scale-95 transition-all shadow-xs"
            title="Quay về trang tiếp đón người dân"
          >
            <Home className="w-4 h-4 text-emerald-700" />
            <span>Về trang chủ</span>
          </button>

          {/* Tiêu đề & Thông tin biểu mẫu */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-mono text-[11px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                {workflow.formCode}
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                Trang {currentPageNumber}/{workflow.totalPages || 1}
              </span>
            </div>
            <div className="text-xs sm:text-sm font-black text-slate-800 truncate max-w-[200px] sm:max-w-md">
              {workflow.formTitleVi || workflow.formTitle}
            </div>
          </div>
        </div>
      </header>

      {/* KHUNG NỘI DUNG CHÍNH (2 CỘT TRÊN TABLET/DESKTOP, 1 CỘT TRÊN MOBILE) */}
      <main className="max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-4 sm:gap-6 flex-1">
        {/* Thanh chọn vai trò điền (Chỉ hiện khi biểu mẫu đa bên như Hợp đồng lao động) */}
        {hasMultipleActors && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold overflow-x-auto shadow-xs">
            <button
              type="button"
              onClick={() => { setActorFilter('ALL'); setCurrentStepIndex(0); }}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${actorFilter === 'ALL' ? 'bg-white shadow text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tất cả các ô ({rawSteps.length})
            </button>
            <button
              type="button"
              onClick={() => { setActorFilter('CITIZEN'); setCurrentStepIndex(0); }}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${actorFilter === 'CITIZEN' ? 'bg-emerald-700 shadow text-white font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Phần người dân ({rawSteps.filter(s => !s.targetActor || s.targetActor === 'ALL' || s.targetActor === 'CITIZEN').length})
            </button>
            <button
              type="button"
              onClick={() => { setActorFilter('EMPLOYER'); setCurrentStepIndex(0); }}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${actorFilter === 'EMPLOYER' ? 'bg-sky-700 shadow text-white font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Phần cơ quan / Bên A ({rawSteps.filter(s => s.targetActor === 'EMPLOYER').length})
            </button>
          </div>
        )}

        {/* Bố cục Responsive 2 Cột trên Tablet/Desktop & 1 Cột trên Mobile:
            - Mobile: StepHeader (order-1) -> VisualTwin (order-2) -> Guidance (order-3)
            - Tablet & Desktop: Cột Trái = VisualTwin (col 1-6) | Cột Phải = StepHeader + Guidance (col 7-12)
        */}
        <div className="flex flex-col md:grid md:grid-cols-12 md:gap-6 lg:gap-8 items-start">
          {/* CỘT 1 (BÊN TRÁI): PHẦN ẢNH THỊ GIÁC (VISUAL TWIN) */}
          <section
            aria-label="Bản sao thị giác tờ khai"
            className="order-2 md:order-1 md:col-start-1 md:col-span-6 lg:col-span-6 md:row-start-1 md:row-span-3 md:sticky md:top-24 w-full space-y-2 mb-4 md:mb-0"
          >
            <div className="hidden md:flex items-center justify-between px-1 text-xs">
              <span className="font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-700" />
                Vị trí ô thực tế trên giấy tờ
              </span>
              <span className="font-bold text-slate-400">
                Ô được phóng to & chớp viền đỏ
              </span>
            </div>

            <VisualTwin
              pages={workflow.pages || []}
              currentPageNumber={currentPageNumber}
              highlightCoords={currentStep.highlightCoords}
              highlightRegions={currentStep.highlightRegions}
              inputKind={currentStep.inputKind}
              fieldLabel={currentStep.label}
              stepNumber={currentStepIndex + 1}
              exampleRedText={effectiveExampleText}
            />
          </section>

          {/* CỘT 2 (BÊN PHẢI) - PHẦN 1: TIÊU ĐỀ BƯỚC & TIẾN TRÌNH */}
          <section
            aria-label="Tiêu đề bước và tiến trình"
            className="order-1 md:order-2 md:col-start-7 md:col-span-6 lg:col-span-6 md:row-start-1 w-full mb-3 md:mb-0"
          >
            <StepHeader
              currentIndex={currentStepIndex}
              totalSteps={totalSteps}
              sectionName={currentStep.sectionName}
              fieldLabel={currentStep.label}
              requiresPrerequisiteDoc={currentStep.requiresPrerequisiteDoc}
              legalWarningFlag={currentStep.legalWarningFlag}
              targetActor={currentStep.targetActor}
            />
          </section>

          {/* CỘT 2 (BÊN PHẢI) - PHẦN 2: HƯỚNG DẪN GIỌNG NÓI & CHỮ MẪU WCAG AAA */}
          <section
            aria-label="Hướng dẫn điền và chữ mẫu"
            className="order-3 md:order-3 md:col-start-7 md:col-span-6 lg:col-span-6 md:row-start-2 w-full flex flex-col gap-4"
          >
            {/* Bộ điều khiển Trợ lý Giọng nói (Loa 0.9x + Micro Push-to-Talk + FAQ Chips) */}
            <VoiceAssistantPanel
              key={`${workflow.formCode}:${workflow.version}:${currentStep.stepIndex}:${currentStep.voiceGuidance}`}
              voiceGuidance={currentStep.voiceGuidance}
              audioUrl={currentStep.audioUrl}
              faqs={currentStep.faqs}
              formCode={workflow.formCode}
              stepIndex={currentStep.stepIndex || (currentStepIndex + 1)}
            />

            {/* Chữ mẫu in hoa tương phản cao WCAG AAA (FR-3) */}
            <RedTextExample
              exampleText={effectiveExampleText}
              fieldNote={
                currentStep.requiresPrerequisiteDoc
                  ? "Thông tin được trích xuất từ tài liệu đối soát đính kèm."
                  : undefined
              }
            />
          </section>
        </div>
      </main>

      {/* CỤM NÚT ĐIỀU HƯỚNG BƯỚC TRƯỚC / BƯỚC KẾ TIẾP CỐ ĐỊNH DƯỚI ĐÁY */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 z-40 shadow-lg">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 sm:gap-4">
          {/* Thông tin bước phụ trợ cho Tablet & Desktop */}
          <div className="hidden md:flex items-center gap-3">
            <span className="font-mono text-xs font-black bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-md border border-emerald-300">
              {workflow.formCode}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800 truncate max-w-xs lg:max-w-md">
                {currentStep.label}
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                {currentStep.sectionName} • Dòng {currentStepIndex + 1} / {totalSteps}
              </span>
            </div>
          </div>

          {/* Cụm nút chuyển bước */}
          <div className="flex items-center gap-3 w-full md:w-auto md:min-w-[360px] justify-end">
            <button
              type="button"
              onClick={handlePrevStep}
              disabled={currentStepIndex === 0}
              className={`min-h-touch-lg flex-1 md:flex-initial md:px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 border-2 transition-all active:scale-95 ${
                currentStepIndex === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-sm"
              }`}
              aria-label="Quay lại dòng trước"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Dòng trước</span>
            </button>

            <button
              type="button"
              onClick={handleNextStep}
              className="min-h-touch-lg flex-[1.4] md:flex-initial md:px-8 bg-afl-green hover:bg-emerald-800 text-white rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              aria-label={currentStepIndex === totalSteps - 1 ? "Hoàn thành tờ khai" : "Sang dòng kế tiếp"}
            >
              {currentStepIndex === totalSteps - 1 ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-200" />
                  <span>Xong tờ khai</span>
                </>
              ) : (
                <>
                  <span>Dòng kế tiếp</span>
                  <ChevronRight className="w-5 h-5 text-emerald-200" />
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function CitizenGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-slate-500 font-bold text-sm min-h-[50vh]">
          Đang chuẩn bị kịch bản...
        </div>
      }
    >
      <GuideContent />
    </Suspense>
  );
}
