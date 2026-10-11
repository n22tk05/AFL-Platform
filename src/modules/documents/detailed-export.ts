import { DETAIL_KINDS, type DetailedBox, type DetailedDocument, type DetailedElement } from '@/shared/detailed-document.types';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const integer = (n: unknown): n is number => finite(n) && Number.isInteger(n) && n >= 0;
const box = (b: unknown, width: number, height: number): b is DetailedBox => Array.isArray(b) && b.length === 4
  && b.every(finite) && b[0] >= 0 && b[1] >= 0 && b[0] < b[2] && b[1] < b[3] && b[2] <= width && b[3] <= height;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && s.length <= 200);
const matrix = (v: unknown): v is number[][] => Array.isArray(v) && v.length === 3 && v.every(r => Array.isArray(r) && r.length === 3 && r.every(finite));

/** Reject malformed/omitted geometry instead of silently fixing or dropping records. */
export function validateDetailedDocument(value: unknown): asserts value is DetailedDocument {
  const d = value as DetailedDocument;
  const fail = (): never => { throw new Error('INVALID_DETAILED_DOCUMENT'); };
  if (!d || d.schemaVersion !== 'detailed-1.0' || !['complete', 'partial'].includes(d.status) || d.requiresReview !== true
    || d.coordinateSystem !== 'source-oriented-pixels-xyxy' || d.pixelBounds !== 'half-open'
    || !d.source || !d.processed || ![d.source.width, d.source.height, d.processed.width, d.processed.height].every(n => integer(n) && n > 0 && n <= 8192)
    || d.source.width*d.source.height > 12_000_000 || d.processed.width*d.processed.height > 12_000_000
    || !d.transforms || !matrix(d.transforms.sourceToProcessed) || !matrix(d.transforms.processedToSource)
    || !finite(d.transforms.skewDegrees) || Math.abs(d.transforms.skewDegrees) > 35
    || !d.provider || d.provider.name !== 'vietocr-local' || typeof d.provider.model !== 'string' || d.provider.model.length > 200 || typeof d.provider.wordRecognition !== 'boolean'
    || !Array.isArray(d.elements) || !d.elements.length || d.elements.length > 16000
    || !strings(d.warnings) || typeof d.fullText !== 'string' || d.fullText.length > 500_000
    || !d.timingMs || !Object.values(d.timingMs).every(n => finite(n) && n >= 0)
    || !['detection', 'recognition', 'total'].every(k => Object.hasOwn(d.timingMs, k))
    || !d.coverage || !integer(d.coverage.inkPixels) || !integer(d.coverage.unassignedInkPixels)
    || d.coverage.unassignedInkPixels > d.coverage.inkPixels || !finite(d.coverage.explainedInkRatio)
    || d.coverage.explainedInkRatio < 0 || d.coverage.explainedInkRatio > 1 || d.coverage.isCompletenessGuarantee !== false || !d.counts) fail();
  if (d.preprocessing !== undefined) {
    const p = d.preprocessing;
    if (!p || !['auto','camera','scan'].includes(p.mode) || !['auto','manual','none'].includes(p.perspectiveOrigin)
      || typeof p.illuminationNormalized !== 'boolean'
      || !(p.detectionScore === null || finite(p.detectionScore) && p.detectionScore >= 0 && p.detectionScore <= 1)
      || !(p.detectionMethod === null || typeof p.detectionMethod === 'string' && p.detectionMethod.length <= 100)
      || !p.quality || ![p.quality.medianBrightness,p.quality.inkContrast,p.quality.edgeSharpness,p.quality.saturatedPixelRatio].every(n => finite(n) && n >= 0)
      || p.quality.medianBrightness > 255 || p.quality.inkContrast > 255 || p.quality.saturatedPixelRatio > 1) fail();
    if (p.sourceQuad !== null && (!Array.isArray(p.sourceQuad) || p.sourceQuad.length !== 4 || p.sourceQuad.some(point => !Array.isArray(point)
      || point.length !== 2 || !point.every(finite) || point[0] < 0 || point[1] < 0 || point[0] > d.source.width-1 || point[1] > d.source.height-1))) fail();
    if ((p.perspectiveOrigin === 'none') !== (p.sourceQuad === null)) fail();
  }
  const f = d.transforms.sourceToProcessed, inv = d.transforms.processedToSource;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    if (Math.abs(f[row].reduce((sum, n, k) => sum+n*inv[k][col], 0)-(row === col ? 1 : 0)) > 1e-5) fail();
  }
  if (Math.abs(d.coverage.explainedInkRatio-(1-d.coverage.unassignedInkPixels/Math.max(1,d.coverage.inkPixels))) > 1e-7) fail();
  const byId = new Map<string, DetailedElement>(), actual: Record<string, number> = {};
  const orders = new Set<number>(); let textLength = 0;
  for (const e of d.elements) {
    if (!e || typeof e.id !== 'string' || !/^[A-Za-z0-9_.-]{1,120}$/.test(e.id) || byId.has(e.id) || e.page !== 1
      || !DETAIL_KINDS.includes(e.kind) || !integer(e.order) || orders.has(e.order)
      || !(e.parentId === null || typeof e.parentId === 'string')
      || !box(e.bbox, d.source.width, d.source.height) || !box(e.normalizedBox, 1, 1)
      || !box(e.processedBox, d.processed.width, d.processed.height) || !box(e.cropBox, d.processed.width, d.processed.height)
      || !Array.isArray(e.polygon) || e.polygon.length !== 4 || e.polygon.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite))
      || typeof e.textRaw !== 'string' || e.textRaw.length > 120_000 || (e.textReviewed !== undefined && (typeof e.textReviewed !== 'string' || e.textReviewed.length > 120_000))
      || !(e.ocrConfidence === null || finite(e.ocrConfidence) && e.ocrConfidence >= 0 && e.ocrConfidence <= 1)
      || !['recognized', 'blank', 'unreadable', 'not_applicable'].includes(e.recognitionStatus)
      || e.geometryOrigin !== 'pixel_detector' || !['none', 'line_crop_ocr', 'word_crop_ocr', 'line_token_alignment'].includes(e.textOrigin)
      || !strings(e.reviewReasons)) fail();
    if ((e.kind === 'line' || e.kind === 'word') && !integer(e.readingOrder)) fail();
    if (e.kind === 'cell' && (![e.rowIndex, e.columnIndex].every(integer) || ![e.rowSpan, e.columnSpan].every(n => integer(n) && n > 0 && n <= 100))) fail();
    if (e.kind === 'checkbox' && !['checked', 'unchecked', 'unknown'].includes(e.checkboxState ?? '')) fail();
    if (e.labelIds !== undefined && (!Array.isArray(e.labelIds) || e.labelIds.length > 8 || e.labelIds.some(id => typeof id !== 'string'))) fail();
    const expected = [e.bbox[0]/d.source.width, e.bbox[1]/d.source.height, e.bbox[2]/d.source.width, e.bbox[3]/d.source.height];
    if (e.normalizedBox.some((n, i) => Math.abs(n-expected[i]) > 1e-7)) fail();
    const [x1,y1,x2,y2] = e.processedBox;
    const corners = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
    corners.forEach(([x,y], i) => {
      const z = inv[2][0]*x+inv[2][1]*y+inv[2][2];
      if (Math.abs(z) < 1e-10 || Math.abs(e.polygon[i][0]-(inv[0][0]*x+inv[0][1]*y+inv[0][2])/z) > 0.02
        || Math.abs(e.polygon[i][1]-(inv[1][0]*x+inv[1][1]*y+inv[1][2])/z) > 0.02) fail();
    });
    const polygonBox = [Math.max(0,Math.min(...e.polygon.map(p => p[0]))), Math.max(0,Math.min(...e.polygon.map(p => p[1]))),
      Math.min(d.source.width,Math.max(...e.polygon.map(p => p[0]))), Math.min(d.source.height,Math.max(...e.polygon.map(p => p[1])))];
    if (e.bbox.some((n,i) => Math.abs(n-polygonBox[i]) > 0.02)) fail();
    byId.set(e.id, e); orders.add(e.order); actual[e.kind] = (actual[e.kind] ?? 0)+1;
    textLength += e.textRaw.length;
    if (textLength > 2_000_000) fail();
  }
  const roots = d.elements.filter(e => e.parentId === null);
  if (roots.length !== 1 || roots[0].kind !== 'page') fail();
  for (const e of d.elements) {
    if (e.labelIds?.some(id => byId.get(id)?.kind !== 'line')) fail();
    if (e.parentId !== null) {
      const parent = byId.get(e.parentId);
      // Parents precede children: both a cycle check and stable streaming serialization.
      if (!parent || parent.order >= e.order || e.kind === 'page' || e.kind === 'word' && !['line','word_group'].includes(parent.kind)
        || e.kind === 'word_group' && parent.kind !== 'line'
        || e.kind === 'cell' && !['table', 'region'].includes(parent.kind)) fail();
      if (parent && (e.processedBox[0] < parent.processedBox[0] || e.processedBox[1] < parent.processedBox[1]
        || e.processedBox[2] > parent.processedBox[2] || e.processedBox[3] > parent.processedBox[3])) fail();
    }
  }
  if (Object.keys(d.counts).some(k => !DETAIL_KINDS.includes(k as typeof DETAIL_KINDS[number]) || !integer(d.counts[k as keyof typeof d.counts]))
    || (d.counts.word ?? 0) > 8000 || DETAIL_KINDS.some(k => (d.counts[k] ?? 0) !== (actual[k] ?? 0))) fail();
  const lines = d.elements.filter(e => e.kind === 'line').sort((a,b) => a.readingOrder!-b.readingOrder!);
  if (d.fullText !== lines.map(e => transcriptLine(d, e)).join('\n')) fail();
  if (d.status === 'complete' && d.elements.some(e => e.recognitionStatus === 'unreadable')) fail();
}

export function detailedTranscript(document: DetailedDocument, reviewed = false): string {
  validateDetailedDocument(document);
  return document.elements.filter(e => e.kind === 'line').sort((a,b) => a.readingOrder!-b.readingOrder!).map(e => transcriptLine(document, e, reviewed)).join('\n');
}

function transcriptLine(document: DetailedDocument, e: DetailedElement, reviewed = false): string {
  const raw = reviewed ? e.textReviewed ?? e.textRaw : e.textRaw;
  const text = raw.trim() ? raw : `[UNREADABLE:${e.id}]`;
  const marks = { checked: '[x]', unchecked: '[ ]', unknown: '[?]' };
  const prefix = document.elements.filter(c => c.kind === 'checkbox' && c.labelIds?.includes(e.id)).map(c => marks[c.checkboxState!]).join(' ');
  return prefix ? prefix+' '+text : text;
}

export function serializeDetailedCoordinates(document: DetailedDocument, confirmed = false): string {
  validateDetailedDocument(document);
  const { elements, fullText, ...metadata } = document;
  return [JSON.stringify({ record: 'metadata', ...metadata, exportStatus: confirmed ? 'reviewed' : 'draft', encoding: 'UTF-8', bboxOrder: 'xyxy', exportedElementCount: elements.length }),
    ...[...elements].sort((a,b) => a.order-b.order).map(e => JSON.stringify({ record: 'element', ...e }))].join('\n')+'\n';
}

export function serializeDetailedReview(document: DetailedDocument): string {
  validateDetailedDocument(document);
  return ['AFL · ĐỐI CHIẾU TÀI LIỆU', `Trạng thái: ${document.status} · Chưa xác nhận độ chính xác toàn bộ`,
    `Warnings: ${document.warnings.join(', ') || '—'}`,
    `Mực chưa gán: ${document.coverage.unassignedInkPixels}/${document.coverage.inkPixels} pixel (không phải phép đo độ đầy đủ OCR)`, '',
    ...document.elements.filter(e => e.reviewReasons.length || e.recognitionStatus === 'unreadable').map(e =>
      `${e.id} | ${e.kind} | ${e.recognitionStatus} | bbox_xyxy=${JSON.stringify(e.bbox)} | ${e.reviewReasons.join(', ')} | text=${JSON.stringify(e.textRaw)}`)].join('\n')+'\n';
}

export function safeDetailedFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').normalize('NFC').replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0,80) || 'document';
}
