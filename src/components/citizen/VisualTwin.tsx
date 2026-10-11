"use client";

import React, { useEffect, useRef } from "react";
import { NormalizedBoundingBox, FormPageMetadata, FormInputKind, FormInputRegion } from "@/shared/contracts";
import { normalizeCoordsToBoxStyle } from "@/shared/utils/geometry";

interface VisualTwinProps {
  pages: FormPageMetadata[];
  currentPageNumber: number;
  highlightCoords: NormalizedBoundingBox;
  highlightRegions?: FormInputRegion[];
  inputKind?: FormInputKind;
  fieldLabel: string;
  stepNumber?: number;
  exampleRedText?: string;
}


export function computeDynamicFontSize(text: string, coords: NormalizedBoundingBox): number {
  if (!text) return 12;
  const widthRatio = Math.max(0.01, coords[3] - coords[1]);
  const length = Math.max(1, text.length);
  const approxPxWidth = widthRatio * 480;
  const idealSize = (approxPxWidth / length) * 1.4;
  return Math.min(15, Math.max(8, Math.round(idealSize)));
}

export function VisualTwin({
  pages = [],
  currentPageNumber = 1,
  highlightCoords,
  highlightRegions,
  inputKind,
  fieldLabel,
  stepNumber: _stepNumber,
  exampleRedText,
}: VisualTwinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightBoxRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find((page) => page.pageNumber === currentPageNumber);
  const regions = highlightRegions ?? [{ regionId: 'legacy', pageNumber: currentPageNumber, normalizedCoords: highlightCoords }];
  const visibleRegions = regions.filter(region => region.pageNumber === currentPageNumber);
  const actionLabel = inputKind === 'checkbox' ? 'TÍCH CHỌN TẠI ĐÂY' : inputKind === 'character_slots' ? 'MỖI KÝ TỰ MỘT Ô' : inputKind === 'multiline_text' ? 'VIẾT TRÊN CÁC DÒNG NÀY' : 'VIẾT VÀO Ô NÀY';

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

  if (!activePage?.imageUrl) return <p role="status">Chưa có ảnh phôi cho trang {currentPageNumber}; không thay bằng biểu mẫu khác.</p>;

  return (
    <div className="w-full bg-white rounded-2xl overflow-hidden shadow-md border-2 border-slate-300 flex flex-col">
      {/* Thanh trạng thái tối giản */}
      <div className="bg-afl-green px-4 py-2 flex items-center justify-between text-xs font-bold text-white">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D32F2F] animate-ping" />
          <span className="tracking-wide uppercase">{inputKind === 'checkbox' ? 'VỊ TRÍ CẦN TÍCH CHỌN TRÊN GIẤY' : 'VỊ TRÍ Ô CẦN VIẾT TRÊN GIẤY'}</span>
        </div>
        <span className="bg-white/15 px-2 py-0.5 rounded font-mono text-[11px] text-slate-200">
          TRANG {currentPageNumber} / {pages.length || 1}
        </span>
      </div>

      {/* Khung cuộn ẩn thanh trượt chứa ảnh tĩnh tờ khai */}
      <div
        ref={containerRef}
        className="relative w-full max-h-[310px] md:max-h-[calc(100vh-16rem)] lg:max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-hidden bg-slate-100 no-scrollbar select-none"
      >
        <div className="relative w-full">
          {/* Ảnh scan tĩnh tự nhiên, không bị méo tỉ lệ hay letterbox */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activePage.imageUrl}
            alt={`Tờ khai trang ${currentPageNumber}`}
            className="w-full h-auto block select-none pointer-events-none"
          />

          {/* VÙNG KHUNG MÀU ĐỎ NHẤP NHÁY VÀ NHÃN NẰM TRÊN CẠNH TRÊN */}
          {visibleRegions.map((region, index) => <div
            key={region.regionId}
            ref={index === 0 ? highlightBoxRef : undefined}
            style={normalizeCoordsToBoxStyle(region.normalizedCoords)}
            data-testid="field-highlight-region"
            className="absolute pulse-border-red rounded bg-afl-red/10 pointer-events-none transition-all duration-200 z-20"
            aria-label={`Vị trí ô: ${fieldLabel}, vùng ${index + 1}`}
          >
            {/* Nhãn chú thích đặt nổi hẳn lên phía trên mép khung, không đè nội dung */}
            {index === 0 && <div className="absolute bottom-full mb-1.5 left-0 z-30 pointer-events-none whitespace-nowrap">
              <span className="bg-afl-red text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded shadow-md tracking-wider uppercase inline-flex items-center gap-1">
                {actionLabel}
              </span>
            </div>}

            {/* Chữ mẫu tương phản cao tự động co dãn theo kích thước ô thực tế */}
            {exampleRedText && index === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-0.5 overflow-hidden select-none pointer-events-none">
                {inputKind === 'checkbox' ? (
                  <span className="font-black text-afl-red text-xs sm:text-sm drop-shadow-xs">✓</span>
                ) : (
                  <span
                    className="font-extrabold text-afl-red/85 uppercase tracking-wide truncate px-0.5 leading-none drop-shadow-xs"
                    style={{
                      fontSize: `${computeDynamicFontSize(exampleRedText, region.normalizedCoords)}px`,
                    }}
                    title={exampleRedText}
                  >
                    {exampleRedText}
                  </span>
                )}
              </div>
            )}
          </div>)}
        </div>
      </div>
    </div>
  );
}
