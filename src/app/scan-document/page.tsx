'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Scan, 
  AlertTriangle, 
  FileText, 
  Table as TableIcon, 
  Copy, 
  Download, 
  RefreshCw, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  FileCheck,
  Eye,
  Check,
  Zap,
} from 'lucide-react';
import { 
  runLineDetectionDebug,
  type DebugPipelineResult,
  type DocumentQuality, 
  type DocumentQuad,
} from '@/modules/opencv';
import type { DocumentExtractionResult } from '@/shared/document-extraction.types';

export default function ScanDocumentPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [documentHint, setDocumentHint] = useState<string>('auto');
  
  // Trạng thái xử lý
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Kết quả OpenCV & Vision
  const [deskewedDataUrl, setDeskewedDataUrl] = useState<string | null>(null);
  const [documentQuality, setDocumentQuality] = useState<DocumentQuality | null>(null);
  const [, setDetectedQuad] = useState<DocumentQuad | null>(null);
  const [opencvBoxesCount, setOpencvBoxesCount] = useState<number>(0);
  const [extractionResult, setExtractionResult] = useState<DocumentExtractionResult | null>(null);

  // Điều khiển giao diện
  const [activeTab, setActiveTab] = useState<'fields' | 'tables' | 'fulltext' | 'json'>('fields');
  const [imageDisplayMode, setImageDisplayMode] = useState<'deskewed' | 'original'>('deskewed');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavedToSession, setIsSavedToSession] = useState<boolean>(false);

  // Canvas refs cho pipeline OpenCV
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const deskewedCanvasRef = useRef<HTMLCanvasElement>(null);
  const documentOutlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const grayscaleCanvasRef = useRef<HTMLCanvasElement>(null);
  const binaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const horizontalCanvasRef = useRef<HTMLCanvasElement>(null);
  const verticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const combinedCanvasRef = useRef<HTMLCanvasElement>(null);
  const candidateOverlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dọn dẹp object URL khi unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Nạp ảnh mẫu nhanh
  const handleLoadSample = async (samplePath: string, hint: string) => {
    try {
      setErrorMessage(null);
      setExtractionResult(null);
      setDeskewedDataUrl(null);
      setDocumentQuality(null);
      setDetectedQuad(null);
      setOpencvBoxesCount(0);
      setIsSavedToSession(false);
      setDocumentHint(hint);
      setImagePreviewUrl(samplePath);

      const response = await fetch(samplePath);
      const blob = await response.blob();
      const file = new File([blob], samplePath.split('/').pop() || 'sample.jpg', { type: blob.type });
      setSelectedFile(file);
    } catch (e) {
      setErrorMessage(`Không thể nạp ảnh mẫu: ${(e as Error).message}`);
    }
  };

  // Xử lý khi chọn file từ máy
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setExtractionResult(null);
    setDeskewedDataUrl(null);
    setDocumentQuality(null);
    setDetectedQuad(null);
    setOpencvBoxesCount(0);
    setIsSavedToSession(false);
    setSelectedFile(file);

    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
  };

  // Khởi động toàn bộ pipeline: OpenCV Deskew -> Line/Box candidates -> Gemini Multimodal Vision
  const handleStartExtraction = async () => {
    if (!imagePreviewUrl) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setExtractionResult(null);
    setTelemetryLogs([]);
    setIsSavedToSession(false);

    const log = (msg: string) => {
      setTelemetryLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    try {
      // BƯỚC 1: Nạp ảnh vào ImageElement
      setProcessingStep('Đang chuẩn bị ảnh đầu vào...');
      log('Đọc file ảnh và nạp vào canvas...');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Không thể tải dữ liệu ảnh vào bộ nhớ'));
        img.src = imagePreviewUrl;
      });

      // Vẽ vào inputCanvas với giới hạn cạnh dài 1600px
      const inputCanvas = inputCanvasRef.current;
      if (!inputCanvas) throw new Error('Không tìm thấy input canvas');

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

      inputCanvas.width = width;
      inputCanvas.height = height;
      const ctx = inputCanvas.getContext('2d');
      if (!ctx) throw new Error('Không khởi tạo được context 2d');
      ctx.drawImage(img, 0, 0, width, height);

      log(`Kích thước phân tích: ${width}x${height}px`);

      // BƯỚC 2: Chạy OpenCV Debug Pipeline (Deskew + Line detection + Candidates)
      setProcessingStep('OpenCV WASM: Đang nắn phẳng phối cảnh & quét đường kẻ...');
      log('Kích hoạt OpenCV WASM runLineDetectionDebug...');

      let finalDataUrl = imagePreviewUrl;
      let deskewApplied = false;

      try {
        const pipelineResult: DebugPipelineResult = await runLineDetectionDebug({
          mode: 'camera-photo',
          inputCanvas: inputCanvasRef.current!,
          deskewedCanvas: deskewedCanvasRef.current!,
          documentOutlineCanvas: documentOutlineCanvasRef.current!,
          grayscaleCanvas: grayscaleCanvasRef.current!,
          binaryCanvas: binaryCanvasRef.current!,
          horizontalCanvas: horizontalCanvasRef.current!,
          verticalCanvas: verticalCanvasRef.current!,
          combinedCanvas: combinedCanvasRef.current!,
          candidateOverlayCanvas: candidateOverlayCanvasRef.current!,
        });

        setDocumentQuality(pipelineResult.quality);
        setDetectedQuad(pipelineResult.detectedQuad);
        setOpencvBoxesCount(pipelineResult.candidates.length);

        log(`Phát hiện tài liệu: ${pipelineResult.documentDetectionTimeMs.toFixed(0)}ms | Nắn phối cảnh: ${pipelineResult.perspectiveTransformTimeMs.toFixed(0)}ms`);
        log(`Tìm thấy ${pipelineResult.candidates.length} khung ô hình học.`);

        // Lấy data URL từ deskewedCanvas
        const dCanvas = deskewedCanvasRef.current;
        if (dCanvas && dCanvas.width > 0 && dCanvas.height > 0) {
          finalDataUrl = dCanvas.toDataURL('image/jpeg', 0.95);
          setDeskewedDataUrl(finalDataUrl);
          deskewApplied = true;
          log('Trích xuất ảnh nắn phẳng thành công (A4 Rectified).');
        } else {
          setDeskewedDataUrl(imagePreviewUrl);
        }
      } catch (cvErr) {
        log(`Lưu ý OpenCV Deskew: ${(cvErr as Error).message}. Tiếp tục xử lý với ảnh gốc.`);
        setDeskewedDataUrl(imagePreviewUrl);
      }

      // BƯỚC 3: Gửi sang Backend API Vision Engine để trích xuất 100% dữ liệu
      setProcessingStep('AI Vision Engine: Đang bóc tách toàn bộ thông tin văn bản...');
      log('Gửi ảnh sang endpoint /api/documents/extract (Gemini Multimodal Vision)...');

      const response = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: finalDataUrl,
          documentHint: documentHint,
          deskewApplied: deskewApplied,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Lỗi máy chủ HTTP ${response.status}`);
      }

      const resJson = await response.json();
      if (!resJson.success || !resJson.data) {
        throw new Error(resJson.error || 'Dữ liệu trả về không hợp lệ');
      }

      const data: DocumentExtractionResult = resJson.data;
      setExtractionResult(data);
      log(`Bóc tách thành công: ${data.fields.length} trường dữ liệu, ${data.tables.length} bảng biểu trong ${data.processingTimeMs}ms!`);
      setProcessingStep('Hoàn tất trích xuất toàn bộ thông tin!');

    } catch (err) {
      console.error('Lỗi quy trình bóc tách:', err);
      setErrorMessage((err as Error).message || 'Có lỗi xảy ra trong quá trình xử lý');
      log(`LỖI: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Sao chép giá trị từng trường
  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Lưu các trường then chốt vào Session RAM theo Nghị định 13
  const handleSaveToSessionRam = () => {
    if (!extractionResult) return;
    try {
      const sessionPayload = {
        savedAt: new Date().toISOString(),
        documentType: extractionResult.classification.documentType,
        documentNumber: extractionResult.classification.documentNumber,
        fields: extractionResult.fields.reduce((acc, f) => {
          acc[f.fieldKey] = f.fieldValue;
          return acc;
        }, {} as Record<string, string>),
      };
      sessionStorage.setItem('afl_prerequisite_document_data', JSON.stringify(sessionPayload));
      setIsSavedToSession(true);
      setTimeout(() => setIsSavedToSession(false), 3000);
    } catch (e) {
      alert(`Không thể lưu vào Session Storage: ${(e as Error).message}`);
    }
  };

  // Xuất file JSON
  const handleDownloadJson = () => {
    if (!extractionResult) return;
    const blob = new Blob([JSON.stringify(extractionResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_${extractionResult.classification.formCode || 'document'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* HEADER THANH TIÊU ĐỀ */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Scan className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              Universal Document Scanner & Inspector
              <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                WASM + AI Vision
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Quét ảnh, nắn phẳng phối cảnh & bóc tách 100% toàn bộ thông tin văn bản hành chính Việt Nam
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Nghị định 13/2023/NĐ-CP (Session RAM)</span>
          </div>
        </div>
      </header>

      {/* KHÔNG GIAN LÀM VIỆC CHÍNH */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CỘT TRÁI: BỘ NẠP ẢNH & CANVAS STUDIO (5 CỘT) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Card nạp ảnh */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                1. Nạp Ảnh Văn Bản Cần Quét
              </span>
              <span className="text-[11px] text-slate-500">JPG, PNG, WebP</span>
            </div>

            {/* Dropzone nạp ảnh */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-500 bg-slate-900/60 hover:bg-slate-900 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[140px] text-center"
            >
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                <Upload className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-xs font-bold text-slate-200">
                Chạm để chọn ảnh hoặc kéo thả vào đây
              </span>
              <span className="text-[11px] text-slate-500 mt-1">
                {selectedFile ? `Đã chọn: ${selectedFile.name}` : 'Hỗ trợ ảnh chụp điện thoại hoặc scan phẳng'}
              </span>
            </div>

            {/* Bộ nạp nhanh ảnh mẫu */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
              <span className="text-[11px] font-bold text-slate-400">Hoặc nạp nhanh ảnh mẫu có sẵn:</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('/assets/forms/01-lptb/page-1.jpg', 'land_tax')}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 text-left truncate"
                >
                  📄 Mẫu 01/LPTB
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('/assets/forms/khai-sinh/page-1.png', 'birth_cert')}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 text-left truncate"
                >
                  👶 Giấy Khai Sinh
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('/assets/test-form.jpg', 'traffic_ticket')}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 text-left truncate"
                >
                  🚨 Biên Bản Phạt
                </button>
              </div>
            </div>

            {/* Chọn gợi ý loại tài liệu */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">
                Gợi ý loại văn bản (Document Hint):
              </label>
              <select
                value={documentHint}
                onChange={(e) => setDocumentHint(e.target.value)}
                className="w-full text-xs font-bold px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="auto">🔍 Tự động phát hiện (Auto Detect)</option>
                <option value="traffic_ticket">🚨 Biên bản vi phạm giao thông / hành chính</option>
                <option value="land_tax">🏠 Tờ khai lệ phí trước bạ nhà đất (Mẫu 01/LPTB)</option>
                <option value="birth_cert">👶 Tờ khai đăng ký lại khai sinh</option>
              </select>
            </div>

            {/* Nút kích hoạt trích xuất */}
            <button
              type="button"
              disabled={!imagePreviewUrl || isProcessing}
              onClick={handleStartExtraction}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Đang Quét & Bóc Tách Thông Tin...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>Bắt Đầu Quét & Trích Xuất Toàn Bộ</span>
                </>
              )}
            </button>
          </div>

          {/* Khung hiển thị ảnh xem trước & Kết quả nắn phẳng */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                2. Studio Soi Ảnh & Phối Cảnh
              </span>
              
              {deskewedDataUrl && (
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setImageDisplayMode('deskewed')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      imageDisplayMode === 'deskewed'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Nắn phẳng
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageDisplayMode('original')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      imageDisplayMode === 'original'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ảnh gốc
                  </button>
                </div>
              )}
            </div>

            {/* Khung canvas preview */}
            <div className="relative w-full aspect-[3/4] bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center">
              {deskewedDataUrl && imageDisplayMode === 'deskewed' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={deskewedDataUrl}
                  alt="Ảnh đã nắn phẳng"
                  className="w-full h-full object-contain p-2"
                />
              ) : imagePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreviewUrl}
                  alt="Ảnh gốc nạp vào"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <FileText className="w-8 h-8 opacity-40" />
                  <span className="text-xs font-medium">Chưa có ảnh nào được chọn</span>
                </div>
              )}

              {/* Huy hiệu chỉ số chất lượng ảnh */}
              {documentQuality && (
                <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 backdrop-blur border border-slate-800 rounded-lg p-2 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    Độ tin cậy: <strong className="text-emerald-400">{(documentQuality.confidence * 100).toFixed(0)}%</strong>
                  </span>
                  <span className="text-slate-400">
                    Hình chữ nhật: <strong className="text-slate-200">{(documentQuality.rectangularity * 100).toFixed(0)}%</strong>
                  </span>
                  <span className="text-slate-400">
                    Ô hình học: <strong className="text-teal-400">{opencvBoxesCount} ô</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bảng Telemetry Log thời gian thực */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tiến trình xử lý: {processingStep || 'Chờ bắt đầu...'}</span>
            </div>
            <div className="h-28 overflow-y-auto bg-slate-900 border border-slate-800/80 rounded-lg p-2.5 font-mono text-[11px] space-y-1 text-slate-300">
              {telemetryLogs.length === 0 ? (
                <span className="text-slate-500 italic">Nhật ký xử lý sẽ hiển thị tại đây...</span>
              ) : (
                telemetryLogs.map((item, idx) => (
                  <div key={idx} className={item.includes('LỖI') ? 'text-rose-400 font-bold' : item.includes('thành công') ? 'text-emerald-400' : ''}>
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Canvases ngầm để OpenCV đọc và vẽ (ẩn trên DOM) */}
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

        {/* CỘT PHẢI: BẢNG KẾT QUẢ TRÍCH XUẤT 100% THÔNG TIN (7 CỘT) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Card Báo lỗi nếu có */}
          {errorMessage && (
            <div className="bg-rose-950/50 border border-rose-800 text-rose-200 rounded-2xl p-4 text-xs font-medium flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Đã xảy ra lỗi:</strong> {errorMessage}
              </div>
            </div>
          )}

          {/* Card thông tin phân loại văn bản (Classification Card) */}
          {extractionResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {extractionResult.classification.documentType}
                    </span>
                    {extractionResult.classification.formCode && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {extractionResult.classification.formCode}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-black text-white mt-1.5 leading-snug">
                    {extractionResult.classification.documentTitle}
                  </h2>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400 block font-mono">Thời gian trích xuất</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    {extractionResult.processingTimeMs} ms
                  </span>
                </div>
              </div>

              {/* Thông tin phụ: Cơ quan, ngày lập, số hiệu */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Cơ quan ban hành:</span>
                  <span className="text-slate-200 font-medium">{extractionResult.classification.issuingAuthority || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Ngày lập/ký:</span>
                  <span className="text-slate-200 font-medium">{extractionResult.classification.issuedDate || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Số hiệu văn bản:</span>
                  <span className="text-slate-200 font-medium">{extractionResult.classification.documentNumber || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Card Bảng điều khiển Tabs & Chi tiết nội dung trích xuất */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-xl flex-1 flex flex-col overflow-hidden">
            
            {/* Header Tabs */}
            <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('fields')}
                  className={`px-3.5 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                    activeTab === 'fields'
                      ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Các Trường Dữ Liệu ({extractionResult?.fields.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('tables')}
                  className={`px-3.5 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                    activeTab === 'tables'
                      ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TableIcon className="w-4 h-4" />
                  <span>Bảng Biểu ({extractionResult?.tables.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('fulltext')}
                  className={`px-3.5 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                    activeTab === 'fulltext'
                      ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Toàn Văn (Markdown)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('json')}
                  className={`px-3.5 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                    activeTab === 'json'
                      ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="font-mono">{'{ }'}</span>
                  <span>JSON Thô</span>
                </button>
              </div>

              {/* Nút hành động nhanh trên header tab */}
              {extractionResult && (
                <div className="flex items-center gap-2 pb-2">
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    title="Tải file JSON về máy"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Nội dung Tab */}
            <div className="p-5 flex-1 overflow-y-auto max-h-[560px]">
              
              {!extractionResult ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 gap-3">
                  <Scan className="w-12 h-12 stroke-[1.5] text-slate-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-400">Chưa có dữ liệu trích xuất</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vui lòng chọn ảnh và bấm nút <strong>[Bắt Đầu Quét & Trích Xuất]</strong> để hiển thị kết quả.
                    </p>
                  </div>
                </div>
              ) : activeTab === 'fields' ? (
                /* TAB 1: DANH SÁCH CÁC TRƯỜNG KEY-VALUE */
                <div className="flex flex-col gap-3">
                  {extractionResult.fields.map((field, idx) => (
                    <div 
                      key={field.fieldKey || idx}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {field.fieldKey}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            field.category === 'identity' ? 'bg-indigo-500/20 text-indigo-300' :
                            field.category === 'financial' ? 'bg-amber-500/20 text-amber-300' :
                            field.category === 'legal_event' ? 'bg-rose-500/20 text-rose-300' :
                            field.category === 'property' ? 'bg-emerald-500/20 text-emerald-300' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {field.category}
                          </span>
                          {field.isSensitive && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              PII
                            </span>
                          )}
                        </div>

                        {/* Điểm tin cậy & nút copy */}
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] font-mono text-emerald-400 font-bold">
                            {(field.confidence * 100).toFixed(0)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(field.fieldKey, field.fieldValue)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all"
                            title="Sao chép giá trị"
                          >
                            {copiedField === field.fieldKey ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-baseline">
                        <span className="sm:col-span-4 text-xs font-bold text-slate-400">
                          {field.fieldLabel}:
                        </span>
                        <span className="sm:col-span-8 text-xs font-black text-white bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80 break-words">
                          {field.fieldValue}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeTab === 'tables' ? (
                /* TAB 2: BẢNG BIỂU */
                <div className="flex flex-col gap-5">
                  {extractionResult.tables.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      Không phát hiện thấy bảng biểu nào trên văn bản này.
                    </div>
                  ) : (
                    extractionResult.tables.map((table, tIdx) => (
                      <div key={tIdx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        {table.tableName && (
                          <div className="px-4 py-2 bg-slate-800/60 font-bold text-xs text-slate-200 border-b border-slate-800">
                            {table.tableName}
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                              <tr>
                                {table.headers.map((h, hIdx) => (
                                  <th key={hIdx} className="px-3.5 py-2.5 font-black">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {table.rows.map((r, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-800/40">
                                  {r.map((c, cIdx) => (
                                    <td key={cIdx} className="px-3.5 py-2 font-medium text-slate-200">{c}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === 'fulltext' ? (
                /* TAB 3: TOÀN VĂN MARKDOWN */
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {extractionResult.fullText || 'Không có nội dung văn bản'}
                </div>
              ) : (
                /* TAB 4: JSON THÔ */
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => handleCopy('raw_json', JSON.stringify(extractionResult, null, 2))}
                    className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 border border-slate-700"
                  >
                    {copiedField === 'raw_json' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Đã chép!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép JSON</span>
                      </>
                    )}
                  </button>
                  <pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-[460px]">
                    {JSON.stringify(extractionResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer hành động hạ nguồn (Action Toolbar) */}
            {extractionResult && (
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveToSessionRam}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                      isSavedToSession
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {isSavedToSession ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Đã lưu vào Session RAM!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Lưu vào Session RAM (Nghị định 13)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải kết quả JSON</span>
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </main>
    </div>
  );
}
