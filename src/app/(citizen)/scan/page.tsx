"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Camera, 
  FileText, 
  ChevronRight, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2,
  ShieldCheck,
  ScanLine
} from "lucide-react";

interface FormOption {
  id: string;
  code: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

const AVAILABLE_FORMS: FormOption[] = [
  {
    id: "tpl_01_lptb",
    code: "Mẫu 01/LPTB",
    title: "Tờ Khai Lệ Phí Trước Bạ Nhà, Đất",
    description: "Dùng khi làm sổ đỏ, mua bán chuyển nhượng nhà đất",
    badge: "Phổ biến nhất",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  {
    id: "tpl_02_vphc",
    code: "Mẫu Nộp Phạt",
    title: "Biểu Mẫu Nộp Tiền Phạt Vi Phạm",
    description: "Dùng nộp phạt giao thông và vi phạm hành chính",
    badge: "Kèm Biên bản phạt",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
  },
  {
    id: "tpl_03_khai_sinh",
    code: "Mẫu Khai Sinh",
    title: "Tờ Khai Đăng Ký Khai Sinh",
    description: "Dùng đăng ký khai sinh cho con, cháu tại xã/phường",
    badge: "Thường gặp",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
  },
];

export default function CitizenScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  // Giả lập quét ảnh hoặc nhận ảnh từ camera
  const triggerScanProcess = () => {
    setIsScanning(true);
    setScanMessage("Đang căn chỉnh góc và nắn phẳng tờ giấy...");
    
    setTimeout(() => {
      setScanMessage("Đã nhận diện: Tờ khai Lệ phí Trước bạ 01/LPTB!");
    }, 1000);

    setTimeout(() => {
      router.push("/guide?templateId=tpl_01_lptb");
    }, 2000);
  };

  const handleCaptureCamera = () => {
    // Kích hoạt mô phỏng quét form
    triggerScanProcess();
  };

  const handleSelectForm = (formId: string) => {
    router.push(`/guide?templateId=${formId}`);
  };

  return (
    <div className="flex flex-col flex-1 p-4 pb-12 gap-5 relative">
      {/* 1. Tiêu đề tiếp đón thân mật */}
      <div className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-afl-green font-bold text-xs uppercase tracking-wide mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Hệ thống hỗ trợ Một cửa chính thức</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
          Bác cần điền tờ khai nào hôm nay ạ?
        </h2>
        <p className="text-sm text-slate-600 mt-1 font-medium">
          Bác chỉ cần chụp ảnh tờ giấy trên bàn, hoặc chạm chọn tên biểu mẫu bên dưới để cháu hướng dẫn từng chữ nhé.
        </p>
      </div>

      {/* Input camera ẩn để hỗ trợ mở native camera nếu muốn */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={triggerScanProcess}
      />

      {/* 2. Nút chụp ảnh siêu lớn (Hero Button >= 64dp) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCaptureCamera}
          disabled={isScanning}
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

      {/* 4. Danh sách các biểu mẫu có sẵn để chạm nhanh */}
      <div className="flex flex-col gap-3">
        {AVAILABLE_FORMS.map((form) => (
          <button
            key={form.id}
            type="button"
            onClick={() => handleSelectForm(form.id)}
            disabled={isScanning}
            className="w-full min-h-[76px] bg-white hover:bg-slate-50 active:bg-slate-100 text-left p-4 rounded-2xl border-2 border-slate-300 shadow-md flex items-center justify-between gap-3 active:scale-98 transition-all hover:border-afl-green"
          >
            <div className="flex items-start gap-3.5 flex-1">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-6 h-6 text-slate-700" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-mono text-xs font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {form.code}
                  </span>
                  {form.badge && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${form.badgeColor}`}>
                      {form.badge}
                    </span>
                  )}
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">
                  {form.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium line-clamp-1 mt-0.5">
                  {form.description}
                </p>
              </div>
            </div>

            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
              <ChevronRight className="w-6 h-6" />
            </div>
          </button>
        ))}
      </div>

      {/* Khung chỉ dẫn trợ giúp */}
      <div className="bg-slate-100 rounded-xl p-3.5 border border-slate-200 flex items-start gap-2.5 text-slate-600 text-xs sm:text-sm font-medium mt-auto">
        <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Nếu bác không tìm thấy tên giấy tờ mình cần, bác hãy nhờ cán bộ tại quầy hướng dẫn thêm nhé.
        </span>
      </div>

      {/* Màn hình lớp phủ mô phỏng AI Scanning khi bấm chụp */}
      {isScanning && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-400/30 animate-ping" />
            <div className="w-full h-full rounded-full border-4 border-t-emerald-400 border-slate-700 animate-spin flex items-center justify-center">
              <Camera className="w-10 h-10 text-emerald-400" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-white mb-2">
            Đang nhận diện tờ khai...
          </h3>
          <p className="text-base text-emerald-200 font-medium max-w-xs animate-pulse">
            {scanMessage}
          </p>
        </div>
      )}
    </div>
  );
}
