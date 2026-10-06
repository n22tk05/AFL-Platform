'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from 'react';
import {
  DEFAULT_LINE_DETECTION_CONFIG,
  DEFAULT_PREPROCESS_CONFIG,
  runLineDetectionDebug,
  type DebugPipelineResult,
  DocumentDetectionError,
  type DocumentMode,
  type DocumentQuality,
  type DocumentQuad,
} from '@/modules/opencv';
import { JsonReview } from '@/components/documents/JsonReview';
import { assembleCandidatesToJson, type RecognizedCandidate } from '@/modules/documents/candidate-json-assembler';
import type { DocumentJsonExport, ExportBox } from '@/shared/document-export.types';
import type { PixelRect } from '@/modules/opencv/field-types';
import { DOCUMENT_LIMITS, ADAPTIVE_IMAGE_CONFIG, CANDIDATE_OCR_CONFIG } from '@/modules/documents/config';
import { validateImageDimensions } from '@/modules/documents/image-quality';
import { mapCandidateRect } from '@/modules/documents/candidate-frame';
import { loadOpenCv } from '@/modules/opencv/loader';
import { warpDocument } from '@/modules/opencv/perspective-transform';
import type { CvMat } from '@/modules/opencv/types';

const MAX_LONG_SIDE = 1600;
type Status = 'idle' | 'decoding' | 'ready' | 'loading' | 'processing' | 'success' | 'error';

interface ModalPreview {
  label: string;
  dataUrl: string;
  width: number;
  height: number;
}

function cropCandidateToDataUrl(sourceCanvas: HTMLCanvasElement, rect: PixelRect): string {
  const cropCanvas = document.createElement('canvas');
  const padding = CANDIDATE_OCR_CONFIG.cropPadding;
  const padX = Math.max(0, rect.x - padding);
  const padY = Math.max(0, rect.y - padding);
  const padW = Math.min(sourceCanvas.width, rect.x + rect.width + padding) - padX;
  const padH = Math.min(sourceCanvas.height, rect.y + rect.height + padding) - padY;

  cropCanvas.width = Math.max(1, padW);
  cropCanvas.height = Math.max(1, padH);
  const ctx = cropCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(sourceCanvas, padX, padY, padW, padH, 0, 0, padW, padH);
  }
  try { return cropCanvas.toDataURL('image/png'); }
  finally { cropCanvas.width = 0; cropCanvas.height = 0; }
}

function isCheckboxChecked(sourceCanvas: HTMLCanvasElement, rect: PixelRect): boolean | null {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return null;
  const innerX = Math.round(rect.x + rect.width * 0.2);
  const innerY = Math.round(rect.y + rect.height * 0.2);
  const innerW = Math.max(1, Math.round(rect.width * 0.6));
  const innerH = Math.max(1, Math.round(rect.height * 0.6));

  try {
    const imgData = ctx.getImageData(innerX, innerY, innerW, innerH);
    const data = imgData.data;
    let darkPixels = 0;
    const total = innerW * innerH;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      if (brightness < 160) {
        darkPixels++;
      }
    }
    return darkPixels / total > 0.12;
  } catch {
    return false;
  }
}

interface CanvasPanelProps {
  label: string;
  canvasRef: RefObject<HTMLCanvasElement>;
  visible: boolean;
  emptyMessage: string;
  onExpand?: (label: string, canvasRef: RefObject<HTMLCanvasElement>) => void;
}

function CanvasPanel({ label, canvasRef, visible, emptyMessage, onExpand }: CanvasPanelProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <article style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>{label}</h2>
        {visible && onExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand(label, canvasRef);
            }}
            title="Mở rộng xem chi tiết"
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            🔍 Mở rộng
          </button>
        )}
      </div>
      <div
        style={{
          ...canvasFrameStyle,
          cursor: visible && onExpand ? 'zoom-in' : 'default',
          borderColor: isHovered && visible ? '#3b82f6' : '#cbd5e1',
          backgroundColor: isHovered && visible ? '#f0f9ff' : '#f8fafc',
          position: 'relative',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (visible && onExpand) {
            onExpand(label, canvasRef);
          }
        }}
        title={visible && onExpand ? 'Click vào đây để mở rộng xem chi tiết' : undefined}
      >
        <canvas ref={canvasRef} style={{ ...canvasStyle, display: visible ? 'block' : 'none' }} />
        {visible && isHovered && onExpand && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 999,
              pointerEvents: 'none',
              backdropFilter: 'blur(2px)',
            }}
          >
            🔍 Click để phóng to
          </div>
        )}
        {!visible && <span style={{ color: '#6b7280', fontSize: 14, textAlign: 'center' }}>{emptyMessage}</span>}
      </div>
    </article>
  );
}

export default function OpenCvTestPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [result, setResult] = useState<DebugPipelineResult | null>(null);
  const [mode, setMode] = useState<DocumentMode>('clean-scan');
  const [rejection, setRejection] = useState<{ quality: DocumentQuality; quad: DocumentQuad | null; timeMs: number } | null>(null);
  const [preview, setPreview] = useState<ModalPreview | null>(null);
  const [zoom, setZoom] = useState(1);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrStepText, setOcrStepText] = useState('');
  const [ocrResult, setOcrResult] = useState<{
    document: DocumentJsonExport;
    sourcePreview: string;
    rawText: string;
    candidates: (RecognizedCandidate & { cropDataUrl?: string })[];
    warnings: string[];
  } | null>(null);
  const [ocrTab, setOcrTab] = useState<'preview' | 'candidates'>('preview');
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [selectedJsonBox, setSelectedJsonBox] = useState<ExportBox | null>(null);
  const nativeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrController = useRef<AbortController>();
  const ocrGeneration = useRef(0);
  const expiryRef = useRef<ReturnType<typeof setTimeout>>();
  const cancelOcr = useCallback(() => {
    ocrGeneration.current++; ocrController.current?.abort();
    setIsOcrRunning(false); setOcrResult(null); setSelectedJsonBox(null); setOcrNotice(null); setOcrStepText('');
  }, []);

  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const grayscaleCanvasRef = useRef<HTMLCanvasElement>(null);
  const binaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const horizontalCanvasRef = useRef<HTMLCanvasElement>(null);
  const verticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const combinedCanvasRef = useRef<HTMLCanvasElement>(null);
  const candidateOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const documentOutlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const deskewedCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeUrlRef = useRef<string | null>(null);
  const selectionIdRef = useRef(0);
  const runningRef = useRef(false);

  const clearOutputCanvases = useCallback(() => {
    [grayscaleCanvasRef, binaryCanvasRef, horizontalCanvasRef, verticalCanvasRef, combinedCanvasRef, candidateOverlayCanvasRef, documentOutlineCanvasRef, deskewedCanvasRef].forEach((canvasRef) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    });
  }, []);

  useEffect(() => () => {
    selectionIdRef.current++;
    ocrGeneration.current++; ocrController.current?.abort(); clearTimeout(expiryRef.current);
    if (nativeCanvasRef.current) { nativeCanvasRef.current.width = 0; nativeCanvasRef.current.height = 0; }
    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
  }, []);

  const handleExpand = useCallback((label: string, canvasRef: RefObject<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setPreview({
        label,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
      });
      setZoom(1);
    } catch (err) {
      console.error('Không thể mở rộng canvas:', err);
    }
  }, []);

  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null);
      } else if (event.key === '+' || event.key === '=') {
        setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
      } else if (event.key === '-' || event.key === '_') {
        setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
      } else if (event.key === '0') {
        setZoom(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (runningRef.current) return;
    const file = event.target.files?.[0];
    const selectionId = ++selectionIdRef.current;
    cancelOcr(); setPreview(null); clearTimeout(expiryRef.current);
    if (nativeCanvasRef.current) { nativeCanvasRef.current.width = 0; nativeCanvasRef.current.height = 0; nativeCanvasRef.current = null; }
    setErrorMessage(null);
    setHasResults(false);
    setResult(null);
    setRejection(null);
    setImageInfo(null);
    setImageReady(false);
    setCurrentFile(file || null);
    setOcrResult(null);
    setOcrNotice(null);
    clearOutputCanvases();

    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    if (!file) {
      setImageInfo(null);
      setStatus('idle');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageInfo(null);
      setStatus('error');
      setErrorMessage(`File "${file.type || 'không xác định'}" không phải JPEG hoặc PNG.`);
      return;
    }
    if (!file.size || file.size > DOCUMENT_LIMITS.fileBytes) { setStatus('error'); setErrorMessage('Chọn ảnh tối đa 8 MB.'); return; }

    setStatus('decoding');
    const objectUrl = URL.createObjectURL(file);
    activeUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (activeUrlRef.current === objectUrl) activeUrlRef.current = null;
      if (selectionId !== selectionIdRef.current) return;

      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      try { validateImageDimensions(image.naturalWidth, image.naturalHeight); }
      catch { setStatus('error'); setErrorMessage('Ảnh vượt giới hạn 12 triệu pixel hoặc kích thước không hợp lệ.'); return; }
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0 || longestSide <= 0) {
        setStatus('error');
        setErrorMessage('Ảnh có kích thước không hợp lệ.');
        return;
      }
      const scale = longestSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longestSide : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const inputCanvas = inputCanvasRef.current;
      const context = inputCanvas?.getContext('2d');
      if (!inputCanvas || !context) {
        setStatus('error');
        setErrorMessage('Không thể khởi tạo canvas ảnh gốc.');
        return;
      }

      inputCanvas.width = width;
      inputCanvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const nativeCanvas = document.createElement('canvas');
      nativeCanvas.width = image.naturalWidth; nativeCanvas.height = image.naturalHeight;
      const nativeContext = nativeCanvas.getContext('2d');
      if (!nativeContext) { setStatus('error'); setErrorMessage('Không tạo được ảnh OCR.'); return; }
      nativeContext.drawImage(image, 0, 0); nativeCanvasRef.current = nativeCanvas;
      expiryRef.current = setTimeout(() => {
        selectionIdRef.current++; cancelOcr(); setPreview(null); clearOutputCanvases();
        nativeCanvas.width = 0; nativeCanvas.height = 0; nativeCanvasRef.current = null;
        inputCanvas.width = 0; inputCanvas.height = 0;
        setCurrentFile(null); setImageReady(false); setHasResults(false); setResult(null); setImageInfo(null); setRejection(null);
        setStatus('idle'); setErrorMessage('Phiên đã hết hạn; ảnh và kết quả đã được xóa.');
      }, DOCUMENT_LIMITS.sessionTtlMs);
      [grayscaleCanvasRef, binaryCanvasRef, horizontalCanvasRef, verticalCanvasRef, combinedCanvasRef, candidateOverlayCanvasRef].forEach((canvasRef) => {
        if (canvasRef.current) {
          canvasRef.current.width = width;
          canvasRef.current.height = height;
        }
      });
      setImageInfo(`Gốc: ${image.naturalWidth}×${image.naturalHeight}px · Xử lý: ${width}×${height}px · ${file.name}`);
      setImageReady(true);
      setStatus('ready');
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (activeUrlRef.current === objectUrl) activeUrlRef.current = null;
      if (selectionId !== selectionIdRef.current) return;
      setImageInfo(null);
      setStatus('error');
      setErrorMessage('Không thể giải mã ảnh đã chọn.');
    };
    image.src = objectUrl;
  }, [clearOutputCanvases, cancelOcr]);

  const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (runningRef.current) return;
    setMode(event.target.value as DocumentMode);
    cancelOcr(); setPreview(null);
    setErrorMessage(null);
    setHasResults(false);
    setResult(null);
    setRejection(null);
    clearOutputCanvases();
    setStatus(imageReady ? 'ready' : status === 'decoding' ? 'decoding' : 'idle');
  };

  const runPipeline = useCallback(async () => {
    if (runningRef.current || !imageReady) return;
    const inputCanvas = inputCanvasRef.current;
    const grayscaleCanvas = grayscaleCanvasRef.current;
    const binaryCanvas = binaryCanvasRef.current;
    const horizontalCanvas = horizontalCanvasRef.current;
    const verticalCanvas = verticalCanvasRef.current;
    const combinedCanvas = combinedCanvasRef.current;
    const candidateOverlayCanvas = candidateOverlayCanvasRef.current;
    const documentOutlineCanvas = documentOutlineCanvasRef.current;
    const deskewedCanvas = deskewedCanvasRef.current;
    if (!inputCanvas || !grayscaleCanvas || !binaryCanvas || !horizontalCanvas || !verticalCanvas || !combinedCanvas || !candidateOverlayCanvas || !documentOutlineCanvas || !deskewedCanvas) return;

    runningRef.current = true;
    cancelOcr(); setPreview(null);
    const selectionId = selectionIdRef.current;
    setErrorMessage(null);
    setHasResults(false);
    setResult(null);
    setRejection(null);
    clearOutputCanvases();
    setStatus('loading');
    try {
      const pipelineResult = await runLineDetectionDebug({
        mode,
        documentOutlineCanvas,
        deskewedCanvas,
        inputCanvas,
        grayscaleCanvas,
        binaryCanvas,
        horizontalCanvas,
        verticalCanvas,
        combinedCanvas,
        candidateOverlayCanvas,
        preprocessConfig: DEFAULT_PREPROCESS_CONFIG,
        lineConfig: DEFAULT_LINE_DETECTION_CONFIG,
        onOpenCvReady: () => setStatus('processing'),
      });
      if (selectionId !== selectionIdRef.current) return;
      setResult(pipelineResult);
      setHasResults(true);
      setStatus('success');
    } catch (error: unknown) {
      if (selectionId !== selectionIdRef.current) return;
      if (error instanceof DocumentDetectionError) setRejection({ quality: error.quality, quad: error.sourceQuad, timeMs: error.documentDetectionTimeMs });
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi OpenCV không xác định.');
    } finally {
      runningRef.current = false;
    }
  }, [clearOutputCanvases, imageReady, mode, cancelOcr]);

  const runVietOcrOnCandidates = useCallback(async () => {
    if (!result || result.candidates.length === 0 || isOcrRunning) return;
    const nativeInput = nativeCanvasRef.current;
    if (!nativeInput || !nativeInput.width || !nativeInput.height) {
      setErrorMessage('Không tìm thấy canvas hình ảnh để trích xuất chữ.');
      return;
    }
    cancelOcr();
    const requestId = ocrGeneration.current;
    const abort = new AbortController(); ocrController.current = abort;
    const canvas = document.createElement('canvas');
    setIsOcrRunning(true);
    setErrorMessage(null);
    setOcrNotice(null);
    setOcrStepText(`Đang chuẩn bị cắt ${result.candidates.length} candidates...`);

    try {
      const cv = await loadOpenCv() as unknown as { imread(c: HTMLCanvasElement): CvMat; imshow(c: HTMLCanvasElement, m: CvMat): void };
      if (requestId !== ocrGeneration.current) return;
      let original: CvMat | undefined, warped: CvMat | undefined;
      try {
        original = cv.imread(nativeInput);
        if (result.detectedQuad) {
          const sx = nativeInput.width / result.sourceWidth, sy = nativeInput.height / result.sourceHeight;
          const scalePoint = (p: {x: number; y: number}) => ({x: p.x * sx, y: p.y * sy});
          const q = result.detectedQuad;
          warped = warpDocument(cv as unknown as Parameters<typeof warpDocument>[0], original, {
            topLeft: scalePoint(q.topLeft), topRight: scalePoint(q.topRight),
            bottomLeft: scalePoint(q.bottomLeft), bottomRight: scalePoint(q.bottomRight),
          }, ADAPTIVE_IMAGE_CONFIG).deskewed;
        }
        cv.imshow(canvas, warped ?? original);
      } finally { warped?.delete(); original?.delete(); }
      const recognizedCandidates: (RecognizedCandidate & { cropDataUrl?: string })[] = [];
      const linesToOcr: {
        lineId: string;
        image: string;
        coordinates: [number, number, number, number];
        originalWidth: number;
        originalHeight: number;
        candidate: (typeof result.candidates)[number];
      }[] = [];

      for (let i = 0; i < result.candidates.length; i++) {
        const sourceCandidate = result.candidates[i];
        const candidate = { ...sourceCandidate, rect: mapCandidateRect(sourceCandidate.rect, result, canvas) };

        // Skip outer container frames
        if (candidate.isContainer) continue;

        // Checkbox: analyze inner pixels directly on canvas
        if (candidate.source === 'checkbox') {
          const checked = isCheckboxChecked(canvas, candidate.rect);
          recognizedCandidates.push({
            candidateId: candidate.candidateId,
            rect: candidate.rect,
            source: candidate.source,
            isContainer: false,
            text: '',
            checkboxState: checked === null ? 'unknown' : checked ? 'checked' : 'unchecked',
            confidence: null,
            cropDataUrl: cropCandidateToDataUrl(canvas, candidate.rect),
          });
          continue;
        }

        // Text candidates: crop
        const cropDataUrl = cropCandidateToDataUrl(canvas, candidate.rect);
        const ymin = candidate.rect.y / canvas.height;
        const xmin = candidate.rect.x / canvas.width;
        const ymax = (candidate.rect.y + candidate.rect.height) / canvas.height;
        const xmax = (candidate.rect.x + candidate.rect.width) / canvas.width;

        linesToOcr.push({
          lineId: candidate.candidateId,
          image: cropDataUrl,
          coordinates: [ymin, xmin, ymax, xmax],
          originalWidth: candidate.rect.width,
          originalHeight: candidate.rect.height,
          candidate,
        });
      }

      const predictionsMap = new Map<string, { text: string; confidence?: number | null }>();
      if (linesToOcr.length > CANDIDATE_OCR_CONFIG.maxRegions) throw new Error('Có hơn 70 vùng chữ. Dùng trang Đọc chứng từ để đọc toàn trang; không tự bỏ vùng.');
      if (linesToOcr.length) {
        setOcrStepText('Đang đọc nội dung…');
        const res = await fetch('/api/documents/candidates-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal, cache: 'no-store',
          body: JSON.stringify({
            lines: linesToOcr.map((l) => ({
              lineId: l.lineId,
              image: l.image,
              coordinates: l.coordinates,
              originalWidth: l.originalWidth,
              originalHeight: l.originalHeight,
            })),
          }),
        });
        if (requestId !== ocrGeneration.current) return;
        const resData = await res.json();
        if (requestId !== ocrGeneration.current) return;
        if (!res.ok || !resData.success) {
          throw new Error(typeof resData.error === 'string' ? resData.error : 'Không đọc được vùng chữ.');
        }

        for (const pred of resData.predictions || []) {
          predictionsMap.set(pred.lineId, {
            text: pred.text,
            confidence: pred.confidence,
          });
        }
      }

      for (const line of linesToOcr) {
        const pred = predictionsMap.get(line.lineId);
        recognizedCandidates.push({
          candidateId: line.candidate.candidateId,
          rect: line.candidate.rect,
          source: line.candidate.source,
          isContainer: false,
          text: pred?.text || '',
          confidence: pred?.confidence ?? null,
          cropDataUrl: line.image,
        });
      }

      setOcrStepText('Đang kiểm tra kết quả…');

      // Assemble into JSON
      const assembled = assembleCandidatesToJson(recognizedCandidates, {
        width: canvas.width,
        height: canvas.height,
      });

      if (requestId !== ocrGeneration.current) return;
      const reviewWarnings = recognizedCandidates.filter(c => !c.text.trim() || c.confidence === null || (c.confidence ?? 0) < ADAPTIVE_IMAGE_CONFIG.retryConfidence)
        .map(c => `${c.candidateId}: ${!c.text.trim() ? 'Chưa đọc được vùng này' : 'Cần kiểm tra với ảnh nguồn'}`);
      setOcrResult({
        document: assembled,
        sourcePreview: canvas.toDataURL('image/png'),
        rawText: assembled.rawText,
        candidates: recognizedCandidates,
        warnings: [...assembled.warnings, 'OCR theo vùng không đảm bảo đã đọc toàn bộ trang. Checkbox là phân tích ảnh và cần xác nhận.', ...reviewWarnings],
      });

      setOcrTab('preview');
      setOcrNotice(assembled.rawText.trim() ? 'Bản nháp cần đối chiếu với ảnh nguồn trước khi tải.' : 'Chưa đọc được vùng này. Hãy xem ảnh nguồn.');
    } catch (err) {
      if (requestId === ocrGeneration.current) setErrorMessage(err instanceof Error ? err.message : 'Không đọc được ảnh.');
    } finally {
      canvas.width = 0; canvas.height = 0;
      if (requestId === ocrGeneration.current) { setIsOcrRunning(false); setOcrStepText(''); }
    }
  }, [isOcrRunning, result, cancelOcr]);

  const isBusy = status === 'loading' || status === 'processing';
  const buttonDisabled = !imageReady || isBusy;

  return (
    <main style={mainStyle}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: '#2563eb', fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>AFL PLATFORM · OPENCV DEBUG</p>
        <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Pipeline phát hiện đường biểu mẫu</h1>
        <p style={{ color: '#4b5563', margin: 0 }}>Tải JPEG/PNG để xem grayscale, threshold và mask đường ngang/dọc.</p>
      </header>

      <section style={controlsStyle}>
        <label style={{ display: 'grid', gap: 6 }}>
          Chế độ xử lý
          <select value={mode} onChange={handleModeChange} disabled={isBusy}>
            <option value="camera-photo">Ảnh chụp từ camera</option>
            <option value="clean-scan">Ảnh scan/PDF đã thẳng</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 14 }}>
          Chọn ảnh JPEG hoặc PNG
          <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} disabled={isBusy} />
        </label>
        <button type="button" onClick={runPipeline} disabled={buttonDisabled} style={buttonStyle(buttonDisabled)}>
          {status === 'loading' ? 'Đang tải OpenCV…' : status === 'processing' ? 'Đang xử lý…' : 'Chạy pipeline phát hiện đường'}
        </button>
        <span style={statusStyle(status)}>{statusText(status)}</span>
      </section>

      {imageInfo && <p style={infoStyle}>{imageInfo}</p>}
      {errorMessage && (
        <div role="alert" style={errorStyle}>
          <p style={{ margin: '0 0 6px' }}>{errorMessage}</p>
          {mode === 'camera-photo' && (
            <button
              type="button"
              onClick={() => {
                cancelOcr(); setHasResults(false); setResult(null); clearOutputCanvases(); setMode('clean-scan');
                setErrorMessage(null);
                setRejection(null);
              }}
              style={{ ...buttonStyle(false), background: '#10b981', padding: '6px 12px', fontSize: 13 }}
            >
              ➜ Thử đọc toàn ảnh bằng chế độ &quot;Clean scan&quot; (Bỏ qua tìm góc camera)
            </button>
          )}
        </div>
      )}
      <p style={infoStyle}>{mode === 'camera-photo' ? 'Ảnh camera: tự tìm giấy, kiểm tra chất lượng và nắn phối cảnh trước khi phát hiện đường.' : 'Clean scan: dùng toàn ảnh làm trang; bỏ qua phát hiện giấy. Chọn JPEG/PNG (kể cả trang PDF đã xuất thành ảnh).'}</p>
      {(result || rejection) && <section style={infoStyle}>
        <p>Đầu ra: {result ? `${result.width} × ${result.height}px` : 'Không nắn: tài liệu bị từ chối'} · Detect: {result?.documentDetectionTimeMs ?? rejection?.timeMs} ms · Warp: {result?.perspectiveTransformTimeMs ?? 0} ms</p>
        <DocumentQualityPanel quality={result?.quality ?? rejection?.quality ?? null} />
        {(result?.detectedQuad || rejection?.quad) && <details><summary>Bốn góc trong ảnh đầu vào</summary><pre style={{ overflowX: 'auto' }}>{JSON.stringify(result?.detectedQuad ?? rejection?.quad, null, 2)}</pre></details>}
      </section>}
      {result && <section style={timingStyle}><strong>Hoàn tất trong {result.totalProcessingTimeMs} ms · {result.candidates.length} candidates</strong><span>OpenCV: {result.openCvLoadTimeMs} ms · Grayscale: {result.grayscaleTimeMs} ms · Binary: {result.binaryTimeMs} ms · Lines: {result.lineDetectionTimeMs} ms · Contours: {result.contourDetectionTimeMs} ms</span></section>}

      <section style={configStyle}>
        <strong>Debug config</strong>
        <span>adaptiveBlockSize={DEFAULT_PREPROCESS_CONFIG.adaptiveBlockSize}</span><span>adaptiveC={DEFAULT_PREPROCESS_CONFIG.adaptiveC}</span><span>blurKernelSize={DEFAULT_PREPROCESS_CONFIG.blurKernelSize}</span>
        <span>horizontalKernelDivisor={DEFAULT_LINE_DETECTION_CONFIG.horizontalKernelDivisor}</span><span>verticalKernelDivisor={DEFAULT_LINE_DETECTION_CONFIG.verticalKernelDivisor}</span><span>closeGapSize={DEFAULT_LINE_DETECTION_CONFIG.closeGapSize}</span>
      </section>

      <section style={gridStyle}>
        <CanvasPanel label="1. Ảnh gốc" canvasRef={inputCanvasRef} visible={imageReady} emptyMessage="Chọn ảnh để bắt đầu" onExpand={handleExpand} />
        <CanvasPanel label="Document outline" canvasRef={documentOutlineCanvasRef} visible={hasResults || rejection !== null} emptyMessage="Chưa phát hiện tài liệu" onExpand={handleExpand} />
        <CanvasPanel label={result?.detectedQuad ? 'Trang đã nắn phối cảnh' : 'Toàn ảnh (không nắn phối cảnh)'} canvasRef={deskewedCanvasRef} visible={hasResults} emptyMessage="Chưa có trang xử lý" onExpand={handleExpand} />
        <CanvasPanel label="2. Grayscale" canvasRef={grayscaleCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
        <CanvasPanel label="3. Binary" canvasRef={binaryCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
        <CanvasPanel label="4. Horizontal lines" canvasRef={horizontalCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
        <CanvasPanel label="5. Vertical lines" canvasRef={verticalCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
        <CanvasPanel label="6. Combined mask" canvasRef={combinedCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
        <CanvasPanel label="7. Field candidates" canvasRef={candidateOverlayCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" onExpand={handleExpand} />
      </section>
      {result && <CandidateTable result={result} />}

      {result && (
        <section style={{ marginTop: 28, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                3. Áp dụng VietOCR & Chuyển đổi sang JSON (.json)
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                VietOCR cục bộ đọc các vùng từ ảnh màu gốc, một lần gọi có giới hạn. Đối chiếu ảnh nguồn; chưa kiểm chứng độ đầy đủ hoặc định dạng pháp lý.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={runVietOcrOnCandidates}
                disabled={isOcrRunning || isBusy}
                style={{
                  ...buttonStyle(isOcrRunning || isBusy),
                  background: isOcrRunning ? '#94a3b8' : '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  padding: '10px 18px',
                }}
              >
                {isOcrRunning ? '⏳ ' + (ocrStepText || 'Đang nhận diện...') : '⚡ Áp dụng VietOCR & Xem trước JSON'}
              </button>
            </div>
          </div>

          {/* Notice / Toast */}
          {ocrNotice && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>✅ {ocrNotice}</span>
              <button type="button" onClick={() => setOcrNotice(null)} style={{ background: 'transparent', border: 0, color: '#065f46', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>
          )}

          {/* Result Preview Container */}
          {ocrResult && (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ position: 'relative', width: 'min(100%, 680px)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ocrResult.sourcePreview} alt="Ảnh nguồn OCR theo vùng" style={{ width: '100%', display: 'block' }} />
                {selectedJsonBox && <div data-testid="candidate-json-source-box" style={{ position: 'absolute', pointerEvents: 'none', border: '3px solid #ef4444', left: selectedJsonBox[0] * 100 + '%', top: selectedJsonBox[1] * 100 + '%', width: (selectedJsonBox[2] - selectedJsonBox[0]) * 100 + '%', height: (selectedJsonBox[3] - selectedJsonBox[1]) * 100 + '%' }} />}
              </div>
              <JsonReview key={ocrGeneration.current} draft={ocrResult.document} filename={currentFile?.name || 'document'} disabled={isOcrRunning} onSelect={setSelectedJsonBox} />
              <button style={modalBtnStyle} onClick={() => setOcrTab(ocrTab === 'candidates' ? 'preview' : 'candidates')}>Chi tiết từng Candidate</button>
              {/* Tab 3: Candidate OCR Breakdown */}
              {ocrTab === 'candidates' && (
                <div style={{ maxHeight: 460, overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 800, width: '100%' }}>
                    <thead>
                      <tr>
                        {['ID', 'Loại', 'Ảnh cắt (Crop)', 'Văn bản nhận diện (VietOCR)', 'Tọa độ pixel', 'Độ tin cậy'].map((label) => (
                          <th key={label} style={tableHeaderStyle}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ocrResult.candidates.map((cand) => (
                        <tr key={cand.candidateId}>
                          <td style={tableCellStyle}><strong>{cand.candidateId}</strong></td>
                          <td style={tableCellStyle}>
                            <span style={{
                              background: cand.source === 'checkbox' ? '#dcfce7' : cand.source === 'field_row' ? '#fef3c7' : cand.source === 'phrase_cluster' ? '#ede9fe' : '#fee2e2',
                              color: cand.source === 'checkbox' ? '#166534' : cand.source === 'field_row' ? '#92400e' : cand.source === 'phrase_cluster' ? '#6d28d9' : '#991b1b',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              {cand.source === 'checkbox' ? 'Checkbox' : cand.source === 'field_row' ? 'Dòng' : cand.source === 'phrase_cluster' ? 'Cụm câu' : 'Ô bảng'}
                            </span>
                          </td>
                          <td style={tableCellStyle}>
                            {cand.cropDataUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cand.cropDataUrl} alt={cand.candidateId} style={{ maxHeight: 24, maxWidth: 140, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 2 }} />
                            )}
                          </td>
                          <td style={{ ...tableCellStyle, fontFamily: 'sans-serif', fontWeight: 600, color: '#0f172a' }}>
                            {cand.text || <em style={{ color: '#94a3b8' }}>(trống)</em>}
                          </td>
                          <td style={tableCellStyle}>
                            [{cand.rect.x}, {cand.rect.y}, {cand.rect.width}, {cand.rect.height}]
                          </td>
                          <td style={tableCellStyle}>
                            {cand.confidence !== null && cand.confidence !== undefined ? `${(cand.confidence * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          {/* Modal Header */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#1e293b',
              color: '#f8fafc',
              padding: '12px 18px',
              borderRadius: '10px 10px 0 0',
              flexWrap: 'wrap',
              gap: 12,
              borderBottom: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 18 }}>🔍</span>
              <div>
                <strong style={{ fontSize: 16, display: 'block' }}>{preview.label}</strong>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  Kích thước: {preview.width} × {preview.height}px · Phóng đại: {Math.round(zoom * 100)}%
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
                style={modalBtnStyle}
                title="Thu nhỏ (-)"
              >
                ➖ Thu nhỏ
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                style={{ ...modalBtnStyle, background: zoom === 1 ? '#475569' : '#334155' }}
                title="Vừa khung màn hình (100%)"
              >
                Vừa khung
              </button>
              <button
                type="button"
                onClick={() => setZoom(1.5)}
                style={{ ...modalBtnStyle, background: zoom === 1.5 ? '#475569' : '#334155' }}
                title="Phóng đại 150%"
              >
                150%
              </button>
              <button
                type="button"
                onClick={() => setZoom(2)}
                style={{ ...modalBtnStyle, background: zoom === 2 ? '#475569' : '#334155' }}
                title="Phóng đại 200%"
              >
                200%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                style={modalBtnStyle}
                title="Phóng to (+)"
              >
                ➕ Phóng to
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={{ ...modalBtnStyle, background: '#dc2626', borderColor: '#b91c1c', color: '#fff', marginLeft: 6 }}
                title="Đóng cửa sổ (phím Esc hoặc click vùng tối)"
              >
                ✕ Đóng (Esc)
              </button>
            </div>
          </div>

          {/* Modal Body / Scrollable Image Viewer */}
          <div
            onClick={() => setPreview(null)}
            style={{
              flex: 1,
              background: '#090d16',
              borderRadius: '0 0 10px 10px',
              overflow: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                borderRadius: 6,
                backgroundColor: '#fff',
                margin: 'auto',
                border: '1px solid #334155',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.dataUrl}
                alt={preview.label}
                style={{
                  display: 'block',
                  width: zoom === 1 ? 'auto' : `${Math.round(preview.width * zoom)}px`,
                  maxWidth: zoom === 1 ? '88vw' : 'none',
                  maxHeight: zoom === 1 ? '76vh' : 'none',
                  height: 'auto',
                  imageRendering: zoom > 1 ? 'auto' : 'auto',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DocumentQualityPanel({ quality }: { quality: DocumentQuality | null }) {
  if (!quality) return <p>Clean scan: không chấm điểm tự động.</p>;
  const reasons: Record<string, string> = {
    NO_QUADRILATERAL: 'Không thấy đủ bốn góc', AREA_TOO_SMALL: 'Giấy quá nhỏ trong ảnh', AREA_TOO_LARGE: 'Vùng nhận diện gần chiếm toàn ảnh',
    DEGENERATE_QUAD: 'Bốn góc không hợp lệ hoặc cạnh quá ngắn', ASPECT_RATIO_OUT_OF_RANGE: 'Tỷ lệ giấy không phù hợp', OUTPUT_TOO_SMALL: 'Độ phân giải tài liệu quá thấp',
    LOW_CONFIDENCE: 'Điểm tin cậy thấp', BORDER_TOO_CLOSE: 'Giấy sát viền ảnh; cần chụp đủ lề', LOW_RECTANGULARITY: 'Tứ giác bị méo quá nhiều', WEAK_EDGE_SUPPORT: 'Viền tài liệu không rõ', QUAD_OUTSIDE_IMAGE: 'Góc nằm ngoài ảnh',
  };
  return <>
    <p>Heuristic score: {quality.confidence.toFixed(3)} / 1 (không phải xác suất) · Area ratio: {quality.areaRatio.toFixed(3)} · Rectangularity: {quality.rectangularity.toFixed(3)} · Border margin: {quality.borderMarginRatio.toFixed(3)} · Edge support: {quality.edgeSupport?.toFixed(3) ?? '—'}</p>
    <p>{quality.accepted ? 'Đạt quality gate' : quality.rejectionReasons.map(reason => `${reasons[reason] ?? reason} (${reason})`).join('; ')}</p>
  </>;
}

function CandidateTable({ result }: { result: DebugPipelineResult }) {
  const tableCellsCount = result.candidates.filter(c => c.source === 'closed_contour' && !c.isContainer).length;
  const checkboxesCount = result.candidates.filter(c => c.source === 'checkbox').length;
  const fieldRowsCount = result.candidates.filter(c => c.source === 'field_row').length;
  const phraseClustersCount = result.candidates.filter(c => c.source === 'phrase_cluster').length;
  const containersCount = result.candidates.filter(c => c.isContainer).length;

  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Field candidates ({result.candidates.length})</h2>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
          {containersCount > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{containersCount} Khung bao</span>}
          {tableCellsCount > 0 && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{tableCellsCount} Ô bảng</span>}
          {checkboxesCount > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{checkboxesCount} Checkbox</span>}
          {fieldRowsCount > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{fieldRowsCount} Dòng biểu mẫu</span>}
          {phraseClustersCount > 0 && <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{phraseClustersCount} Cụm câu chi tiết</span>}
        </div>
      </div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 360, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 960, width: '100%' }}>
          <thead><tr>{['ID', 'x', 'y', 'width', 'height', 'Loại', 'areaRatio', 'aspectRatio', 'rectangularity', 'parentIndex', 'childIndex'].map((label) => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
          <tbody>{result.candidates.map((candidate) => {
            const badge = candidate.isContainer
              ? { text: 'Khung bao', bg: '#dbeafe', color: '#1e40af' }
              : candidate.source === 'checkbox'
              ? { text: 'Checkbox', bg: '#dcfce7', color: '#166534' }
              : candidate.source === 'field_row'
              ? { text: 'Dòng biểu mẫu', bg: '#fef3c7', color: '#92400e' }
              : candidate.source === 'phrase_cluster'
              ? { text: 'Cụm câu chi tiết', bg: '#ede9fe', color: '#6d28d9' }
              : { text: 'Ô bảng', bg: '#fee2e2', color: '#991b1b' };
            return (
              <tr key={candidate.candidateId}>
                <td style={tableCellStyle}><strong>{candidate.candidateId}</strong></td>
                <td style={tableCellStyle}>{candidate.rect.x}</td>
                <td style={tableCellStyle}>{candidate.rect.y}</td>
                <td style={tableCellStyle}>{candidate.rect.width}</td>
                <td style={tableCellStyle}>{candidate.rect.height}</td>
                <td style={tableCellStyle}>
                  <span style={{ background: badge.bg, color: badge.color, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                    {badge.text}
                  </span>
                </td>
                <td style={tableCellStyle}>{candidate.areaRatio.toFixed(4)}</td>
                <td style={tableCellStyle}>{candidate.aspectRatio.toFixed(3)}</td>
                <td style={tableCellStyle}>{candidate.rectangularity.toFixed(3)}</td>
                <td style={tableCellStyle}>{candidate.parentIndex}</td>
                <td style={tableCellStyle}>{candidate.childIndex}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function statusText(status: Status): string {
  return { idle: 'Chưa chọn ảnh', decoding: 'Đang giải mã ảnh', ready: 'Ảnh sẵn sàng', loading: 'Đang tải OpenCV', processing: 'Đang xử lý pipeline', success: 'Xử lý thành công', error: 'Xử lý thất bại' }[status];
}
function statusStyle(status: Status): CSSProperties {
  const colors: Record<Status, [string, string]> = { idle: ['#f3f4f6', '#4b5563'], decoding: ['#fef3c7', '#92400e'], ready: ['#dbeafe', '#1d4ed8'], loading: ['#fef3c7', '#92400e'], processing: ['#fef3c7', '#92400e'], success: ['#dcfce7', '#166534'], error: ['#fee2e2', '#b91c1c'] };
  const [backgroundColor, color] = colors[status];
  return { backgroundColor, color, borderRadius: 999, fontSize: 13, fontWeight: 650, padding: '7px 10px' };
}
const mainStyle: CSSProperties = { maxWidth: 1440, margin: '0 auto', padding: '28px 18px 48px', color: '#1f2937', fontFamily: 'system-ui, sans-serif' };
const controlsStyle: CSSProperties = { alignItems: 'end', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14, padding: 16 };
const panelStyle: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 };
const canvasFrameStyle: CSSProperties = { alignItems: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, display: 'flex', justifyContent: 'center', minHeight: 240, overflow: 'auto', padding: 8 };
const canvasStyle: CSSProperties = { height: 'auto', maxHeight: 480, maxWidth: '100%', objectFit: 'contain' };
const gridStyle: CSSProperties = { display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' };
const infoStyle: CSSProperties = { background: '#f1f5f9', borderRadius: 6, color: '#475569', fontSize: 14, margin: '0 0 12px', padding: '10px 12px' };
const errorStyle: CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', margin: '0 0 12px', padding: '10px 12px' };
const timingStyle: CSSProperties = { background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: '#065f46', display: 'grid', fontSize: 14, gap: 4, marginBottom: 12, padding: '10px 12px' };
const configStyle: CSSProperties = { alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, display: 'flex', flexWrap: 'wrap', fontFamily: 'ui-monospace, monospace', fontSize: 12, gap: '8px 14px', marginBottom: 18, padding: '10px 12px' };
const tableHeaderStyle: CSSProperties = { background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 10px', position: 'sticky', textAlign: 'left', top: 0, whiteSpace: 'nowrap' };
const tableCellStyle: CSSProperties = { borderBottom: '1px solid #f1f5f9', padding: '7px 10px', whiteSpace: 'nowrap' };
function buttonStyle(disabled: boolean): CSSProperties { return { background: disabled ? '#94a3b8' : '#2563eb', border: 0, borderRadius: 6, color: 'white', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 650, padding: '10px 15px' }; }
const modalBtnStyle: CSSProperties = { background: '#334155', border: '1px solid #475569', borderRadius: 6, color: '#f8fafc', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'background 0.15s ease' };
