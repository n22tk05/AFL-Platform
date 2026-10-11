"use client";

import React from "react";

export default function CitizenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col">
      {/* Vùng nội dung mở rộng toàn màn hình khớp chuẩn Desktop & Tablet */}
      <div className="flex-1 flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}
