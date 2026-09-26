"use client";

import React, { useState } from "react";
import { ZoomIn, ZoomOut, PenTool } from "lucide-react";

interface RedTextExampleProps {
  exampleText: string;
  fieldNote?: string;
}

export function RedTextExample({
  exampleText,
  fieldNote,
}: RedTextExampleProps) {
  // 0: Nhỏ (20px), 1: Vừa (25px), 2: Cực Đại (30px)
  const [fontScale, setFontScale] = useState<number>(0);

  const fontClasses = [
    "text-xl leading-snug",      // ~20px (>= 18pt chuẩn)
    "text-2xl leading-snug",     // ~25px
    "text-[28px] leading-tight", // ~28-30px
  ];

  const handleZoomOut = () => {
    setFontScale((prev) => Math.max(0, prev - 1));
  };

  const handleZoomIn = () => {
    setFontScale((prev) => Math.min(2, prev + 1));
  };

  return (
    <div className="w-full bg-white rounded-2xl border-2 border-slate-300 shadow-md p-4 flex flex-col gap-3">
      {/* Thanh công cụ tiêu đề & phóng to chữ */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2 text-slate-800">
          <PenTool className="w-5 h-5 text-afl-red shrink-0" />
          <span className="font-extrabold text-sm sm:text-base tracking-wide uppercase">
            CHỮ MẪU ĐỂ BÁC CHÉP THEO:
          </span>
        </div>

        {/* Nút phóng to / thu nhỏ cỡ chữ */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={fontScale === 0}
            className="w-10 h-10 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Thu nhỏ chữ mẫu"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={fontScale === 2}
            className="w-10 h-10 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Phóng to chữ mẫu"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Khung chữ mẫu in hoa màu đỏ đậm #D32F2F trên nền giấy trắng */}
      <div className="bg-[#FFFDF8] border-2 border-dashed border-red-300 rounded-xl p-3.5 flex items-center justify-center text-center min-h-[90px]">
        <p
          className={`font-black tracking-wider uppercase break-words text-afl-red select-all transition-all duration-200 ${fontClasses[fontScale]}`}
          style={{ textShadow: "0 1px 1px rgba(0,0,0,0.05)" }}
        >
          {exampleText || "(ĐỂ TRỐNG Ô NÀY NẾU CHƯA CÓ)"}
        </p>
      </div>

      {/* Ghi chú phụ nếu có */}
      {fieldNote && (
        <p className="text-xs sm:text-sm text-slate-500 font-medium italic">
          💡 Lưu ý: {fieldNote}
        </p>
      )}
    </div>
  );
}
