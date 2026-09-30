'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Scan,
  Download,
  Copy,
  Clock,
  ShieldCheck,
  Eye,
  RefreshCw,
  Sparkles,
  Layers,
  Settings,
  Zap,
  Info,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type {
  DocumentExtractionResult,
  NormalizedBoundingBox,
  ExtractedField,
} from '@/shared/document-extraction.types';
import type { DocumentMode } from '@/modules/opencv';
import { prepareDocumentImage } from '@/modules/documents/prepare-image';
import { documentSession, reviewedFields, type FieldConfirmations } from '@/modules/documents/session';
import { DOCUMENT_LIMITS } from '@/modules/documents/config';
import { normalizeField, valueErrors } from '@/modules/documents/validation';
import { TRAFFIC_FIELDS } from '@/modules/documents/schema';

// Synthetic sample generator for 1-click test document creation
function createSyntheticDocumentBlob(kind: 'traffic' | 'clean' | 'angled'): Promise<{ blob: Blob; filename: string }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d')!;

    // Background desk surface
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Paper transformation
    ctx.save();
    if (kind === 'angled') {
      ctx.translate(100, 60);
      ctx.rotate((1.5 * Math.PI) / 180);
    } else {
      ctx.translate(100, 80);
    }

    // White paper sheet with subtle drop shadow
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1440);

    // Document header
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 500, 70);
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Độc lập - Tự do - Hạnh phúc', 500, 102);

    // Divider line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(380, 115);
    ctx.lineTo(620, 115);
    ctx.stroke();

    // Authority info (left aligned)
    ctx.textAlign = 'left';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('CÔNG AN TP. HÀ NỘI', 60, 80);
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText('PHÒNG CSGT ĐƯỜNG BỘ', 60, 105);

    // Document Title
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('BIÊN BẢN VI PHẠM HÀNH CHÍNH', 500, 190);
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('Về trật tự an toàn giao thông đường bộ', 500, 222);

    // Fields layout
    ctx.textAlign = 'left';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#1e293b';

    const leftCol = 70;
    let y = 290;
    const lineHeight = 58;

    const rows = [
      { label: 'Số biên bản:', value: '004821/BB-VPHC', highlight: true },
      { label: 'Ngày lập biên bản:', value: '15/09/2026', highlight: true },
      { label: 'Họ và tên người vi phạm:', value: 'NGUYỄN VĂN AN', highlight: true },
      { label: 'Số CCCD / Mã định danh:', value: '001085012345', highlight: true },
      { label: 'Địa chỉ thường trú:', value: 'Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội', highlight: false },
      { label: 'Phương tiện vi phạm mang biển số:', value: '29A-888.88', highlight: true },
      { label: 'Hành vi vi phạm:', value: 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông', highlight: false },
      { label: 'Số quyết định xử phạt:', value: '9042/QĐ-XPHC', highlight: true },
      { label: 'Số tiền phạt:', value: '900.000 đồng (Chín trăm nghìn đồng)', highlight: true },
      { label: 'Thời hạn nộp tiền phạt:', value: '30/09/2026', highlight: true },
    ];

    rows.forEach((row) => {
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(row.label, leftCol, y);

      ctx.font = row.highlight ? 'bold 19px monospace' : '17px Arial, sans-serif';
      ctx.fillStyle = row.highlight ? '#0f172a' : '#1e293b';
      ctx.fillText(row.value, leftCol + 320, y);

      // Light underline
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftCol, y + 14);
      ctx.lineTo(930, y + 14);
      ctx.stroke();

      y += lineHeight;
    });

    // Signature section
    y += 50;
    ctx.font = 'italic 16px Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Hà Nội, ngày 15 tháng 09 năm 2026', 620, y);

    y += 40;
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('NGƯỜI LẬP BIÊN BẢN', 260, y);
    ctx.fillText('NGƯỜI VI PHẠM', 740, y);

    ctx.font = 'italic 15px Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('(Ký, ghi rõ họ tên)', 260, y + 25);
    ctx.fillText('(Ký, ghi rõ họ tên)', 740, y + 25);

    // Fake signature & stamp
    ctx.font = '22px "Brush Script MT", cursive, sans-serif';
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText('Trung úy Trần Minh Đức', 260, y + 80);
    ctx.fillText('Nguyễn Văn An', 740, y + 80);

    // Official Stamp
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(360, y + 60, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.fillText('CÔNG AN TP. HÀ NỘI', 360, y + 55);
    ctx.fillText('★ CSGT ★', 360, y + 70);

    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({ blob, filename: `bien_ban_csgt_${kind}.png` });
        }
      },
      'image/png'
    );
  });
}

// Simulated mock extraction result for offline testing
function buildMockExtraction(rawText: string, processingTimeMs: number): DocumentExtractionResult {
  return {
    contractVersion: 2,
    status: 'extracted',
    documentType: 'traffic_violation_record',
    fullText: rawText,
    overallConfidence: 0.96,
    requiresReview: false,
    warnings: [],
    processingTimeMs,
    deskewApplied: true,
    fields: {
      recordNumber: {
        key: 'recordNumber',
        label: 'Số biên bản',
        value: '004821/BB-VPHC',
        rawText: '004821/BB-VPHC',
        confidence: 0.99,
        evidenceText: 'Số biên bản: 004821/BB-VPHC',
        sourceLineIds: ['line-7'],
        sourceBoundingBoxes: [[0.18, 0.35, 0.21, 0.65]],
        status: 'accepted',
        validationErrors: [],
      },
      recordDate: {
        key: 'recordDate',
        label: 'Ngày lập biên bản',
        value: '2026-09-15',
        rawText: '15/09/2026',
        confidence: 0.98,
        evidenceText: 'Ngày lập biên bản: 15/09/2026',
        sourceLineIds: ['line-8'],
        sourceBoundingBoxes: [[0.22, 0.35, 0.25, 0.60]],
        status: 'accepted',
        validationErrors: [],
      },
      citizenName: {
        key: 'citizenName',
        label: 'Họ và tên',
        value: 'NGUYỄN VĂN AN',
        rawText: 'NGUYỄN VĂN AN',
        confidence: 0.97,
        evidenceText: 'Họ và tên người vi phạm: NGUYỄN VĂN AN',
        sourceLineIds: ['line-9'],
        sourceBoundingBoxes: [[0.26, 0.35, 0.29, 0.68]],
        status: 'accepted',
        validationErrors: [],
      },
      citizenId: {
        key: 'citizenId',
        label: 'Số CCCD',
        value: '001085012345',
        rawText: '001085012345',
        confidence: 0.99,
        evidenceText: 'Số CCCD / Mã định danh: 001085012345',
        sourceLineIds: ['line-10'],
        sourceBoundingBoxes: [[0.30, 0.35, 0.33, 0.62]],
        status: 'accepted',
        validationErrors: [],
      },
      address: {
        key: 'address',
        label: 'Địa chỉ',
        value: 'Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội',
        rawText: 'Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội',
        confidence: 0.92,
        evidenceText: 'Địa chỉ thường trú: Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội',
        sourceLineIds: ['line-11'],
        sourceBoundingBoxes: [[0.34, 0.35, 0.37, 0.85]],
        status: 'accepted',
        validationErrors: [],
      },
      vehiclePlate: {
        key: 'vehiclePlate',
        label: 'Biển số xe',
        value: '29A-888.88',
        rawText: '29A-888.88',
        confidence: 0.98,
        evidenceText: 'Phương tiện vi phạm mang biển số: 29A-888.88',
        sourceLineIds: ['line-12'],
        sourceBoundingBoxes: [[0.38, 0.35, 0.41, 0.58]],
        status: 'accepted',
        validationErrors: [],
      },
      violationDescription: {
        key: 'violationDescription',
        label: 'Hành vi vi phạm',
        value: 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
        rawText: 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
        confidence: 0.94,
        evidenceText: 'Hành vi vi phạm: Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
        sourceLineIds: ['line-13'],
        sourceBoundingBoxes: [[0.42, 0.35, 0.45, 0.88]],
        status: 'accepted',
        validationErrors: [],
      },
      decisionNumber: {
        key: 'decisionNumber',
        label: 'Số quyết định',
        value: '9042/QĐ-XPHC',
        rawText: '9042/QĐ-XPHC',
        confidence: 0.97,
        evidenceText: 'Số quyết định xử phạt: 9042/QĐ-XPHC',
        sourceLineIds: ['line-14'],
        sourceBoundingBoxes: [[0.46, 0.35, 0.49, 0.60]],
        status: 'accepted',
        validationErrors: [],
      },
      fineAmount: {
        key: 'fineAmount',
        label: 'Số tiền phạt',
        value: 900000,
        rawText: '900.000 đồng',
        confidence: 0.99,
        evidenceText: 'Số tiền phạt: 900.000 đồng (Chín trăm nghìn đồng)',
        sourceLineIds: ['line-15'],
        sourceBoundingBoxes: [[0.50, 0.35, 0.53, 0.72]],
        status: 'accepted',
        validationErrors: [],
      },
      paymentDeadline: {
        key: 'paymentDeadline',
        label: 'Hạn nộp phạt',
        value: '2026-09-30',
        rawText: '30/09/2026',
        confidence: 0.96,
        evidenceText: 'Thời hạn nộp tiền phạt: 30/09/2026',
        sourceLineIds: ['line-16'],
        sourceBoundingBoxes: [[0.54, 0.35, 0.57, 0.60]],
        status: 'accepted',
        validationErrors: [],
      },
    },
  };
}

export default function DocumentTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<DocumentMode>('clean-scan');
  const [engineMode, setEngineMode] = useState<'live' | 'mock'>('live');
  const [activeTab, setActiveTab] = useState<'structured' | 'markdown' | 'diagnostics'>('structured');
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);

  // Results state
  const [extractionResult, setExtractionResult] = useState<DocumentExtractionResult | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState<'preview' | 'raw' | 'headings'>('preview');

  // Review & Session state
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<FieldConfirmations>({});
  const [sessionData, setSessionData] = useState<Record<string, string> | null>(null);

  // Status & Timing
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStepText, setCurrentStepText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [timings, setTimings] = useState<{ deskewMs: number; extractionMs: number; totalMs: number }>({
    deskewMs: 0,
    extractionMs: 0,
    totalMs: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    };
  }, [previewUrl, processedUrl]);

  // Subscribe to session changes
  useEffect(() => {
    setSessionData(documentSession.read());
    const unsubscribe = documentSession.subscribe(() => {
      setSessionData(documentSession.read());
    });
    return () => unsubscribe();
  }, []);

  // Handle file selection
  const selectFile = useCallback((newFile: File | null) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (processedUrl) URL.revokeObjectURL(processedUrl);

    setExtractionResult(null);
    setMarkdownContent(null);
    setDraftValues({});
    setConfirmations({});
    setSelectedFieldKey(null);
    setProcessedUrl(null);
    setStatusMessage(null);

    if (!newFile) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(newFile);
    setPreviewUrl(URL.createObjectURL(newFile));
    setStatusMessage({ type: 'info', text: `Đã nạp file: ${newFile.name} (${(newFile.size / 1024).toFixed(1)} KB)` });
  }, [previewUrl, processedUrl]);

  // Quick preset loader
  const loadPreset = async (presetType: 'synthetic-traffic' | 'synthetic-angled' | 'form-lptb') => {
    setIsProcessing(true);
    setCurrentStepText('Đang tạo mẫu thử nghiệm...');
    try {
      if (presetType === 'synthetic-traffic' || presetType === 'synthetic-angled') {
        const { blob, filename } = await createSyntheticDocumentBlob(
          presetType === 'synthetic-traffic' ? 'clean' : 'angled'
        );
        const synthFile = new File([blob], filename, { type: 'image/png' });
        setMode(presetType === 'synthetic-angled' ? 'camera-photo' : 'clean-scan');
        selectFile(synthFile);
      } else if (presetType === 'form-lptb') {
        const response = await fetch('/assets/forms/01-lptb/page-1.jpg');
        const blob = await response.blob();
        const lptbFile = new File([blob], 'to_khai_01_lptb_mau.jpg', { type: 'image/jpeg' });
        setMode('clean-scan');
        selectFile(lptbFile);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Không tải được file mẫu: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsProcessing(false);
      setCurrentStepText('');
    }
  };

  // Run full extraction pipeline
  const runPipeline = async (target: 'all' | 'structured' | 'markdown') => {
    if (!file) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abort = new AbortController();
    abortControllerRef.current = abort;

    setIsProcessing(true);
    setStatusMessage(null);
    const startTotal = performance.now();

    try {
      // Step 1: Preprocessing & Deskew (OpenCV WASM)
      setCurrentStepText('Đang nắn phối cảnh & thẩm định ảnh bằng OpenCV WASM...');
      const startDeskew = performance.now();
      const prepared = await prepareDocumentImage(file, mode);
      const deskewTime = Math.round(performance.now() - startDeskew);

      const processedBlobUrl = URL.createObjectURL(prepared.blob);
      setProcessedUrl(processedBlobUrl);

      // Step 2: Extraction execution
      const startExtraction = performance.now();

      if (engineMode === 'mock') {
        // Simulated local execution
        setCurrentStepText('Đang chạy chế độ mô phỏng offline...');
        await new Promise((r) => setTimeout(r, 650)); // Realistic network latency simulation

        const sampleText = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nCÔNG AN TP. HÀ NỘI\nPHÒNG CSGT ĐƯỜNG BỘ\n\nBIÊN BẢN VI PHẠM HÀNH CHÍNH\nVề trật tự an toàn giao thông đường bộ\n\nSố biên bản: 004821/BB-VPHC\nNgày lập biên bản: 15/09/2026\nHọ và tên người vi phạm: NGUYỄN VĂN AN\nSố CCCD / Mã định danh: 001085012345\nĐịa chỉ thường trú: Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội\nPhương tiện vi phạm mang biển số: 29A-888.88\nHành vi vi phạm: Không chấp hành hiệu lệnh của đèn tín hiệu giao thông\nSố quyết định xử phạt: 9042/QĐ-XPHC\nSố tiền phạt: 900.000 đồng (Chín trăm nghìn đồng)\nThời hạn nộp tiền phạt: 30/09/2026`;

        if (target === 'all' || target === 'structured') {
          const mockData = buildMockExtraction(sampleText, Math.round(performance.now() - startExtraction));
          setExtractionResult(mockData);
          setDraftValues(
            Object.fromEntries(Object.entries(mockData.fields).map(([k, v]) => [k, v.value === null ? '' : String(v.value)]))
          );
        }

        if (target === 'all' || target === 'markdown') {
          const mockMarkdown = `# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc

CÔNG AN TP. HÀ NỘI
PHÒNG CSGT ĐƯỜNG BỘ

# BIÊN BẢN VI PHẠM HÀNH CHÍNH
Về trật tự an toàn giao thông đường bộ

## Thông tin biên bản
- **Số biên bản:** 004821/BB-VPHC
- **Ngày lập:** 15/09/2026
- **Họ và tên:** NGUYỄN VĂN AN
- **Số CCCD:** 001085012345
- **Địa chỉ:** Số 12 phố Hàng Bông, Q. Hoàn Kiếm, TP. Hà Nội
- **Biển số xe:** 29A-888.88
- **Hành vi:** Không chấp hành hiệu lệnh của đèn tín hiệu giao thông
- **Số quyết định:** 9042/QĐ-XPHC
- **Số tiền phạt:** 900.000 đồng
- **Thời hạn nộp:** 30/09/2026
`;
          setMarkdownContent(mockMarkdown);
        }

        const totalTime = Math.round(performance.now() - startTotal);
        setTimings({ deskewMs: deskewTime, extractionMs: Math.round(performance.now() - startExtraction), totalMs: totalTime });
        setStatusMessage({ type: 'success', text: `Xử lý thành công trong ${totalTime}ms (Chế độ mô phỏng Offline)` });
      } else {
        // Live API execution
        let hasError = false;

        if (target === 'all' || target === 'structured') {
          setCurrentStepText('Đang gửi Google Document AI & Gemini structured extraction...');
          const form = new FormData();
          form.set('file', prepared.blob, 'document.png');
          form.set('deskewApplied', String(prepared.deskewApplied));
          form.set('documentHint', 'traffic_violation_record');

          const response = await fetch('/api/documents/extract', {
            method: 'POST',
            body: form,
            signal: abort.signal,
            cache: 'no-store',
          });
          const payload = await response.json();

          if (!response.ok || !payload.success) {
            hasError = true;
            setStatusMessage({
              type: 'warning',
              text: `Live API cảnh báo: ${payload.error?.message_vi || 'Cần kiểm tra API key trong .env'}. Bạn có thể chuyển sang chế độ "Mô phỏng Offline" để test giao diện.`,
            });
          } else {
            const data: DocumentExtractionResult = payload.data;
            setExtractionResult(data);
            setDraftValues(
              Object.fromEntries(Object.entries(data.fields).map(([k, v]) => [k, v.value === null ? '' : String(v.value)]))
            );
          }
        }

        if (target === 'all' || target === 'markdown') {
          setCurrentStepText('Đang gọi Codex MarkdownExportService...');
          const mdForm = new FormData();
          mdForm.set('file', prepared.blob, 'document.png');

          const mdRes = await fetch('/api/documents/markdown', {
            method: 'POST',
            body: mdForm,
            signal: abort.signal,
            cache: 'no-store',
          });

          if (mdRes.ok) {
            const text = await mdRes.text();
            setMarkdownContent(text);
          } else {
            const errJson = await mdRes.json().catch(() => ({}));
            if (!hasError) {
              setStatusMessage({
                type: 'warning',
                text: `Markdown Export: ${errJson.error?.message_vi || 'Chưa cấu hình Google Document AI'}. Có thể dùng chế độ Offline để xem cấu trúc mẫu.`,
              });
            }
          }
        }

        const totalTime = Math.round(performance.now() - startTotal);
        setTimings({ deskewMs: deskewTime, extractionMs: Math.round(performance.now() - startExtraction), totalMs: totalTime });
        if (!hasError) {
          setStatusMessage({ type: 'success', text: `Trích xuất hoàn tất trong ${totalTime}ms (Live API)` });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatusMessage({ type: 'error', text: 'Lỗi xử lý: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsProcessing(false);
      setCurrentStepText('');
    }
  };

  // Field confirmation
  const handleConfirmField = (key: string) => {
    const raw = draftValues[key] ?? '';
    const normalized = raw.trim() ? normalizeField(key, raw) : null;

    if (raw.trim() && (normalized === null || (key !== 'vehiclePlate' && valueErrors(key, normalized).length))) {
      setStatusMessage({
        type: 'error',
        text: `Giá trị trường "${TRAFFIC_FIELDS[key as keyof typeof TRAFFIC_FIELDS] || key}" không hợp lệ. Vui lòng kiểm tra lại.`,
      });
      return;
    }

    setConfirmations((prev) => ({ ...prev, [key]: normalized }));
    setStatusMessage({
      type: 'success',
      text: normalized === null ? `Đã bỏ trống trường ${key}` : `Đã xác nhận trường ${key}: ${normalized}`,
    });
  };

  // Save to Session RAM
  const handleSaveToSession = () => {
    if (!extractionResult) return;
    try {
      documentSession.save(extractionResult, confirmations);
      setSessionData(documentSession.read());
      setStatusMessage({
        type: 'success',
        text: 'Đã lưu an toàn vào Session RAM! Dữ liệu sẽ tự động tiêu hủy sau 15 phút theo Nghị định 13/2023/NĐ-CP.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể lưu vào Session RAM',
      });
    }
  };

  // Clear Session RAM
  const handleClearSession = () => {
    documentSession.clear();
    setSessionData(null);
    setStatusMessage({ type: 'info', text: 'Đã xóa trắng Session RAM (Zero-Retention Wipe).' });
  };

  // Download Markdown file
  const handleDownloadMarkdown = () => {
    if (!markdownContent) return;
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${file?.name.replace(/\.[^.]+$/, '') || 'document'}_extracted.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Copy Markdown to clipboard
  const handleCopyMarkdown = async () => {
    if (!markdownContent) return;
    await navigator.clipboard.writeText(markdownContent);
    setStatusMessage({ type: 'success', text: 'Đã sao chép Markdown vào clipboard!' });
  };

  // Bounding boxes of the currently selected field
  const activeBoxes: NormalizedBoundingBox[] =
    selectedFieldKey && extractionResult?.fields[selectedFieldKey]
      ? extractionResult.fields[selectedFieldKey].sourceBoundingBoxes || []
      : [];

  // Parse markdown headings for headings tab
  const headingList = markdownContent
    ? markdownContent
        .split('\n')
        .map((line, idx) => ({ line: idx + 1, text: line }))
        .filter((item) => item.text.trim().startsWith('#'))
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            href="/scan-document"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Về Màn Hình Quét
          </Link>
          <div className="h-5 w-px bg-slate-800 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                AFL Document Intelligence Test Workbench
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                FR-6 & Markdown Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kiểm thử & đối chiếu trực quan 2 luồng: Bóc tách Có cấu trúc (JSON v2) & Xuất Toàn văn Markdown (Codex)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Engine Selector */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
            <button
              onClick={() => setEngineMode('live')}
              className={`px-3 py-1 rounded-lg transition-all ${
                engineMode === 'live' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Gọi trực tiếp API backend (/api/documents/extract & /api/documents/markdown)"
            >
              Live API
            </button>
            <button
              onClick={() => setEngineMode('mock')}
              className={`px-3 py-1 rounded-lg transition-all ${
                engineMode === 'mock' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Chạy kiểm thử offline không phụ thuộc Cloud API key"
            >
              Mô Phỏng Offline
            </button>
          </div>

          <Link
            href="/opencv-test"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
          >
            <Scan className="w-3.5 h-3.5 text-sky-400" /> OpenCV Debug
          </Link>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="max-w-[1600px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Upload, Presets & Document Image with Evidence Overlays */}
        <div className="lg:col-span-6 flex flex-col gap-5">
          {/* Control Panel: File & Presets */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-black text-slate-400 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-slate-400" /> Cấu Hình Đầu Vào
              </span>
              <span className="text-xs text-slate-500 font-mono">Tối đa 8 MB (JPEG / PNG)</span>
            </div>

            {/* Quick 1-Click Presets */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => loadPreset('synthetic-traffic')}
                disabled={isProcessing}
                className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-left transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 group-hover:text-amber-300">
                  <Zap className="w-3.5 h-3.5" /> Biên Bản CSGT
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Tạo Canvas Chuẩn</div>
              </button>

              <button
                onClick={() => loadPreset('synthetic-angled')}
                disabled={isProcessing}
                className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-left transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 group-hover:text-sky-300">
                  <Scan className="w-3.5 h-3.5" /> Chụp Nghiêng
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Test OpenCV Deskew</div>
              </button>

              <button
                onClick={() => loadPreset('form-lptb')}
                disabled={isProcessing}
                className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-left transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                  <FileText className="w-3.5 h-3.5" /> Mẫu 01/LPTB
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Ảnh Thật Kho Lưu</div>
              </button>
            </div>

            {/* File Input and Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Hoặc Chọn File Ảnh Tùy Ý</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-400 file:mr-2.5 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Chế Độ Nắn Phối Cảnh (OpenCV)</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as DocumentMode)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="clean-scan">Bản Scan Phẳng (Không xoay)</option>
                  <option value="camera-photo">Ảnh Chụp Camera (Tìm 4 góc & Nắn)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2.5 pt-2">
              <button
                onClick={() => runPipeline('structured')}
                disabled={!file || isProcessing}
                className="px-3 py-2.5 rounded-xl font-bold text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Layers className="w-3.5 h-3.5" /> Trích Xuất JSON
              </button>

              <button
                onClick={() => runPipeline('markdown')}
                disabled={!file || isProcessing}
                className="px-3 py-2.5 rounded-xl font-bold text-xs bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <FileText className="w-3.5 h-3.5" /> Xuất Markdown
              </button>

              <button
                onClick={() => runPipeline('all')}
                disabled={!file || isProcessing}
                className="px-3 py-2.5 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" /> Chạy Cả Hai
              </button>
            </div>

            {/* Status & Progress Message */}
            {isProcessing && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 animate-pulse font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{currentStepText}</span>
              </div>
            )}

            {statusMessage && !isProcessing && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                    : statusMessage.type === 'warning'
                    ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
                    : statusMessage.type === 'error'
                    ? 'bg-rose-950/60 border-rose-500/30 text-rose-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />}
                <div className="flex-1">{statusMessage.text}</div>
              </div>
            )}
          </div>

          {/* Interactive Document Canvas View */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-black text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                {processedUrl ? 'Ảnh Đã Nắn Chuẩn Hóa (OpenCV Deskewed)' : 'Ảnh Gốc'}
              </span>
              {selectedFieldKey && (
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  Đang soi: {TRAFFIC_FIELDS[selectedFieldKey as keyof typeof TRAFFIC_FIELDS] || selectedFieldKey}
                </span>
              )}
            </div>

            <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60 flex items-center justify-center min-h-[420px]">
              {processedUrl || previewUrl ? (
                <div className="relative w-full max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={processedUrl || previewUrl!}
                    alt="Chứng từ kiểm thử"
                    className="block w-full h-auto object-contain select-none"
                  />

                  {/* Overlaid Bounding Boxes */}
                  {processedUrl &&
                    activeBoxes.map(([top, left, bottom, right], idx) => {
                      const style = {
                        top: `${top * 100}%`,
                        left: `${left * 100}%`,
                        width: `${(right - left) * 100}%`,
                        height: `${(bottom - top) * 100}%`,
                      };
                      return (
                        <div
                          key={idx}
                          className="absolute border-2 border-amber-400 bg-amber-400/25 rounded-sm shadow-[0_0_12px_rgba(251,191,36,0.6)] animate-pulse pointer-events-none transition-all duration-150"
                          style={style}
                        >
                          <span className="absolute -top-5 left-0 text-[10px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded shadow">
                            {selectedFieldKey} ({((right - left) * 100).toFixed(0)}% x {((bottom - top) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center p-8 text-slate-600">
                  <Scan className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Chưa có ảnh nào được chọn</p>
                  <p className="text-xs text-slate-500 mt-1">Bấm các nút tạo mẫu nhanh phía trên để thử nghiệm ngay</p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Mẹo: Click vào bất kỳ trường nào ở cột bên phải để soi hộp Bounding Box màu vàng.</span>
              {timings.totalMs > 0 && (
                <span className="font-mono text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Tổng: {timings.totalMs}ms
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Outputs (Structured Fields / Markdown / Diagnostics) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('structured')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'structured'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Dữ Liệu Cấu Trúc (JSON v2)</span>
              {extractionResult && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  {Object.keys(extractionResult.fields).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('markdown')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'markdown'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Xuất Markdown (Codex)</span>
              {markdownContent && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-400 font-mono">
                  {markdownContent.length} chars
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'diagnostics'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-html'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Chẩn Đoán & RAM</span>
            </button>
          </div>

          {/* TAB 1: Structured Fields & Evidence Grounding */}
          {activeTab === 'structured' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex-1 flex flex-col">
              {extractionResult ? (
                <>
                  {/* Result Header & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-100 uppercase">
                          {extractionResult.documentType}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            extractionResult.status === 'extracted'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {extractionResult.status === 'extracted' ? 'Tự Động Đạt' : 'Cần Rà Soát'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Độ tin cậy tổng quát: {(extractionResult.overallConfidence * 100).toFixed(1)}% • Xử lý: {extractionResult.processingTimeMs}ms
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveToSession}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Lưu Vào Session RAM
                      </button>
                    </div>
                  </div>

                  {/* Fields List */}
                  <div className="space-y-3 overflow-y-auto max-h-[620px] pr-1">
                    {Object.entries(extractionResult.fields).map(([key, field]) => {
                      const isSelected = selectedFieldKey === key;
                      const hasBoxes = field.sourceBoundingBoxes && field.sourceBoundingBoxes.length > 0;
                      const isConfirmed = Object.hasOwn(confirmations, key);

                      return (
                        <div
                          key={key}
                          onClick={() => setSelectedFieldKey(key)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-800/90 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30'
                              : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-200">
                                  {TRAFFIC_FIELDS[key as keyof typeof TRAFFIC_FIELDS] || field.label || key}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">({key})</span>
                                {hasBoxes && (
                                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded font-bold">
                                    Có Bounding Box
                                  </span>
                                )}
                              </div>

                              <div className="mt-1.5 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={draftValues[key] ?? ''}
                                  onChange={(e) =>
                                    setDraftValues((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-full text-xs font-bold font-mono px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:outline-none focus:border-amber-500"
                                  placeholder="Chưa có giá trị..."
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmField(key);
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                                    isConfirmed
                                      ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                  }`}
                                  title="Xác nhận giá trị trường"
                                >
                                  {isConfirmed ? <Check className="w-3.5 h-3.5" /> : 'Xác Nhận'}
                                </button>
                              </div>

                              {/* Evidence text snippet */}
                              {field.evidenceText && (
                                <p className="text-[11px] text-slate-400 mt-1.5 italic bg-slate-900/60 p-1.5 rounded border border-slate-800/80">
                                  Bằng chứng: &quot;{field.evidenceText}&quot;
                                </p>
                              )}
                            </div>

                            {/* Status badge & Confidence */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  field.status === 'accepted'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : field.status === 'needs_review'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {field.status === 'accepted'
                                  ? 'Đạt'
                                  : field.status === 'needs_review'
                                  ? 'Cần Xem'
                                  : 'Chưa Đọc'}
                              </span>

                              <span className="text-[10px] font-mono text-slate-500">
                                {(field.confidence * 100).toFixed(0)}% OCR
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-600">
                  <Layers className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-slate-400">Chưa có kết quả trích xuất cấu trúc</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Bấm &quot;Trích Xuất JSON&quot; hoặc &quot;Chạy Cả Hai&quot; từ cột bên trái để thực hiện phân tích
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Full Text Markdown Export (Codex) */}
          {activeTab === 'markdown' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex-1 flex flex-col">
              {markdownContent ? (
                <>
                  {/* Top Bar for Markdown */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
                      <button
                        onClick={() => setMarkdownView('preview')}
                        className={`px-3 py-1 rounded-lg transition-all ${
                          markdownView === 'preview' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Bản Xem (Preview)
                      </button>
                      <button
                        onClick={() => setMarkdownView('raw')}
                        className={`px-3 py-1 rounded-lg transition-all ${
                          markdownView === 'raw' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Mã Nguồn (Raw)
                      </button>
                      <button
                        onClick={() => setMarkdownView('headings')}
                        className={`px-3 py-1 rounded-lg transition-all ${
                          markdownView === 'headings' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Tiêu Đề ({headingList.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyMarkdown}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" /> Sao Chép
                      </button>
                      <button
                        onClick={handleDownloadMarkdown}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Tải File .md
                      </button>
                    </div>
                  </div>

                  {/* Rendered Preview */}
                  {markdownView === 'preview' && (
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800/80 overflow-y-auto max-h-[620px] font-sans text-slate-200 leading-relaxed text-sm space-y-3">
                      {markdownContent.split('\n').map((line, idx) => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('# ')) {
                          return (
                            <h1 key={idx} className="text-lg font-black text-amber-400 pt-2 border-b border-slate-800 pb-1">
                              {trimmed.replace('# ', '')}
                            </h1>
                          );
                        }
                        if (trimmed.startsWith('## ')) {
                          return (
                            <h2 key={idx} className="text-base font-bold text-sky-400 pt-1">
                              {trimmed.replace('## ', '')}
                            </h2>
                          );
                        }
                        if (trimmed.startsWith('### ')) {
                          return (
                            <h3 key={idx} className="text-sm font-bold text-slate-300">
                              {trimmed.replace('### ', '')}
                            </h3>
                          );
                        }
                        if (trimmed.startsWith('- ')) {
                          return (
                            <li key={idx} className="ml-4 list-disc text-slate-300 text-xs">
                              {trimmed.replace('- ', '')}
                            </li>
                          );
                        }
                        if (!trimmed) {
                          return <div key={idx} className="h-2" />;
                        }
                        return (
                          <p key={idx} className="text-xs text-slate-300">
                            {line}
                          </p>
                        );
                      })}
                    </div>
                  )}

                  {/* Raw Text Code */}
                  {markdownView === 'raw' && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-sky-300 overflow-y-auto max-h-[620px] whitespace-pre-wrap leading-relaxed">
                      {markdownContent}
                    </div>
                  )}

                  {/* Headings Structure Inspector */}
                  {markdownView === 'headings' && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-y-auto max-h-[620px] space-y-2">
                      <p className="text-xs text-slate-400 mb-2">
                        Danh sách các dòng được Gemini phân loại là tiêu đề cấu trúc văn bản:
                      </p>
                      {headingList.length > 0 ? (
                        headingList.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                          >
                            <span className="font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-400/10 shrink-0">
                              Dòng {item.line}
                            </span>
                            <span className="font-semibold text-slate-200">{item.text}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500 italic">Không có dòng tiêu đề nào được phát hiện.</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-600">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-slate-400">Chưa có nội dung Markdown</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Bấm &quot;Xuất Markdown&quot; hoặc &quot;Chạy Cả Hai&quot; để sinh file Markdown toàn văn từ ảnh
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Diagnostics & Session RAM */}
          {activeTab === 'diagnostics' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 flex-1 flex flex-col">
              {/* Performance Waterfall */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Đo Lường Độ Trễ Pipeline (Latency Waterfall)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">OpenCV Deskew</span>
                    <span className="text-lg font-black font-mono text-sky-400">{timings.deskewMs} ms</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">OCR & AI Extraction</span>
                    <span className="text-lg font-black font-mono text-amber-400">{timings.extractionMs} ms</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Tổng Thời Gian</span>
                    <span className="text-lg font-black font-mono text-emerald-400">{timings.totalMs} ms</span>
                  </div>
                </div>
              </div>

              {/* Session RAM Inspector (Decree 13 Compliance) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Giám Sát Session RAM (Nghị định 13/2023/NĐ-CP)
                  </h3>
                  {sessionData && (
                    <button
                      onClick={handleClearSession}
                      className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs font-bold border border-rose-700/50"
                    >
                      Xóa Sạch Ngay (Zero Retention)
                    </button>
                  )}
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  {sessionData && Object.keys(sessionData).length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-bold pb-2 border-b border-slate-800">
                        <span>Đang lưu tạm trong RAM ({Object.keys(sessionData).length} trường)</span>
                        <span className="font-mono text-slate-400">Tự hủy sau 15 phút</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        {Object.entries(sessionData).map(([k, v]) => (
                          <div key={k} className="p-2 rounded bg-slate-900 border border-slate-800/80">
                            <span className="text-slate-500 block text-[10px]">{k}:</span>
                            <span className="text-slate-200 font-bold truncate block">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-slate-500 text-xs">
                      Session RAM trống. Chưa có dữ liệu nhạy cảm nào được lưu.
                    </div>
                  )}
                </div>
              </div>

              {/* Raw JSON Tree */}
              <div className="flex-1 flex flex-col">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  Dữ Liệu JSON Thô (Contract Version 2)
                </h3>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 overflow-y-auto max-h-[300px] flex-1">
                  <pre>{JSON.stringify(extractionResult || { message: 'Chưa có dữ liệu trích xuất' }, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
