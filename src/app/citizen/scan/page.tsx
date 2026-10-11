"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listCitizenForms, type CitizenFormOption } from '@/modules/forms/services/citizen-workflow.client';
import { capturedFormSession } from '@/modules/forms/citizen-session';
import { APP_ROUTES } from '@/shared/routes';
import {
  Camera,
  ArrowLeft,
  Zap,
  ZapOff,
  RefreshCcw,
  Image as ImageIcon,
} from "lucide-react";

export default function CitizenScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [forms, setForms] = useState<CitizenFormOption[]>([]);
  const [formCode, setFormCode] = useState('');
  const [error, setError] = useState('');
  const fileReader = useRef<FileReader | null>(null);
  const readGeneration = useRef(0);
  const cancelRead = useCallback(() => { readGeneration.current++; fileReader.current?.abort(); }, []);
  useEffect(() => {
    cancelRead(); setIsProcessing(false);
    return cancelRead;
  }, [formCode, cancelRead]);

  useEffect(() => {
    const controller = new AbortController();
    void listCitizenForms({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setForms(result.forms); if (result.offline) setError('Máy chủ danh sách biểu mẫu chưa khả dụng.'); }
    }).catch(() => { if (!controller.signal.aborted) setError('Không nạp được biểu mẫu.'); });
    return () => controller.abort();
  }, []);

  const openGuide = (image: string) => {
    if (!formCode) throw new Error('Bác chọn đúng biểu mẫu đã ban hành trước nhé.');
    capturedFormSession.save(image);
    capturedFormSession.selectForm(formCode);
    router.push(APP_ROUTES.citizenGuide(formCode));
  };

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cancelled = false;

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
        if (cancelled) { mediaStream.getTracks().forEach(track => track.stop()); return; }
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        if (cancelled) return;
        console.warn(
          "Không thể mở camera thiết bị, chuyển sang chế độ tải tệp:",
          err,
        );
        setHasCamera(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    try {
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight) throw new Error('Camera chưa có ảnh.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      openGuide(canvas.toDataURL('image/jpeg', 0.9));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không chụp được ảnh.'); }
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 8 * 1024 * 1024) {
        setError('Chọn JPEG/PNG tối đa 8 MB.'); return;
      }
      setIsProcessing(true); setError('');
      const current = ++readGeneration.current;
      fileReader.current?.abort();
      const reader = new FileReader();
      fileReader.current = reader;
      reader.onload = () => {
        if (current !== readGeneration.current) return;
        try { openGuide(String(reader.result)); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Ảnh chưa hợp lệ.'); }
        finally { setIsProcessing(false); }
      };
      reader.onerror = () => { if (current === readGeneration.current) { setIsProcessing(false); setError('Không đọc được ảnh.'); } };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-black text-white relative overflow-hidden select-none min-h-[calc(100vh-65px)]">
      <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-2">
        <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">
          Chọn biểu mẫu khớp với tờ khai giấy của bác
          <select
            className="mt-1.5 block w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={formCode}
            onChange={(event) => setFormCode(event.target.value)}
          >
            <option value="">-- Bấm vào đây để chọn biểu mẫu đã ban hành --</option>
            {forms.map((form) => (
              <option key={form.formCode} value={form.formCode}>
                {form.formCode} — {form.formTitle}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-400 font-medium">
          Hệ thống sẽ đối chiếu với biểu mẫu bác chọn để phóng to từng ô hướng dẫn. Ảnh chụp không lưu trên máy chủ.
        </p>
        {error && (
          <p role="alert" className="text-xs font-bold text-rose-300 bg-rose-950/60 border border-rose-800 p-2.5 rounded-lg">
            {error}
          </p>
        )}
      </div>
      {/* Top Bar: Nút quay lại /citizen & Đèn flash */}
      <div className="p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={() => router.push("/citizen")}
          className="min-h-[44px] px-3.5 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-black flex items-center gap-1.5 text-white active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <button
          type="button"
          onClick={() => setIsFlashOn(!isFlashOn)}
          className="w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl flex items-center justify-center text-white active:scale-95 transition-all"
          title="Bật/Tắt đèn flash"
        >
          {isFlashOn ? (
            <Zap className="w-5 h-5 text-amber-300" />
          ) : (
            <ZapOff className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      {/* Vùng Viewfinder Camera */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-[400px]">
        {hasCamera ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="p-6 text-center text-slate-400 flex flex-col items-center gap-3">
            <Camera className="w-12 h-12 text-slate-500" />
            <p className="text-sm font-bold text-white">
              Không tìm thấy Camera trực tiếp trên thiết bị
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-afl-green text-white font-black text-xs rounded-xl shadow active:scale-95"
            >
              Chọn ảnh từ máy
            </button>
          </div>
        )}

        {/* Khung căn 4 góc giấy A4 */}
        <div className="absolute inset-x-7 top-14 bottom-14 sm:inset-14 border-2 border-emerald-400/80 rounded-2xl pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
          {/* 4 Góc ke thước căn chỉnh */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 -mt-0.5 -ml-0.5" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 -mt-0.5 -mr-0.5" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 -mb-0.5 -ml-0.5" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 -mb-0.5 -mr-0.5" />

          {/* DÒNG HƯỚNG DẪN NẰM NGOÀI MÉP TRÊN (KHÔNG CHE BIỂU MẪU) */}
          <div className="absolute bottom-full mb-3 inset-x-0 flex justify-center pointer-events-none">
            <span className="bg-black/85 text-emerald-300 text-[11px] font-black px-3.5 py-1 rounded-full uppercase tracking-wider border border-emerald-500/40 shadow-lg backdrop-blur-md inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Đặt tờ khai vừa vào khung màu xanh
            </span>
          </div>
        </div>

        {/* Hiệu ứng đang xử lý */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/80 z-30 flex flex-col items-center justify-center gap-3">
            <RefreshCcw className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm font-black text-white">
              Đang đọc ảnh đã chọn...
            </p>
          </div>
        )}
      </div>

      {/* Bottom Bar: Nút bấm chụp to tròn */}
      <div className="p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-around z-20">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileFallback}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white active:scale-95 transition-all"
          title="Chọn ảnh có sẵn"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleCapture}
          disabled={isProcessing}
          className="w-[72px] h-[72px] rounded-full border-4 border-white bg-afl-green flex items-center justify-center text-white shadow-xl active:scale-90 transition-transform disabled:opacity-50"
          title="Chụp ảnh tờ khai"
        >
          <div className="w-14 h-14 rounded-full bg-emerald-600 border-2 border-white/60 flex items-center justify-center">
            <Camera className="w-7 h-7 text-white" />
          </div>
        </button>

        <div className="w-12" />
      </div>
    </div>
  );
}
