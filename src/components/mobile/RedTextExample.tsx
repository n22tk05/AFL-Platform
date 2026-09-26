"use client";

import React, { useState } from "react";
import { ZoomIn, ZoomOut, PenTool } from "lucide-react";

interface RedTextExampleProps {
  exampleText: string;
  fieldNote?: string;
}

export function RedTextExample({ exampleText, fieldNote }: RedTextExampleProps) {
  const [fontScale, setFontScale] = useState<number>(0);

  const fontClasses = [
    "text-xl leading-snug",      // ~20px (>= 18pt)
    "text-2xl leading-snug",     // ~25px
    "text-[28px] leading-tight", // ~28-30px
  ];

  return (
    <div className="w-full bg-white rounded-2xl border-2 border-slate-300 p-4 shadow-sm flex flex-col gap-2.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2 text-slate-800">
          <PenTool className="w-4 h-4 text-[#D32F2F] shrink-0" />
          <span className="font-extrabold text-xs sm:text-sm tracking-wide uppercase">
            CHỮ MẪU ĐỂ BÁC CHÉP THEO:
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFontScale((p) => Math.max(0, p - 1))}
            disabled={fontScale === 0}
            className="w-8 h-8 rounded bg-white disabled:opacity-40 border border-slate-300 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Thu nhỏ chữ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setFontScale((p) => Math.min(2, p + 1))}
            disabled={fontScale === 2}
            className="w-8 h-8 rounded bg-white disabled:opacity-40 border border-slate-300 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Phóng to chữ"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-[#FFFDF8] border-2 border-dashed border-slate-300 rounded-xl p-3.5 flex items-center justify-center text-center min-h-[80px]">
        <p className={`font-black tracking-wide uppercase text-[#D32F2F] break-words ${fontClasses[fontScale]}`}>
          {exampleText || "(ĐỂ TRỐNG Ô NÀY NẾU CHƯA CÓ)"}
        </p>
      </div>

      {fieldNote && (
        <p className="text-xs text-slate-500 font-medium">
          💡 Lưu ý: {fieldNote}
        </p>
      )}
    </div>
  );
}
