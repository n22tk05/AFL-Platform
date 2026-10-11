"use client";

import React from "react";
import { AlertTriangle, FileText, UserCheck } from "lucide-react";
import type { TargetActor } from "@/shared/contracts";

interface StepHeaderProps {
  currentIndex: number;
  totalSteps: number;
  sectionName: string;
  fieldLabel: string;
  requiresPrerequisiteDoc?: boolean;
  legalWarningFlag?: boolean;
  targetActor?: TargetActor;
}

export function StepHeader({
  currentIndex,
  totalSteps,
  sectionName,
  fieldLabel,
  requiresPrerequisiteDoc,
  legalWarningFlag,
  targetActor,
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

        {targetActor === 'CITIZEN' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-lg shadow-sm">
            <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Phần người dân điền</span>
          </div>
        )}

        {targetActor === 'EMPLOYER' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 border border-sky-300 text-sky-900 text-xs font-bold rounded-lg shadow-sm">
            <UserCheck className="w-3.5 h-3.5 text-sky-700" />
            <span>Phần người sử dụng LĐ</span>
          </div>
        )}

        {targetActor === 'OFFICER' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-300 text-purple-900 text-xs font-bold rounded-lg shadow-sm">
            <UserCheck className="w-3.5 h-3.5 text-purple-700" />
            <span>Phần cán bộ tiếp nhận</span>
          </div>
        )}
      </div>
    </div>
  );
}
