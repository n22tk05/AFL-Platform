"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  ListFilter,
  Clock,
  Edit3,
  ExternalLink,
  Search,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import initialTemplates from "../../../../assets/mock-data/mock-admin-templates.json";
import { FormUploadModal } from "@/components/admin/FormUploadModal";
import { FormStorageService } from "@/shared/services/form-storage";

export type FormStatusType = "ALL" | "ACTIVE" | "PENDING_REVIEW" | "DRAFT" | "ARCHIVED";

const STATUS_ORDER_PRIORITY: Record<string, number> = {
  ACTIVE: 1,
  PENDING_REVIEW: 2,
  DRAFT: 3,
  ARCHIVED: 4,
};

export interface LibraryTemplateItem {
  id: string;
  formCode: string;
  title: string;
  legalBasis: string;
  department: string;
  version: number;
  totalSteps: number;
  totalPages: number;
  status: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export default function AdminLibraryPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FormStatusType>("ALL");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [templates, setTemplates] = useState<LibraryTemplateItem[]>(
    initialTemplates as LibraryTemplateItem[]
  );

  // Khôi phục thêm các biểu mẫu vừa lưu trong localStorage
  const refreshTemplates = useCallback(() => {
    try {
      const forms = FormStorageService.getAllAdminForms();
      setTemplates(forms as LibraryTemplateItem[]);
    } catch (e) {
      console.warn("Lỗi đồng bộ localStorage thư viện:", e);
    }
  }, []);

  useEffect(() => {
    refreshTemplates();
    window.addEventListener("storage", refreshTemplates);
    window.addEventListener("afl:form-updated", refreshTemplates);
    window.addEventListener("focus", refreshTemplates);

    return () => {
      window.removeEventListener("storage", refreshTemplates);
      window.removeEventListener("afl:form-updated", refreshTemplates);
      window.removeEventListener("focus", refreshTemplates);
    };
  }, [refreshTemplates]);

  // Đếm số lượng theo trạng thái
  const counts = {
    all: templates.length,
    active: templates.filter((t) => t.status === "ACTIVE").length,
    pending: templates.filter((t) => t.status === "PENDING_REVIEW").length,
    draft: templates.filter((t) => t.status === "DRAFT" || !t.status).length,
    archived: templates.filter((t) => t.status === "ARCHIVED").length,
  };

  // 1. Lọc theo từ khóa tìm kiếm và tab trạng thái
  const filteredTemplates = templates.filter((tpl) => {
    const matchesSearch =
      tpl.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tpl.formCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tpl.legalBasis && tpl.legalBasis.toLowerCase().includes(searchTerm.toLowerCase()));

    const currentStatus = (tpl.status || "DRAFT").toUpperCase();
    const matchesStatus = statusFilter === "ALL" || currentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // 2. SẮP XẾP ƯU TIÊN: ACTIVE -> PENDING_REVIEW -> DRAFT -> ARCHIVED
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    const statusA = (a.status || "DRAFT").toUpperCase();
    const statusB = (b.status || "DRAFT").toUpperCase();

    const priorityA = STATUS_ORDER_PRIORITY[statusA] ?? 99;
    const priorityB = STATUS_ORDER_PRIORITY[statusB] ?? 99;

    // Tiêu chí 1: Sắp xếp theo nhóm trạng thái
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Tiêu chí 2: Cùng trạng thái thì xếp theo ngày tạo / ban hành mới nhất
    const timeA = new Date(a.publishedAt || 0).getTime();
    const timeB = new Date(b.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-sm">
            <span>🟢</span> <span>Đang áp dụng</span>
          </span>
        );
      case "PENDING_REVIEW":
        return (
          <span className="bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-sm animate-pulse">
            <span>🔵</span> <span>Chờ thẩm định</span>
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-sm">
            <span>⚪</span> <span>Lưu trữ</span>
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-sm">
            <span>🟡</span> <span>Bản nháp</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-61px)] bg-slate-100 flex flex-col p-6 sm:p-8 space-y-6">
      {/* Component Modal Tải Lên & Quét AI */}
      <FormUploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      {/* 1. THANH TIÊU ĐỀ & NÚT THÊM BIỂU MẪU MỚI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-300 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-emerald-800 uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Cơ sở Dữ liệu Biểu mẫu Hành chính</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
            Thư Viện Biểu Mẫu Dịch Vụ Công
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Quản trị vòng đời biểu mẫu từ khâu tải lên, thẩm định đến ban hành chính thức
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

      {/* Thông báo biểu mẫu chờ thẩm định */}
      {counts.pending > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl flex items-center justify-between text-xs text-blue-950 font-bold shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
            <span>
              Hiện có <strong>{counts.pending} biểu mẫu</strong> đang ở trạng thái{" "}
              <strong>Chờ thẩm định</strong> cần cán bộ pháp chế phê duyệt.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING_REVIEW")}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black active:scale-95 transition-all shadow-sm"
          >
            Xem ngay
          </button>
        </div>
      )}

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

        {/* Bộ lọc 4 trạng thái & Toggle Lưới/Bảng */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-sm flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                statusFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tất cả ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                statusFilter === "ACTIVE"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-emerald-800 hover:bg-emerald-50"
              }`}
            >
              Đang áp dụng ({counts.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("PENDING_REVIEW")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                statusFilter === "PENDING_REVIEW"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-800 hover:bg-blue-50"
              }`}
            >
              Chờ thẩm định ({counts.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("DRAFT")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                statusFilter === "DRAFT"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-amber-800 hover:bg-amber-50"
              }`}
            >
              Bản nháp ({counts.draft})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ARCHIVED")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                statusFilter === "ARCHIVED"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Lưu trữ ({counts.archived})
            </button>
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
          {sortedTemplates.map((tpl) => (
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
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />

                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="font-mono text-xs font-black bg-white/95 text-slate-900 px-2 py-0.5 rounded shadow">
                    {tpl.formCode}
                  </span>
                  <span className="font-mono text-xs font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded shadow">
                    v{tpl.version}
                  </span>
                </div>

                <div className="absolute top-3 right-3">{getStatusBadge(tpl.status)}</div>

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
                    <span>{tpl.totalSteps} bước</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(tpl.publishedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                {/* Các nút hành động */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {tpl.status === "ACTIVE" ? (
                    <Link
                      href={`/citizen/guide?templateId=${tpl.id}`}
                      target="_blank"
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Xem Citizen</span>
                    </Link>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 italic px-2">
                      (Chưa áp dụng cho dân)
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/admin/review/${tpl.id}`)}
                    className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>
                      {tpl.status === "PENDING_REVIEW" ? "Thẩm định ngay" : "Chỉnh sửa & Căn ô"}
                    </span>
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
                  <th className="p-4">Mã & Bản</th>
                  <th className="p-4">Tên Biểu Mẫu</th>
                  <th className="p-4">Căn Cứ Pháp Lý</th>
                  <th className="p-4 text-center">Trạng Thái</th>
                  <th className="p-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                {sortedTemplates.map((tpl) => (
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
                    <td className="p-4 text-center">{getStatusBadge(tpl.status)}</td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/review/${tpl.id}`)}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-black text-xs inline-flex items-center gap-1 active:scale-95 shadow-sm transition-all"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{tpl.status === "PENDING_REVIEW" ? "Thẩm định" : "Chỉnh sửa"}</span>
                      </button>
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
