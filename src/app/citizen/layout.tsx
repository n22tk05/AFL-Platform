"use client";

import React from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CitizenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleResetSession = () => {
    if (
      confirm("Bác có chắc chắn muốn xóa thông tin và làm lại từ đầu không?")
    ) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
      }
      router.push("/citizen");
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 flex justify-center">
      {/* Container tràn viền trên mobile, tối đa max-w-xl trên tablet/desktop */}
      <div className="w-full max-w-xl min-h-screen bg-slate-50 flex flex-col shadow-sm border-x border-slate-200 relative">
        {/* Header Citizen */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b-2 border-emerald-800/20 px-4 py-3 flex items-center justify-between shadow-xs">
          <Link className="flex items-center gap-2" href="/citizen">
            <div className="w-9 h-9 rounded-xl bg-afl-green text-white flex items-center justify-center font-black text-base shadow-sm">
              AFL
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase leading-none tracking-wide">
                Trợ Lý Tờ Khai
              </h1>
              <p className="text-[11px] text-emerald-800 font-bold mt-0.5">
                Dành Cho Người Cao Tuổi
              </p>
            </div>
          </Link>
        </header>

        {/* Nội dung chính */}
        <main className="flex-1 flex flex-col">{children}</main>  
      </div>
    </div>
  );
}
