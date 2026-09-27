"use client";

import React from "react";
import { AlertTriangle, FileText } from "lucide-react";

interface StepHeaderProps {
  currentIndex: number;
  totalSteps: number;
  sectionName: string;
  fieldLabel: string;
  requiresPrerequisiteDoc?: boolean;
  legalWarningFlag?: boolean;
}

export function StepHeader({
  currentIndex,
  totalSteps,
  sectionName,
  fieldLabel,
  requiresPrerequisiteDoc,
  legalWarningFlag,
}: StepHeaderProps) {
  const currentStepNumber = currentIndex + 1;
  const progressPercent = (currentStepNumber / totalSteps) * 100;

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Thanh tiến trình bước (Progress Bar) */}
      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
        <div
          className="bg-afl-green h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Chỉ số bước & Mục cha */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
        <span>{sectionName}</span>
        <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
          Dòng {currentStepNumber} / {totalSteps}
        </span>
      </div>

      {/* Tên trường thông tin */}
      <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
        {fieldLabel}
      </h2>

      {/* Huy hiệu cảnh báo phụ */}
      <div className="flex flex-wrap gap-2 pt-1">
        {requiresPrerequisiteDoc && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold rounded-lg shadow-sm">
            <FileText className="w-3.5 h-3.5" />
            <span>Lấy từ Sổ đỏ / Giấy tờ gốc</span>
          </div>
        )}

        {legalWarningFlag && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold rounded-lg shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Đối soát kỹ số tiền / tài khoản</span>
          </div>
        )}
      </div>
    </div>
  );
}
