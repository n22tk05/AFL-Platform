'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Scan, ShieldCheck, Sparkles } from 'lucide-react';
import type { DocumentExtractionResult, NormalizedBoundingBox, OcrReview } from '@/shared/document-extraction.types';
import { prepareDocumentImage, FullImageConsentRequired, type PreparationMode, type PreparedDocumentImage } from '@/modules/documents/prepare-image';
import { IMAGE_WARNING_MESSAGES } from '@/modules/documents/image-quality';
import { OcrAttemptReview } from '@/components/documents/OcrAttemptReview';
import { documentSession, reviewedFields, type FieldConfirmations } from '@/modules/documents/session';
import { DOCUMENT_LIMITS } from '@/modules/documents/config';
import { JsonReview } from '@/components/documents/JsonReview';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { parseJsonExport } from '@/modules/documents/json-validator';
import { normalizeField, valueErrors } from '@/modules/documents/validation';

const button = 'min-h-14 px-4 py-3 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-lg font-bold';
const panel = 'bg-slate-950 border border-slate-700 rounded-2xl p-5 space-y-4';
const labels = { accepted: 'Đạt kiểm tra tự động', needs_review: 'Cần kiểm tra', unreadable: 'Chưa đọc được' };
const warnings: Record<string, string> = {
  ...IMAGE_WARNING_MESSAGES,
  'OCR provider unavailable': 'Dịch vụ đọc chữ chưa sẵn sàng. Không có dữ liệu tự động để sử dụng.',
  OCR_NOT_CONFIGURED: 'Dịch vụ OCR chưa được cấu hình hoặc chưa có quyền truy cập. Hãy liên hệ người quản trị.',
  OCR_TIMEOUT: 'Dịch vụ đọc chữ quá thời gian chờ. Hãy thử lại.',
  STRUCTURED_UNAVAILABLE: 'Chưa thể trích xuất các trường. Bác có thể đối chiếu toàn văn bên dưới.',
  UNSUPPORTED_OR_MISMATCHED_DOCUMENT_TYPE: 'Loại giấy tờ chưa được hỗ trợ hoặc không khớp loại đã chọn.',
  OCR_NUMERIC_DISAGREEMENT: 'Các lần đọc khác nhau về số liệu; cần xác nhận thủ công.',
  OCR_EMPTY_OR_UNSUPPORTED_PAGES: 'Chưa đọc được vùng này. Hãy đối chiếu ảnh nguồn.',
};
export default function ScanDocumentPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processed, setProcessed] = useState<string | null>(null);
  const [enhancedPreviews, setEnhancedPreviews] = useState<{ variant: string; url: string }[]>([]);
  const [shownVariant, setShownVariant] = useState('primary');
  const [imageWarnings, setImageWarnings] = useState<string[]>([]);
  const [needsFullImage, setNeedsFullImage] = useState<'extract' | 'json' | null>(null);
  const [mode, setMode] = useState<PreparationMode>('upload-photo');
  const [hint, setHint] = useState('auto');
  const [cloudTextConsent, setCloudTextConsent] = useState(false);
  const [result, setResult] = useState<DocumentExtractionResult | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<FieldConfirmations>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [jsonBox, setJsonBox] = useState<NormalizedBoundingBox | null>(null);
  const [jsonDraft, setJsonDraft] = useState<DocumentJsonExport | null>(null);
  const [failedReview, setFailedReview] = useState<OcrReview | null>(null);
  const [guideHref, setGuideHref] = useState('/scan');
  const generation = useRef(0), controller = useRef<AbortController>();
  const expiry = useRef<ReturnType<typeof setTimeout>>(), input = useRef<HTMLInputElement>(null);
  const cancelPending = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (processed) URL.revokeObjectURL(processed); }, [processed]);
  useEffect(() => () => { enhancedPreviews.forEach(image => URL.revokeObjectURL(image.url)); }, [enhancedPreviews]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const formCode = params.get('formCode'), templateId = params.get('templateId');
    const back = new URLSearchParams();
    if (formCode && /^[A-Za-z0-9_-]{1,80}$/.test(formCode)) back.set('formCode', formCode);
    if (templateId && /^[A-Za-z0-9_-]{1,120}$/.test(templateId)) back.set('templateId', templateId);
    setGuideHref(back.size ? `/guide?${back.toString()}` : '/scan');
    try { sessionStorage.removeItem('afl_prerequisite_document_data'); } catch { /* Storage can be disabled. */ }
    const clearSaved = documentSession.subscribe(() => { if (!documentSession.read()) setSaved(false); });
    return () => { cancelPending(); clearTimeout(expiry.current); clearSaved(); };
  }, [cancelPending]);
  function invalidate() {
    cancelPending(); setJsonDraft(null); setJsonBox(null); setFailedReview(null); setResult(null); setDrafts({}); setConfirmed({});
    setSelected(null); setSelectedRegion(null); setProcessed(null); setEnhancedPreviews([]); setShownVariant('primary');
    setImageWarnings([]); setNeedsFullImage(null); setSaved(false); setBusy(false); setMessage(''); documentSession.clear();
  }
  function clearAll() {
    invalidate(); clearTimeout(expiry.current); setFile(null); setPreview(null); setCloudTextConsent(false);
    if (input.current) input.current.value = '';
  }
  function choose(next: File | null) {
    clearAll(); if (!next) return;
    setFile(next); setPreview(URL.createObjectURL(next));
    expiry.current = setTimeout(() => { clearAll(); setMessage('Phiên đã hết hạn. Ảnh và kết quả đã được xóa.'); }, DOCUMENT_LIMITS.sessionTtlMs);
  }
  function preparedForm(prepared: PreparedDocumentImage) {
    setProcessed(URL.createObjectURL(prepared.blob));
    setEnhancedPreviews(prepared.enhancements.map(image => ({ variant: image.variant, url: URL.createObjectURL(image.blob) })));
    setImageWarnings(prepared.quality.warnings);
    const form = new FormData(); form.set('file', prepared.blob, `processed-document.${prepared.blob.type === 'image/png' ? 'png' : 'jpg'}`);
    form.set('deskewApplied', String(prepared.deskewApplied)); form.set('documentHint', hint);
    form.set('documentDetectionFailed', String(prepared.documentDetectionFailed));
    form.set('imageWarnings', JSON.stringify(prepared.quality.warnings));
    for (const image of prepared.enhancements) form.set(image.variant, image.blob, `${image.variant}.${image.blob.type === 'image/png' ? 'png' : 'jpg'}`);
    return form;
  }
  async function run(action: 'extract' | 'json', allowFullImage = false) {
    if (!file || (action === 'extract' && !cloudTextConsent)) return;
    invalidate(); const requestId = generation.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage('Đang tối ưu hình ảnh…');
    try {
      const prepared = await prepareDocumentImage(file, mode, { allowFullImage, signal: abort.signal });
      if (requestId !== generation.current) return;
      const form = preparedForm(prepared); setMessage('Đang đọc nội dung…');
      const response = await fetch(`/api/documents/${action}`, { method: 'POST', body: form, signal: abort.signal, cache: 'no-store' });
      if (requestId !== generation.current) return;
      setMessage('Đang kiểm tra kết quả…');
      const payload = await response.json();
      if (requestId !== generation.current) return;
      setMessage('Đang kiểm tra kết quả…');
      if (!response.ok || !payload.success) {
        if (action === 'json' && payload.data) setJsonDraft(parseJsonExport(payload.data));
        if (payload.error?.ocrReview?.attempts && payload.error?.ocrReview?.regions) setFailedReview(payload.error.ocrReview);
        throw new Error(payload.error?.message_vi || 'Không đọc được phản hồi. Hãy thử lại.');
      }
      if (action === 'json') {
        if (!payload.data || !parseJsonExport(payload.data)) throw new Error('Phản hồi JSON không hợp lệ.');
        setJsonDraft(parseJsonExport(payload.data));
        setMessage(payload.data.rawText?.trim() && payload.data.status !== 'failed' ? 'Bản nháp đã sẵn sàng. Hãy đối chiếu với ảnh, sửa nếu cần và xác nhận trước khi tải.' : 'Chưa đọc được vùng này. Bác vẫn có thể xem ảnh nguồn và kết quả từng lần đọc.');
      } else {
        if (payload.data?.contractVersion !== 2) throw new Error('Phản hồi trích xuất không hợp lệ.');
        const data: DocumentExtractionResult = payload.data; setResult(data);
        setDrafts(Object.fromEntries(Object.entries(data.fields).map(([key, field]) => [key, field.value === null ? '' : String(field.value)])));
        setMessage(data.status === 'manual_review_required' ? 'Cần kiểm tra thủ công. Chưa có dữ liệu được lưu.' : 'Bác hãy đối chiếu từng trường trước khi xác nhận.');
      }
    } catch (error) {
      if (requestId === generation.current) {
        if (error instanceof FullImageConsentRequired) setNeedsFullImage(action);
        setMessage(error instanceof Error ? error.message : 'Không xử lý được ảnh.');
      }
    } finally { if (requestId === generation.current) setBusy(false); }
  }
  function confirmField(key: string) {
    const raw = drafts[key] ?? '', value = raw.trim() ? normalizeField(key, raw) : null;
    if (raw.trim() && (value === null || (key !== 'vehiclePlate' && valueErrors(key, value).length))) {
      setMessage('Giá trị chưa hợp lệ. Ngày dùng DD/MM/YYYY hoặc YYYY-MM-DD; CCCD gồm 12 số; tiền không âm.'); return;
    }
    documentSession.clear(); setSaved(false); setConfirmed(prev => ({ ...prev, [key]: value }));
    setMessage(value === null ? 'Trường để trống sẽ không dùng để điền biểu mẫu.' : 'Đã ghi nhận xác nhận của bác.');
  }
  let canSave = false;
  try { canSave = !!result && Object.keys(reviewedFields(result, confirmed)).length > 0; } catch { /* Outstanding review blocks saving. */ }
  const review = result?.ocrReview ?? failedReview ?? undefined;
  const boxes: NormalizedBoundingBox[] = jsonDraft ? (jsonBox ? [jsonBox] : []) : selectedRegion !== null && review?.regions[selectedRegion]
    ? (review.regions[selectedRegion].boundingBox ? [review.regions[selectedRegion].boundingBox!] : [])
    : (selected && result && selected in result.fields) ? (result.fields[selected].sourceBoundingBoxes || []) : [];
  const reviewBoxes = review?.regions.flatMap(region => region.boundingBox ? [region.boundingBox] : []) ?? [];
  const displayImage = shownVariant === 'primary' ? processed : enhancedPreviews.find(image => image.variant === shownVariant)?.url ?? processed;
  return <div className="min-h-screen bg-slate-900 text-slate-100 font-sans text-lg">
    <header className="border-b border-slate-700 bg-slate-950 px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
      <div><h1 className="text-2xl font-bold flex items-center gap-3"><Scan aria-hidden="true" />Quét và kiểm tra chứng từ</h1><p>Đọc chữ, đối chiếu bằng chứng và xác nhận trước khi điền biểu mẫu.</p></div>
      <div className="flex items-center gap-3"><Link href="/document-test" className={button}><Sparkles className="w-4 h-4 inline" /> Bàn làm việc Kiểm thử</Link><button className={button} onClick={clearAll}>Xóa phiên</button></div>
    </header>
    <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 space-y-5" aria-label="Ảnh chứng từ">
        <div className={panel}>
          <label className="block font-bold" htmlFor="document-file">1. Chọn ảnh JPEG/PNG, tối đa 8 MB</label>
          <input id="document-file" ref={input} className="w-full min-h-14" type="file" accept="image/jpeg,image/png" onChange={e => choose(e.target.files?.[0] ?? null)} />
          <label className="block">Nguồn ảnh<select className="block w-full bg-slate-800 p-3 min-h-14 rounded-lg" value={mode} onChange={e => { invalidate(); setMode(e.target.value as PreparationMode); }}>
            <option value="upload-photo">Ảnh tải lên: tự tìm giấy hoặc thử đọc toàn ảnh</option><option value="camera-photo">Ảnh chụp: cần đủ bốn góc giấy</option><option value="clean-scan">Bản scan đã thẳng, chỉ có trang giấy</option>
          </select></label>
          <label className="block">Loại chứng từ<select className="block w-full bg-slate-800 p-3 min-h-14 rounded-lg" value={hint} onChange={e => { invalidate(); setHint(e.target.value); }}>
            <option value="auto">Tự nhận diện</option><option value="traffic_violation_record">Biên bản vi phạm giao thông</option><option value="unknown">Loại khác (chưa hỗ trợ)</option>
          </select></label>
          <label className="flex items-start gap-3"><input type="checkbox" checked={cloudTextConsent} onChange={e => setCloudTextConsent(e.target.checked)} className="mt-1 h-5 w-5" />Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.</label>
          <p className="text-sm">VietOCR đọc ảnh cục bộ. Trích xuất trường dùng Gemini text trên cloud; chuyển JSON chỉ dùng VietOCR.</p>
          <button className={`${button} w-full bg-emerald-800`} disabled={!file || busy || !cloudTextConsent} onClick={() => run('extract')}>{busy ? 'Đang xử lý…' : 'Đọc chứng từ'}</button>
          <button className={`${button} w-full bg-sky-800`} disabled={!file || busy} onClick={() => run('json')}>Chuyển ảnh sang JSON</button>
          {needsFullImage && <button className={`${button} w-full bg-amber-900`} disabled={busy} onClick={() => run(needsFullImage, true)}>Thử đọc toàn ảnh</button>}
          <p className="flex gap-2"><ShieldCheck aria-hidden="true" />Ảnh và dữ liệu chỉ giữ tạm trong phiên, tối đa 15 phút.</p>
        </div>
        <div className={panel}>
          <h2 className="font-bold">{processed ? 'Ảnh đã xử lý gửi để đọc chữ' : 'Ảnh vừa chọn'}</h2>
          {processed && <div className="flex flex-wrap gap-2" aria-label="Bản ảnh xử lý">
            <button className={button} aria-pressed={shownVariant === 'primary'} onClick={() => setShownVariant('primary')}>Ảnh màu primary</button>
            {enhancedPreviews.map(image => <button key={image.variant} className={button} aria-pressed={shownVariant === image.variant} onClick={() => setShownVariant(image.variant)}>{image.variant === 'contrast' ? 'Bản tăng tương phản' : 'Bản cân bằng ánh sáng'}</button>)}
          </div>}
          {(processed || preview) ? <div className="relative w-full" data-testid="evidence-image">
            {/* Native image preserves the primary coordinate frame. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayImage || preview!} alt={processed ? 'Chứng từ đã xử lý' : 'Ảnh gốc'} className="block w-full h-auto" />
            {processed && reviewBoxes.map(([top, left, bottom, right], i) => <div key={`review-${i}`} data-testid="ocr-review-box" className="absolute border-2 border-orange-400 pointer-events-none" style={{ top:`${top*100}%`, left:`${left*100}%`, width:`${(right-left)*100}%`, height:`${(bottom-top)*100}%` }} />)}
            {processed && boxes.map(([top, left, bottom, right], i) => <div key={i} data-testid="evidence-box" className="absolute border-4 border-yellow-400 bg-yellow-300/20 pointer-events-none" style={{ top:`${top*100}%`, left:`${left*100}%`, width:`${(right-left)*100}%`, height:`${(bottom-top)*100}%` }} />)}
          </div> : <p>Chọn ảnh để bắt đầu.</p>}
          <p>Chọn tên trường hoặc vùng cần kiểm tra bên phải để xem ảnh nguồn.</p>
        </div>
      </section>
      <section className="lg:col-span-7 space-y-5" aria-label="Kiểm tra kết quả">
        <p role="status" aria-live="polite" className={panel}>{message || 'Chưa có kết quả.'}</p>
        {!busy && imageWarnings.length > 0 && <div className={panel} aria-label="Lưu ý chất lượng ảnh">{imageWarnings.map(code => <p key={code}>{IMAGE_WARNING_MESSAGES[code] || code}</p>)}</div>}
        <OcrAttemptReview review={review} onRegion={index => { setSelectedRegion(index); setSelected(null); setShownVariant('primary'); }} />
        {jsonDraft && <JsonReview key={generation.current} draft={jsonDraft} filename={file?.name || 'document'} disabled={busy} onSelect={box => { setJsonBox(box ? [box[1], box[0], box[3], box[2]] : null); setShownVariant("primary"); }} />}
        {result && <>
          {result.warnings.length > 0 && <div className={panel}><h2 className="font-bold">Lưu ý</h2>{result.warnings.map((w,i) => <p key={i}>{warnings[w] || `Cần đối chiếu chất lượng nguồn (${w}).`}</p>)}</div>}
          <div className={panel}><h2 className="text-2xl font-bold">2. Đối chiếu từng trường</h2><p>Độ tin cậy là điểm của hệ thống, chưa phải tỷ lệ chính xác đã đo. Để trống rồi xác nhận nếu không đọc được.</p>
            {Object.values(result.fields).map(field => <article key={field.key} className="bg-slate-900 border border-slate-600 rounded-xl p-4 space-y-3">
              <button className={`${button} w-full text-left`} onClick={() => { setSelected(field.key); setSelectedRegion(null); }}>{field.label} — xem bằng chứng</button>
              <p>{Object.hasOwn(confirmed,field.key) ? 'Đã xác nhận thủ công' : labels[field.status]} · Độ tin cậy {Math.round(field.confidence*100)}%</p>
              <label className="block" htmlFor={`field-${field.key}`}>Giá trị sử dụng</label>
              <input id={`field-${field.key}`} className="w-full rounded-lg p-3 min-h-14 bg-slate-950 border border-slate-500 text-2xl" value={drafts[field.key] ?? ''} onChange={e => {
                setDrafts(prev => ({ ...prev, [field.key]: e.target.value })); setConfirmed(prev => { const next = { ...prev }; delete next[field.key]; return next; });
                setResult(prev => prev ? { ...prev, fields: { ...prev.fields, [field.key]: { ...prev.fields[field.key], status: 'needs_review' } } } : prev);
                documentSession.clear(); setSaved(false);
              }} />
              <p className="break-words">Chữ gốc: {field.rawText || 'Không đọc được'}</p><p className="break-words">Bằng chứng: {field.evidenceText || 'Không có bằng chứng hợp lệ'}</p>
              {field.validationErrors.map((error,i) => <p className="text-amber-200" key={i}>{error}</p>)}
              <button className={button} onClick={() => confirmField(field.key)}>Xác nhận trường này{!drafts[field.key]?.trim() ? ' để trống' : ''}</button>
            </article>)}
          </div>
          <details className={panel}><summary className="min-h-14 cursor-pointer font-bold">Xem toàn văn OCR</summary><pre className="whitespace-pre-wrap font-sans break-words">{result.fullText || 'Chưa có văn bản OCR.'}</pre></details>
          <div className={panel}><button className={`${button} w-full bg-emerald-800`} disabled={!canSave || busy} onClick={() => {
            try { documentSession.save(result,confirmed); setSaved(true); setMessage('Đã lưu các trường đủ điều kiện trong bộ nhớ phiên.'); }
            catch (e) { setMessage(e instanceof Error ? e.message : 'Chưa thể lưu.'); }
          }}>3. Xác nhận và lưu các trường đã duyệt</button>
            {!canSave && <p>Hãy xác nhận hoặc để trống các trường cần kiểm tra trước khi tiếp tục.</p>}
            {saved && <Link className={`${button} block text-center`} href={guideHref}>Tiếp tục điền biểu mẫu</Link>}
          </div>
        </>}
      </section>
    </main>
  </div>;
}
