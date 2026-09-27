"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { 
  X, 
  Zap, 
  ZapOff, 
  Camera, 
  RefreshCw, 
  Check, 
  AlertTriangle 
} from "lucide-react";

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureComplete: (imageDataUrl: string) => void;
}

export function CameraScannerModal({
  isOpen,
  onClose,
  onCaptureComplete,
}: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // 1. Khởi động Camera sau
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          "Trình duyệt hiện tại không hỗ trợ chụp ảnh trực tiếp. Bác vui lòng chọn tờ khai mẫu bên dưới nhé!"
        );
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Kiểm tra tính năng Flash/Torch
      const track = mediaStream.getVideoTracks()[0];
      const capabilities = (track as any)?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capabilities && capabilities.torch) {
        setHasTorch(true);
      }
    } catch (err: unknown) {
      console.error("Lỗi truy cập Camera:", err);
      setCameraError(
        "Không thể mở máy ảnh. Bác vui lòng kiểm tra lại quyền cho phép truy cập Camera của trình duyệt nhé!"
      );
    }
  }, []);

  // 2. Dừng Camera & Tắt luồng
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setStream(null);
    }
    setIsTorchOn(false);
  }, [stream]);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, capturedImage, startCamera, stopCamera]);

  // 3. Bật/Tắt Đèn Flash
  const toggleTorch = async () => {
    if (!stream || !hasTorch) return;
    const track = stream.getVideoTracks()[0];
    try {
      const nextState = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn("Không thể bật Flash:", err);
    }
  };

  // 4. Chụp ảnh từ khung Video
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  // 5. Chụp lại
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  // 6. Xác nhận sử dụng ảnh
  const handleConfirmUseImage = () => {
    if (capturedImage) {
      // Lưu vào Session RAM theo Nghị định 13
      try {
        sessionStorage.setItem("afl_captured_form_image", capturedImage);
      } catch (e) {
        console.warn("Session storage quota:", e);
      }
      onCaptureComplete(capturedImage);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Canvas ẩn để kết xuất ảnh */}
      <canvas ref={canvasRef} className="hidden" />

      {/* THANH ĐIỀU KHIỂN TRÊN CÙNG */}
      <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        {/* Nút Thoát / Quay lại */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng camera"
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center border border-white/30 active:scale-95 transition-all"
        >
          <X className="w-7 h-7" />
        </button>

        {/* Tiêu đề hướng dẫn */}
        <div className="text-center px-2">
          <span className="text-white font-extrabold text-sm sm:text-base drop-shadow-md">
            {capturedImage ? "XÁC NHẬN ẢNH CHỤP" : "CĂN CHỈNH 4 GÓC TỜ KHAI"}
          </span>
        </div>

        {/* Nút Bật/Tắt Flash (Nếu có hỗ trợ) */}
        {hasTorch && !capturedImage ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-label="Bật tắt đèn flash"
            className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/30 backdrop-blur-md transition-all active:scale-95 ${
              isTorchOn ? "bg-amber-400 text-slate-950" : "bg-white/20 text-white"
            }`}
          >
            {isTorchOn ? <Zap className="w-6 h-6 fill-slate-950" /> : <ZapOff className="w-6 h-6" />}
          </button>
        ) : (
          <div className="w-12 h-12" />
        )}
      </div>

      {/* KHUNG HIỂN THỊ CAMERA / PREVIEW ẢNH */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="p-6 text-center text-white max-w-sm flex flex-col items-center">
            <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
            <p className="text-base font-bold leading-relaxed">{cameraError}</p>
            <button
              onClick={startCamera}
              className="mt-4 px-6 py-3 bg-afl-green text-white font-bold rounded-xl active:scale-95"
            >
              Thử lại
            </button>
          </div>
        ) : capturedImage ? (
          /* Màn hình xem trước ảnh vừa chụp */
          <div className="relative w-full h-full flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capturedImage}
              alt="Ảnh tờ khai vừa chụp"
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border-2 border-white/20"
            />
          </div>
        ) : (
          /* Khung ngắm Video trực tiếp */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Lớp phủ căn chỉnh 4 góc mép giấy A4 */}
            <div className="relative z-10 w-[84%] max-w-[340px] aspect-[1/1.414] border-2 border-white/30 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* 4 Góc màu xanh dạ quang nổi bật */}
              <div className="absolute -top-1 -left-1 w-9 h-9 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-9 h-9 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-9 h-9 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-9 h-9 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

              {/* Đường quét ngang mô phỏng */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-b border-dashed border-emerald-400/50" />

              <div className="absolute -bottom-10 inset-x-0 text-center">
                <span className="bg-black/60 backdrop-blur-sm text-emerald-300 text-xs sm:text-sm font-bold px-3 py-1 rounded-full border border-emerald-400/40">
                  Ướm trọn tờ giấy vào trong khung
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* THANH ĐIỀU KHIỂN DƯỚI CÙNG */}
      <div className="relative z-20 p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-around">
        {capturedImage ? (
          /* 2 Nút lựa chọn: Chụp lại hoặc Xác nhận */
          <div className="w-full flex items-center justify-between gap-4 max-w-sm mx-auto">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 min-h-[58px] bg-slate-800 text-white border-2 border-slate-600 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <RefreshCw className="w-5 h-5 text-amber-400" />
              <span>Chụp lại</span>
            </button>

            <button
              type="button"
              onClick={handleConfirmUseImage}
              className="flex-1 min-h-[58px] bg-afl-green text-white border-2 border-emerald-400 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-green-900/40"
            >
              <Check className="w-6 h-6" />
              <span>Dùng ảnh này</span>
            </button>
          </div>
        ) : (
          /* Nút bấm chụp ảnh chính */
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleCapture}
              disabled={!!cameraError}
              aria-label="Chụp ảnh tờ khai"
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 bg-white/20 backdrop-blur-sm active:scale-90 transition-transform disabled:opacity-40"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center shadow-lg">
                <Camera className="w-8 h-8 text-slate-900" />
              </div>
            </button>
            <span className="text-white/80 text-xs font-bold uppercase tracking-wider">
              Chạm để chụp
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
