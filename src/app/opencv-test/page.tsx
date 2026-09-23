'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from 'react';
import {
  DEFAULT_LINE_DETECTION_CONFIG,
  DEFAULT_PREPROCESS_CONFIG,
  runLineDetectionDebug,
  type DebugPipelineResult,
} from '@/modules/opencv';

const MAX_LONG_SIDE = 1600;
type Status = 'idle' | 'decoding' | 'ready' | 'loading' | 'processing' | 'success' | 'error';

interface CanvasPanelProps {
  label: string;
  canvasRef: RefObject<HTMLCanvasElement>;
  visible: boolean;
  emptyMessage: string;
}

function CanvasPanel({ label, canvasRef, visible, emptyMessage }: CanvasPanelProps) {
  return (
    <article style={panelStyle}>
      <h2 style={{ fontSize: 16, fontWeight: 650, margin: '0 0 12px' }}>{label}</h2>
      <div style={canvasFrameStyle}>
        <canvas ref={canvasRef} style={{ ...canvasStyle, display: visible ? 'block' : 'none' }} />
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

  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const grayscaleCanvasRef = useRef<HTMLCanvasElement>(null);
  const binaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const horizontalCanvasRef = useRef<HTMLCanvasElement>(null);
  const verticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const combinedCanvasRef = useRef<HTMLCanvasElement>(null);
  const candidateOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeUrlRef = useRef<string | null>(null);
  const selectionIdRef = useRef(0);
  const runningRef = useRef(false);

  const clearOutputCanvases = useCallback(() => {
    [grayscaleCanvasRef, binaryCanvasRef, horizontalCanvasRef, verticalCanvasRef, combinedCanvasRef, candidateOverlayCanvasRef].forEach((canvasRef) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    });
  }, []);

  useEffect(() => () => {
    if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const selectionId = ++selectionIdRef.current;
    setErrorMessage(null);
    setHasResults(false);
    setResult(null);
    setImageReady(false);
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

    setStatus('decoding');
    const objectUrl = URL.createObjectURL(file);
    activeUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (activeUrlRef.current === objectUrl) activeUrlRef.current = null;
      if (selectionId !== selectionIdRef.current) return;

      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0 || longestSide <= 0) {
        setStatus('error');
        setErrorMessage('Ảnh có kích thước không hợp lệ.');
        return;
      }
      const scale = longestSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longestSide : 1;
      const width = Math.round(image.naturalWidth * scale);
      const height = Math.round(image.naturalHeight * scale);
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
  }, [clearOutputCanvases]);

  const runPipeline = useCallback(async () => {
    if (runningRef.current || !imageReady) return;
    const inputCanvas = inputCanvasRef.current;
    const grayscaleCanvas = grayscaleCanvasRef.current;
    const binaryCanvas = binaryCanvasRef.current;
    const horizontalCanvas = horizontalCanvasRef.current;
    const verticalCanvas = verticalCanvasRef.current;
    const combinedCanvas = combinedCanvasRef.current;
    const candidateOverlayCanvas = candidateOverlayCanvasRef.current;
    if (!inputCanvas || !grayscaleCanvas || !binaryCanvas || !horizontalCanvas || !verticalCanvas || !combinedCanvas || !candidateOverlayCanvas) return;

    runningRef.current = true;
    setErrorMessage(null);
    setHasResults(false);
    setResult(null);
    clearOutputCanvases();
    setStatus('loading');
    try {
      const pipelineResult = await runLineDetectionDebug({
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
      setResult(pipelineResult);
      setHasResults(true);
      setStatus('success');
    } catch (error: unknown) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi OpenCV không xác định.');
    } finally {
      runningRef.current = false;
    }
  }, [clearOutputCanvases, imageReady]);

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
      {errorMessage && <p role="alert" style={errorStyle}>{errorMessage}</p>}
      {result && <section style={timingStyle}><strong>Hoàn tất trong {result.totalProcessingTimeMs} ms · {result.candidates.length} candidates</strong><span>OpenCV: {result.openCvLoadTimeMs} ms · Grayscale: {result.grayscaleTimeMs} ms · Binary: {result.binaryTimeMs} ms · Lines: {result.lineDetectionTimeMs} ms · Contours: {result.contourDetectionTimeMs} ms</span></section>}

      <section style={configStyle}>
        <strong>Debug config</strong>
        <span>adaptiveBlockSize={DEFAULT_PREPROCESS_CONFIG.adaptiveBlockSize}</span><span>adaptiveC={DEFAULT_PREPROCESS_CONFIG.adaptiveC}</span><span>blurKernelSize={DEFAULT_PREPROCESS_CONFIG.blurKernelSize}</span>
        <span>horizontalKernelDivisor={DEFAULT_LINE_DETECTION_CONFIG.horizontalKernelDivisor}</span><span>verticalKernelDivisor={DEFAULT_LINE_DETECTION_CONFIG.verticalKernelDivisor}</span><span>closeGapSize={DEFAULT_LINE_DETECTION_CONFIG.closeGapSize}</span>
      </section>

      <section style={gridStyle}>
        <CanvasPanel label="1. Ảnh gốc" canvasRef={inputCanvasRef} visible={imageReady} emptyMessage="Chọn ảnh để bắt đầu" />
        <CanvasPanel label="2. Grayscale" canvasRef={grayscaleCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
        <CanvasPanel label="3. Binary" canvasRef={binaryCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
        <CanvasPanel label="4. Horizontal lines" canvasRef={horizontalCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
        <CanvasPanel label="5. Vertical lines" canvasRef={verticalCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
        <CanvasPanel label="6. Combined mask" canvasRef={combinedCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
        <CanvasPanel label="7. Field candidates" canvasRef={candidateOverlayCanvasRef} visible={hasResults} emptyMessage="Chưa chạy pipeline" />
      </section>
      {result && <CandidateTable result={result} />}
    </main>
  );
}

function CandidateTable({ result }: { result: DebugPipelineResult }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 18 }}>Field candidates ({result.candidates.length})</h2>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 360, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 900, width: '100%' }}>
          <thead><tr>{['ID', 'x', 'y', 'width', 'height', 'areaRatio', 'aspectRatio', 'rectangularity', 'parentIndex', 'childIndex'].map((label) => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
          <tbody>{result.candidates.map((candidate) => <tr key={candidate.candidateId}>
            <td style={tableCellStyle}>{candidate.candidateId}</td><td style={tableCellStyle}>{candidate.rect.x}</td><td style={tableCellStyle}>{candidate.rect.y}</td><td style={tableCellStyle}>{candidate.rect.width}</td><td style={tableCellStyle}>{candidate.rect.height}</td>
            <td style={tableCellStyle}>{candidate.areaRatio.toFixed(4)}</td><td style={tableCellStyle}>{candidate.aspectRatio.toFixed(3)}</td><td style={tableCellStyle}>{candidate.rectangularity.toFixed(3)}</td><td style={tableCellStyle}>{candidate.parentIndex}</td><td style={tableCellStyle}>{candidate.childIndex}</td>
          </tr>)}</tbody>
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
const gridStyle: CSSProperties = { display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' };
const infoStyle: CSSProperties = { background: '#f1f5f9', borderRadius: 6, color: '#475569', fontSize: 14, margin: '0 0 12px', padding: '10px 12px' };
const errorStyle: CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', margin: '0 0 12px', padding: '10px 12px' };
const timingStyle: CSSProperties = { background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: '#065f46', display: 'grid', fontSize: 14, gap: 4, marginBottom: 12, padding: '10px 12px' };
const configStyle: CSSProperties = { alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, display: 'flex', flexWrap: 'wrap', fontFamily: 'ui-monospace, monospace', fontSize: 12, gap: '8px 14px', marginBottom: 18, padding: '10px 12px' };
const tableHeaderStyle: CSSProperties = { background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 10px', position: 'sticky', textAlign: 'left', top: 0, whiteSpace: 'nowrap' };
const tableCellStyle: CSSProperties = { borderBottom: '1px solid #f1f5f9', padding: '7px 10px', whiteSpace: 'nowrap' };
function buttonStyle(disabled: boolean): CSSProperties { return { background: disabled ? '#94a3b8' : '#2563eb', border: 0, borderRadius: 6, color: 'white', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 650, padding: '10px 15px' }; }
