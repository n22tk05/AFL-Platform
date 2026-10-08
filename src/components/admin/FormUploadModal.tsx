'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession, AdminKeyInput } from '@/modules/forms/admin-session.client';
import { assembleFormManifest, confirmManifest, type ManifestReviewDraft } from '@/modules/forms/services/form-manifest-assembler';
import { canonicalFormCode } from '@/modules/forms/client';
import { AdminApiError } from '@/modules/forms/services/form-api.client';
import { templateFileError, formErrorMessage } from '@/modules/forms/services/form-feedback.client';
import { AdminVisualTwinEditor } from '@/components/admin/AdminVisualTwinEditor';
import type { FormPageMetadata } from '@/shared/contracts';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { APP_ROUTES } from '@/shared/routes';

interface FormUploadModalProps { isOpen: boolean; onClose: () => void }
export function FormUploadModal({ isOpen, onClose }: FormUploadModalProps) {
  const router = useRouter();
  const { adminKey } = useAdminSession();
  const [file, setFile] = useState<File | null>(null);
  const [formCode, setFormCode] = useState('');
  const [title, setTitle] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [mode, setMode] = useState<'clean-scan' | 'camera-photo'>('clean-scan');
  const [blankConfirmed, setBlankConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ManifestReviewDraft | null>(null);
  const [ocr, setOcr] = useState<DocumentJsonExport | null>(null);
  const [preview, setPreview] = useState('');
  const [selected, setSelected] = useState(0);
  const processed = useRef<Blob | null>(null);
  const previewRef = useRef('');
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { generation.current++; request.current?.abort(); }, []);
  const clearAnalysis = useCallback(() => {
    cancel(); setBusy(false); setDraft(null); setReviewConfirmed(false); setOcr(null); setSelected(0);
    processed.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ''; setPreview('');
  }, [cancel]);
  useEffect(() => {
    if (!isOpen) {
      clearAnalysis(); setBlankConfirmed(false); setFile(null); setError('');
    }
    return cancel;
  }, [isOpen, cancel, clearAnalysis]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  useEffect(() => { generation.current++; request.current?.abort(); setBusy(false); }, [adminKey]);
  if (!isOpen) return null;
  const updateBox = (field: string, value: unknown) => {
    if (!draft) return;
    setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.map((box, index) =>
      index === selected ? { ...box, [field]: value, ...(field === 'normalizedCoords' ? { estimatedWidthRatio: (value as number[])[3] - (value as number[])[1] } : {}) } : box) } }); setReviewConfirmed(false);
  };
  const analyze = async () => {
    if (!file || !formCode.trim() || !title.trim() || !blankConfirmed) { setError('Chọn phôi trống và nhập mã/tên biểu mẫu.'); return; }
    clearAnalysis();
    const current = ++generation.current;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setDraft(null); setReviewConfirmed(false);
    const assertCurrent = () => { if (generation.current !== current || controller.signal.aborted) throw new Error('OPERATION_ABORTED'); };
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('Ảnh không hợp lệ.')); element.src = sourceUrl;
      });
      assertCurrent();
      if (image.naturalWidth * image.naturalHeight > 12_000_000) throw new Error('Ảnh vượt 12 triệu pixel.');
      const canvas = () => document.createElement('canvas');
      const inputCanvas = canvas();
      const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
      inputCanvas.width = Math.round(image.naturalWidth * scale); inputCanvas.height = Math.round(image.naturalHeight * scale);
      inputCanvas.getContext('2d')!.drawImage(image, 0, 0, inputCanvas.width, inputCanvas.height);
      const deskewedCanvas = canvas();
      const { runLineDetectionDebug } = await import('@/modules/opencv');
      const geometry = await runLineDetectionDebug({ mode, inputCanvas, deskewedCanvas,
        grayscaleCanvas: canvas(), binaryCanvas: canvas(), horizontalCanvas: canvas(), verticalCanvas: canvas(),
        combinedCanvas: canvas(), candidateOverlayCanvas: canvas(), documentOutlineCanvas: canvas() });
      assertCurrent();
      const blob = await new Promise<Blob>((resolve, reject) => deskewedCanvas.toBlob(result => result ? resolve(result) : reject(new Error('Không xuất được ảnh chuẩn.')), 'image/png'));
      if (blob.size > 8 * 1024 * 1024) throw new Error('Ảnh chuẩn vượt 8 MB; chọn ảnh nhỏ hơn.');
      const payload = new FormData(); payload.set('file', blob, 'processed.png'); payload.set('deskewApplied', String(mode === 'camera-photo'));
      const response = await fetch('/api/documents/json', { method: 'POST', body: payload, signal: controller.signal });
      const envelope = await response.json(); assertCurrent();
      if (!response.ok || envelope.success !== true) throw new Error(envelope.error?.message_vi || 'VietOCR chưa khả dụng.');
      const ocrDocument = envelope.data as DocumentJsonExport;
      const next = assembleFormManifest({ formId: `form_${Date.now()}`, formCode: canonicalFormCode(formCode), formTitle: title.trim(),
        width: geometry.width, height: geometry.height, candidates: geometry.candidates, document: ocrDocument });
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(blob);
      processed.current = blob; setPreview(previewRef.current); setDraft(next); setOcr(ocrDocument); setSelected(0);
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) setError(formErrorMessage(reason, 'Không phân tích được phôi. Vui lòng kiểm tra ảnh và thử lại.'));
    } finally {
      URL.revokeObjectURL(sourceUrl);
      if (generation.current === current) setBusy(false);
    }
  };
  const generate = async () => {
    if (!draft || !processed.current || !adminKey.trim() || !blankConfirmed) { setError('Cần manifest, khóa quản trị và xác nhận phôi trống.'); return; }
    const current = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const manifest = confirmManifest(draft.manifest, reviewConfirmed);
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(processed.current!);
      });
      if (generation.current !== current || controller.signal.aborted) return;
      const assetResponse = await fetch('/api/admin/forms/assets', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ formCode: manifest.formCode, imageBase64, blankTemplateConfirmed: true }) });
      const asset = await assetResponse.json();
      if (generation.current !== current || controller.signal.aborted) return;
      if (!assetResponse.ok || asset.success !== true) throw new AdminApiError(assetResponse.status, asset.error?.code || 'ASSET_UNAVAILABLE', 'Không lưu được ảnh phôi.');
      const page = asset.data as FormPageMetadata;
      if (page.width !== manifest.imageDimensions.width || page.height !== manifest.imageDimensions.height) throw new Error('FRAME_MISMATCH');
      const response = await fetch('/api/llm/prompt', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ manifest: { ...manifest, pages: [page], circularInfo: legalBasis } }) });
      const result = await response.json();
      if (generation.current !== current || controller.signal.aborted) return;
      if (!response.ok || result.success !== true || result.meta?.persisted !== true) throw new AdminApiError(response.status, result.error?.code || 'PROMPT_UNAVAILABLE', 'Chưa lưu được kịch bản trên máy chủ.');
      onClose(); router.push(APP_ROUTES.review(manifest.formCode));
    } catch (reason) {
      if (generation.current === current && !controller.signal.aborted) setError(formErrorMessage(reason, 'Chưa lưu được phôi hoặc kịch bản trên máy chủ. Vui lòng kiểm tra và thử lại.'));
    } finally { if (generation.current === current) setBusy(false); }
  };
  const box = draft?.manifest.boxes[selected];
  const page = draft ? { pageNumber: 1, imageUrl: preview, width: draft.manifest.imageDimensions.width, height: draft.manifest.imageDimensions.height } : null;
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
        <input type="file" aria-label="Ảnh phôi" accept="image/jpeg,image/png" onChange={event => {
          const next = event.target.files?.[0] ?? null;
          clearAnalysis(); setFile(null); setBlankConfirmed(false); setError('');
          const message = templateFileError(next);
          if (message) { event.target.value = ''; setError(`${message} Kết quả đối soát của ảnh trước đã được xóa.`); return; }
          setFile(next);
        }} />
        {file && <p role="status">Ảnh đang chọn: {file.name}. Cần phân tích và đối soát lại khi đổi ảnh.</p>}
      <fieldset disabled={busy} className="grid gap-3">
        <label><input type="checkbox" checked={blankConfirmed} onChange={event => { setBlankConfirmed(event.target.checked); setReviewConfirmed(false); }} /> Đây là phôi trống, không chứa dữ liệu công dân.</label>
        <button className="border rounded p-3" onClick={() => void analyze()}>Phân tích OpenCV và VietOCR</button>
      </fieldset>
      {busy && <p role="status">Đang xử lý… Có thể đóng để hủy.</p>}{error && <p role="alert" className="text-red-800">{error}</p>}
      {draft && <fieldset disabled={busy} className="space-y-3">
        <div className="grid lg:grid-cols-2 gap-4">
          {box && page && <AdminVisualTwinEditor pages={[page]} currentPageNumber={1} onPageChange={() => {}} fieldLabel={box.rawText || 'Cần đặt nhãn'}
            highlightCoords={box.normalizedCoords} onCoordsChange={coords => updateBox('normalizedCoords', coords)} />}
          <div className="space-y-3"><label>Ô cần đối soát<select className="block border p-2 w-full" value={selected} onChange={event => setSelected(Number(event.target.value))}>
            {draft.manifest.boxes.map((item, index) => <option key={item.boxId} value={index}>{index + 1}. {item.rawText || 'CHƯA RÕ NHÃN'}</option>)}</select></label>
            {box && <><p>{draft.evidence.find(item => item.boxId === box.boxId)?.reason}</p>
              <label>Nhãn thực trên phôi<input className="block border p-2 w-full" value={box.rawText} onChange={event => updateBox('rawText', event.target.value)} /></label>
              <label>Loại ô<select className="border p-2 ml-2" value={box.boxType} onChange={event => updateBox('boxType', event.target.value)}>
                <option value="text">Nhập chữ</option><option value="checkbox">Tích chọn</option><option value="table_cell">Ô trong bảng</option></select></label>
              <button className="border rounded p-2" onClick={() => {
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes: draft.manifest.boxes.filter(item => item.boxId !== box.boxId) } });
                setSelected(0); setReviewConfirmed(false);
              }}>Loại ô không cần kê khai</button></>}
            <button className="border rounded p-2" disabled={draft.manifest.boxes.length >= 200} onClick={() => {
              const next = { boxId: `manual_${crypto.randomUUID()}`, rawText: '', boxType: 'text' as const, estimatedWidthRatio: 0.4, normalizedCoords: [0.1, 0.1, 0.2, 0.5] as [number, number, number, number] };
              setDraft({ ...draft, manifest: { ...draft.manifest, boxes: [...draft.manifest.boxes, next] } }); setSelected(draft.manifest.boxes.length); setReviewConfirmed(false);
            }}>Thêm ô thủ công — cần vẽ lại và đặt nhãn</button>
            {[-1, 1].map(direction => <button key={direction} className="border rounded p-2" disabled={selected + direction < 0 || selected + direction >= draft.manifest.boxes.length}
              onClick={() => {
                const boxes = [...draft.manifest.boxes];
                [boxes[selected], boxes[selected + direction]] = [boxes[selected + direction], boxes[selected]];
                setDraft({ ...draft, manifest: { ...draft.manifest, boxes } }); setSelected(selected + direction); setReviewConfirmed(false);
              }}>{direction < 0 ? 'Đưa ô lên trước' : 'Đưa ô xuống sau'}</button>)}
          </div>
        </div>
        <details><summary>Text OCR và cảnh báo nguồn</summary><pre className="whitespace-pre-wrap text-sm">{ocr?.rawText}</pre><p>{ocr?.warnings.join('; ')}</p></details>
        <label><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} /> Đã đối chiếu từng nhãn, loại ô, vùng cần viết và thứ tự bước.</label>
        <button className="bg-emerald-800 text-white rounded p-3" disabled={!reviewConfirmed || !adminKey.trim()} onClick={() => void generate()}>Lưu phôi và sinh kịch bản chờ duyệt</button>
      </fieldset>}
    </section>
  </div>;
}
