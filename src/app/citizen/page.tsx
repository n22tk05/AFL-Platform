"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, ChevronRight, Sparkles, BookOpen } from "lucide-react";
import { FormStorageService } from "@/shared/services/form-storage";

export default function CitizenHomePage() {
  const router = useRouter();
  const [activeTemplates, setActiveTemplates] = useState<any[]>([]);

  // Hàm nạp toàn bộ biểu mẫu ACTIVE
  const loadForms = useCallback(() => {
    const forms = FormStorageService.getActiveCitizenForms();
    setActiveTemplates(forms);
  }, []);

  useEffect(() => {
    loadForms();

    // Lắng nghe khi Admin cập nhật biểu mẫu từ tab khác hoặc cùng tab
    window.addEventListener("storage", loadForms);
    window.addEventListener("afl:form-updated", loadForms);
    window.addEventListener("focus", loadForms);

    return () => {
      window.removeEventListener("storage", loadForms);
      window.removeEventListener("afl:form-updated", loadForms);
      window.removeEventListener("focus", loadForms);
    };
  }, [loadForms]);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-5 space-y-5">
      {/* Lời chào thân thiện */}
      <div className="bg-emerald-50 border-2 border-emerald-600/30 rounded-2xl p-4 sm:p-5 shadow-xs">
        <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
          Bác muốn điền giấy tờ gì hôm nay ạ?
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
          Bác có thể bấm chụp ảnh tờ khai hoặc chạm chọn trực tiếp mẫu giấy ở danh sách bên dưới.
        </p>
      </div>

      {/* NÚT CHÍNH: CHỤP ẢNH TỜ KHAI */}
      <button
        type="button"
        onClick={() => router.push("/citizen/scan")}
        className="w-full min-h-[72px] p-4 bg-green-800 hover:bg-emerald-900 text-white rounded-2xl border-2 border-emerald-950 flex items-center justify-between shadow-lg active:scale-98 transition-all group"
      >
        <div className="flex items-center gap-3.5 text-left">
          <div className="w-13 h-13 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Camera className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-black uppercase tracking-wide">
              Chụp Ảnh Biểu Mẫu
            </div>
            <p className="text-xs text-emerald-100 font-semibold">
              Đưa camera vào tờ giấy để nhận diện biểu mẫu
            </p>
          </div>
        </div>
        <ChevronRight className="w-6 h-6 text-emerald-200 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* DANH SÁCH BIỂU MẪU CHỌN NHANH (100% LÀ ACTIVE) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs font-black text-slate-600 uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-700" />
            <span>Biểu mẫu đang áp dụng ({activeTemplates.length}):</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {activeTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => router.push(`/citizen/guide?templateId=${tpl.id}`)}
              className="w-full p-4 bg-white hover:bg-emerald-50/50 border-2 border-slate-300 hover:border-emerald-600 rounded-2xl flex items-center justify-between text-left shadow-xs active:scale-98 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                      {tpl.formCode}
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                      v{tpl.version}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 leading-snug group-hover:text-emerald-800 transition-colors">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {tpl.department} • {tpl.totalSteps} bước
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-700 shrink-0 ml-2 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
