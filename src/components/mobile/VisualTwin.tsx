"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import { NormalizedBoundingBox } from "@/shared/contracts";

interface VisualTwinProps {
  scannedImageUrl?: string;
  highlightCoords: NormalizedBoundingBox;
  fieldLabel: string;
  stepNumber: number;
}

export function VisualTwin({
  scannedImageUrl,
  highlightCoords,
  fieldLabel,
  stepNumber,
}: VisualTwinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightBoxRef = useRef<HTMLDivElement>(null);

  const [ymin, xmin, ymax, xmax] = highlightCoords;

  // Tính toán vị trí phần trăm chuẩn hóa
  const boxTop = `${ymin * 100}%`;
  const boxLeft = `${xmin * 100}%`;
  const boxHeight = `${(ymax - ymin) * 100}%`;
  const boxWidth = `${(xmax - xmin) * 100}%`;

  // Tự động cuộn nhẹ đến vùng đang điền khi chuyển bước
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
  }, [highlightCoords]);

  return (
    <div className="w-full bg-slate-800 rounded-2xl overflow-hidden shadow-lg border-2 border-slate-700 flex flex-col">
      {/* Thanh trạng thái Bản sao thị giác */}
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between text-xs font-semibold text-slate-300 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>VỊ TRÍ Ô CẦN VIẾT TRÊN GIẤY</span>
        </div>
        <span className="text-emerald-400 font-mono">Ô số {stepNumber}</span>
      </div>

      {/* Khung cuộn hiển thị tờ khai */}
      <div
        ref={containerRef}
        className="relative w-full max-h-[290px] overflow-y-auto overflow-x-hidden bg-slate-900/60 scroll-smooth"
      >
        <div className="relative w-full aspect-[1200/1700]">
          {/* Ảnh scan phôi tờ khai gốc */}
          <Image
            src={scannedImageUrl || "/assets/test-form.svg"}
            alt="Bản sao thị giác tờ khai giấy"
            className="object-contain select-none pointer-events-none"
            fill
            priority
            sizes="(max-width: 448px) 100vw, 448px"
          />

          {/* Vòng viền phát sáng nhấp nháy dẫn đường (Pulsing Highlighter) */}
          <div
            ref={highlightBoxRef}
            style={{
              top: boxTop,
              left: boxLeft,
              height: boxHeight,
              width: boxWidth,
            }}
            className="absolute pulse-border-active rounded-md bg-emerald-500/15 pointer-events-none transition-all duration-300 z-20"
            aria-label={`Vùng đang hướng dẫn: ${fieldLabel}`}
          >
            {/* Nhãn gắn trực tiếp vào góc ô */}
            <span className="absolute -top-3.5 left-1 bg-afl-green text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-sm">
              ĐIỀN VÀO ĐÂY
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
