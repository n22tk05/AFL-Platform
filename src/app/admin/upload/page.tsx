'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminSession, AdminKeyInput } from '@/modules/forms/admin-session.client';
import { assembleFormManifest, confirmManifest, type ManifestReviewDraft } from '@/modules/forms/services/form-manifest-assembler';
import { assembleMultipageReviewDraft, type FormRecognitionPageInput } from '@/modules/forms/services/multipage-form-recognition';
import { canonicalFormCode } from '@/modules/forms/client';
import { AdminApiError } from '@/modules/forms/services/form-api.client';
import { templateFileError, formErrorMessage } from '@/modules/forms/services/form-feedback.client';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import { useOperationToast } from '@/components/OperationToastProvider';
import type { FormPageMetadata, FormGeometricBox, FormInputKind } from '@/shared/contracts';
import { editBoxRegion, editBoxRegions, mergeTextFields, regionsForBox, splitTextField } from '@/modules/forms/services/form-region-editor';
import { INPUT_KINDS } from '@/modules/forms/services/form-field-metadata';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { buildFormOcrContext } from '@/modules/forms/services/form-ocr-context';
import { nextPriorityReviewIndex, prioritizedReviewReasons } from '@/modules/forms/services/form-region-recognition';
import { APP_ROUTES } from '@/shared/routes';
import {
  UploadCloud,
  Layers,
  Sparkles,
  ArrowLeft,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  PlusCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export default function AdminUploadPage() {
  const router = useRouter();
  const { adminKey } = useAdminSession();
  const { showPending, updatePending, showSuccess, showError, dismiss } = useOperationToast();

  // Form setup states
  const [files, setFiles] = useState<File[]>([]);
  const [formCode, setFormCode] = useState('');
  const [title, setTitle] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [mode, setMode] = useState<'clean-scan' | 'camera-photo'>('clean-scan');
  const [blankConfirmed, setBlankConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  // Execution states
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ManifestReviewDraft | null>(null);
  const [ocrPages, setOcrPages] = useState<DocumentJsonExport[]>([]);
  const [previews, setPreviews] = useState<FormPageMetadata[]>([]);
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [selected, setSelected] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(0);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boxTabsRef = useRef<HTMLDivElement>(null);
  const processed = useRef<Blob[]>([]);
  const previewRefs = useRef<string[]>([]);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const operationToastId = useRef<number | null>(null);

  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    dismiss(operationToastId.current);
    operationToastId.current = null;
  }, [dismiss]);

  const clearAnalysis = useCallback(() => {
    cancel();
    setBusy(false);
    setBusyPhase('');
    setDraft(null);
    setReviewConfirmed(false);
    setOcrPages([]);
    setSelected(0);
    setSelectedRegion(0);
    setActivePageNumber(1);
    processed.current = [];
    previewRefs.current.forEach(url => URL.revokeObjectURL(url));
    previewRefs.current = [];
    setPreviews([]);
  }, [cancel]);

  useEffect(() => {
    return () => {
      cancel();
      previewRefs.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, [cancel]);

  useEffect(() => {
    generation.current++;
    request.current?.abort();
    dismiss(operationToastId.current);
    operationToastId.current = null;
    setBusy(false);
    setBusyPhase('');
  }, [adminKey, dismiss]);

  // Cuộn tab ô đang chọn vào giữa
  useEffect(() => {
    if (!boxTabsRef.current) return;
    const activeTab = boxTabsRef.current.querySelector<HTMLButtonElement>(`[data-box-index="${selected}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selected]);

  const updateBox = (field: string, value: unknown) => {
    if (!draft) return;
    setDraft({
      ...draft,
      manifest: {
        ...draft.manifest,
        boxes: draft.manifest.boxes.map((box, index) =>
          index === selected
            ? {
                ...box,
                [field]: value,
                ...(field === 'normalizedCoords' ? { estimatedWidthRatio: (value as number[])[3] - (value as number[])[1] } : {}),
              }
            : box
        ),
      },
    });
    setReviewConfirmed(false);
  };

  const replaceBox = (updated: FormGeometricBox) => {
    if (!draft) return;
    setDraft({
      ...draft,
      manifest: {
        ...draft.manifest,
        boxes: draft.manifest.boxes.map(item => (item.boxId === updated.boxId ? updated : item)),
      },
    });
    setReviewConfirmed(false);
  };

  const handleFilesChosen = (incoming: File[]) => {
    if (!incoming.length) return;
    const problem = incoming.map((f, idx) => {
      const err = templateFileError(f);
      return err ? `Trang ${idx + 1}: ${err}` : null;
    }).find(Boolean);

    const totalSize = incoming.reduce((acc, f) => acc + f.size, 0);
    if (problem || incoming.length > 20 || totalSize > 32 * 1024 * 1024) {
      setError(`${problem || 'Chỉ nhận tối đa 20 trang và tổng dung lượng không quá 32 MB.'}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    clearAnalysis();
    setFiles(incoming);
    setBlankConfirmed(false);
    setError('');
  };

  const scrollBoxTabs = (direction: 'left' | 'right') => {
    if (!boxTabsRef.current) return;
    const offset = direction === 'left' ? -220 : 220;
    boxTabsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const analyze = async () => {
    if (!files.length || !formCode.trim() || !title.trim() || !blankConfirmed) {
      setError('Vui lòng chọn phôi trống, nhập mã, tên biểu mẫu và đánh dấu xác nhận phôi trống.');
      return;
    }
    clearAnalysis();
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setDraft(null);
    setReviewConfirmed(false);
    operationToastId.current = showPending('Đang quét và nhận diện biểu mẫu', `Chuẩn bị xử lý ${files.length} trang.`);

    const assertCurrent = () => {
      if (generation.current !== current || controller.signal.aborted) throw new Error('OPERATION_ABORTED');
    };

    try {
      const canvas = () => document.createElement('canvas');
      const { runLineDetectionDebug } = await import('@/modules/opencv');
      const pages: FormRecognitionPageInput[] = [];
      const blobs: Blob[] = [];

      for (const [index, file] of files.entries()) {
        assertCurrent();
        setBusyPhase(`Đang xử lý hình học & nắn ảnh trang ${index + 1}/${files.length}...`);
        updatePending(operationToastId.current, `OpenCV: xử lý hình học và nắn ảnh trang ${index + 1}/${files.length}.`);
        const sourceUrl = URL.createObjectURL(file);
        try {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error(`Ảnh trang ${index + 1} không hợp lệ hoặc bị lỗi.`));
            el.src = sourceUrl;
          });
          assertCurrent();
          if (image.naturalWidth * image.naturalHeight > 12_000_000) {
            throw new Error(`Ảnh trang ${index + 1} vượt 12 triệu pixel. Vui lòng nén bớt độ phân giải.`);
          }

          const inputCanvas = canvas();
          const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
          inputCanvas.width = Math.round(image.naturalWidth * scale);
          inputCanvas.height = Math.round(image.naturalHeight * scale);
          inputCanvas.getContext('2d')!.drawImage(image, 0, 0, inputCanvas.width, inputCanvas.height);

          const deskewedCanvas = canvas();
          const geometry = await runLineDetectionDebug({
            mode,
            inputCanvas,
            deskewedCanvas,
            grayscaleCanvas: canvas(),
            binaryCanvas: canvas(),
            horizontalCanvas: canvas(),
            verticalCanvas: canvas(),
            combinedCanvas: canvas(),
            candidateOverlayCanvas: canvas(),
            documentOutlineCanvas: canvas(),
          });
          assertCurrent();

          const blob = await new Promise<Blob>((resolve, reject) =>
            deskewedCanvas.toBlob(r => (r ? resolve(r) : reject(new Error('Không xuất được ảnh chuẩn.'))), 'image/png')
          );
          if (blob.size > 8 * 1024 * 1024) throw new Error(`Ảnh chuẩn trang ${index + 1} vượt 8 MB.`);

          setBusyPhase(`Đang gửi VietOCR nhận dạng văn bản tiếng Việt trang ${index + 1}/${files.length}...`);
          updatePending(operationToastId.current, `VietOCR: trích xuất văn bản trang ${index + 1}/${files.length}.`);
          const payload = new FormData();
          payload.set('file', blob, 'processed.png');
          payload.set('deskewApplied', String(mode === 'camera-photo'));

          const response = await fetch('/api/documents/json', { method: 'POST', body: payload, signal: controller.signal });
          const envelope = await response.json();
          assertCurrent();
          if (!response.ok || envelope.success !== true) {
            throw new Error(envelope.error?.message_vi || `Dịch vụ VietOCR trang ${index + 1} chưa khả dụng.`);
          }

          pages.push({
            pageNumber: index + 1,
            width: geometry.width,
            height: geometry.height,
            candidates: geometry.candidates,
            document: envelope.data as DocumentJsonExport,
          });
          blobs.push(blob);
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }
      }

      setBusyPhase('Đang tổng hợp cấu trúc trường & liên kết ngữ nghĩa...');
      const identity = { formId: `form_${Date.now()}`, formCode: canonicalFormCode(formCode), formTitle: title.trim() };
      const next = pages.length === 1 ? assembleFormManifest({ ...identity, ...pages[0] }) : assembleMultipageReviewDraft({ ...identity, pages });
      assertCurrent();

      const nextPreviews = blobs.map((blob, idx) => ({
        pageNumber: idx + 1,
        imageUrl: URL.createObjectURL(blob),
        width: pages[idx].width,
        height: pages[idx].height,
      }));
      previewRefs.current = nextPreviews.map(p => p.imageUrl);
      processed.current = blobs;
      setPreviews(nextPreviews);
      setDraft(next);
      setOcrPages(pages.map(p => p.document));
      setSelected(0);
      setActivePageNumber(1);
      showSuccess(operationToastId.current, 'Quét biểu mẫu hoàn tất', `Đã phân tích ${pages.length} trang và nhận diện ${next.manifest.boxes.length} trường.`);
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) {
        const message = formErrorMessage(reason, 'Không thể phân tích phôi biểu mẫu. Vui lòng kiểm tra lại ảnh và thử lại.');
        setError(message);
        showError(operationToastId.current, 'Quét biểu mẫu thất bại', message);
      }
    } finally {
      if (generation.current === current) {
        setBusy(false);
        setBusyPhase('');
        if (controller.signal.aborted) dismiss(operationToastId.current);
      }
    }
  };

  const generate = async () => {
    if (!draft || processed.current.length !== previews.length || !previews.length || !adminKey.trim() || !blankConfirmed || !reviewConfirmed) {
      setError(!reviewConfirmed
        ? 'Hãy đối chiếu các nhãn, loại ô, vùng tọa độ và thứ tự bước, sau đó tích xác nhận rà soát trước khi lưu.'
        : 'Cần bản phân tích manifest, khóa quản trị và xác nhận phôi trống.');
      return;
    }
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    let phase = 'Đang lưu trữ ảnh phôi chuẩn lên máy chủ';
    setBusyPhase(phase);
    setError('');
    operationToastId.current = showPending('Đang lưu phôi và sinh kịch bản', phase);

    try {
      const previewManifest = confirmManifest({ ...draft.manifest, pages: previews }, reviewConfirmed);
      const ocrContext = buildFormOcrContext(ocrPages);
      if (
        new TextEncoder().encode(JSON.stringify({ manifest: { ...previewManifest, circularInfo: legalBasis }, ocrContext })).byteLength >
        376 * 1024
      ) {
        throw new Error('PROMPT_REQUEST_TOO_LARGE');
      }

      const savedPages: FormPageMetadata[] = [];
      for (const [index, blob] of processed.current.entries()) {
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (generation.current !== current || controller.signal.aborted) return;

        phase = `Đang đăng ký ảnh phôi trang ${index + 1}/${processed.current.length}`;
        setBusyPhase(`${phase}...`);
        updatePending(operationToastId.current, `${phase}...`);
        const assetResponse = await fetch('/api/admin/forms/assets', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ formCode: draft.manifest.formCode, pageNumber: index + 1, imageBase64, blankTemplateConfirmed: true }),
        });
        const asset = await assetResponse.json();
        if (generation.current !== current || controller.signal.aborted) return;
        if (!assetResponse.ok || asset.success !== true) {
          throw new AdminApiError(assetResponse.status, asset.error?.code || 'ASSET_UNAVAILABLE', `Không lưu được ảnh phôi trang ${index + 1}.`);
        }
        const page = asset.data as FormPageMetadata;
        if (page.pageNumber !== index + 1 || page.width !== previews[index].width || page.height !== previews[index].height) {
          throw new Error('FRAME_MISMATCH');
        }
        savedPages.push(page);
      }

      phase = 'Đang gọi AI Gemini sinh kịch bản và lưu cơ sở dữ liệu';
      setBusyPhase(`${phase}...`);
      updatePending(operationToastId.current, `${phase}...`);
      const manifest = confirmManifest({ ...draft.manifest, pages: savedPages }, reviewConfirmed);
      const response = await fetch('/api/llm/prompt', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ manifest: { ...manifest, circularInfo: legalBasis }, ocrContext }),
      });
      const result = await response.json();
      if (generation.current !== current || controller.signal.aborted) return;
      if (!response.ok || result.success !== true || result.meta?.persisted !== true) {
        throw new AdminApiError(response.status, result.error?.code || 'PROMPT_UNAVAILABLE', 'Chưa lưu được kịch bản trên máy chủ.');
      }

      // Điều hướng thẳng tới trang review của biểu mẫu mới
      showSuccess(operationToastId.current, 'Đã lưu phôi và tạo kịch bản', 'Đang mở trang kiểm duyệt kịch bản.');
      operationToastId.current = null;
      router.push(APP_ROUTES.review(manifest.formCode));
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) {
        const message = `${phase}: ${formErrorMessage(reason, 'Thao tác thất bại. Kiểm tra kết nối máy chủ hoặc log API rồi thử lại.')}`;
        setError(message);
        showError(operationToastId.current, 'Không lưu được phôi hoặc kịch bản', message);
      }
    } finally {
      if (generation.current === current) {
        setBusy(false);
        setBusyPhase('');
        if (controller.signal.aborted) dismiss(operationToastId.current);
      }
    }
  };

  const box = draft?.manifest.boxes[selected];
  const reviewBoxCount = draft?.manifest.boxes.filter(item => item.recognition?.status === 'needs_review' || !item.rawText).length ?? 0;
  const selectedReviewPosition = box && (box.recognition?.status === 'needs_review' || !box.rawText)
    ? draft?.manifest.boxes.slice(0, selected + 1).filter(item => item.recognition?.status === 'needs_review' || !item.rawText).length ?? 0
    : 0;
  const page = previews.find(item => item.pageNumber === activePageNumber);
  const pageReview = draft?.pageReviews?.find(item => item.pageNumber === activePageNumber);
  const region = box && regionsForBox(box)[selectedRegion];

  return (
    <section className={`w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6 min-w-0 ${busy ? 'pb-28' : ''}`}>
      {/* 1. THANH TIÊU ĐỀ TRANG CHUẨN DESIGN SYSTEM REVIEW */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <Link href={APP_ROUTES.library} className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về thư viện biểu mẫu</span>
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Thêm Phôi Biểu Mẫu Trống Mới</h1>
          <p className="text-xs text-slate-500 font-medium">
            Quy trình tiếp nhận: Nạp ảnh phôi → Nắn OpenCV → Trích xuất VietOCR → Đối soát ô → Sinh kịch bản
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg text-xs font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
            QUY TRÌNH TIẾP NHẬN PHÔI
          </span>
        </div>
      </div>

      {/* 2. KHÓA QUẢN TRỊ HIỆN TẠI */}
      <AdminKeyInput />

      {/* 3. THÔNG BÁO TIẾN TRÌNH / LỖI HỆ THỐNG */}
      {Boolean(error) && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* 4. KHỐI THIẾT LẬP THÔNG TIN BIỂU MẪU & TẢI TỆP PHÔI */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
              1. Thông tin biểu mẫu & Tệp tin phôi
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-semibold">Bước chuẩn bị đầu vào</span>
        </div>

        <fieldset disabled={busy} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
              Mã biểu mẫu (Form Code): <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="VD: HDLD-2021, 01-LPTB..."
              className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 uppercase"
              value={formCode}
              onChange={event => {
                setFormCode(event.target.value);
                setDraft(null);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
              Tên biểu mẫu tiếng Việt: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="VD: Hợp đồng lao động xác định thời hạn..."
              className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600"
              value={title}
              onChange={event => {
                setTitle(event.target.value);
                setDraft(null);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
              Căn cứ pháp lý / Thông tư ban hành:
            </label>
            <input
              type="text"
              placeholder="VD: Thông tư số 10/2020/TT-BLĐTBXH..."
              className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600"
              value={legalBasis}
              onChange={event => setLegalBasis(event.target.value)}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
              Chế độ nắn hình ảnh (OpenCV Ingestion Mode):
            </label>
            <select
              className="w-full md:w-auto text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 bg-white"
              value={mode}
              onChange={event => {
                setMode(event.target.value as typeof mode);
                setDraft(null);
              }}
            >
              <option value="clean-scan">Ảnh scan phẳng chuẩn (Khuyên dùng khi có file PDF/scan thẳng)</option>
              <option value="camera-photo">Ảnh chụp qua camera điện thoại (Tự động tìm 4 góc và nắn phối cảnh)</option>
            </select>
          </div>
        </fieldset>

        {/* Khu vực kéo thả / chọn file ảnh */}
        <fieldset disabled={busy} className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={event => {
              const incoming = Array.from(event.target.files ?? []);
              handleFilesChosen(incoming);
            }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-2xl p-8 bg-slate-50 hover:bg-emerald-50/30 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3 select-none"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">
                Nhấp để tải lên hoặc kéo thả ảnh phôi vào đây
              </p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Chấp nhận định dạng ảnh JPEG hoặc PNG. Tối đa 20 trang, tổng dung lượng không quá 32 MB.
              </p>
            </div>
          </div>

          {/* Danh sách các trang đã nạp */}
          {files.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-black uppercase text-slate-700">
                <span>Danh sách trang phôi đã nạp ({files.length} trang):</span>
                <span className="text-[11px] text-slate-400 font-normal">Thứ tự này quyết định thứ tự trang của biểu mẫu</span>
              </div>
              <ul className="divide-y divide-slate-200">
                {files.map((file, index) => (
                  <li key={`${index}-${file.name}`} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded font-black font-mono shrink-0">
                        Trang {index + 1}
                      </span>
                      <span className="font-bold text-slate-800 truncate">{file.name}</span>
                      <span className="text-slate-400 text-[11px]">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => {
                          const reordered = [...files];
                          [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                          clearAnalysis();
                          setFiles(reordered);
                          setBlankConfirmed(false);
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded text-xs font-bold"
                        title="Đưa trang lên trước"
                      >
                        ▲ Lên
                      </button>
                      <button
                        type="button"
                        disabled={busy || index === files.length - 1}
                        onClick={() => {
                          const reordered = [...files];
                          [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
                          clearAnalysis();
                          setFiles(reordered);
                          setBlankConfirmed(false);
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded text-xs font-bold"
                        title="Đưa trang xuống sau"
                      >
                        ▼ Xuống
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const filtered = files.filter((_, i) => i !== index);
                          clearAnalysis();
                          setFiles(filtered);
                          setBlankConfirmed(false);
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Xóa trang này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cam kết phôi trống bảo mật */}
          <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/50 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
            <label className="text-xs font-bold text-emerald-950 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                checked={blankConfirmed}
                onChange={event => {
                  setBlankConfirmed(event.target.checked);
                  setReviewConfirmed(false);
                }}
              />
              <span>
                Tôi xác nhận đây là <strong>phôi biểu mẫu trống hoàn toàn</strong>, tuyệt đối không chứa dữ liệu công dân hay thông tin nhạy cảm (Tuân thủ Nghị định 13/2023/NĐ-CP).
              </span>
            </label>
          </div>

          {/* Nút phân tích */}
          <div className="pt-2">
            <button
              type="button"
              disabled={busy || !files.length || !formCode.trim() || !title.trim() || !blankConfirmed}
              onClick={() => void analyze()}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>⚡ Phân tích OpenCV & Trích xuất VietOCR</span>
            </button>
          </div>
        </fieldset>
      </div>

      {/* 5. KHỐI ĐỐI SOÁT Ô NHẬN DIỆN & CHỈ SỐ (Hiển thị sau khi phân tích thành công) */}
      {draft && (
        <div className="space-y-5">
          {/* Dải chỉ số tổng quan */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                  Kết quả nhận diện tự động:
                </span>
                <span className="font-mono text-xs font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                  {draft.manifest.boxes.length} trường
                </span>
                {draft.manifest.boxes.filter(item => item.recognition?.status === 'needs_review' || !item.rawText).length > 0 && (
                  <span className="font-mono text-xs font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                    {draft.manifest.boxes.filter(item => item.recognition?.status === 'needs_review' || !item.rawText).length} trường cần chú ý
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Mỗi trường nhiều dòng chỉ sinh một bước hướng dẫn. Vui lòng đối soát từng nhãn và khung đỏ; trạng thái gợi ý không thay thế xác nhận của quản trị viên.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {reviewBoxCount > 0 && draft && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIndex = nextPriorityReviewIndex(draft.manifest.boxes, selected);
                    if (nextIndex === undefined) return;
                    setSelected(nextIndex);
                    setSelectedRegion(0);
                    setActivePageNumber(draft.manifest.boxes[nextIndex].pageNumber ?? 1);
                  }}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                  aria-label="Chuyển đến ô cần chú ý tiếp theo"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{selectedReviewPosition > 0 ? `Ô cần chú ý ${selectedReviewPosition}/${reviewBoxCount}` : `${reviewBoxCount} ô cần chú ý`}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const source = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
                  const link = document.createElement('a');
                  link.href = source;
                  link.download = `${canonicalFormCode(formCode)}-recognition.json`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(source), 0);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                title="Tải tệp JSON nhận diện để lưu vết hoặc kiểm tra"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Tải JSON nhận diện</span>
              </button>
            </div>
          </div>

          {/* Cảnh báo đặc thù trang phôi */}
          {draft.manifest.boxes.some(item => item.pageNumber === activePageNumber && item.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED')) && (
            <div role="alert" className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Trang {activePageNumber} đang dùng tiêu đề cột kế thừa từ trang trước. Hãy kiểm tra lại từng nhãn Có/Không trước khi lưu.</span>
            </div>
          )}
          {draft.manifest.boxes.some(item => item.pageNumber === activePageNumber && item.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED')) && (
            <div role="alert" className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Hàng đầu trang {activePageNumber} được suy từ chữ OCR và lưới chưa khép kín; cần sửa nhãn và tọa độ nếu ảnh khác thực tế.</span>
            </div>
          )}

          {/* Lưới 2 cột: Cột trái Visual Twin Preview, Cột phải Hộp điều khiển đối soát */}
          <div className="grid lg:grid-cols-2 gap-4 min-w-0 w-full">
            {/* CỘT TRÁI: VISUAL TWIN EDITOR */}
            <div className="space-y-3 min-w-0 w-full">
              {previews.length > 1 && (
                <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                  <span>Trang phôi hiển thị:</span>
                  <select
                    className="border border-slate-300 rounded-lg p-1.5 font-semibold bg-white"
                    value={activePageNumber}
                    onChange={event => setActivePageNumber(Number(event.target.value))}
                  >
                    {previews.map(item => (
                      <option key={item.pageNumber} value={item.pageNumber}>
                        Trang {item.pageNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {box && page && region?.pageNumber === activePageNumber ? (
                <AdminVisualTwinEditor
                  pages={previews}
                  currentPageNumber={activePageNumber}
                  onPageChange={setActivePageNumber}
                  fieldLabel={box.rawText || 'Cần đặt nhãn'}
                  highlightCoords={region.normalizedCoords}
                  onCoordsChange={coords => replaceBox(editBoxRegion(box, selectedRegion, coords))}
                />
              ) : page ? (
                <div className="bg-white p-3 rounded-xl border border-slate-300">
                  <img
                    src={page.imageUrl}
                    alt={`Ảnh phôi trang ${activePageNumber} để đối soát`}
                    className="block w-full h-auto border rounded"
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500">Chưa có ảnh phôi hợp lệ để hiển thị.</p>
              )}
            </div>

            {/* CỘT PHẢI: BẢNG BIÊN TẬP Ô ĐỐI SOÁT */}
            <div className="space-y-3 min-w-0 w-full">
              {/* KHỐI KHÓA CỨNG: BẢNG CHỌN Ô CÓ THANH SCROLL CHUẨN DESIGN SYSTEM REVIEW */}
              <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-xs w-full min-w-0 max-w-full flex flex-col gap-2">
                <div className="flex items-center justify-between px-1 text-slate-500">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Danh sách các ô đối soát ({draft.manifest.boxes.length} ô)</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scrollBoxTabs('left')}
                      className="px-2 py-0.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold transition-colors flex items-center gap-0.5"
                      title="Cuộn danh sách sang trái"
                    >
                      <ChevronLeft className="w-3 h-3" />
                      <span className="text-[10px]">Trước</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollBoxTabs('right')}
                      className="px-2 py-0.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold transition-colors flex items-center gap-0.5"
                      title="Cuộn danh sách sang phải"
                    >
                      <span className="text-[10px]">Sau</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div
                  ref={boxTabsRef}
                  tabIndex={0}
                  aria-label="Thanh cuộn danh sách các ô đối soát"
                  className="w-full min-w-0 max-w-full flex items-center gap-1.5 overflow-x-auto pb-2 pt-1 px-1 custom-scrollbar select-none scroll-smooth focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded-lg"
                >
                  {draft.manifest.boxes.map((item, idx) => {
                    const isActive = selected === idx;
                    const needsReview = item.recognition?.status === 'needs_review' || !item.rawText;
                    const hasOcrAdvisory = item.recognition?.reviewReasons.includes('OCR_LOW_CONFIDENCE') ?? false;
                    return (
                      <button
                        key={item.boxId || idx}
                        data-box-index={idx}
                        type="button"
                        onClick={() => {
                          setSelected(idx);
                          setSelectedRegion(0);
                          setActivePageNumber(item.pageNumber ?? 1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 transition-all whitespace-nowrap ${
                          isActive
                            ? 'bg-emerald-700 text-white shadow-md scale-105 ring-2 ring-emerald-400'
                            : needsReview
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                            : hasOcrAdvisory
                            ? 'bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300'
                            : 'bg-slate-50 hover:bg-slate-200 text-slate-700 border border-slate-300'
                        }`}
                      >
                        #{idx + 1} P{item.pageNumber ?? 1} {needsReview ? '⚠️' : hasOcrAdvisory ? 'ℹ️' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chi tiết ô đang chọn */}
              {box && (
                <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-black uppercase text-slate-800">
                      Ô #{selected + 1} / {draft.manifest.boxes.length} (Trang {box.pageNumber ?? 1})
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">ID: {box.boxId}</span>
                  </div>

                  {prioritizedReviewReasons(box.recognition?.reviewReasons).length ? (
                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      Cần ưu tiên đối soát: {prioritizedReviewReasons(box.recognition?.reviewReasons).join('; ')}
                    </p>
                  ) : null}
                  {box.recognition?.reviewReasons?.includes('OCR_LOW_CONFIDENCE') ? (
                    <p className="text-xs font-semibold text-sky-900 bg-sky-50 p-2.5 rounded-lg border border-sky-200">
                      Tín hiệu OCR confidence thấp chưa được hiệu chỉnh; hãy so nhãn với ảnh. Tín hiệu này không tự kết luận ô sai.
                    </p>
                  ) : null}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                      Nhãn thực trên phôi (Raw Label):
                    </label>
                    <input
                      type="text"
                      className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600"
                      value={box.rawText || ''}
                      onChange={event => updateBox('rawText', event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                        Loại trường:
                      </label>
                      <select
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 bg-white"
                        value={box.inputKind ?? 'single_line_text'}
                        onChange={event => replaceBox(editBoxRegions(box, regionsForBox(box), event.target.value as FormInputKind))}
                      >
                        {INPUT_KINDS.map(kind => (
                          <option key={kind} value={kind}>
                            {
                              {
                                single_line_text: 'Một dòng',
                                multiline_text: 'Nhiều dòng',
                                checkbox: 'Tích chọn',
                                character_slots: 'Mỗi ký tự một ô',
                                table_cell: 'Ô trong bảng',
                              }[kind]
                            }
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                        Vùng của trường:
                      </label>
                      <select
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 bg-white"
                        value={selectedRegion}
                        onChange={event => {
                          const idx = Number(event.target.value);
                          setSelectedRegion(idx);
                          setActivePageNumber(regionsForBox(box)[idx].pageNumber);
                        }}
                      >
                        {regionsForBox(box).map((item, index) => (
                          <option key={item.regionId} value={index}>
                            Vùng {index + 1} — trang {item.pageNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cụm nút thao tác vi chỉnh vùng */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200">
                    <button
                      type="button"
                      disabled={regionsForBox(box).length >= 64}
                      onClick={() => {
                        const regions = regionsForBox(box);
                        const regionId = `region_${crypto.randomUUID()}`;
                        replaceBox(
                          editBoxRegions(
                            box,
                            [...regions, { regionId, pageNumber: activePageNumber, normalizedCoords: [0.1, 0.1, 0.15, 0.5] }],
                            'multiline_text'
                          )
                        );
                        setSelectedRegion(regions.length);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                    >
                      + Thêm dòng viết
                    </button>

                    <button
                      type="button"
                      disabled={regionsForBox(box).length <= 1}
                      onClick={() => {
                        replaceBox(editBoxRegions(box, regionsForBox(box).filter((_, index) => index !== selectedRegion)));
                        setSelectedRegion(0);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                    >
                      Bỏ dòng đang chọn
                    </button>

                    <button
                      type="button"
                      disabled={
                        box.boxType !== 'text' ||
                        draft.manifest.boxes[selected + 1]?.boxType !== 'text' ||
                        regionsForBox(box).length + (draft.manifest.boxes[selected + 1] ? regionsForBox(draft.manifest.boxes[selected + 1]).length : 0) >
                          64
                      }
                      onClick={() => {
                        const merged = mergeTextFields(box, draft.manifest.boxes[selected + 1]);
                        setDraft({
                          ...draft,
                          manifest: {
                            ...draft.manifest,
                            boxes: draft.manifest.boxes.flatMap((item, index) =>
                              index === selected ? [merged] : index === selected + 1 ? [] : [item]
                            ),
                          },
                        });
                        setSelectedRegion(0);
                        setReviewConfirmed(false);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                    >
                      Gộp với ô kế tiếp
                    </button>

                    <button
                      type="button"
                      disabled={
                        box.boxType !== 'text' ||
                        regionsForBox(box).length < 2 ||
                        draft.manifest.boxes.length + regionsForBox(box).length - 1 > 200
                      }
                      onClick={() => {
                        const split = splitTextField(box, regionsForBox(box).slice(1).map(() => `manual_${crypto.randomUUID()}`));
                        setDraft({
                          ...draft,
                          manifest: {
                            ...draft.manifest,
                            boxes: draft.manifest.boxes.flatMap((item, index) => (index === selected ? split : [item])),
                          },
                        });
                        setSelectedRegion(0);
                        setReviewConfirmed(false);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                    >
                      Tách các vùng thành ô riêng
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDraft({
                          ...draft,
                          manifest: {
                            ...draft.manifest,
                            boxes: draft.manifest.boxes.filter(item => item.boxId !== box.boxId),
                          },
                        });
                        setSelected(0);
                        setSelectedRegion(0);
                        setReviewConfirmed(false);
                      }}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold"
                    >
                      Loại bỏ ô này
                    </button>
                  </div>

                  {/* Đổi thứ tự ô & Thêm ô vẽ mới */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={selected === 0}
                        onClick={() => {
                          const boxes = [...draft.manifest.boxes];
                          [boxes[selected - 1], boxes[selected]] = [boxes[selected], boxes[selected - 1]];
                          setDraft({ ...draft, manifest: { ...draft.manifest, boxes } });
                          setSelected(selected - 1);
                          setReviewConfirmed(false);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded text-xs font-bold"
                      >
                        ▲ Đưa ô lên trước
                      </button>
                      <button
                        type="button"
                        disabled={selected >= draft.manifest.boxes.length - 1}
                        onClick={() => {
                          const boxes = [...draft.manifest.boxes];
                          [boxes[selected + 1], boxes[selected]] = [boxes[selected], boxes[selected + 1]];
                          setDraft({ ...draft, manifest: { ...draft.manifest, boxes } });
                          setSelected(selected + 1);
                          setReviewConfirmed(false);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded text-xs font-bold"
                      >
                        ▼ Đưa ô xuống sau
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={draft.manifest.boxes.length >= 200}
                      onClick={() => {
                        const boxId = `manual_${crypto.randomUUID()}`;
                        const coords: [number, number, number, number] = [0.1, 0.1, 0.2, 0.5];
                        const next: FormGeometricBox = {
                          boxId,
                          pageNumber: activePageNumber,
                          rawText: '',
                          boxType: 'text',
                          inputKind: 'single_line_text',
                          inputRegions: [{ regionId: `${boxId}_region_1`, pageNumber: activePageNumber, normalizedCoords: coords }],
                          estimatedWidthRatio: 0.4,
                          normalizedCoords: coords,
                        };
                        setDraft({ ...draft, manifest: { ...draft.manifest, boxes: [...draft.manifest.boxes, next] } });
                        setSelected(draft.manifest.boxes.length);
                        setSelectedRegion(0);
                        setReviewConfirmed(false);
                      }}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Thêm ô thủ công</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chi tiết nội dung OCR gốc */}
          <details className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
            <summary className="font-bold text-slate-700 cursor-pointer select-none">
              Xem văn bản thô trích xuất từ VietOCR (Trang {activePageNumber})
            </summary>
            <div className="mt-3 space-y-2">
              <pre className="p-3 bg-white border rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-60 custom-scrollbar">
                {ocrPages[activePageNumber - 1]?.rawText || 'Không có văn bản trích xuất.'}
              </pre>
              {ocrPages[activePageNumber - 1]?.warnings?.length ? (
                <p className="text-amber-800 font-semibold">
                  Cảnh báo: {ocrPages[activePageNumber - 1].warnings.join('; ')}
                </p>
              ) : null}
            </div>
          </details>

          {/* 6. KHỐI XÁC NHẬN ĐỐI SOÁT & SINH KỊCH BẢN CHỜ DUYỆT */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                2. Phê duyệt phôi và Sinh kịch bản hướng dẫn
              </h2>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                checked={reviewConfirmed}
                onChange={event => {
                  setReviewConfirmed(event.target.checked);
                  if (event.target.checked) setError('');
                }}
              />
              <span className="text-xs font-bold text-slate-800">
                Tôi đã đối chiếu kỹ lưỡng từng nhãn hiển thị, loại ô nhập liệu, vùng tọa độ highlight và thứ tự các bước điền.
              </span>
            </label>

            <button
              type="button"
              disabled={busy || !reviewConfirmed || !adminKey.trim() || draft.manifest.boxes.length === 0}
              title={!reviewConfirmed ? 'Hãy tích xác nhận rà soát sau khi đối chiếu nhãn, loại ô, tọa độ và thứ tự bước.'
                : !adminKey.trim() ? 'Nhập khóa quản trị trước khi tiếp tục.' : undefined}
              onClick={() => void generate()}
              className="w-full sm:w-auto px-8 py-3.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>🚀 Lưu phôi và Khởi tạo kịch bản chờ duyệt</span>
            </button>
            {!reviewConfirmed && (
              <p className="text-xs font-semibold text-amber-800" role="status">
                Nút đang khóa: hãy đối chiếu từng ô rồi tích xác nhận rà soát. Mọi chỉnh sửa sau đó sẽ yêu cầu xác nhận lại.
              </p>
            )}
            {reviewConfirmed && !adminKey.trim() && (
              <p className="text-xs font-semibold text-amber-800" role="status">Nút đang khóa: cần nhập khóa quản trị hợp lệ.</p>
            )}
          </div>
        </div>
      )}

      {busy && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 pointer-events-none">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-white/95 p-4 text-xs font-bold text-emerald-950 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-emerald-700" />
              <span className="truncate sm:whitespace-normal">
                {busyPhase || 'Đang xử lý phân tích hình học và nhận diện văn bản...'}
              </span>
            </div>
            <button
              type="button"
              onClick={cancel}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
            >
              Hủy thao tác
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
