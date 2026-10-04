"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  Sparkles,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { FormWorkflow } from "@/shared/contracts";
import { FormStorageService } from "@/shared/services/form-storage";
import { APP_ROUTES } from '@/shared/routes';
import { saveLocalDraft } from '@/modules/forms/services/local-workflow-store';

interface FormUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FormUploadModal({ isOpen, onClose }: FormUploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCode, setFormCode] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [blankTemplateConfirmed, setBlankTemplateConfirmed] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => { requestId.current++; requestController.current?.abort(); }, []);
  useEffect(() => { if (previewUrl) return () => URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    if (!isOpen) {
      requestId.current++; requestController.current?.abort();
      setIsScanning(false); setSelectedFile(null); setPreviewUrl(null);
      setDetectedBoxes([]); setTerminalLogs([]); setBlankTemplateConfirmed(false); setAdminKey('');
    }
  }, [isOpen]);

  // Trạng thái Animation
  const [isScanning, setIsScanning] = useState(false);
  const [, setScanPhase] = useState<number>(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [detectedBoxes, setDetectedBoxes] = useState<
    Array<{ top: string; left: string; width: string; height: string }>
  >([]);

  // Điều kiện kiểm tra bắt buộc: Phải có file và điền đủ cả 3 trường metadata
  const isFormValid = Boolean(
    selectedFile &&
    blankTemplateConfirmed &&
    formCode.trim().length > 0 &&
    formTitle.trim().length > 0 &&
    legalBasis.trim().length > 0
  );

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    if (!formTitle.trim()) {
      setFormTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && ['image/png', 'image/jpeg'].includes(file.type) && file.size <= 8 * 1024 * 1024) {
      requestId.current++; requestController.current?.abort(); setDetectedBoxes([]); setTerminalLogs([]);
      processSelectedFile(file);
    } else if (file) {
      setTerminalLogs(['Chỉ hỗ trợ PNG/JPEG tối đa 8 MB. PDF chưa có bộ giải mã an toàn.']);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && ['image/png', 'image/jpeg'].includes(file.type) && file.size <= 8 * 1024 * 1024) {
      requestId.current++; requestController.current?.abort(); setDetectedBoxes([]); setTerminalLogs([]);
      processSelectedFile(file);
    } else if (file) {
      setTerminalLogs(['Chỉ hỗ trợ PNG/JPEG tối đa 8 MB. PDF chưa có bộ giải mã an toàn.']);
    }
    }
  };

  // Hidden canvas refs cho OpenCV WASM pipeline
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const deskewedCanvasRef = useRef<HTMLCanvasElement>(null);
  const documentOutlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const grayscaleCanvasRef = useRef<HTMLCanvasElement>(null);
  const binaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const horizontalCanvasRef = useRef<HTMLCanvasElement>(null);
  const verticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const combinedCanvasRef = useRef<HTMLCanvasElement>(null);
  const candidateOverlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // KÍCH HOẠT TIẾN TRÌNH XỬ LÝ BIỂU MẪU THẬT BẰNG OPENCV WASM & GEMINI
  const handleStartAnalysis = async () => {
    if (!isFormValid || !previewUrl || isScanning) return;
    const id = ++requestId.current;
    requestController.current?.abort();
    const controller = new AbortController(); requestController.current = controller;
    const current = () => id === requestId.current && !controller.signal.aborted;

    setIsScanning(true);
    setScanPhase(1);
    setTerminalLogs([
      "➜ Khởi động tiến trình xử lý biểu mẫu đa tầng...",
      "➜ [Tầng 1 - OpenCV WASM] Đang phân tích góc nghiêng và viền mép giấy...",
    ]);

    try {
      // 1. Nạp ảnh vào HTMLImageElement
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Không thể tải ảnh scan vào bộ nhớ"));
        img.src = previewUrl;
      });
      if (!current()) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 12_000_000) throw new Error('Ảnh không hợp lệ hoặc vượt giới hạn 12 triệu pixel.');

      const maxDim = 1600;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      // Vẽ vào canvas đầu vào
      const inCanvas = inputCanvasRef.current || document.createElement("canvas");
      inCanvas.width = width;
      inCanvas.height = height;
      const ctx = inCanvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0, width, height);

      setScanPhase(2);
      setTerminalLogs((prev) => [
        ...prev,
        "➜ [Tầng 2 - Geometric Vision] Đang định vị các đường kẻ và ô nhập liệu...",
      ]);

      // 2. Chạy OpenCV WASM Line & Candidate Detection thật
      const { runLineDetectionDebug } = await import("@/modules/opencv");
      if (!current()) return;
      const pipelineResult = await runLineDetectionDebug({
        mode: "clean-scan",
        inputCanvas: inCanvas,
        deskewedCanvas: deskewedCanvasRef.current || document.createElement("canvas"),
        documentOutlineCanvas: documentOutlineCanvasRef.current || document.createElement("canvas"),
        grayscaleCanvas: grayscaleCanvasRef.current || document.createElement("canvas"),
        binaryCanvas: binaryCanvasRef.current || document.createElement("canvas"),
        horizontalCanvas: horizontalCanvasRef.current || document.createElement("canvas"),
        verticalCanvas: verticalCanvasRef.current || document.createElement("canvas"),
        combinedCanvas: combinedCanvasRef.current || document.createElement("canvas"),
        candidateOverlayCanvas: candidateOverlayCanvasRef.current || document.createElement("canvas"),
      });
      if (!current()) return;

      const procWidth = pipelineResult.width || width;
      const procHeight = pipelineResult.height || height;
      const candidates = pipelineResult.candidates || [];

      // Hiển thị các box thật bóc tách được (giới hạn tối đa 200 ô theo hợp đồng)
      const realBoxes = candidates.slice(0, 200).map((c) => ({
        top: `${((c.rect.y / procHeight) * 100).toFixed(1)}%`,
        left: `${((c.rect.x / procWidth) * 100).toFixed(1)}%`,
        width: `${((c.rect.width / procWidth) * 100).toFixed(1)}%`,
        height: `${((c.rect.height / procHeight) * 100).toFixed(1)}%`,
      }));

      setDetectedBoxes(realBoxes);

      setScanPhase(3);
      setTerminalLogs((prev) => [
        ...prev,
        pipelineResult.detectedQuad
          ? `✔ Đã nhận diện 4 góc phôi và nắn phẳng phối cảnh (${pipelineResult.perspectiveTransformTimeMs.toFixed(0)}ms)`
          : `✔ Đã phân tích phôi scan tiêu chuẩn (${procWidth}x${procHeight}px)`,
        `✔ OpenCV WASM đã bóc tách thành công ${candidates.length} khung ô hình học (${pipelineResult.totalProcessingTimeMs.toFixed(0)}ms)`,
        candidates.length > 0
          ? "➜ [Tầng 3 - Gemini LLM] Đang sinh kịch bản câu thoại bình dân tốc độ 0.9x..."
          : "⚠ Không phát hiện được khung ô tự động. Biểu mẫu sẽ được chuyển sang giao diện kiểm duyệt để chuyên viên cấu hình.",
      ]);

      // 3. Chuẩn bị Manifest để gọi LLM Prompt API (không tạo box giả)
      const manifestBoxes = candidates.slice(0, 200).map((c, idx) => {
        const ymin = Math.max(0, Math.min(0.98, Number((c.rect.y / procHeight).toFixed(4))));
        const xmin = Math.max(0, Math.min(0.98, Number((c.rect.x / procWidth).toFixed(4))));
        const ymax = Math.max(ymin + 0.01, Math.min(1.0, Number(((c.rect.y + c.rect.height) / procHeight).toFixed(4))));
        const xmax = Math.max(xmin + 0.01, Math.min(1.0, Number(((c.rect.x + c.rect.width) / procWidth).toFixed(4))));
        return {
          boxId: `box_${String(idx + 1).padStart(2, "0")}`,
          normalizedCoords: [ymin, xmin, ymax, xmax] as [number, number, number, number],
          rawText: `Ô kê khai số ${idx + 1}`,
          boxType: (c.rect.width / procWidth < 0.08 ? "checkbox" : "text") as "checkbox" | "text",
          estimatedWidthRatio: Math.max(0.01, Math.min(1.0, Number((c.rect.width / procWidth).toFixed(2)))),
        };
      });

      const rawId = formCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 60);
      const sanitizedFormId = rawId || `form_${Date.now()}`;

      // Gọi API LLM sinh kịch bản kèm x-admin-key (Step 07 guardrail) khi có manifest boxes
      let generatedSteps: FormWorkflow["steps"] = [];
      if (manifestBoxes.length > 0) {
        try {
          if (!adminKey.trim()) throw new Error('MANUAL_CONFIGURATION');
          const promptRes = await fetch("/api/llm/prompt", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-key": adminKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              manifest: {
                formId: sanitizedFormId,
                formTitle: formTitle.trim(),
                formCode: formCode.trim(),
                imageDimensions: { width: procWidth, height: procHeight },
                boxes: manifestBoxes,
              },
            }),
          });
          if (!current()) return;

          if (promptRes.ok) {
            const promptData = await promptRes.json();
            if (!current()) return;
            if (promptData.success && promptData.data?.steps) {
              generatedSteps = promptData.data.steps.map((st: { stepIndex?: number; boxId: string; sectionName?: string; label?: string; voiceGuidance?: string; audioUrl?: string; exampleRedText?: string; highlightCoords?: [number, number, number, number]; requiresPrerequisiteDoc?: boolean; legalWarningFlag?: boolean; faqs?: Array<{ question: string; answer: string }> }, sIdx: number) => ({
                stepIndex: sIdx + 1,
                boxId: st.boxId || `box_${String(sIdx + 1).padStart(2, "0")}`,
                pageNumber: 1,
                sectionName: st.sectionName || `Mục ${sIdx + 1}`,
                label: st.label || `Thông tin trường ${sIdx + 1}`,
                voiceGuidance: st.voiceGuidance || "Bác ghi rõ thông tin vào ô này nhé.",
                audioUrl: st.audioUrl || "",
                exampleRedText: st.exampleRedText || "VÍ DỤ MẪU IN HOA",
                highlightCoords: manifestBoxes.find(box => box.boxId === st.boxId)?.normalizedCoords || manifestBoxes[sIdx]?.normalizedCoords!,
                requiresPrerequisiteDoc: st.requiresPrerequisiteDoc ?? false,
                legalWarningFlag: st.legalWarningFlag ?? false,
                faqs: st.faqs || [],
              }));
            }
          }
        } catch {
          if (!current()) return;
          setTerminalLogs(prev => [...prev, 'Không có kịch bản AI đã lưu. Dùng tọa độ thật để cấu hình thủ công; đây vẫn là bản nháp.']);
        }

        // Nếu không có steps từ API, dùng fallback mẫu với tọa độ thật và stepIndex 1-based
        if (generatedSteps.length === 0) {
          generatedSteps = manifestBoxes.map((box, idx) => ({
            stepIndex: idx + 1,
            boxId: box.boxId,
            pageNumber: 1,
            sectionName: 'Cần chuyên viên cấu hình',
            label: `Ô ${idx + 1} — cần đặt tên theo phôi`,
            voiceGuidance: 'Chuyên viên cần viết hướng dẫn đúng với ô trên phôi trước khi áp dụng.',
            audioUrl: '',
            exampleRedText: 'CẦN CHUYÊN VIÊN ĐỐI SOÁT',
            highlightCoords: box.normalizedCoords,
            requiresPrerequisiteDoc: false,
            legalWarningFlag: false,
            faqs: [],
          }));
        }
      }

      setScanPhase(4);
      setTerminalLogs((prev) => [
        ...prev,
        "✔ Hoàn tất tạo kịch bản kẹp tọa độ chuẩn hóa [0.0 - 1.0]",
        "➜ Đang chuyển dữ liệu sang Cổng kiểm duyệt chuyên viên...",
      ]);

      // Tạo bản nháp lưu vào LocalStorage
      const draftId = `tpl_custom_${Date.now()}`;
      const draftWorkflow: FormWorkflow = {
        templateId: draftId,
        formCode: formCode.trim(),
        formTitle: formTitle.trim(),
        formTitleVi: formTitle.trim(),
        circularInfo: legalBasis.trim(),
        totalPages: 1,
        version: 1,
        status: "DRAFT",
        publishedAt: new Date().toISOString(),
        pages: [
          {
            pageNumber: 1,
            imageUrl: (deskewedCanvasRef.current || inCanvas).toDataURL('image/jpeg', 0.95),
            width: procWidth,
            height: procHeight,
          },
        ],
        totalSteps: generatedSteps.length,
        steps: generatedSteps,
      };

      if (!current()) return;
      try {
        FormStorageService.saveDraft(draftWorkflow);
      } catch (e) {
        console.warn("Storage error", e);
      }
      saveLocalDraft(localStorage, draftWorkflow);
      setIsScanning(false);
      onClose();

      // Chuyển thẳng sang Cổng đối soát để Admin căn chỉnh ô
      router.push(APP_ROUTES.review(draftId));
    } catch (analysisErr) {
      if (!current()) return;
      setTerminalLogs((prev) => [
        ...prev,
        `❌ Lỗi xử lý: ${(analysisErr as Error).message}`,
      ]);
      setIsScanning(false);
    } finally {
      if (current()) setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-300 flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wide">
                Tải Lên Biểu Mẫu Mới
              </h3>
              <p className="text-[11px] text-emerald-400 font-medium">
                Bóc tách khung ô tự động
              </p>
            </div>
          </div>
          {!isScanning && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nội dung Modal */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4 no-scrollbar">
          {/* HOẠT CẢNH QUÉT AI CÔNG NGHỆ CAO */}
          {isScanning ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Khung ảnh có tia laser và các box ảo bung ra */}
              <div className="relative w-full max-w-[340px] aspect-[1/1.3] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border-2 border-emerald-500/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl || "/assets/forms/01-lptb/page-1.jpg"}
                  alt="Scanning Form"
                  className="w-full h-full object-cover opacity-60"
                />

                {/* TIA LASER CHẠY LÊN XUỐNG */}
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-laser-scan z-30 pointer-events-none" />

                {/* CÁC BOX ẢO BUNG RA KHI PHÁT HIỆN */}
                {detectedBoxes.map((b, i) => (
                  <div
                    key={i}
                    style={{ top: b.top, left: b.left, width: b.width, height: b.height }}
                    className="absolute border-2 border-emerald-400 bg-emerald-400/20 rounded z-20 animate-pulse transition-all duration-300"
                  >
                    <span className="absolute -top-3 left-0 bg-emerald-600 text-white text-[8px] font-black px-1 rounded shadow">
                      Field #{i + 1}
                    </span>
                  </div>
                ))}

                {/* Lớp phủ hiệu ứng mờ */}
                <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />
              </div>

              {/* BẢNG LOG TERMINAL CHẠY CHỮ CÔNG NGHỆ CAO */}
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] space-y-1.5 shadow-inner">
                <div className="flex items-center gap-1.5 text-slate-400 pb-1 border-b border-slate-800">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-300">
                    AFL AI Vision Pipeline • Telemetry Status
                  </span>
                </div>
                <div className="space-y-1 pt-1 max-h-24 overflow-y-auto no-scrollbar">
                  {terminalLogs.map((log, index) => (
                    <div
                      key={index}
                      className={
                        log.startsWith("✔") ? "text-emerald-400 font-bold" : "text-slate-300"
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* FORM KÉO THẢ ẢNH GỐC */
            <>
              {/* Dropzone kéo thả ảnh */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  previewUrl
                    ? "border-emerald-500 bg-emerald-50/20"
                    : "border-slate-300 hover:border-emerald-600 bg-slate-50 hover:bg-slate-100/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="flex flex-col items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Xem trước ảnh scan"
                      className="max-h-40 object-contain rounded-lg shadow-sm border border-slate-300"
                    />
                    <span className="text-xs font-black text-emerald-800">
                      ✓ Đã chọn: {selectedFile?.name} (Chạm để chọn lại)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-1">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-black text-slate-800">
                      Kéo thả ảnh scan biểu mẫu vào đây hoặc bấm để chọn tệp{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      Hỗ trợ phôi trống PNG/JPEG tối đa 8 MB
                    </span>
                  </div>
                )}
              </div>

              {/* Thông tin metadata bắt buộc */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                      Mã biểu mẫu <span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Mẫu 01/LPTB"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                        !formCode.trim()
                          ? "border-slate-300 bg-slate-50"
                          : "border-emerald-500 bg-white"
                      }`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                      Tên biểu mẫu<span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Tờ khai đăng ký lại khai sinh..."
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                        !formTitle.trim()
                          ? "border-slate-300 bg-slate-50"
                          : "border-emerald-500 bg-white"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                    Căn cứ pháp lý <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Thông tư số 89/2026/TT-BTC ngày 30/6/2026 của Bộ Tài chính"
                    value={legalBasis}
                    onChange={(e) => setLegalBasis(e.target.value)}
                    className={`w-full text-xs font-medium px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                      !legalBasis.trim()
                        ? "border-slate-300 bg-slate-50"
                        : "border-emerald-500 bg-white"
                    }`}
                  />
                </div>
              </div>

              {/* Dòng cảnh báo điều kiện hợp lệ */}
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={blankTemplateConfirmed} onChange={e => setBlankTemplateConfirmed(e.target.checked)} />Đây là phôi trống, không chứa thông tin công dân; cho phép lưu phôi trong trình duyệt.</label>
              <label className="block text-sm">Khóa quản trị để tạo/lưu kịch bản AI (tùy chọn)<input type="password" autoComplete="off" value={adminKey} onChange={e => setAdminKey(e.target.value)} className="w-full border rounded p-2" /></label>
              {!isScanning && terminalLogs.length > 0 && <p role="status" className="text-amber-900">{terminalLogs.at(-1)}</p>}
              {!isFormValid && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Vui lòng tải tệp ảnh và điền đủ 3 mục (Mã biểu mẫu, Tên biểu mẫu, Căn cứ pháp lý) để kích hoạt AI quét nhé!
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Modal */}
        {!isScanning && (
          <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              Tất cả các trường gắn dấu (*) là bắt buộc
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg active:scale-95 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={!isFormValid || isScanning}
                onClick={handleStartAnalysis}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <span>Bắt Đầu Quét AI & Tạo Kịch Bản</span>
              </button>
            </div>
          </div>
        )}
        {/* Canvases ẩn cho OpenCV WASM */}
        <div className="hidden" aria-hidden="true">
          <canvas ref={inputCanvasRef} />
          <canvas ref={deskewedCanvasRef} />
          <canvas ref={documentOutlineCanvasRef} />
          <canvas ref={grayscaleCanvasRef} />
          <canvas ref={binaryCanvasRef} />
          <canvas ref={horizontalCanvasRef} />
          <canvas ref={verticalCanvasRef} />
          <canvas ref={combinedCanvasRef} />
          <canvas ref={candidateOverlayCanvasRef} />
        </div>
      </div>
    </div>
  );
}
