"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { documentSession, prerequisiteValue } from "@/modules/documents/session";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Home } from "lucide-react";
import { WorkflowStep, FormWorkflow } from "@/shared/contracts";
import { FormStorageService } from "@/shared/services/form-storage";
import { VisualTwin } from "@/components/citizen/VisualTwin";
import { RedTextExample } from "@/components/citizen/RedTextExample";
import { StepHeader } from "@/components/citizen/StepHeader";
import { VoiceAssistantPanel } from "@/components/citizen/VoiceAssistantPanel";

function GuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("templateId") || "tpl_01_lptb";

  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Nạp kịch bản chỉ cho phép biểu mẫu ACTIVE
  useEffect(() => {
    const activeWorkflow = FormStorageService.getCitizenWorkflow(templateId);
    setWorkflow(activeWorkflow);
    setIsLoading(false);
    setCurrentStepIndex(0);
  }, [templateId]);

  // Lắng nghe sự kiện đồng bộ nếu Admin cập nhật bản mới (cả liên tab lẫn cùng tab)
  useEffect(() => {
    const reloadWorkflow = () => {
      const updated = FormStorageService.getCitizenWorkflow(templateId);
      setWorkflow(updated);
      if (updated?.steps) {
        setCurrentStepIndex((prev) => Math.min(prev, Math.max(0, updated.steps.length - 1)));
      }
    };

    const handleCustomUpdate = (e: any) => {
      if (!e.detail?.templateId || e.detail.templateId === templateId) {
        reloadWorkflow();
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.key || e.key === `afl_workflow_published_${templateId}` || e.key === "afl_admin_last_published_time") {
        reloadWorkflow();
      }
    };

    window.addEventListener("storage", handleStorageEvent);
    window.addEventListener("afl:form-updated", handleCustomUpdate);
    window.addEventListener("focus", reloadWorkflow);

    return () => {
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("afl:form-updated", handleCustomUpdate);
      window.removeEventListener("focus", reloadWorkflow);
    };
  }, [templateId]);

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
      documentSession.clear();
      alert(`Chúc mừng bác đã hoàn thành toàn bộ ${workflow?.formTitleVi || workflow?.formTitle || "tờ khai"}!`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-slate-500 font-bold text-sm">
        Đang nạp kịch bản biểu mẫu...
      </div>
    );
  }

  // BẢO MẬT & NGHIỆP VỤ: Chặn hiển thị nếu biểu mẫu chưa ACTIVE hoặc không tồn tại
  if (!workflow) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 leading-snug">
          Biểu mẫu chưa được ban hành chính thức
        </h2>
        <p className="text-sm text-slate-600 font-medium max-w-md">
          Biểu mẫu này đang trong quá trình thẩm định hoặc chưa ban hành chính thức. Bác vui lòng chọn biểu mẫu khác nhé!
        </p>
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
      <div className="p-6 text-center text-slate-700">
        Không tìm thấy dữ liệu quy trình biểu mẫu. Vui lòng kiểm tra lại.
      </div>
    );
  }

  const currentPageNumber = currentStep.pageNumber || 1;

  return (
    <div className="flex flex-col flex-1 pb-24 no-scrollbar">
      {/* THANH HEADER ĐIỀU HƯỚNG VỀ TRANG CHỦ CITIZEN */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b-2 border-emerald-800/20 px-4 py-3 flex items-center justify-between shadow-xs">
        {/* NÚT VỀ TRANG CHỦ CITIZEN */}
        <button
          type="button"
          onClick={() => router.push("/citizen")}
          className="min-h-[46px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-600/30 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 active:scale-95 transition-all shadow-xs"
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
          <div className="text-xs font-black text-slate-800 truncate max-w-[180px] sm:max-w-[260px]">
            {workflow.formTitleVi || workflow.formTitle}
          </div>
        </div>
      </header>

      {/* Khung nội dung cuộn */}
      <div className="p-4 flex flex-col gap-4">
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
          voiceGuidance={currentStep.voiceGuidance}
          audioUrl={currentStep.audioUrl}
          faqs={currentStep.faqs}
          formCode={workflow.formCode}
          stepIndex={currentStep.stepIndex || (currentStepIndex + 1)}
        />

        {/* 4. Chữ mẫu in hoa tương phản cao WCAG AAA (FR-3) */}
        <RedTextExample
          exampleText={effectiveExampleText}
          fieldNote={
            currentStep.requiresPrerequisiteDoc
              ? "Thông tin được trích xuất từ tài liệu đối soát đính kèm."
              : undefined
          }
        />
      </div>

      {/* 5. Cụm nút điều hướng Bước Trước / Bước Kế Tiếp cố định dưới đáy */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t-2 border-slate-300 p-3 sm:p-4 z-40 max-w-xl mx-auto flex items-center justify-between gap-3 shadow-lg">
        {/* Nút Quay lại bước trước */}
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={currentStepIndex === 0}
          className={`min-h-touch-lg flex-1 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 border-2 transition-all active:scale-95 ${
            currentStepIndex === 0
              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-sm"
          }`}
          aria-label="Quay lại dòng trước"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Dòng trước</span>
        </button>

        {/* Nút Tiếp tục dòng kế tiếp */}
        <button
          type="button"
          onClick={handleNextStep}
          className="min-h-touch-lg flex-[1.4] bg-afl-green hover:bg-emerald-800 text-white rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
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
  );
}

export default function CitizenGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-slate-500 font-bold text-sm">
          Đang chuẩn bị kịch bản...
        </div>
      }
    >
      <GuideContent />
    </Suspense>
  );
}
