'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCitizenForms, type CitizenFormOption } from '@/modules/forms/services/citizen-workflow.client';
import { APP_ROUTES } from '@/shared/routes';
import { FileText, ArrowRight, Volume2, ShieldCheck, AlertCircle, Sparkles, Camera, ScanLine } from 'lucide-react';

export default function CitizenHomePage() {
  const [forms, setForms] = useState<CitizenFormOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      return listCitizenForms({ signal })
        .then((result) => {
          if (!signal.aborted) {
            setForms(result.forms);
            setUnavailable(result.offline);
          }
        })
        .catch(() => {
          if (!signal.aborted) {
            setForms([]);
            setUnavailable(true);
          }
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false);
        });
    };

    void load();
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      window.removeEventListener('focus', load);
    };
  }, []);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Banner Giới thiệu Dành cho Người cao tuổi & Công dân */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-black text-emerald-100 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Một cửa điện tử AI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
              Bác chọn biểu mẫu cần kê khai
            </h1>
            <p className="text-sm sm:text-base text-emerald-100 font-medium max-w-2xl leading-relaxed">
              Hệ thống sẽ phóng to từng ô, đọc lời hướng dẫn từng bước bằng tiếng Việt giọng đọc chuẩn, và hiển thị chữ mẫu màu đỏ rõ nét để bác điền chính xác.
            </p>

            {/* Nút Scan ảnh tiện ích */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href={APP_ROUTES.scan}
                id="btn-citizen-scan-banner"
                className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-950/20 active:scale-95 transition-all group/scan"
              >
                <Camera className="w-5 h-5 text-slate-950 group-hover/scan:scale-110 transition-transform" />
                <span>Scan ảnh biểu mẫu</span>
                <ArrowRight className="w-4 h-4 text-slate-900 group-hover/scan:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={APP_ROUTES.scanDocument}
                id="btn-citizen-ocr-banner"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm backdrop-blur-md border border-white/20 active:scale-95 transition-all"
              >
                <ScanLine className="w-4 h-4 text-emerald-200" />
                <span>Đọc ảnh chứng từ (OCR)</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Thẻ hành động Scan ảnh nhanh */}
        <div className="bg-white rounded-3xl border-2 border-emerald-200/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-100/80 border border-emerald-300 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
              <Camera className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-700" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-md tracking-wider">
                  Máy quét ảnh thông minh
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                Bác đã có tờ khai in sẵn trên tay?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Mở camera quét ảnh hoặc tải ảnh giấy tờ để hệ thống nhận diện và hướng dẫn điền trực tiếp.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={APP_ROUTES.scan}
              id="btn-citizen-scan-card"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm shadow-sm active:scale-95 transition-all"
            >
              <Camera className="w-4 h-4" />
              <span>Bật máy quét ảnh</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Thông báo sự cố ngoại tuyến */}
        {unavailable && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 font-bold text-sm shadow-xs"
          >
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-amber-900">Máy chủ chưa khả dụng</p>
              <p className="font-medium text-amber-800 text-xs mt-0.5">
                Bác vui lòng thử lại sau ít phút; hệ thống không sử dụng kịch bản mẫu thay thế để bảo đảm tính chuẩn xác pháp lý.
              </p>
            </div>
          </div>
        )}

        {/* Trạng thái đang tải */}
        {loading && forms.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((skeleton) => (
              <div
                key={skeleton}
                className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse flex items-center justify-between"
              >
                <div className="space-y-2.5 flex-1">
                  <div className="w-24 h-5 bg-slate-200 rounded-md" />
                  <div className="w-2/3 h-6 bg-slate-200 rounded-lg" />
                </div>
                <div className="w-10 h-10 bg-slate-200 rounded-xl shrink-0 ml-4" />
              </div>
            ))}
          </div>
        )}

        {/* Danh sách Biểu mẫu Kê khai */}
        {!loading && forms.length > 0 && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                Biểu mẫu đang hiệu lực ({forms.length})
              </h2>
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" />
                Hỗ trợ đọc loa
              </span>
            </div>

            <ul className="space-y-3" role="list">
              {forms.map((form) => (
                <li key={form.formCode}>
                  <Link
                    href={APP_ROUTES.citizenGuide(form.formCode)}
                    className="group bg-white rounded-2xl border-2 border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-emerald-600 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-700 group-hover:text-white transition-colors duration-200 shadow-xs">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-md border border-slate-200 group-hover:border-emerald-300 transition-colors">
                            {form.formCode}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Đang hoạt động
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-emerald-800 transition-colors leading-snug">
                          {form.formTitle}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Chạm vào đây để bắt đầu xem hướng dẫn điền từng bước
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end sm:justify-center shrink-0">
                      <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-800 group-hover:bg-emerald-900 text-white rounded-xl text-xs font-black shadow-sm group-hover:shadow transition-all">
                        <span>Bắt đầu điền</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trạng thái danh sách rỗng */}
        {!loading && forms.length === 0 && !unavailable && (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800">
              Chưa có biểu mẫu nào được kích hoạt
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              Cán bộ quản trị đang chuẩn bị các biểu mẫu hành chính. Bác vui lòng quay lại sau.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
