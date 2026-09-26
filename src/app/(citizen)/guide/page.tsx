"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CheckCircle, Volume2 } from "lucide-react";
import mockWorkflowData from "../../../../assets/mock-data/mock-workflow.json";
import { FormWorkflow, WorkflowStep } from "@/shared/contracts";
import { VisualTwin } from "@/components/mobile/VisualTwin";
import { RedTextExample } from "@/components/mobile/RedTextExample";
import { StepHeader } from "@/components/mobile/StepHeader";

export default function GuidePage() {
  const workflow = mockWorkflowData as unknown as FormWorkflow;
  const steps: WorkflowStep[] = workflow.steps || [];
  const totalSteps = steps.length;

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

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
      alert("Chúc mừng bác đã hoàn thành toàn bộ tờ khai!");
    }
  };

  if (!currentStep) {
    return (
      <div className="p-6 text-center text-slate-700">
        Không tìm thấy dữ liệu quy trình. Vui lòng kiểm tra lại mock-workflow.json.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-24">
      {/* Khung nội dung cuộn */}
      <div className="p-4 flex flex-col gap-4">
        {/* 1. Tiêu đề bước & Tiến trình */}
        <StepHeader
          currentIndex={currentStepIndex}
          totalSteps={totalSteps}
          sectionName={currentStep.sectionName}
          fieldLabel={currentStep.label}
          requiresPrerequisiteDoc={currentStep.requiresPrerequisiteDoc}
          legalWarningFlag={currentStep.legalWarningFlag}
        />

        {/* 2. Bản sao thị giác & Viền sáng nhấp nháy (FR-2) */}
        <VisualTwin
          scannedImageUrl={(workflow as any).scannedImageUrl || "/assets/test-form.svg"}
          highlightCoords={currentStep.highlightCoords}
          fieldLabel={currentStep.label}
          stepNumber={currentStepIndex + 1}
        />

        {/* 3. Lời thoại hướng dẫn mộc mạc (Đang chuẩn bị cho Audio ở Bước 3) */}
        <div className="w-full bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Volume2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Lời khuyên của Trợ lý:
            </div>
            <p className="text-base sm:text-lg font-bold text-amber-950 mt-0.5 leading-snug">
              &ldquo;{currentStep.voiceGuidance}&rdquo;
            </p>
          </div>
        </div>

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

        {/* Hiển thị số bước nhanh */}
        <div className="text-center font-black text-sm text-slate-600">
          {currentStepIndex + 1} / {totalSteps}
        </div>

        {/* Nút Dòng tiếp theo / Hoàn thành */}
        <button
          type="button"
          onClick={handleNextStep}
          className="min-h-touch-lg flex-1 px-5 bg-afl-green hover:bg-emerald-800 text-white border-2 border-emerald-900 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
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
