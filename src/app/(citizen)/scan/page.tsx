"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Camera, 
  FileText, 
  ChevronRight, 
  AlertCircle, 
  ShieldCheck,
  ScanLine
} from "lucide-react";
import { CameraScannerModal } from "@/components/mobile/CameraScannerModal";
import { capturedFormSession, discardLegacyCitizenStorage, type CapturedFormImage } from '@/modules/forms/citizen-session';
import { listCitizenForms, type CitizenFormOption } from '@/modules/forms/services/citizen-workflow.client';
import { APP_ROUTES } from '@/shared/routes';

export default function CitizenScanPage() {
  const router = useRouter();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [forms, setForms] = useState<CitizenFormOption[]>([]);
  const [capture, setCapture] = useState<CapturedFormImage | null>(null);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { discardLegacyCitizenStorage(sessionStorage); } catch { /* Storage may be disabled. */ }
    const update = () => setCapture(capturedFormSession.read());
    update(); return capturedFormSession.subscribe(update);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Live forms remain available. */ }
    listCitizenForms({ storage, signal: abort.signal }).then(data => {
      if (abort.signal.aborted) return;
      setForms(data.forms);
      setMessage(data.offline ? 'Chưa kết nối thư viện máy chủ. Các bản mẫu và bản xuất bản trên trình duyệt được ghi rõ bên dưới.' : '');
    }).catch(() => {
      if (!abort.signal.aborted) { setForms([]); setMessage('Chưa tải được danh sách biểu mẫu. Bác có thể thử lại.'); }
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [refresh]);
  useEffect(() => {
    const update = (event: StorageEvent) => { if (event.key?.startsWith('afl_workflow_')) setRefresh(value => value + 1); };
    window.addEventListener('storage', update); return () => window.removeEventListener('storage', update);
  }, []);

  // Mở Camera
  const handleOpenCamera = () => {
    setIsCameraOpen(true);
  };

  // Đóng Camera
  const handleCloseCamera = () => {
    setIsCameraOpen(false);
  };

  // Khi chụp và đồng ý sử dụng ảnh
  const handleCaptureComplete = (imageDataUrl: string) => {
    setIsCameraOpen(false);
    try {
      capturedFormSession.save(imageDataUrl);
      setMessage('Ảnh chỉ giữ tạm trong phiên. Bác chọn đúng tên biểu mẫu bên dưới để xem hướng dẫn.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chưa sử dụng được ảnh chụp.'); }
  };

  const handleSelectForm = (form: CitizenFormOption) => {
    capturedFormSession.selectForm(form.formCode);
    router.push(`${APP_ROUTES.guide}?formCode=${encodeURIComponent(form.formCode)}&templateId=${encodeURIComponent(form.id)}`);
  };

  return (
    <div className="flex flex-col flex-1 p-4 pb-12 gap-5 relative">
      {/* Component Camera toàn màn hình */}
      <CameraScannerModal 
        isOpen={isCameraOpen} 
        onCaptureComplete={handleCaptureComplete} 
        onClose={handleCloseCamera}
      />

      {/* 1. Lời chào tiếp đón */}
      <div className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-afl-green font-bold text-xs uppercase tracking-wide mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Hệ thống hỗ trợ Một cửa chính thức</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
          Bác cần điền tờ khai nào hôm nay ạ?
        </h2>
        <p className="text-sm text-slate-600 mt-1 font-medium">
          Bác chọn đúng tên biểu mẫu để xem hướng dẫn. Có thể chụp ảnh tờ giấy trên bàn để đối chiếu trong phiên.
        </p>
      </div>

      {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{message}</p>}
      {capture && <div className="rounded-xl border border-slate-300 bg-white p-3 space-y-2">
        <p className="font-bold">Ảnh tờ khai vừa chụp — chọn tên biểu mẫu bên dưới</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capture.image} alt="Ảnh tờ khai giữ tạm trong phiên" className="max-h-48 w-full object-contain" />
        <button className="min-h-14 font-bold underline" onClick={() => capturedFormSession.clear()}>Xóa ảnh chụp</button>
      </div>}

      {/* 2. Nút chụp ảnh siêu lớn (Hero Button >= 64dp) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleOpenCamera}
          className="w-full min-h-[96px] bg-afl-green hover:bg-emerald-800 active:scale-98 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl border-4 border-emerald-900 transition-all group"
          aria-label="Chụp ảnh tờ khai trên bàn"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center shrink-0 border border-white/30 group-hover:scale-105 transition-transform">
              <Camera className="w-9 h-9 text-white" />
            </div>
            <div>
              <span className="inline-block bg-amber-400 text-slate-950 font-black text-[11px] px-2 py-0.5 rounded-full mb-1 uppercase tracking-wider">
                Cách 1: Nhanh nhất
              </span>
              <div className="text-xl sm:text-2xl font-black tracking-wide leading-tight">
                CHỤP ẢNH TỜ KHAI
              </div>
              <div className="text-xs sm:text-sm text-emerald-100 font-medium">
                Đặt tờ giấy trên bàn và bấm vào đây
              </div>
            </div>
          </div>
          <ScanLine className="w-7 h-7 text-emerald-200 shrink-0 group-hover:scale-110 transition-transform hidden sm:block" />
        </button>
      </div>

      {/* 3. Dòng phân cách rõ nét */}
      <div className="relative flex items-center justify-center my-1">
        <div className="border-t-2 border-slate-300 w-full" />
        <span className="bg-afl-bg px-3 text-xs sm:text-sm font-extrabold text-slate-500 uppercase tracking-wider text-center shrink-0">
          HOẶC CHỌN TỜ KHAI CÓ SẴN (CÁCH 2)
        </span>
        <div className="border-t-2 border-slate-300 w-full" />
      </div>

      {/* 4. Danh sách các biểu mẫu có sẵn */}
      <div className="flex flex-col gap-3">
        {loading && <p role="status">Đang tải biểu mẫu đã xuất bản…</p>}
        {!loading && !forms.length && <p>Chưa có biểu mẫu đã xuất bản để hướng dẫn.</p>}
        {forms.map((form) => (
          <button
            key={form.id}
            type="button"
            onClick={() => handleSelectForm(form)}
            className="w-full min-h-[76px] bg-white hover:bg-slate-50 active:bg-slate-100 text-left p-4 rounded-2xl border-2 border-slate-300 shadow-md flex items-center justify-between gap-3 active:scale-98 transition-all hover:border-afl-green"
          >
            <div className="flex items-start gap-3.5 flex-1">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-6 h-6 text-slate-700" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-mono text-xs font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {form.formCode}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-300">
                    {form.source === 'live' ? 'Đã xuất bản' : form.source === 'local' ? 'Xuất bản trên trình duyệt' : 'Mẫu minh họa'}
                  </span>
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">
                  {form.formTitle}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium line-clamp-1 mt-0.5">
                  Hướng dẫn đúng biểu mẫu đã chọn
                </p>
              </div>
            </div>

            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              <ChevronRight className="w-6 h-6" />
            </div>
          </button>
        ))}
      </div>
      <button className="min-h-14 font-bold underline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Tải lại danh sách biểu mẫu</button>

      {/* Nút Universal Document Scanner cho chứng từ bất kỳ */}
      <button
        type="button"
        onClick={() => router.push(APP_ROUTES.scanDocument)}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl p-4 flex items-center justify-between border-2 border-slate-700 shadow-md transition-all active:scale-98"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <ScanLine className="w-6 h-6" />
          </div>
          <div className="text-left">
            <div className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              Quét & Trích Xuất Văn Bản Toàn Năng
              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">MỚI</span>
            </div>
            <div className="text-xs text-slate-400 font-medium">
              Đọc chữ bằng VietOCR, đối chiếu ảnh và xác nhận dữ liệu trước khi dùng
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
      </button>

      {/* Khung chỉ dẫn trợ giúp */}
      <div className="bg-slate-100 rounded-xl p-3.5 border border-slate-200 flex items-start gap-2.5 text-slate-600 text-xs sm:text-sm font-medium mt-auto">
        <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Nếu bác không tìm thấy tên giấy tờ mình cần, bác hãy nhờ cán bộ tại quầy hướng dẫn thêm nhé.
        </span>
      </div>
    </div>
  );
}
