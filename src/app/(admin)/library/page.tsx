"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  ListFilter,
  FileText,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Search,
  Tag,
  BookOpen,
} from "lucide-react";
import initialTemplates from "../../../../assets/mock-data/mock-admin-templates.json";
import { FormUploadModal } from "@/components/admin/FormUploadModal";

export default function AdminLibraryPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED">("ALL");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);

  // Khôi phục thêm các biểu mẫu vừa lưu trong localStorage
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage);
      const customForms: typeof initialTemplates = [];
      const updatedInitial = [...initialTemplates];

      keys.forEach((key) => {
        if (key.startsWith("afl_workflow_published_")) {
          const item = JSON.parse(localStorage.getItem(key) || "{}");
          if (item.templateId) {
            const rawStatus = (item.status ? String(item.status).toUpperCase() : "DRAFT");
            const normalizedStatus = (rawStatus === "ACTIVE" || rawStatus === "ARCHIVED" ? rawStatus : "DRAFT");
            const existingIdx = updatedInitial.findIndex((t) => t.id === item.templateId);

            if (existingIdx !== -1) {
              updatedInitial[existingIdx] = {
                ...updatedInitial[existingIdx],
                version: item.version || updatedInitial[existingIdx].version,
                totalSteps: item.totalSteps || item.steps?.length || updatedInitial[existingIdx].totalSteps,
                status: normalizedStatus,
                publishedAt: item.publishedAt || updatedInitial[existingIdx].publishedAt,
              };
            } else {
              customForms.push({
                id: item.templateId,
                formCode: item.formCode || "MẪU_MỚI",
                title: item.formTitleVi || item.formTitle || "Biểu mẫu tùy chỉnh",
                legalBasis: item.circularInfo || "Kê khai hành chính",
                department: "Bộ phận Một cửa",
                version: item.version || 1,
                totalSteps: item.totalSteps || item.steps?.length || 0,
                totalPages: item.totalPages || 1,
                status: normalizedStatus,
                publishedAt: item.publishedAt || new Date().toISOString(),
                thumbnailUrl: item.pages?.[0]?.imageUrl || "/assets/forms/01-lptb/page-1.jpg",
              });
            }
          }
        }
      });

      setTemplates([...customForms, ...updatedInitial]);
    } catch (e) {
      console.warn("Local storage parse error", e);
    }
  }, []);

  const filteredTemplates = templates.filter((tpl) => {
    const matchesSearch =
      tpl.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tpl.formCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tpl.legalBasis.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || tpl.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full min-h-[calc(100vh-61px)] bg-slate-100 flex flex-col p-6 sm:p-8 space-y-6">
      {/* Component Modal Tải Lên & Quét AI */}
      <FormUploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      {/* 1. THANH TIÊU ĐỀ & NÚT THÊM BIỂU MẪU MỚI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-300 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-emerald-800 uppercase tracking-wider mb-1">
            <span>Cơ sở Dữ liệu Biểu mẫu Hành chính</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
            Thư Viện Biểu Mẫu Đã Ban Hành
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Quản lý, đối soát Bounding Box và xuất bản các kịch bản hướng dẫn người cao tuổi
          </p>
        </div>

        {/* Nút Hero: Tải Biểu Mẫu Mới */}
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="min-h-[48px] px-5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>TẢI LÊN BIỂU MẪU MỚI</span>
        </button>
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, LỌC VÀ CHUYỂN ĐỔI CHẾ ĐỘ XEM */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Ô tìm kiếm */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã tờ khai, tên thủ tục hoặc văn bản..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs font-bold pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm text-slate-800"
          />
        </div>

        {/* Bộ lọc trạng thái & Toggle Lưới/Bảng */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-sm">
            {(["ALL", "ACTIVE", "DRAFT", "ARCHIVED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                  statusFilter === st
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {st === "ALL"
                  ? "Tất cả"
                  : st === "ACTIVE"
                  ? "Đang áp dụng"
                  : st === "DRAFT"
                  ? "Bản nháp"
                  : "Lưu trữ"}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-emerald-100 text-emerald-900"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Xem dạng thẻ lưới"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "table"
                  ? "bg-emerald-100 text-emerald-900"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Xem dạng danh sách bảng"
            >
              <ListFilter className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. HIỂN THỊ DANH SÁCH BIỂU MẪU */}
      {viewMode === "grid" ? (
        /* DẠNG THẺ LƯỚI (GRID CARDS) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-2xl border border-slate-300 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden group"
            >
              {/* Ảnh thu nhỏ và nhãn phiên bản */}
              <div className="relative h-44 bg-slate-200 overflow-hidden border-b border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tpl.thumbnailUrl}
                  alt={tpl.title}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />

                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="font-mono text-xs font-black bg-white/95 text-slate-900 px-2 py-0.5 rounded shadow">
                    {tpl.formCode}
                  </span>
                  <span className="font-mono text-xs font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded shadow">
                    v{tpl.version}
                  </span>
                </div>

                <div className="absolute top-3 right-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow border ${
                      tpl.status === "ACTIVE"
                        ? "bg-emerald-500/95 text-white border-emerald-400"
                        : tpl.status === "ARCHIVED"
                        ? "bg-slate-600/95 text-white border-slate-500"
                        : "bg-amber-400/95 text-slate-950 border-amber-300"
                    }`}
                  >
                    {tpl.status === "ACTIVE"
                      ? "Đang áp dụng"
                      : tpl.status === "ARCHIVED"
                      ? "Lưu trữ"
                      : "Bản nháp"}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <span className="text-[11px] font-medium text-emerald-300 block line-clamp-1">
                    {tpl.department}
                  </span>
                  <h3 className="font-black text-base leading-snug line-clamp-1 drop-shadow">
                    {tpl.title}
                  </h3>
                </div>
              </div>

              {/* Thông tin chi tiết */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5 text-xs text-slate-600">
                  <p className="line-clamp-2 font-medium" title={tpl.legalBasis}>
                    <strong>Căn cứ:</strong> {tpl.legalBasis}
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-bold">
                    <span>{tpl.totalPages} trang</span>
                    <span>•</span>
                    <span>{tpl.totalSteps} bước hướng dẫn</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(tpl.publishedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                {/* Các nút hành động */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={`/guide?templateId=${tpl.id}`}
                    target="_blank"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Xem Citizen</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => router.push(`/admin/review/${tpl.id}`)}
                    className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Chỉnh sửa & Căn ô</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* DẠNG DANH SÁCH BẢNG (TABLE COLUMNS) */
        <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-black uppercase text-[11px] tracking-wider border-b border-slate-800">
                  <th className="p-4">Mã & Phiên bản</th>
                  <th className="p-4">Tên Biểu Mẫu</th>
                  <th className="p-4">Căn Cứ Pháp Lý</th>
                  <th className="p-4 text-center">Số Trang / Bước</th>
                  <th className="p-4 text-center">Trạng Thái</th>
                  <th className="p-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                {filteredTemplates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                          {tpl.formCode}
                        </span>
                        <span className="font-mono font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                          v{tpl.version}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-black text-slate-900 text-sm">{tpl.title}</div>
                      <div className="text-[11px] text-slate-500">{tpl.department}</div>
                    </td>
                    <td className="p-4 max-w-xs">
                      <p className="line-clamp-2 text-slate-600">{tpl.legalBasis}</p>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-bold text-slate-900">{tpl.totalPages} trang</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-emerald-700 font-bold">{tpl.totalSteps} bước</span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                          tpl.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : tpl.status === "ARCHIVED"
                            ? "bg-slate-100 text-slate-700 border-slate-300"
                            : "bg-amber-100 text-amber-900 border-amber-300"
                        }`}
                      >
                        {tpl.status === "ACTIVE"
                          ? "Đang áp dụng"
                          : tpl.status === "ARCHIVED"
                          ? "Lưu trữ"
                          : "Bản nháp"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/guide?templateId=${tpl.id}`}
                          target="_blank"
                          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Xem thử giao diện Người dân"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/review/${tpl.id}`)}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-black text-xs flex items-center gap-1 active:scale-95 shadow-sm transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Kiểm duyệt</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
