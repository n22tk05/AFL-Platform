"use client";

import React, { useRef, useState } from "react";
import { NormalizedBoundingBox, FormPageMetadata } from "@/shared/contracts";
import { Move, Crop } from "lucide-react";

interface AdminVisualTwinEditorProps {
  pages: FormPageMetadata[];
  currentPageNumber: number;
  onPageChange: (page: number) => void;
  highlightCoords: NormalizedBoundingBox;
  onCoordsChange: (newCoords: NormalizedBoundingBox) => void;
  fieldLabel: string;
}

type InteractionType =
  | "move"
  | "nw"
  | "ne"
  | "se"
  | "sw"
  | "n"
  | "s"
  | "w"
  | "e"
  | "draw";

export function AdminVisualTwinEditor({
  pages = [],
  currentPageNumber = 1,
  onPageChange,
  highlightCoords,
  onCoordsChange,
  fieldLabel,
}: AdminVisualTwinEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find((p) => p.pageNumber === currentPageNumber) ||
    pages[0] || {
      pageNumber: 1,
      imageUrl: "/assets/forms/01-lptb/page-1.jpg",
      width: 1200,
      height: 1700,
    };

  const [mode, setMode] = useState<"drag" | "draw">("drag");
  const [ymin, xmin, ymax, xmax] = highlightCoords;

  const boxTop = `${ymin * 100}%`;
  const boxLeft = `${xmin * 100}%`;
  const boxHeight = `${Math.max(0.005, ymax - ymin) * 100}%`;
  const boxWidth = `${Math.max(0.005, xmax - xmin) * 100}%`;

  // Khởi động thao tác kéo thả (di chuyển, co giãn 8 điểm neo, hoặc vẽ mới)
  const startInteraction = (e: React.MouseEvent, type: InteractionType) => {
    e.stopPropagation();
    e.preventDefault();
    if (!imageWrapperRef.current) return;

    const rect = imageWrapperRef.current.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialBox: NormalizedBoundingBox = [...highlightCoords];

    // Nếu vẽ ô mới: tạo ô khởi điểm ngay tại điểm click
    if (type === "draw") {
      const clickX = Math.max(
        0,
        Math.min(1, (startClientX - rect.left) / rect.width),
      );
      const clickY = Math.max(
        0,
        Math.min(1, (startClientY - rect.top) / rect.height),
      );
      onCoordsChange([
        parseFloat(clickY.toFixed(4)),
        parseFloat(clickX.toFixed(4)),
        parseFloat(Math.min(1, clickY + 0.02).toFixed(4)),
        parseFloat(Math.min(1, clickX + 0.1).toFixed(4)),
      ]);
    }

    // Lắng nghe chuột toàn màn hình (Window Tracking) chống đứt gãy cử chỉ
    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      if (!imageWrapperRef.current) return;
      const currentRect = imageWrapperRef.current.getBoundingClientRect();

      if (type === "draw") {
        const startX = Math.max(
          0,
          Math.min(1, (startClientX - currentRect.left) / currentRect.width),
        );
        const startY = Math.max(
          0,
          Math.min(1, (startClientY - currentRect.top) / currentRect.height),
        );
        const currentX = Math.max(
          0,
          Math.min(
            1,
            (moveEvent.clientX - currentRect.left) / currentRect.width,
          ),
        );
        const currentY = Math.max(
          0,
          Math.min(
            1,
            (moveEvent.clientY - currentRect.top) / currentRect.height,
          ),
        );

        const newYmin = parseFloat(Math.min(startY, currentY).toFixed(4));
        const newXmin = parseFloat(Math.min(startX, currentX).toFixed(4));
        const newYmax = parseFloat(Math.max(startY, currentY).toFixed(4));
        const newXmax = parseFloat(Math.max(startX, currentX).toFixed(4));

        if (newYmax - newYmin >= 0.002 && newXmax - newXmin >= 0.005) {
          onCoordsChange([newYmin, newXmin, newYmax, newXmax]);
        }
      } else if (type === "move") {
        const deltaX = (moveEvent.clientX - startClientX) / currentRect.width;
        const deltaY = (moveEvent.clientY - startClientY) / currentRect.height;
        const [initYmin, initXmin, initYmax, initXmax] = initialBox;
        const w = initXmax - initXmin;
        const h = initYmax - initYmin;

        const newXmin = Math.max(0, Math.min(1 - w, initXmin + deltaX));
        const newYmin = Math.max(0, Math.min(1 - h, initYmin + deltaY));
        const newXmax = newXmin + w;
        const newYmax = newYmin + h;

        onCoordsChange([
          parseFloat(newYmin.toFixed(4)),
          parseFloat(newXmin.toFixed(4)),
          parseFloat(newYmax.toFixed(4)),
          parseFloat(newXmax.toFixed(4)),
        ]);
      } else {
        // Co giãn qua 8 điểm neo tương tác
        const deltaX = (moveEvent.clientX - startClientX) / currentRect.width;
        const deltaY = (moveEvent.clientY - startClientY) / currentRect.height;
        let [y1, x1, y2, x2] = initialBox;
        const minDim = 0.005;

        switch (type) {
          case "nw":
            y1 = Math.min(y2 - minDim, Math.max(0, y1 + deltaY));
            x1 = Math.min(x2 - minDim, Math.max(0, x1 + deltaX));
            break;
          case "ne":
            y1 = Math.min(y2 - minDim, Math.max(0, y1 + deltaY));
            x2 = Math.max(x1 + minDim, Math.min(1, x2 + deltaX));
            break;
          case "se":
            y2 = Math.max(y1 + minDim, Math.min(1, y2 + deltaY));
            x2 = Math.max(x1 + minDim, Math.min(1, x2 + deltaX));
            break;
          case "sw":
            y2 = Math.max(y1 + minDim, Math.min(1, y2 + deltaY));
            x1 = Math.min(x2 - minDim, Math.max(0, x1 + deltaX));
            break;
          case "n":
            y1 = Math.min(y2 - minDim, Math.max(0, y1 + deltaY));
            break;
          case "s":
            y2 = Math.max(y1 + minDim, Math.min(1, y2 + deltaY));
            break;
          case "w":
            x1 = Math.min(x2 - minDim, Math.max(0, x1 + deltaX));
            break;
          case "e":
            x2 = Math.max(x1 + minDim, Math.min(1, x2 + deltaX));
            break;
        }

        onCoordsChange([
          parseFloat(y1.toFixed(4)),
          parseFloat(x1.toFixed(4)),
          parseFloat(y2.toFixed(4)),
          parseFloat(x2.toFixed(4)),
        ]);
      }
    };

    const handleGlobalMouseUp = () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 border-r border-slate-300 overflow-hidden select-none">
      {/* Toolbar điều khiển phía trên ảnh scan */}
      <div className="bg-white px-4 py-2.5 border-b border-slate-300 flex items-center justify-between gap-3 shrink-0">
        {/* Bộ chọn trang */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase">
            Trang:
          </span>
          {pages.map((p) => (
            <button
              key={p.pageNumber}
              type="button"
              onClick={() => onPageChange(p.pageNumber)}
              className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                currentPageNumber === p.pageNumber
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
              }`}
            >
              Trang {p.pageNumber}
            </button>
          ))}
        </div>

        {/* Chế độ tương tác chuột */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">
            Thao tác:
          </span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setMode("drag")}
              className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                mode === "drag"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span>Chỉnh sửa</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("draw")}
              className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                mode === "draw"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Vẽ ô mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Khung cuộn hiển thị tài liệu scan */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-6 flex justify-center items-start bg-slate-300/80 no-scrollbar"
      >
        <div
          ref={imageWrapperRef}
          onMouseDown={(e) => {
            if (mode === "draw") {
              startInteraction(e, "draw");
            }
          }}
          className={`relative max-w-[850px] w-full bg-white shadow-2xl rounded border border-slate-400 select-none ${
            mode === "draw" ? "cursor-crosshair" : "cursor-default"
          }`}
        >
          {/* Ảnh scan tài liệu gốc */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activePage?.imageUrl || "/assets/forms/01-lptb/page-1.jpg"}
            alt="Biểu mẫu cần đối soát"
            className="w-full h-auto block pointer-events-none select-none"
            draggable={false}
          />

          {/* Vùng khung viền đỏ highlight */}
          <div
            style={{
              top: boxTop,
              left: boxLeft,
              height: boxHeight,
              width: boxWidth,
            }}
            className="absolute border-2 border-[#D32F2F] bg-[#D32F2F]/15 z-20 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
          >
            {/* Nhãn nổi ở cạnh trên */}
            <div className="absolute bottom-full mb-1.5 left-0 z-30 pointer-events-none whitespace-nowrap">
              <span className="bg-[#D32F2F] text-white text-[10px] font-black px-2 py-0.5 rounded shadow tracking-wider uppercase inline-flex items-center gap-1">
                {fieldLabel || "VỊ TRÍ CẦN ĐIỀN"}
              </span>
            </div>

            {/* Vùng thân ô kéo di chuyển (Move Area) */}
            <div
              onMouseDown={(e) => {
                if (mode === "drag") {
                  startInteraction(e, "move");
                }
              }}
              className="absolute inset-0 cursor-move pointer-events-auto bg-[#D32F2F]/5 hover:bg-[#D32F2F]/20 transition-colors"
              title="Nhấn giữ và kéo để di chuyển ô"
            />

            {/* 8 Điểm neo co giãn tương tác (Interactive Resize Handles) */}
            {/* 4 Góc */}
            <div
              onMouseDown={(e) => startInteraction(e, "nw")}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn góc trên-trái"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "ne")}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn góc trên-phải"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "se")}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn góc dưới-phải"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "sw")}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn góc dưới-trái"
            />

            {/* 4 Cạnh */}
            <div
              onMouseDown={(e) => startInteraction(e, "n")}
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-ns-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn cạnh trên"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "s")}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-ns-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn cạnh dưới"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "w")}
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-ew-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn cạnh trái"
            />
            <div
              onMouseDown={(e) => startInteraction(e, "e")}
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#D32F2F] rounded-full cursor-ew-resize shadow-md hover:scale-125 transition-transform z-30 pointer-events-auto"
              title="Kéo giãn cạnh phải"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
