"use client";

import React, { useEffect, useRef } from "react";
import { NormalizedBoundingBox, FormPageMetadata } from "@/shared/contracts";

interface VisualTwinProps {
  pages: FormPageMetadata[];
  currentPageNumber: number;
  highlightCoords: NormalizedBoundingBox;
  fieldLabel: string;
  stepNumber?: number;
}

export function VisualTwin({
  pages = [],
  currentPageNumber = 1,
  highlightCoords,
  fieldLabel,
  stepNumber: _stepNumber,
}: VisualTwinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightBoxRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find((p) => p.pageNumber === currentPageNumber) || pages[0];
  const [ymin, xmin, ymax, xmax] = highlightCoords;

  const boxTop = `${ymin * 100}%`;
  const boxLeft = `${xmin * 100}%`;
  const boxHeight = `${(ymax - ymin) * 100}%`;
  const boxWidth = `${(xmax - xmin) * 100}%`;

  // Tự động căn chỉnh mượt mà để ô cần điền luôn nằm ở vị trí dễ nhìn nhất
  useEffect(() => {
    if (highlightBoxRef.current && containerRef.current) {
      const container = containerRef.current;
      const target = highlightBoxRef.current;
      const targetTop = target.offsetTop;
      const containerHeight = container.clientHeight;

      container.scrollTo({
        top: Math.max(0, targetTop - containerHeight / 3),
        behavior: "smooth",
      });
    }
  }, [highlightCoords, currentPageNumber]);

  return (
    <div className="w-full bg-white rounded-2xl overflow-hidden shadow-md border-2 border-slate-300 flex flex-col">
      {/* Thanh trạng thái tối giản */}
      <div className="bg-afl-green px-4 py-2 flex items-center justify-between text-xs font-bold text-white">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D32F2F] animate-ping" />
          <span className="tracking-wide uppercase">VỊ TRÍ Ô CẦN VIẾT TRÊN GIẤY</span>
        </div>
        <span className="bg-white/15 px-2 py-0.5 rounded font-mono text-[11px] text-slate-200">
          TRANG {currentPageNumber} / {pages.length || 1}
        </span>
      </div>

      {/* Khung cuộn ẩn thanh trượt chứa ảnh tĩnh tờ khai */}
      <div
        ref={containerRef}
        className="relative w-full max-h-[310px] overflow-y-auto overflow-x-hidden bg-slate-100 no-scrollbar select-none"
      >
        <div className="relative w-full">
          {/* Ảnh scan tĩnh tự nhiên, không bị méo tỉ lệ hay letterbox */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activePage?.imageUrl || "/assets/forms/01-lptb/page-1.jpg"}
            alt={`Tờ khai trang ${currentPageNumber}`}
            className="w-full h-auto block select-none pointer-events-none"
          />

          {/* VÙNG KHUNG MÀU ĐỎ NHẤP NHÁY VÀ NHÃN NẰM TRÊN CẠNH TRÊN */}
          <div
            ref={highlightBoxRef}
            style={{
              top: boxTop,
              left: boxLeft,
              height: boxHeight,
              width: boxWidth,
            }}
            className="absolute pulse-border-red rounded bg-[#D32F2F]/10 pointer-events-none transition-all duration-200 z-20"
            aria-label={`Vị trí ô: ${fieldLabel}`}
          >
            {/* Nhãn chú thích đặt nổi hẳn lên phía trên mép khung, không đè nội dung */}
            <div className="absolute bottom-full mb-1.5 left-0 z-30 pointer-events-none whitespace-nowrap">
              <span className="bg-[#D32F2F] text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded shadow-md tracking-wider uppercase inline-flex items-center gap-1">
                VIẾT VÀO Ô NÀY
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
