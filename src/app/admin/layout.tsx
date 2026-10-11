"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AdminSessionProvider } from '@/modules/forms/admin-session.client';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSessionProvider>
      <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
        {/* Header Desktop dành cho Cán bộ Quản trị - đặt offset dưới PageNavigation */}
        <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between border-b border-slate-800 shadow-md sticky top-16 sm:top-20 z-40">
          <div className="flex items-center gap-4">
            <div className="h-5 w-px bg-slate-700" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm">
                AFL
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wide uppercase leading-tight">
                  Cổng Kiểm Duyệt Biểu Mẫu Hành Chính
                </h1>
                <p className="text-[11px] text-emerald-400 font-medium">
                  Phân hệ Chuyên viên Một cửa
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Chế độ kiểm duyệt pháp lý</span>
            </div>
          </div>
        </header>

        {/* Vùng làm việc chính */}
        <main className="flex-1 flex overflow-hidden">{children}</main>
      </div>
    </AdminSessionProvider>
  );
}
