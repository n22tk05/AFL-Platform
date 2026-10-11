'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronLeft, ChevronRight, FileText, Focus, Layers3, Loader2, Search, ScanLine, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { DETAIL_KINDS, type DetailKind, type DetailedDocument, type DetailedElement } from '@/shared/detailed-document.types';
import { detailedTranscript, safeDetailedFilename, serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '@/modules/documents/detailed-export';
import { DOCUMENT_LIMITS } from '@/modules/documents/config';
import { loadOpenCv } from '@/modules/opencv/loader';
import { detectDocument } from '@/modules/opencv/document-detector';
import { quadPoints } from '@/modules/opencv/corner-ordering';
import type { CvMat, CvRuntime } from '@/modules/opencv/types';

const labels: Record<DetailKind, string> = { page: 'Trang', region: 'Vùng', table: 'Bảng', cell: 'Ô biểu mẫu', line: 'Dòng', word: 'Từ', word_group: 'Cụm từ', checkbox: 'Checkbox', guide_line: 'Đường kẻ', unknown_region: 'Chưa xác định' };
const tones: Record<DetailKind, string> = { page: '#64748b', region: '#4f46e5', table: '#0284c7', cell: '#0891b2', line: '#23875b', word: '#d68b16', word_group:'#b87a3c', checkbox: '#a855f7', guide_line: '#64748b', unknown_region: '#df5d3b' };
const pill = 'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-40';
const number = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const states = { recognized: 'Đã đọc', blank: 'Ô trống', unreadable: 'Chưa đọc được', not_applicable: 'Cấu trúc ảnh' };

function download(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DetailedWorkbench({ file, compact = false }: { file?: File | null; compact?: boolean }) {
  const [ownFile, setOwnFile] = useState<File | null>(null);
  const chosenFile = file === undefined ? ownFile : file;
  const [source, setSource] = useState(''), [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [document, setDocument] = useState<DetailedDocument | null>(null);
  const [busy, setBusy] = useState(false), [phase, setPhase] = useState(''), [error, setError] = useState('');
  const [precise, setPrecise] = useState(true), [camera, setCamera] = useState(false), [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<DetailKind>('line'), [query, setQuery] = useState(''), [onlyReview, setOnlyReview] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [zoom, setZoom] = useState(1), [page, setPage] = useState(0);
  const [confirmed, setConfirmed] = useState(false), [tab, setTab] = useState<'records' | 'transcript'>('records');
  const controller = useRef<AbortController>(), generation = useRef(0), input = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);

  useEffect(() => {
    const id = ++generation.current;
    controller.current?.abort(); setBusy(false); setDocument(null); setConfirmed(false); setSelectedId(null);
    setError(''); setSource(''); setDimensions({ width: 0, height: 0 }); setPage(0); setZoom(1);
    if (!chosenFile) return;
    if (!['image/png','image/jpeg'].includes(chosenFile.type) || !chosenFile.size || chosenFile.size > DOCUMENT_LIMITS.fileBytes) {
      setError('Chọn JPEG hoặc PNG hợp lệ, tối đa 8 MB.'); return;
    }
    const url = URL.createObjectURL(chosenFile);
    const image = new Image();
    image.onload = () => {
      if (id !== generation.current) return;
      if (image.naturalWidth*image.naturalHeight > DOCUMENT_LIMITS.imagePixels || Math.max(image.naturalWidth,image.naturalHeight) > DOCUMENT_LIMITS.imageMaxDimension) {
        setError('Ảnh vượt giới hạn 12 triệu pixel hoặc cạnh dài 8192 px.'); return;
      }
      setSource(url); setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => { if (id === generation.current) setError('Không giải mã được ảnh đã chọn.'); };
    image.src = url;
    const expiry = setTimeout(() => {
      invalidate(); setSource(''); setDocument(null); setBusy(false);
      setError('Phiên đã hết hạn; hãy chọn lại ảnh.'); setDimensions({ width: 0, height: 0 }); URL.revokeObjectURL(url);
    }, DOCUMENT_LIMITS.sessionTtlMs);
    return () => { invalidate(); clearTimeout(expiry); URL.revokeObjectURL(url); image.onload = null; image.onerror = null; };
  }, [chosenFile, invalidate]);

  const run = useCallback(async () => {
    if (!chosenFile || !source || busy) return;
    const id = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setDocument(null); setConfirmed(false); setSelectedId(null); setPage(0);
    try {
      const form = new FormData(); form.set('file', chosenFile); form.set('recognizeWords', String(precise));
      if (camera) {
        setPhase('Đang tìm bốn góc tờ giấy…');
        const cv = await loadOpenCv() as unknown as CvRuntime & { imread(canvas: HTMLCanvasElement): CvMat };
        if (id !== generation.current) return;
        const image = imageRef.current;
        if (!image?.complete || !image.naturalWidth) throw new Error('Ảnh nguồn chưa sẵn sàng.');
        const canvas = window.document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Không tạo được canvas.');
        context.drawImage(image, 0, 0); let mat: CvMat | undefined;
        try {
          mat = cv.imread(canvas);
          const detected = detectDocument(cv, mat);
          form.set('quad', JSON.stringify(quadPoints(detected.sourceQuad).map(p => [p.x, p.y])));
        } finally { mat?.delete(); canvas.width = 0; canvas.height = 0; }
      }
      setPhase(precise ? 'Đang đọc dòng và kiểm tra từng từ…' : 'Đang đọc dòng và tách tọa độ từ…');
      const response = await fetch('/api/documents/detailed', { method: 'POST', body: form, cache: 'no-store',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(160_000)]) });
      const payload = await response.json();
      if (id !== generation.current) return;
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Không đọc được tài liệu.');
      validateDetailedDocument(payload.data);
      if (payload.data.source.width !== dimensions.width || payload.data.source.height !== dimensions.height) throw new Error('Ảnh nguồn và tọa độ không cùng kích thước.');
      setDocument(payload.data); setKind('line'); setQuery(''); setOnlyReview(false);
      setSelectedId(payload.data.elements.find((e: DetailedElement) => e.kind === 'line')?.id ?? null);
    } catch (failure) {
      if (id === generation.current) setError(failure instanceof Error && failure.name === 'TimeoutError' ? 'Hết thời gian đọc; thử chế độ nhanh hoặc chia trang nhỏ hơn.'
        : failure instanceof Error ? failure.message : 'Không đọc được tài liệu.');
    } finally { if (id === generation.current) { setBusy(false); setPhase(''); } }
  }, [chosenFile, source, busy, precise, camera, dimensions]);

  const records = useMemo(() => document?.elements.filter(e => e.kind === kind
    && (!onlyReview || e.reviewReasons.length || e.recognitionStatus === 'unreadable')
    && (!query || (e.id+' '+e.textRaw+' '+(e.textReviewed ?? '')+' '+e.parentId).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))) ?? [], [document, kind, onlyReview, query]);
  const selected = document?.elements.find(e => e.id === selectedId) ?? null;
  const parent = document?.elements.find(e => e.id === selected?.parentId);
  const children = useMemo(() => document?.elements.filter(e => e.parentId === selectedId) ?? [], [document, selectedId]);
  const visibleRecords = records.slice(page*60, (page+1)*60);
  const selectedIndex = records.findIndex(e => e.id === selectedId);
  const prefix = safeDetailedFilename(chosenFile?.name ?? 'document');
  const unresolved = document?.elements.filter(e => e.recognitionStatus === 'unreadable').length ?? 0;

  function choose(next: File | null) { setOwnFile(next); }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); if (file === undefined) choose(event.dataTransfer.files[0] ?? null); }
  function select(element: DetailedElement) { setSelectedId(element.id); }
  function filter(next: DetailKind) { setKind(next); setPage(0); }
  function edit(text: string) {
    setConfirmed(false);
    setDocument(prev => prev ? { ...prev, elements: prev.elements.map(e => e.id === selectedId ? { ...e, textReviewed: text } : e) } : null);
  }

  return <section aria-label="Đọc chi tiết và xuất TXT" className={`${compact ? 'my-6 rounded-3xl border border-stone-200 p-5' : ''} text-[#253b2e]`}>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#55725d]"><span className="h-2 w-2 rounded-full bg-[#d8a245]" /> AFL / DOCUMENT INTELLIGENCE</p>
        <h1 className={`${compact ? 'text-2xl' : 'text-4xl sm:text-5xl'} font-semibold tracking-tight`}>Mỗi chi tiết. <span className="font-serif italic text-[#6d865f]">Một tọa độ.</span></h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">Đọc vùng, dòng, từ và ô biểu mẫu. Giữ ảnh nguồn để đối chiếu, xuất từng bản ghi rõ ràng.</p>
      </div>
      <span className="rounded-full border border-[#cdd6c9] px-4 py-2 text-xs font-semibold uppercase tracking-wider">OpenCV + VietOCR cục bộ</span>
    </header>

    <div className="mb-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div onDragOver={e => { e.preventDefault(); if (file === undefined) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}
        className={`flex min-h-36 items-center gap-5 rounded-2xl border border-dashed p-6 ${dragging ? 'border-emerald-600 bg-emerald-50' : 'border-[#bdcabc] bg-white/70'}`}>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#edf1e9]"><FileText size={25} strokeWidth={1.5} /></span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{chosenFile?.name ?? 'Thả tài liệu của bạn vào đây'}</p>
          <p className="mt-1 text-sm text-stone-500">{dimensions.width ? `${number(dimensions.width)} × ${number(dimensions.height)} px · Giữ độ phân giải gốc` : 'JPEG / PNG · Tối đa 8 MB và 12 triệu pixel'}</p>
          {file === undefined && <><input ref={input} className="sr-only" aria-label="Chọn ảnh đọc chi tiết" type="file" accept="image/png,image/jpeg" onChange={e => choose(e.target.files?.[0] ?? null)} />
            <button className={`${pill} mt-3 bg-[#edf1e9]`} onClick={() => input.current?.click()}><Upload size={15} /> {chosenFile ? 'Đổi ảnh' : 'Chọn ảnh'}</button></>}
        </div>
      </div>
      <div className="rounded-2xl bg-[#263e30] p-6 text-[#f1f4e9]">
        <div className="mb-4 flex items-center justify-between"><p className="text-xs uppercase tracking-[0.17em] text-[#b8ccb4]">Cách đọc tài liệu</p><ScanLine size={19} /></div>
        <label className="mb-3 flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[#d5a855]" checked={precise} onChange={e => setPrecise(e.target.checked)} disabled={busy} /><span>Kiểm tra từng từ bằng OCR<small className="mt-1 block text-[#b8ccb4]">Đọc crop từ riêng và báo khác biệt với dòng. Tắt để đọc nhanh.</small></span></label>
        <label className="mb-4 flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="accent-[#d5a855]" checked={camera} onChange={e => setCamera(e.target.checked)} disabled={busy} /> Nắn phối cảnh ảnh chụp tờ giấy</label>
        <div className="flex gap-2"><button className={`${pill} w-full bg-[#e9bd71] text-[#263e30]`} disabled={!source || busy} onClick={run}>{busy ? <Loader2 size={17} className="animate-spin" /> : <ScanLine size={17} />}{busy ? 'Đang đọc tài liệu' : 'Đọc chi tiết'}{!busy && <ArrowUpRight size={17} />}</button>
          {busy && <button aria-label="Hủy đọc chi tiết" className={`${pill} bg-white/10`} onClick={() => { generation.current++; controller.current?.abort(); setBusy(false); setPhase(''); }}><X size={18} /></button>}</div>
      </div>
    </div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">{error}</p>}
    {busy && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl bg-[#e8eee2] p-4 text-sm"><Loader2 size={18} className="animate-spin" />{phase} <span className="ml-auto text-xs text-stone-500">Các vùng chưa xử lý sẽ được giữ và đánh dấu.</span></div>}

    {document && <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
      {[['VÙNG & Ô', (document.counts.region ?? 0)+(document.counts.cell ?? 0)], ['DÒNG', document.counts.line ?? 0], ['TỪ', document.counts.word ?? 0], ['CHƯA ĐỌC', unresolved], ['THỜI GIAN', `${number(document.timingMs.total/1000)} s`]].map(([label,value]) =>
        <div key={label} className="rounded-2xl border border-[#dce3d7] bg-white p-4"><p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-stone-500">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p></div>)}
    </div>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-2xl border border-[#dce3d7] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5e9e0] px-5 py-4"><div><p className="text-sm font-semibold">Ảnh nguồn</p><p className="mt-1 text-xs text-stone-500">Tọa độ trên ảnh sau chuẩn hóa hướng EXIF · XYXY</p></div>
          <div className="flex items-center gap-2"><button aria-label="Thu nhỏ ảnh nguồn" className="rounded-lg p-2 hover:bg-stone-100" onClick={() => setZoom(z => Math.max(1, z-0.25))}><ZoomOut size={17} /></button><span className="text-xs tabular-nums">{Math.round(zoom*100)}%</span><button aria-label="Phóng lớn ảnh nguồn" className="rounded-lg p-2 hover:bg-stone-100" onClick={() => setZoom(z => Math.min(4, z+0.25))}><ZoomIn size={17} /></button></div>
        </div>
        <div className="max-h-[800px] min-h-[400px] overflow-auto bg-[#e7ebe2] p-5" style={{ backgroundImage: 'radial-gradient(#c9d2c4 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          {source ? <div className="relative bg-white shadow-lg" style={{ width: `${zoom*100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imageRef} src={source} alt="Ảnh nguồn của tài liệu chi tiết" className="block w-full" />
            {document && <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="absolute inset-0 h-full w-full" aria-label="Tọa độ các vùng trên ảnh nguồn">
              {records.filter(e => e.id !== selectedId).map(e => <polygon key={e.id} points={e.polygon.map(p => p.join(',')).join(' ')} fill={tones[e.kind]} fillOpacity={0.05} stroke={tones[e.kind]} strokeWidth="1" vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={() => select(e)}><title>{e.id}: {e.textRaw || states[e.recognitionStatus]}</title></polygon>)}
              {selected && <polygon data-testid="detailed-selected-polygon" points={selected.polygon.map(p => p.join(',')).join(' ')} fill="#df5d3b" fillOpacity={0.16} stroke="#df5d3b" strokeWidth="3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            </svg>}
          </div> : <div className="flex min-h-[380px] flex-col items-center justify-center text-[#70836c]"><Focus size={48} strokeWidth={1} /><p className="mt-4 text-sm">Chọn ảnh để bắt đầu khám phá chi tiết.</p></div>}
        </div>
        <div className="flex items-center gap-2 px-5 py-3 text-xs text-stone-500"><span className="h-2 w-2 rounded-full bg-[#df5d3b]" /> Vùng đang chọn<span className="ml-auto">{document ? `${document.elements.length} bản ghi được giữ` : 'Ảnh chỉ nằm trong phiên làm việc'}</span></div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-[#dce3d7] bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Layers3 size={18} /> Cấu trúc tài liệu</h2><div className="flex gap-2 text-xs"><button className={tab === 'records' ? 'font-bold text-emerald-700' : 'text-stone-500'} onClick={() => setTab('records')}>Bản ghi</button><button className={tab === 'transcript' ? 'font-bold text-emerald-700' : 'text-stone-500'} onClick={() => setTab('transcript')}>Toàn văn</button></div></div>
          <div className="mb-4 flex flex-wrap gap-2">{DETAIL_KINDS.filter(k => k !== 'page').map(k => <button key={k} aria-pressed={kind === k} onClick={() => filter(k)} className={`rounded-full border px-3 py-1.5 text-xs ${kind === k ? 'border-[#263e30] bg-[#263e30] text-white' : 'border-stone-200 text-stone-600'}`}>{labels[k]} <span className="ml-1 opacity-70">{document?.counts[k] ?? 0}</span></button>)}</div>
          {tab === 'transcript' ? <pre data-testid="detailed-transcript" className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#f4f6f0] p-4 font-sans text-sm leading-7">{document ? detailedTranscript(document, true) || '(Không có dòng chữ)' : 'Toàn văn sẽ xuất hiện sau khi đọc.'}</pre> : <>
            <label className="mb-3 flex items-center gap-2 rounded-lg bg-[#f4f6f0] px-3 py-2"><Search size={16} className="text-stone-400" /><input aria-label="Tìm bản ghi chi tiết" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Tìm nội dung hoặc ID…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <label className="mb-3 flex items-center gap-2 text-xs text-stone-500"><input type="checkbox" checked={onlyReview} onChange={e => { setOnlyReview(e.target.checked); setPage(0); }} className="accent-emerald-700" /> Chỉ hiện vùng cần đối chiếu</label>
            <div className="max-h-[440px] overflow-auto" data-testid="detailed-records">{visibleRecords.length ? visibleRecords.map(e => <button key={e.id} onClick={() => select(e)} aria-pressed={selectedId === e.id} className={`mb-1 block w-full rounded-lg border px-3 py-3 text-left ${selectedId === e.id ? 'border-[#c8d7bc] bg-[#edf3e7]' : 'border-transparent hover:bg-stone-50'}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] font-semibold text-[#6c7d65]">{e.id}</span><span className={`text-[10px] ${e.recognitionStatus === 'unreadable' ? 'text-orange-700' : 'text-stone-500'}`}>{states[e.recognitionStatus]}</span></div>
              <p className="mt-1 break-words text-sm">{e.textReviewed ?? (e.textRaw || (e.kind === 'checkbox' ? `Trạng thái: ${e.checkboxState}` : e.recognitionStatus === 'blank' ? '(ô trống)' : '—'))}</p>
              <p className="mt-1 font-mono text-[10px] text-stone-400">[{e.bbox.map(number).join(', ')}]</p>
            </button>) : <p className="py-10 text-center text-sm text-stone-400">{document ? 'Không có bản ghi phù hợp.' : 'Đọc tài liệu để xem vùng, dòng và từng từ.'}</p>}</div>
            {records.length > 60 && <div className="mt-3 flex items-center justify-between text-xs text-stone-500"><button aria-label="Trang bản ghi trước" disabled={!page} onClick={() => setPage(p => p-1)}><ChevronLeft size={18} /></button><span>{page+1} / {Math.ceil(records.length/60)} · {records.length} bản ghi</span><button aria-label="Trang bản ghi sau" disabled={(page+1)*60 >= records.length} onClick={() => setPage(p => p+1)}><ChevronRight size={18} /></button></div>}
          </>}
        </div>
        {selected && <div className="rounded-2xl border border-[#dce3d7] bg-white p-5" data-testid="detailed-inspector">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Chi tiết vùng đang chọn</h3><span className="rounded-full bg-[#f2eadb] px-3 py-1 text-[10px] text-[#9b6c20]">{labels[selected.kind]}</span></div>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-xs"><dt className="text-stone-500">ID</dt><dd className="break-all font-mono">{selected.id}</dd><dt className="text-stone-500">Vùng cha</dt><dd>{parent ? <button className="underline underline-offset-2" onClick={() => select(parent)}>{parent.id}</button> : 'Trang gốc'}</dd><dt className="text-stone-500">XYXY (px)</dt><dd className="font-mono">[{selected.bbox.map(number).join(', ')}]</dd><dt className="text-stone-500">Chuẩn hóa</dt><dd className="break-all font-mono">[{selected.normalizedBox.map(n => n.toFixed(6)).join(', ')}]</dd><dt className="text-stone-500">Nguồn chữ</dt><dd>{selected.textOrigin}</dd><dt className="text-stone-500">Tin cậy OCR</dt><dd>{selected.ocrConfidence === null ? 'Chưa có số đo' : `${number(selected.ocrConfidence*100)}%`}</dd></dl>
          {source && <div className="mt-4 rounded-xl border border-stone-200 bg-[#f5f6f1] p-3"><p className="mb-2 text-[10px] text-stone-500">Cận cảnh vùng trên ảnh nguồn</p><svg aria-label="Cận cảnh vùng đã chọn" viewBox={`${selected.bbox[0]} ${selected.bbox[1]} ${selected.bbox[2]-selected.bbox[0]} ${selected.bbox[3]-selected.bbox[1]}`} className="h-28 w-full"><defs><clipPath id={`detailed-crop-${selected.id}`}><rect x={selected.bbox[0]} y={selected.bbox[1]} width={selected.bbox[2]-selected.bbox[0]} height={selected.bbox[3]-selected.bbox[1]} /></clipPath></defs><image href={source} width={dimensions.width} height={dimensions.height} clipPath={`url(#detailed-crop-${selected.id})`} /><polygon points={selected.polygon.map(p => p.join(',')).join(' ')} fill="none" stroke="#df5d3b" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg></div>}
          {selected.kind === 'cell' && <p className="mt-3 text-xs text-stone-600">Hàng {(selected.rowIndex ?? 0)+1} · Cột {(selected.columnIndex ?? 0)+1} · Gộp {selected.rowSpan} hàng × {selected.columnSpan} cột</p>}
          {selected.kind === 'checkbox' && <p className="mt-3 text-xs text-stone-600">Trạng thái: {selected.checkboxState === 'checked' ? 'Đã chọn' : selected.checkboxState === 'unchecked' ? 'Chưa chọn' : 'Chưa xác định'} · Nhãn: {selected.labelIds?.join(', ') || 'Chưa liên kết'}</p>}
          <details className="mt-3 text-xs text-stone-500"><summary className="cursor-pointer">Bốn góc và tọa độ crop OCR</summary><dl className="mt-2 grid grid-cols-[80px_1fr] gap-2"><dt>Polygon gốc</dt><dd className="break-all font-mono">{selected.polygon.map(p => `[${p.map(number).join(', ')}]`).join(' ')}</dd><dt>Ảnh xử lý</dt><dd className="break-all font-mono">[{selected.processedBox.map(number).join(', ')}]</dd><dt>Crop OCR</dt><dd className="break-all font-mono">[{selected.cropBox.map(number).join(', ')}]</dd></dl></details>
          {selected.textReviewed !== undefined && <p className="mt-3 break-words text-xs text-stone-500">OCR gốc: {selected.textRaw || '(không có chữ)'}</p>}
          {children.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{children.map(child => <button key={child.id} className="rounded bg-[#eef2e9] px-2 py-1 font-mono text-[10px]" onClick={() => select(child)}>{child.textRaw || child.id}</button>)}</div>}
          {['line','word'].includes(selected.kind) && <label className="mt-4 block text-xs text-stone-500">Nội dung đối chiếu <span className="text-stone-400">(chữ nguồn vẫn được giữ)</span><textarea aria-label="Nội dung đối chiếu của vùng" value={selected.textReviewed ?? selected.textRaw} onChange={e => edit(e.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-stone-200 p-3 text-sm text-[#253b2e] outline-none focus:border-emerald-600" /></label>}
          {selected.reviewReasons.length > 0 && <p className="mt-3 break-words text-xs leading-5 text-orange-800">Cần đối chiếu: {selected.reviewReasons.join(' · ')}</p>}
          {records.length > 1 && <div className="mt-3 flex gap-2"><button className="rounded border px-3 py-1 text-xs disabled:opacity-30" disabled={selectedIndex <= 0} onClick={() => select(records[selectedIndex-1])}>← Trước</button><button className="rounded border px-3 py-1 text-xs disabled:opacity-30" disabled={selectedIndex < 0 || selectedIndex >= records.length-1} onClick={() => select(records[selectedIndex+1])}>Sau →</button></div>}
        </div>}
      </div>
    </div>

    {document && <footer className="mt-6 rounded-2xl border border-[#dce3d7] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">Mang từng chi tiết ra khỏi màn hình.</h2><p className="mt-2 text-sm text-stone-500">TXT UTF-8 · Mỗi tọa độ một bản ghi · Ô trống và vùng chưa đọc vẫn có trong file.</p></div><span className="rounded-full bg-[#eef2e9] px-3 py-1.5 text-xs font-semibold">{document.status === 'partial' ? 'Còn vùng cần kiểm tra' : 'Đã xử lý các vùng phát hiện'}</span></div>
      <label className="my-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="accent-emerald-700" /> Tôi đã đối chiếu ảnh nguồn; đánh dấu bản xuất đã được duyệt.</label>
      <div className="flex flex-wrap gap-2">
        <button className={`${pill} bg-[#263e30] text-white`} onClick={() => download(serializeDetailedCoordinates(document, confirmed), `${prefix}.coordinates.txt`)}><ArrowDownToLine size={16} /> TXT tọa độ</button>
        <button className={`${pill} border border-[#ccd5c5]`} onClick={() => download(`${confirmed ? 'AFL · ĐÃ ĐỐI CHIẾU' : 'AFL · BẢN NHÁP CẦN ĐỐI CHIẾU'}\nTrạng thái: ${document.status}\n\n${detailedTranscript(document, true)}\n`, `${prefix}.fulltext.txt`)}><FileText size={16} /> TXT toàn văn</button>
        <button className={`${pill} border border-[#ccd5c5]`} onClick={() => download(serializeDetailedReview(document), `${prefix}.review.txt`)}>Báo cáo đối chiếu</button>
        <button className={`${pill} border border-[#ccd5c5]`} onClick={() => { validateDetailedDocument(document); download(JSON.stringify({ ...document, exportStatus: confirmed ? 'reviewed' : 'draft' }, null, 2)+'\n', `${prefix}.layout.json`, 'application/json;charset=utf-8'); }}>JSON chi tiết</button>
        {selected && <button className={`${pill} border border-[#ccd5c5]`} onClick={() => download(JSON.stringify({ record: 'element', coordinateSystem: document.coordinateSystem, source: document.source, ...selected }, null, 2)+'\n', `${prefix}.${selected.id}.txt`)}>TXT vùng đang chọn</button>}
      </div>
      <details className="mt-5 text-xs text-stone-500"><summary className="cursor-pointer">Thông tin cần đối chiếu ({document.warnings.length}) và phạm vi đo</summary><p className="mt-2 leading-6">{document.warnings.join(' · ') || 'Không có cảnh báo hệ thống.'}<br />Phần mực chưa được gán: {number(document.coverage.unassignedInkPixels)} pixel. Chỉ số này hỗ trợ tìm vùng bỏ sót, không xác nhận rằng mọi chữ đã đọc đúng. Bảng/checkbox và thứ tự đọc là kết quả hình học cần kiểm tra.</p></details>
      {confirmed && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><Check size={14} /> Bản xuất đã được đánh dấu đối chiếu; chữ nguồn và các cảnh báo được giữ nguyên.</p>}
    </footer>}
  </section>;
}
