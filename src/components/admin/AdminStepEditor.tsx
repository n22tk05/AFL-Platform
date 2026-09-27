"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { WorkflowStep, NormalizedBoundingBox } from "@/shared/contracts";
import {
  ChevronLeft,
  ChevronRight,
  Volume2,
  FileText,
  AlertTriangle,
  Layers,
  PlusCircle,
  Trash2,
} from "lucide-react";

interface AdminStepEditorProps {
  steps: WorkflowStep[];
  currentStepIndex: number;
  onSelectStep: (index: number) => void;
  onUpdateStep: (updatedStep: WorkflowStep) => void;
  onInsertStep: (insertAfterIndex: number) => void;
  onDeleteStep: (deleteIndex: number) => void;
}

export function AdminStepEditor({
  steps,
  currentStepIndex,
  onSelectStep,
  onUpdateStep,
  onInsertStep,
  onDeleteStep,
}: AdminStepEditorProps) {
  const currentStep = steps[currentStepIndex];
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn thanh chứa nút bước để nút đang chọn luôn ở trung tâm tầm nhìn
  useEffect(() => {
    if (!tabsContainerRef.current) return;
    const activeButton = tabsContainerRef.current.querySelector<HTMLButtonElement>(
      `[data-step-index="${currentStepIndex}"]`
    );
    if (activeButton) {
      activeButton.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [currentStepIndex]);

  const sections = useMemo(() => {
    const list: { name: string; firstIndex: number }[] = [];
    steps.forEach((s, idx) => {
      const name = s.sectionName?.trim() || "Mục chung";
      if (!list.some((item) => item.name === name)) {
        list.push({ name, firstIndex: idx });
      }
    });
    return list;
  }, [steps]);

  const handleFieldChange = (field: keyof WorkflowStep, value: any) => {
    if (!currentStep) return;
    onUpdateStep({ ...currentStep, [field]: value });
  };

  const handleCoordsChange = (index: number, val: number) => {
    if (!currentStep) return;
    const newCoords = [...currentStep.highlightCoords] as NormalizedBoundingBox;
    newCoords[index] = parseFloat(val.toFixed(4)) || 0;
    handleFieldChange("highlightCoords", newCoords);
  };

  const speakPreview = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDeleteCurrentStep = () => {
    if (steps.length <= 1) {
      alert("Không thể xóa bước cuối cùng của biểu mẫu!");
      return;
    }
    if (confirm(`Bác có chắc chắn muốn xóa bước: "${currentStep.label}" không?`)) {
      onDeleteStep(currentStepIndex);
    }
  };

  if (!currentStep) return null;

  return (
    <div className="w-full h-full flex flex-col bg-white border-l border-slate-300 overflow-hidden">
      {/* 1. KHU VỰC THANH ĐIỀU HƯỚNG BƯỚC & THANH KÉO SCRUBBER */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-slate-800">Bước:</span>
            <span className="text-xs font-mono font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 tabular-nums">
              #{currentStepIndex + 1} / {steps.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Nút Chèn bước mới */}
            <button
              type="button"
              onClick={() => onInsertStep(currentStepIndex)}
              className="px-2.5 py-1 text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all"
              title="Thêm bước điền mới vào đúng vị trí này"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Chèn bước</span>
            </button>

            {/* Nút Xóa bước hiện tại */}
            <button
              type="button"
              onClick={handleDeleteCurrentStep}
              className="p-1 text-xs font-bold bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg active:scale-95 transition-all"
              title="Xóa bước này"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Nút Trước / Kế tiếp */}
            <div className="h-4 w-px bg-slate-300 mx-1" />
            <button
              type="button"
              disabled={currentStepIndex === 0}
              onClick={() => onSelectStep(currentStepIndex - 1)}
              className="px-2 py-1 text-xs font-black bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded-lg flex items-center active:scale-95 shadow-sm"
              title="Về bước trước"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={currentStepIndex === steps.length - 1}
              onClick={() => onSelectStep(currentStepIndex + 1)}
              className="px-2 py-1 text-xs font-black bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded-lg flex items-center active:scale-95 shadow-sm"
              title="Sang bước kế tiếp"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Thanh trượt Scrubber lướt các bước (Cập nhật tức thì với cả onInput và onChange) */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(0, steps.length - 1)}
            value={currentStepIndex}
            onInput={(e) => onSelectStep(parseInt((e.target as HTMLInputElement).value, 10))}
            onChange={(e) => onSelectStep(parseInt(e.target.value, 10))}
            className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 active:scale-y-110 transition-transform focus:outline-none"
            aria-label="Thanh trượt chuyển bước nhanh"
          />
        </div>

        {/* Quick-Jump theo Phân đoạn (Section) */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
          <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={sections.find((sec) => sec.name === currentStep.sectionName)?.firstIndex ?? currentStepIndex}
            onChange={(e) => onSelectStep(parseInt(e.target.value, 10))}
            className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 truncate"
          >
            {sections.map((sec, i) => (
              <option key={i} value={sec.firstIndex}>
                Phân đoạn: {sec.name} (từ #{sec.firstIndex + 1})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. DẢI NÚT BƯỚC CHI TIẾT TỰ ĐỘNG LƯỚT THEO (SYNCHRONIZED STEP TABS) */}
      <div
        ref={tabsContainerRef}
        className="px-4 py-2 border-b border-slate-200 bg-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 scroll-smooth select-none"
      >
        {steps.map((s, idx) => {
          const isActive = currentStepIndex === idx;
          return (
            <button
              key={s.boxId || idx}
              data-step-index={idx}
              type="button"
              onClick={() => onSelectStep(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 transition-all ${
                isActive
                  ? "bg-emerald-700 text-white shadow-md scale-105 ring-2 ring-emerald-400"
                  : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-300"
              }`}
            >
              #{idx + 1} P{s.pageNumber || 1}
            </button>
          );
        })}
      </div>

      {/* 3. FORM CHI TIẾT BIÊN TẬP NỘI DUNG BƯỚC */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
        {/* Mục phân loại & Thuộc Trang */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">
              Mục phân loại (Section Name):
            </label>
            <input
              type="text"
              value={currentStep.sectionName}
              onChange={(e) => handleFieldChange("sectionName", e.target.value)}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">
              Thuộc Trang:
            </label>
            <select
              value={currentStep.pageNumber || 1}
              onChange={(e) => handleFieldChange("pageNumber", parseInt(e.target.value, 10))}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600"
            >
              <option value={1}>Trang 1</option>
              <option value={2}>Trang 2</option>
            </select>
          </div>
        </div>

        {/* Tiêu đề dòng */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">
            Tên trường thông tin (Label):
          </label>
          <input
            type="text"
            value={currentStep.label}
            onChange={(e) => handleFieldChange("label", e.target.value)}
            className="w-full text-sm font-black px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 text-slate-900"
          />
        </div>

        {/* Câu thoại hướng dẫn mộc mạc */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-600 uppercase">
              Câu thoại hướng dẫn bình dân:
            </label>
            <button
              type="button"
              onClick={() => speakPreview(currentStep.voiceGuidance)}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Nghe thử 0.9x</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={currentStep.voiceGuidance}
            onChange={(e) => handleFieldChange("voiceGuidance", e.target.value)}
            className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 leading-relaxed"
          />
        </div>

        {/* Chữ mẫu in hoa đỏ #D32F2F */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">
            Chữ mẫu in hoa đỏ tương phản (#D32F2F):
          </label>
          <input
            type="text"
            value={currentStep.exampleRedText}
            onChange={(e) => handleFieldChange("exampleRedText", e.target.value)}
            className="w-full text-sm font-black px-3 py-2 border-2 border-red-300 bg-red-50/40 rounded-lg text-[#D32F2F] tracking-wide uppercase focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Tọa độ ô chuẩn hóa */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span className="block text-xs font-bold text-slate-700 uppercase mb-2">
            Tọa độ ô [ymin, xmin, ymax, xmax]:
          </span>
          <div className="grid grid-cols-4 gap-2">
            {(["ymin", "xmin", "ymax", "xmax"] as const).map((key, i) => (
              <div key={key}>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">{key}:</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  value={currentStep.highlightCoords[i]}
                  onChange={(e) => handleCoordsChange(i, parseFloat(e.target.value))}
                  className="w-full text-xs font-mono font-bold px-2 py-1 border border-slate-300 rounded bg-white tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Cờ cảnh báo & Liên chứng từ */}
        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={!!currentStep.requiresPrerequisiteDoc}
              onChange={(e) => handleFieldChange("requiresPrerequisiteDoc", e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
            />
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Có liên chứng từ tiên quyết (Sổ đỏ / Biên bản phạt)</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-amber-200 bg-amber-50/40 hover:bg-amber-50 cursor-pointer">
            <input
              type="checkbox"
              checked={!!currentStep.legalWarningFlag}
              onChange={(e) => handleFieldChange("legalWarningFlag", e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            />
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Cảnh báo pháp lý (Cần đối soát kỹ số tiền / tài khoản)</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
