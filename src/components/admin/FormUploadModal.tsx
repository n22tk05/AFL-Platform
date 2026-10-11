'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession, AdminKeyInput } from '@/modules/forms/admin-session.client';
import { assembleFormManifest, confirmManifest, type ManifestReviewDraft } from '@/modules/forms/services/form-manifest-assembler';
import { assembleMultipageReviewDraft, type FormRecognitionPageInput } from '@/modules/forms/services/multipage-form-recognition';
import { canonicalFormCode } from '@/modules/forms/client';
import { AdminApiError } from '@/modules/forms/services/form-api.client';
import { templateFileError, formErrorMessage } from '@/modules/forms/services/form-feedback.client';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import type { FormPageMetadata, FormGeometricBox, FormInputKind } from '@/shared/contracts';
import { editBoxRegion, editBoxRegions, mergeTextFields, regionsForBox, splitTextField } from '@/modules/forms/services/form-region-editor';
import { INPUT_KINDS } from '@/modules/forms/services/form-field-metadata';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { buildFormOcrContext } from '@/modules/forms/services/form-ocr-context';
import { APP_ROUTES } from '@/shared/routes';
import { useOperationToast } from '@/components/OperationToastProvider';

interface FormUploadModalProps { isOpen: boolean; onClose: () => void }
export function FormUploadModal({ isOpen, onClose }: FormUploadModalProps) {
  const router = useRouter();
  const { adminKey } = useAdminSession();
  const { showPending, updatePending, showSuccess, showError, dismiss } = useOperationToast();
  const [files, setFiles] = useState<File[]>([]);
  const [formCode, setFormCode] = useState('');
  const [title, setTitle] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [mode, setMode] = useState<'clean-scan' | 'camera-photo'>('clean-scan');
  const [blankConfirmed, setBlankConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ManifestReviewDraft | null>(null);
  const [ocrPages, setOcrPages] = useState<DocumentJsonExport[]>([]);
  const [previews, setPreviews] = useState<FormPageMetadata[]>([]);
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [selected, setSelected] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(0);
  const processed = useRef<Blob[]>([]);
  const previewRefs = useRef<string[]>([]);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const operationToastId = useRef<number | null>(null);
  const cancel = useCallback(() => {
    generation.current++; request.current?.abort(); dismiss(operationToastId.current); operationToastId.current = null;
  }, [dismiss]);
  const clearAnalysis = useCallback(() => {
    cancel(); setBusy(false); setDraft(null); setReviewConfirmed(false); setOcrPages([]); setSelected(0); setSelectedRegion(0); setActivePageNumber(1);
    processed.current = [];
    previewRefs.current.forEach(url => URL.revokeObjectURL(url));
    previewRefs.current = []; setPreviews([]);
  }, [cancel]);
  useEffect(() => {
    if (!isOpen) {
      clearAnalysis(); setBlankConfirmed(false); setFiles([]); setError('');
    }
    return cancel;
  }, [isOpen, cancel, clearAnalysis]);
  useEffect(() => () => { previewRefs.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { generation.current++; request.current?.abort(); dismiss(operationToastId.current); operationToastId.current = null; setBusy(false); }, [adminKey, dismiss]);
  if (!isOpen) return null;
  const updateBox = (field: string, value: unknown) => {
    if (!draft) return;
    setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.map((box, index) =>
      index === selected ? { ...box, [field]: value, ...(field === 'normalizedCoords' ? { estimatedWidthRatio: (value as number[])[3] - (value as number[])[1] } : {}) } : box) } }); setReviewConfirmed(false);
  };
  const replaceBox = (updated: FormGeometricBox) => {
    if (!draft) return;
    setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.map(item => item.boxId === updated.boxId ? updated : item) } });
    setReviewConfirmed(false);
  };
  const analyze = async () => {
    if (!files.length || !formCode.trim() || !title.trim() || !blankConfirmed) { setError('Chọn phôi trống và nhập mã/tên biểu mẫu.'); return; }
    clearAnalysis();
    const current = ++generation.current;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setDraft(null); setReviewConfirmed(false);
    operationToastId.current = showPending('Đang quét và nhận diện biểu mẫu', `Chuẩn bị xử lý ${files.length} trang bằng OpenCV và VietOCR.`);
    const assertCurrent = () => { if (generation.current !== current || controller.signal.aborted) throw new Error('OPERATION_ABORTED'); };
    try {
      const canvas = () => document.createElement('canvas');
      const { runLineDetectionDebug } = await import('@/modules/opencv');
      const pages: FormRecognitionPageInput[] = [];
      const blobs: Blob[] = [];
      for (const [index, file] of files.entries()) {
        assertCurrent();
        updatePending(operationToastId.current, `OpenCV: nắn ảnh trang ${index + 1}/${files.length}.`);
        const sourceUrl = URL.createObjectURL(file);
        try {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error(`Ảnh trang ${index + 1} không hợp lệ.`)); element.src = sourceUrl;
          });
          assertCurrent();
          if (image.naturalWidth * image.naturalHeight > 12_000_000) throw new Error(`Ảnh trang ${index + 1} vượt 12 triệu pixel.`);
          const inputCanvas = canvas();
          const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
          inputCanvas.width = Math.round(image.naturalWidth * scale); inputCanvas.height = Math.round(image.naturalHeight * scale);
          inputCanvas.getContext('2d')!.drawImage(image, 0, 0, inputCanvas.width, inputCanvas.height);
          const deskewedCanvas = canvas();
          const geometry = await runLineDetectionDebug({ mode, inputCanvas, deskewedCanvas,
            grayscaleCanvas: canvas(), binaryCanvas: canvas(), horizontalCanvas: canvas(), verticalCanvas: canvas(),
            combinedCanvas: canvas(), candidateOverlayCanvas: canvas(), documentOutlineCanvas: canvas() });
          assertCurrent();
          updatePending(operationToastId.current, `VietOCR: nhận dạng văn bản trang ${index + 1}/${files.length}.`);
          const blob = await new Promise<Blob>((resolve, reject) => deskewedCanvas.toBlob(result => result ? resolve(result) : reject(new Error('Không xuất được ảnh chuẩn.')), 'image/png'));
          if (blob.size > 8 * 1024 * 1024) throw new Error(`Ảnh chuẩn trang ${index + 1} vượt 8 MB; chọn ảnh nhỏ hơn.`);
          const payload = new FormData(); payload.set('file', blob, 'processed.png'); payload.set('deskewApplied', String(mode === 'camera-photo'));
          const response = await fetch('/api/documents/json', { method: 'POST', body: payload, signal: controller.signal });
          const envelope = await response.json(); assertCurrent();
          if (!response.ok || envelope.success !== true) throw new Error(envelope.error?.message_vi || `VietOCR trang ${index + 1} chưa khả dụng.`);
          pages.push({ pageNumber: index + 1, width: geometry.width, height: geometry.height,
            candidates: geometry.candidates, document: envelope.data as DocumentJsonExport });
          blobs.push(blob);
        } finally { URL.revokeObjectURL(sourceUrl); }
      }
      const identity = { formId: `form_${Date.now()}`, formCode: canonicalFormCode(formCode), formTitle: title.trim() };
      const next = pages.length === 1 ? assembleFormManifest({ ...identity, ...pages[0] })
        : assembleMultipageReviewDraft({ ...identity, pages });
      assertCurrent();
      const nextPreviews = blobs.map((blob, index) => ({ pageNumber: index + 1, imageUrl: URL.createObjectURL(blob),
        width: pages[index].width, height: pages[index].height }));
      previewRefs.current = nextPreviews.map(page => page.imageUrl);
      processed.current = blobs; setPreviews(nextPreviews); setDraft(next); setOcrPages(pages.map(page => page.document)); setSelected(0);
      showSuccess(operationToastId.current, 'Quét biểu mẫu hoàn tất', `Đã phân tích ${pages.length} trang và nhận diện ${next.manifest.boxes.length} trường.`);
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) {
        const message = formErrorMessage(reason, 'Không phân tích được phôi. Vui lòng kiểm tra ảnh và thử lại.');
        setError(message); showError(operationToastId.current, 'Quét biểu mẫu thất bại', message);
      }
    } finally {
      if (generation.current === current) { setBusy(false); if (controller.signal.aborted) dismiss(operationToastId.current); }
    }
  };
  const generate = async () => {
    if (!draft || processed.current.length !== previews.length || !previews.length || !adminKey.trim() || !blankConfirmed) {
      setError('Cần manifest, khóa quản trị và xác nhận phôi trống.'); return;
    }
    const current = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    operationToastId.current = showPending('Đang lưu phôi và sinh kịch bản', 'Đang lưu ảnh phôi đã xử lý.');
    try {
      const previewManifest = confirmManifest({ ...draft.manifest, pages: previews }, reviewConfirmed);
      const ocrContext = buildFormOcrContext(ocrPages);
      if (new TextEncoder().encode(JSON.stringify({ manifest: { ...previewManifest, circularInfo: legalBasis }, ocrContext })).byteLength > 376 * 1024)
        throw new Error('PROMPT_REQUEST_TOO_LARGE');
      const savedPages: FormPageMetadata[] = [];
      for (const [index, blob] of processed.current.entries()) {
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        if (generation.current !== current || controller.signal.aborted) return;
        updatePending(operationToastId.current, `Đang lưu ảnh phôi trang ${index + 1}/${processed.current.length}.`);
        const assetResponse = await fetch('/api/admin/forms/assets', { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ formCode: draft.manifest.formCode, pageNumber: index + 1, imageBase64, blankTemplateConfirmed: true }) });
        const asset = await assetResponse.json();
        if (generation.current !== current || controller.signal.aborted) return;
        if (!assetResponse.ok || asset.success !== true) throw new AdminApiError(assetResponse.status, asset.error?.code || 'ASSET_UNAVAILABLE', `Không lưu được ảnh phôi trang ${index + 1}.`);
        const page = asset.data as FormPageMetadata;
        if (page.pageNumber !== index + 1 || page.width !== previews[index].width || page.height !== previews[index].height) throw new Error('FRAME_MISMATCH');
        savedPages.push(page);
      }
      updatePending(operationToastId.current, 'Đang gửi OCR và cấu trúc ô cho Gemini để sinh kịch bản.');
      const manifest = confirmManifest({ ...draft.manifest, pages: savedPages }, reviewConfirmed);
      const response = await fetch('/api/llm/prompt', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ manifest: { ...manifest, circularInfo: legalBasis }, ocrContext }) });
      const result = await response.json();
      if (generation.current !== current || controller.signal.aborted) return;
      if (!response.ok || result.success !== true || result.meta?.persisted !== true) throw new AdminApiError(response.status, result.error?.code || 'PROMPT_UNAVAILABLE', 'Chưa lưu được kịch bản trên máy chủ.');
      showSuccess(operationToastId.current, 'Đã lưu phôi và tạo kịch bản', 'Đang mở trang kiểm duyệt kịch bản.');
      operationToastId.current = null;
      onClose(); router.push(APP_ROUTES.review(manifest.formCode));
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) {
        const message = formErrorMessage(reason, 'Chưa lưu được phôi hoặc kịch bản trên máy chủ. Vui lòng kiểm tra và thử lại.');
        setError(message); showError(operationToastId.current, 'Không lưu được phôi hoặc kịch bản', message);
      }
    } finally { if (generation.current === current) { setBusy(false); if (controller.signal.aborted) dismiss(operationToastId.current); } }
  };
  const box = draft?.manifest.boxes[selected];
  const page = previews.find(item => item.pageNumber === activePageNumber);
  const pageReview = draft?.pageReviews?.find(item => item.pageNumber === activePageNumber);
  const region = box && regionsForBox(box)[selectedRegion];
  return <div role="dialog" aria-modal="true" aria-label="Tạo biểu mẫu từ phôi" className="fixed inset-0 bg-black/60 z-50 p-4 overflow-auto">
    <section className="max-w-6xl mx-auto bg-white rounded p-5 space-y-3">
      <button className="border rounded p-3" onClick={() => { cancel(); onClose(); }}>Đóng</button><h2 className="text-xl font-bold">Phôi → OCR → đối soát ô → kịch bản</h2>
      <AdminKeyInput /><fieldset disabled={busy} className="grid gap-3">
        <label>Mã biểu mẫu<input className="border p-2 block" value={formCode} onChange={event => { setFormCode(event.target.value); setDraft(null); }} /></label>
        <label>Tên biểu mẫu<input className="border p-2 block" value={title} onChange={event => { setTitle(event.target.value); setDraft(null); }} /></label>
        <label>Căn cứ đã xác minh<input className="border p-2 block" value={legalBasis} onChange={event => setLegalBasis(event.target.value)} /></label>
        <label>Chế độ ảnh<select className="border p-2 ml-2" value={mode} onChange={event => { setMode(event.target.value as typeof mode); setDraft(null); }}>
          <option value="clean-scan">Ảnh scan thẳng</option><option value="camera-photo">Ảnh chụp — kiểm tra và nắn phối cảnh</option></select></label>
      </fieldset>
        <input type="file" aria-label="Ảnh phôi" accept="image/jpeg,image/png" multiple onChange={event => {
          const next = Array.from(event.target.files ?? []);
          if (!next.length) return;
          const message = next.map((file, index) => {
            const problem = templateFileError(file);
            return problem ? `Trang ${index + 1}: ${problem}` : null;
          }).find(Boolean);
          if (message || next.length > 20 || next.reduce((total, file) => total + file.size, 0) > 32 * 1024 * 1024) {
            event.target.value = '';
            setError(`${message || 'Chỉ nhận tối đa 20 trang và tổng dung lượng 32 MB.'} Bản đối soát cũ vẫn được giữ.`);
            return;
          }
          clearAnalysis(); setFiles(next); setBlankConfirmed(false); setError('');
        }} />
        {files.length > 0 && <p role="status">Ảnh đang chọn: {files.map(file => file.name).join(', ')}. Thứ tự liệt kê là thứ tự trang; cần phân tích và đối soát lại khi đổi ảnh.</p>}
        {files.length > 1 && <ol>{files.map((file, index) => <li key={`${index}-${file.name}`} className="flex items-center gap-2">
          <span>Trang {index + 1}: {file.name}</span>
          <button className="border rounded p-1" disabled={busy || index === 0} onClick={() => {
            const reordered = [...files]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
            clearAnalysis(); setFiles(reordered); setBlankConfirmed(false);
          }}>Đưa trang {index + 1} lên</button>
          <button className="border rounded p-1" disabled={busy || index === files.length - 1} onClick={() => {
            const reordered = [...files]; [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
            clearAnalysis(); setFiles(reordered); setBlankConfirmed(false);
          }}>Đưa trang {index + 1} xuống</button>
        </li>)}</ol>}
      <fieldset disabled={busy} className="grid gap-3">
        <label><input type="checkbox" checked={blankConfirmed} onChange={event => { setBlankConfirmed(event.target.checked); setReviewConfirmed(false); }} /> Đây là phôi trống, không chứa dữ liệu công dân.</label>
        <button className="border rounded p-3" onClick={() => void analyze()}>Phân tích OpenCV và VietOCR</button>
      </fieldset>
      {busy && <p role="status">Đang xử lý… Có thể đóng để hủy.</p>}{error && <p role="alert" className="text-red-800">{error}</p>}
      {draft && <fieldset disabled={busy} className="space-y-3">
        <p role="status">Nhận diện {draft.manifest.boxes.length} trường; {draft.manifest.boxes.filter(item => item.recognition?.status === 'needs_review' || !item.rawText).length} trường cần chú ý. Mỗi trường nhiều dòng chỉ sinh một bước hướng dẫn.</p>
        {previews.length > 1 && <label>Trang phôi<select className="border p-2 ml-2" value={activePageNumber}
          onChange={event => setActivePageNumber(Number(event.target.value))}>
          {previews.map(item => <option key={item.pageNumber} value={item.pageNumber}>Trang {item.pageNumber}</option>)}
        </select></label>}
        {pageReview && <p role="status">Trang {activePageNumber}: {pageReview.summary.detectedFields} trường, {pageReview.regions.length} vùng bằng chứng.</p>}
        {draft.manifest.boxes.some(item => item.pageNumber === activePageNumber && item.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED')) &&
          <p role="alert" className="text-amber-900">Trang {activePageNumber} đang dùng tiêu đề cột kế thừa từ trang trước. Hãy kiểm tra lại từng nhãn Có/Không trước khi lưu.</p>}
        {draft.manifest.boxes.some(item => item.pageNumber === activePageNumber && item.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED')) &&
          <p role="alert" className="text-amber-900">Hàng đầu trang {activePageNumber} được suy từ chữ OCR và lưới chưa khép kín; cần sửa nhãn và tọa độ nếu ảnh khác thực tế.</p>}
        {previews.length > 1 && pageReview?.summary.detectedFields === 0 && <p role="alert" className="text-red-800">Trang {activePageNumber} chưa có ô kê khai; hãy xem ảnh và bằng chứng trước khi duyệt toàn biểu mẫu.</p>}
        {draft.manifest.boxes.length === 0 && <p role="alert" className="text-red-800">Trang này có vẻ chỉ chứa chú thích hoặc hướng dẫn, không có ô cần kê khai. Hãy đối soát ảnh; nếu có ô thật, thêm ô thủ công trước khi tạo kịch bản.</p>}
        {draft.summary && draft.summary.labeledFields * 2 < draft.summary.detectedFields &&
          <p role="alert" className="text-red-800">Phần lớn vùng chưa ghép được nhãn. Hãy dùng ảnh rõ hơn hoặc đối soát từng vùng trước khi tạo kịch bản.</p>}
        <div className="grid lg:grid-cols-2 gap-4">
          {box && page && region?.pageNumber === activePageNumber && <AdminVisualTwinEditor pages={previews} currentPageNumber={activePageNumber}
            onPageChange={setActivePageNumber} fieldLabel={box.rawText || 'Cần đặt nhãn'}
            highlightCoords={region.normalizedCoords} onCoordsChange={coords => replaceBox(editBoxRegion(box, selectedRegion, coords))} />}
          {page && (!box || region?.pageNumber !== activePageNumber) && <img src={page.imageUrl}
            alt={pageReview?.summary.detectedFields === 0 || draft.manifest.boxes.length === 0
              ? 'Ảnh phôi để đối soát trang không có ô nhận diện' : `Ảnh phôi trang ${activePageNumber} để đối soát`}
            className="block w-full h-auto border" />}
          <div className="space-y-3"><label>Ô cần đối soát<select className="block border p-2 w-full" value={selected} onChange={event => {
            const index = Number(event.target.value); setSelected(index); setSelectedRegion(0);
            setActivePageNumber(draft.manifest.boxes[index]?.pageNumber ?? 1);
          }}>
            {draft.manifest.boxes.map((item, index) => <option key={item.boxId} value={index}>{index + 1}. Trang {item.pageNumber ?? 1} — {item.rawText || 'CHƯA RÕ NHÃN'}</option>)}</select></label>
            {box && <><p>{box.recognition?.reviewReasons.join('; ') || draft.evidence.find(item => item.boxId === box.boxId)?.reason}</p>
              <label>Nhãn thực trên phôi<input className="block border p-2 w-full" value={box.rawText} onChange={event => updateBox('rawText', event.target.value)} /></label>
              <label>Loại trường<select className="border p-2 ml-2" value={box.inputKind ?? 'single_line_text'} onChange={event => replaceBox(editBoxRegions(box, regionsForBox(box), event.target.value as FormInputKind))}>
                {INPUT_KINDS.map(kind => <option key={kind} value={kind}>{({ single_line_text: 'Một dòng', multiline_text: 'Nhiều dòng', checkbox: 'Tích chọn', character_slots: 'Mỗi ký tự một ô', table_cell: 'Ô trong bảng' })[kind]}</option>)}</select></label>
              <label>Vùng của trường<select className="border p-2 ml-2" value={selectedRegion} onChange={event => {
                const index = Number(event.target.value); setSelectedRegion(index); setActivePageNumber(regionsForBox(box)[index].pageNumber);
              }}>
                {regionsForBox(box).map((item, index) => <option key={item.regionId} value={index}>Vùng {index + 1} — trang {item.pageNumber}</option>)}</select></label>
              <button className="border rounded p-2" disabled={regionsForBox(box).length >= 64} onClick={() => {
                const regions = regionsForBox(box);
                const regionId = `region_${crypto.randomUUID()}`;
                replaceBox(editBoxRegions(box, [...regions, { regionId, pageNumber: activePageNumber, normalizedCoords: [0.1, 0.1, 0.15, 0.5] }], 'multiline_text'));
                setSelectedRegion(regions.length);
              }}>Thêm dòng — cần vẽ lại</button>
              <button className="border rounded p-2" disabled={regionsForBox(box).length <= 1} onClick={() => {
                replaceBox(editBoxRegions(box, regionsForBox(box).filter((_, index) => index !== selectedRegion))); setSelectedRegion(0);
              }}>Bỏ vùng đang chọn</button>
              <button className="border rounded p-2" disabled={box.boxType !== 'text' || draft.manifest.boxes[selected + 1]?.boxType !== 'text'
                || regionsForBox(box).length + (draft.manifest.boxes[selected + 1] ? regionsForBox(draft.manifest.boxes[selected + 1]).length : 0) > 64} onClick={() => {
                const merged = mergeTextFields(box, draft.manifest.boxes[selected + 1]);
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.flatMap((item, index) => index === selected ? [merged] : index === selected + 1 ? [] : [item]) } });
                setSelectedRegion(0); setReviewConfirmed(false);
              }}>Gộp trường này với trường kế tiếp</button>
              <button className="border rounded p-2" disabled={box.boxType !== 'text' || regionsForBox(box).length < 2
                || draft.manifest.boxes.length + regionsForBox(box).length - 1 > 200} onClick={() => {
                const split = splitTextField(box, regionsForBox(box).slice(1).map(() => `manual_${crypto.randomUUID()}`));
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.flatMap((item, index) => index === selected ? split : [item]) } });
                setSelectedRegion(0); setReviewConfirmed(false);
              }}>Tách các vùng thành trường riêng — cần đặt nhãn mới</button>
              <button className="border rounded p-2" onClick={() => {
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.filter(item => item.boxId !== box.boxId) } });
                setSelected(0); setSelectedRegion(0); setReviewConfirmed(false);
              }}>Loại ô không cần kê khai</button></>}
            <button className="border rounded p-2" disabled={draft.manifest.boxes.length >= 200} onClick={() => {
              const boxId = `manual_${crypto.randomUUID()}`;
              const coords: [number, number, number, number] = [0.1, 0.1, 0.2, 0.5];
              const next: FormGeometricBox = { boxId, pageNumber: activePageNumber, rawText: '', boxType: 'text', inputKind: 'single_line_text',
                inputRegions: [{ regionId: `${boxId}_region_1`, pageNumber: activePageNumber, normalizedCoords: coords }],
                estimatedWidthRatio: 0.4, normalizedCoords: coords };
              setDraft({ ...draft, manifest: { ...draft.manifest, boxes: [...draft.manifest.boxes, next] } }); setSelected(draft.manifest.boxes.length); setSelectedRegion(0); setReviewConfirmed(false);
            }}>Thêm ô thủ công — cần vẽ lại và đặt nhãn</button>
            {[-1, 1].map(direction => <button key={direction} className="border rounded p-2" disabled={selected + direction < 0 || selected + direction >= draft.manifest.boxes.length}
              onClick={() => {
                const boxes = [...draft.manifest.boxes];
                [boxes[selected], boxes[selected + direction]] = [boxes[selected + direction], boxes[selected]];
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes } }); setSelected(selected + direction); setReviewConfirmed(false);
              }}>{direction < 0 ? 'Đưa ô lên trước' : 'Đưa ô xuống sau'}</button>)}
          </div>
        </div>
        <details><summary>Vùng bị loại và bằng chứng nhận diện</summary><ul>{draft.regions?.map(item => <li key={item.candidateId}>{item.candidateId}: {item.role} — {item.reason}</li>)}</ul></details>
        <button className="border rounded p-2" onClick={() => {
          const source = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = source; link.download = `${canonicalFormCode(formCode)}-recognition.json`;
          link.click(); setTimeout(() => URL.revokeObjectURL(source), 0);
        }}>Tải JSON nhận diện để đối soát</button>
        <details><summary>Text OCR và cảnh báo nguồn — trang {activePageNumber}</summary><pre className="whitespace-pre-wrap text-sm">{ocrPages[activePageNumber - 1]?.rawText}</pre><p>{ocrPages[activePageNumber - 1]?.warnings.join('; ')}</p></details>
        <label><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} /> Đã đối chiếu từng nhãn, loại ô, vùng cần viết và thứ tự bước.</label>
        <button className="bg-emerald-800 text-white rounded p-3" disabled={!reviewConfirmed || !adminKey.trim() || draft.manifest.boxes.length === 0} onClick={() => void generate()}>Lưu phôi và sinh kịch bản chờ duyệt</button>
      </fieldset>}
    </section>
  </div>;
}
