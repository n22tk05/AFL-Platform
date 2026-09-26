"use client";

import React from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
import { ShieldAlert, Sun } from "lucide-react";

export default function CitizenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLocked } = useWakeLock();

  const handleResetSession = () => {
    if (confirm("Bác có chắc muốn hủy phiên và xóa toàn bộ dữ liệu tạm thời không?")) {
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 flex justify-center items-stretch sm:py-4">
      <main className="w-full max-w-md min-h-screen sm:min-h-[844px] bg-afl-bg flex flex-col shadow-2xl border-x border-slate-300 relative overflow-hidden">
        {/* Header Trợ Năng Cho Người Cao Tuổi */}
        <header className="bg-white border-b-2 border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-afl-green text-white flex items-center justify-center font-bold text-lg shadow-sm">
              AFL
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                Trợ Lý Biểu Mẫu
              </h1>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Sun className={`w-3.5 h-3.5 ${isLocked ? "text-amber-500 fill-amber-500" : "text-slate-400"}`} />
                <span>{isLocked ? "Màn hình luôn sáng" : "Màn hình tự khóa"}</span>
              </div>
            </div>
          </div>

          {/* Nút Hủy Phiên & Xóa Sạch Dữ Liệu Theo Nghị Định 13 */}
          <button
            onClick={handleResetSession}
            aria-label="Hủy phiên và xóa dữ liệu tạm thời"
            className="min-h-touch px-3 py-1.5 bg-red-50 hover:bg-red-100 text-afl-red border-2 border-afl-red rounded-lg font-bold text-sm flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <ShieldAlert className="w-4 h-4 shrink-0"/>
            <span>Xóa phiên</span>
          </button>
        </header>

        {/* Khung nội dung màn hình di động */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
