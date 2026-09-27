"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { WorkflowStep } from "@/shared/contracts";
import { getMockWorkflow } from "@/config/app.config";
import { VisualTwin } from "@/components/mobile/VisualTwin";
import { RedTextExample } from "@/components/mobile/RedTextExample";
import { StepHeader } from "@/components/mobile/StepHeader";
import { VoiceAssistantPanel } from "@/components/mobile/VoiceAssistantPanel";

function GuideContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("templateId") || "tpl_01_lptb";

  // Lựa chọn kịch bản dựa vào templateId thông qua Mock Switcher Registry
  const workflow = useMemo(() => {
    return getMockWorkflow(templateId);
  }, [templateId]);

  const steps: WorkflowStep[] = workflow.steps || [];
  const totalSteps = steps.length;

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  // Tự động reset về bước 0 khi chuyển biểu mẫu
  useEffect(() => {
    setCurrentStepIndex(0);
  }, [templateId]);

  const currentStep = steps[currentStepIndex];

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      alert(`Chúc mừng bác đã hoàn thành toàn bộ ${workflow.formTitleVi || workflow.formTitle || "tờ khai"}!`);
    }
  };

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
        />

        {/* 4. Chữ mẫu in hoa màu đỏ tương phản cao #D32F2F (FR-5) */}
        <RedTextExample
          exampleText={currentStep.exampleRedText}
          fieldNote={currentStep.faqs?.[0]?.answer}
        />
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
