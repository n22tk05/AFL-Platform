"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  RefreshCcw,
  Sparkles,
  Zap,
  ZapOff,
} from "lucide-react";

export default function CitizenCameraScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.warn(
          "Không thể mở camera thiết bị, chuyển sang chế độ tải tệp:",
          err,
        );
        setHasCamera(false);
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleFlash = useCallback(async () => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = (track.getCapabilities?.() || {}) as Record<
            string,
            unknown
          >;
          if (capabilities.torch) {
            await track.applyConstraints({
              advanced: [{ torch: !isFlashOn } as MediaTrackConstraintSet],
            });
          }
        } catch (err) {
          console.warn("Không thể bật đèn Flash:", err);
        }
      }
    }
    setIsFlashOn((prev) => !prev);
  }, [stream, isFlashOn]);

  const handleCapture = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(50);
      } catch {
        // Bỏ qua nếu thiết bị chặn rung
      }
    }

    // Giả lập nhận diện biểu mẫu và chuyển thẳng sang bước hướng dẫn
    setTimeout(() => {
      setIsProcessing(false);
      router.push("/citizen/guide?templateId=tpl_01_lptb");
    }, 1100);
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        router.push("/citizen/guide?templateId=tpl_01_lptb");
      }, 900);
    }
  };

  return (
    <main className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full bg-black flex flex-col overflow-hidden select-none z-50">
      {/* 1. TOP HEADER (CỐ ĐỊNH CHIỀU CAO - SHRINK-0) */}
      <header className="shrink-0 h-14 px-4 bg-slate-950/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between text-white z-20">
        <button
          type="button"
          onClick={() => router.push("/citizen")}
          className="min-h-[42px] px-3 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <div className="text-center">
          <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-400">
            Chụp Ảnh Tờ Khai
          </h1>
          <p className="text-[10px] text-slate-300 font-medium">
            Tự động nhận diện biểu mẫu A4
          </p>
        </div>

        <div className="w-[80px] flex justify-end items-center gap-2">
          {hasCamera && (
            <button
              type="button"
              onClick={toggleFlash}
              className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all"
              title="Bật/Tắt đèn flash"
            >
              {isFlashOn ? (
                <Zap className="w-4 h-4 text-amber-300" />
              ) : (
                <ZapOff className="w-4 h-4 text-white" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* 2. KHU VỰC CAMERA & KHUNG NGẮM TỜ KHAI (CO GIÃN VỪA KHÍT - FLEX-1 MIN-H-0) */}
      <section className="flex-1 min-h-0 w-full relative bg-slate-900 flex items-center justify-center overflow-hidden">
        {/* Luồng Camera Video hoặc Màn hình Fallback */}
        {hasCamera ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-slate-400">
              <Camera className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">
                Không thể mở trực tiếp Camera
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Bác có thể tải ảnh tờ khai có sẵn trong máy hoặc cấp quyền máy
                ảnh cho trình duyệt.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Chọn ảnh từ thiết bị</span>
            </button>
          </div>
        )}

        {/* Lớp phủ làm tối 4 cạnh (Vignette) để làm nổi bật khung A4 */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* KHUNG ĐỊNH VỊ TỜ KHAI A4 (TỰ FIT THEO KHÔNG GIAN CÒN LẠI) */}
        <div className="absolute w-[82%] max-w-[340px] aspect-[1/1.414] border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none flex flex-col justify-between p-3">
          {/* 4 Góc định vị vàng neon */}
          <div className="flex justify-between items-start">
            <span className="w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl -mt-1 -ml-1" />
            <span className="w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr -mt-1 -mr-1" />
          </div>

          {/* Dòng chữ hướng dẫn ở tâm khung */}
          <div className="text-center bg-black/60 backdrop-blur-xs py-1 px-3 rounded-full mx-auto border border-white/20">
            <p className="text-[11px] font-bold text-emerald-300 tracking-wide">
              Căn góc tờ giấy A4 vừa khung này
            </p>
          </div>

          <div className="flex justify-between items-end">
            <span className="w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl -mb-1 -ml-1" />
            <span className="w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br -mb-1 -mr-1" />
          </div>
        </div>

        {/* Hiệu ứng đang xử lý nhận diện AI */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/85 z-30 flex flex-col items-center justify-center gap-3 backdrop-blur-xs">
            <RefreshCcw className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-sm font-black text-white tracking-wide">
              Đang nhận diện & căn góc biểu mẫu...
            </p>
            <p className="text-xs text-emerald-200/80 font-medium">
              Hệ thống AI đang so khớp mẫu tờ khai
            </p>
          </div>
        )}
      </section>

      {/* 3. THANH ĐIỀU KHIỂN ĐÁY & NÚT CHỤP (CỐ ĐỊNH Ở ĐÁY - SHRINK-0) */}
      <footer className="shrink-0 bg-slate-950/95 backdrop-blur-md border-t border-white/10 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex items-center justify-around z-20">
        {/* Nút Tải ảnh có sẵn từ máy */}
        <label
          htmlFor="file-upload"
          className="flex flex-col items-center gap-1 text-slate-300 hover:text-white cursor-pointer active:scale-95 transition-all w-16"
        >
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center border border-white/15">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-bold">Tải ảnh lên</span>
          <input
            id="file-upload"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileFallback}
            className="hidden"
          />
        </label>

        {/* NÚT CHỤP HÌNH TRUNG TÂM (SHUTTER BUTTON) - SIÊU TO, DỄ BẤM */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={isProcessing}
          className="relative w-[72px] h-[72px] rounded-full bg-white flex items-center justify-center shadow-2xl active:scale-90 transition-transform group disabled:opacity-50"
          title="Chụp ảnh tờ khai"
        >
          {/* Vòng tròn viền ngoài phát sáng */}
          <div className="absolute inset-[-5px] rounded-full border-2 border-emerald-400 animate-pulse pointer-events-none" />
          {/* Lõi nút chụp */}
          <div className="w-[60px] h-[60px] rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center">
            <Camera className="w-7 h-7 text-white" />
          </div>
        </button>

        {/* Nút Trợ giúp / Thao tác phụ */}
        <div className="flex flex-col items-center gap-1 text-slate-400 w-16"></div>
      </footer>
    </main>
  );
}
