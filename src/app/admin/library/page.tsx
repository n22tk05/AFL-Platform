'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminKeyInput, useAdminSession } from '@/modules/forms/admin-session.client';
import { listAdminForms } from '@/modules/forms/services/form-api.client';
import { formErrorMessage } from '@/modules/forms/services/form-feedback.client';
import type { AdminFormSummary } from '@/modules/forms/types/form.types';
import { FormUploadModal } from '@/components/admin/FormUploadModal';
import { FormQrModal } from '@/components/admin/FormQrModal';
import { APP_ROUTES } from '@/shared/routes';
import { Activity, CheckCircle, Clock, ExternalLink, FileText, QrCode, RefreshCw, Search, ShieldCheck } from 'lucide-react';

interface SystemHealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    vietocr: { status: 'online' | 'offline'; latencyMs?: number; message?: string };
    database: { status: 'connected' | 'error'; latencyMs?: number; message?: string };
    gemini: { status: 'configured' | 'missing_key' };
  };
  timestamp: string;
}

export default function AdminLibraryPage() {
  const { adminKey } = useAdminSession();
  const [forms, setForms] = useState<AdminFormSummary[]>([]);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [qrForm, setQrForm] = useState<AdminFormSummary | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE'>('ALL');
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  useEffect(() => {
    let current = true;
    setForms([]);
    setError('');
    if (adminKey.trim()) {
      listAdminForms(adminKey)
        .then(result => {
          if (current) setForms(result.forms);
        })
        .catch(reason => {
          if (current) setError(formErrorMessage(reason, 'Không nạp được danh sách biểu mẫu. Vui lòng thử lại.'));
        });
    }
    return () => { current = false; };
  }, [adminKey, refresh]);

  // Kiểm tra sức khỏe hệ thống khi có adminKey
  useEffect(() => {
    if (!adminKey.trim()) {
      setHealth(null);
      return;
    }
    let active = true;
    setLoadingHealth(true);
    fetch('/api/admin/health', {
      headers: { 'x-admin-key': adminKey },
    })
      .then(res => res.json())
      .then(data => {
        if (active && data.success) setHealth(data.data);
      })
      .catch(() => {
        if (active) setHealth(null);
      })
      .finally(() => {
        if (active) setLoadingHealth(false);
      });
    return () => { active = false; };
  }, [adminKey, refresh]);

  // Bộ lọc danh sách biểu mẫu
  const filteredForms = useMemo(() => {
    return forms.filter(form => {
      const matchStatus = statusFilter === 'ALL' || form.status.toUpperCase() === statusFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchQuery = !query || form.formCode.toLowerCase().includes(query) || form.formTitle.toLowerCase().includes(query);
      return matchStatus && matchQuery;
    });
  }, [forms, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      ALL: forms.length,
      DRAFT: forms.filter(f => f.status.toUpperCase() === 'DRAFT').length,
      PENDING_REVIEW: forms.filter(f => f.status.toUpperCase() === 'PENDING_REVIEW').length,
      ACTIVE: forms.filter(f => f.status.toUpperCase() === 'ACTIVE').length,
    };
  }, [forms]);

  return (
    <section className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Thư viện biểu mẫu trên máy chủ</h1>
          <p className="text-sm text-slate-500 font-medium">Hệ thống quản lý, đối soát kịch bản và chuẩn hóa tọa độ AFL-Platform</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-xs"
            onClick={() => setRefresh(v => v + 1)}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Nạp lại</span>
          </button>
          <Link
            href={APP_ROUTES.upload}
            className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span>+ Thêm phôi trống</span>
          </Link>
        </div>
      </div>

      <AdminKeyInput />

      {/* Bảng theo dõi sức khỏe dịch vụ hệ thống */}
      {adminKey && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-600" />
            <span className="font-extrabold text-slate-800 uppercase tracking-wide">Trạng thái hệ thống:</span>
            {loadingHealth ? (
              <span className="text-slate-500 font-medium">Đang kiểm tra...</span>
            ) : health ? (
              <span className={`px-2 py-0.5 rounded font-black ${health.status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {health.status === 'healthy' ? 'HOẠT ĐỘNG TỐT' : 'CÓ CẢNH BÁO'}
              </span>
            ) : (
              <span className="text-slate-400">Chưa có dữ liệu</span>
            )}
          </div>

          {health && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${health.services.vietocr.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="font-bold text-slate-700">VietOCR OCR:</span>
                <span className="font-mono text-slate-600">
                  {health.services.vietocr.status === 'online' ? `${health.services.vietocr.latencyMs}ms` : 'Ngoại tuyến'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${health.services.database.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="font-bold text-slate-700">PostgreSQL DB:</span>
                <span className="font-mono text-slate-600">
                  {health.services.database.status === 'connected' ? `${health.services.database.latencyMs}ms` : 'Lỗi kết nối'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${health.services.gemini.status === 'configured' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="font-bold text-slate-700">Gemini AI:</span>
                <span className="font-mono text-slate-600">
                  {health.services.gemini.status === 'configured' ? 'Sẵn sàng' : 'Chưa có key'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800 font-bold rounded-xl text-sm">{error}</p>}
      {!adminKey && <p className="text-sm text-slate-500 italic">Nhập khóa quản trị để đọc dữ liệu thật. Không dùng dữ liệu mẫu thay thế.</p>}

      {/* Thanh công cụ lọc & tìm kiếm */}
      {adminKey && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Bộ lọc trạng thái */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${statusFilter === 'ALL' ? 'bg-white shadow text-slate-900 font-black' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tất cả ({counts.ALL})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DRAFT')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${statusFilter === 'DRAFT' ? 'bg-slate-700 shadow text-white font-black' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Bản nháp ({counts.DRAFT})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING_REVIEW')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${statusFilter === 'PENDING_REVIEW' ? 'bg-amber-600 shadow text-white font-black' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Chờ duyệt ({counts.PENDING_REVIEW})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${statusFilter === 'ACTIVE' ? 'bg-emerald-700 shadow text-white font-black' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Đang hoạt động ({counts.ACTIVE})
            </button>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên mẫu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>
        </div>
      )}

      {/* Danh sách thẻ biểu mẫu */}
      <ul className="space-y-3">
        {filteredForms.map(form => {
          const statusUpper = form.status.toUpperCase();
          const badgeStyle = statusUpper === 'ACTIVE'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : statusUpper === 'PENDING_REVIEW'
            ? 'bg-amber-100 text-amber-800 border-amber-300'
            : 'bg-slate-100 text-slate-700 border-slate-300';

          return (
            <li
              key={form.formId}
              className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-slate-300 transition-all"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded border">
                    {form.formCode}
                  </span>
                  <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded border ${badgeStyle}`}>
                    {statusUpper === 'ACTIVE' ? 'ĐANG HOẠT ĐỘNG' : statusUpper === 'PENDING_REVIEW' ? 'CHỜ DUYỆT' : 'BẢN NHÁP'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    Phiên bản v{form.version}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                  {form.formTitle}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {form.stepCount} bước hướng dẫn
                  </span>
                </div>
              </div>

              {/* Các nút thao tác */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href={APP_ROUTES.review(form.formCode)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4 text-slate-600" />
                  <span>Đối soát kịch bản</span>
                </Link>

                {statusUpper === 'ACTIVE' && (
                  <>
                    <button
                      type="button"
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                      onClick={() => setQrForm(form)}
                    >
                      <QrCode className="w-4 h-4 text-emerald-700" />
                      <span>Mã QR</span>
                    </button>
                    <Link
                      href={`/citizen/guide?formCode=${encodeURIComponent(form.formCode)}`}
                      target="_blank"
                      className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Xem thử dân</span>
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}

        {adminKey && filteredForms.length === 0 && (
          <li className="p-8 text-center bg-slate-50 border border-dashed rounded-2xl text-slate-500 text-sm font-medium">
            Không tìm thấy biểu mẫu nào phù hợp với bộ lọc hiện tại.
          </li>
        )}
      </ul>

      <FormUploadModal isOpen={uploadOpen} onClose={() => { setUploadOpen(false); setRefresh(v => v + 1); }} />
      {qrForm && <FormQrModal isOpen onClose={() => setQrForm(null)} templateId={qrForm.formId} formCode={qrForm.formCode} formTitle={qrForm.formTitle} />}
    </section>
  );
}
