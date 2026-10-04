import { v1, type protos } from '@google-cloud/documentai';
import type { DocumentOcrInput, DocumentOcrProvider, DocumentOcrResult, NormalizedBoundingBox } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError } from '../errors';
import { clampConfidence, validBox } from '../validation';

type GoogleDocument = protos.google.cloud.documentai.v1.IDocument;
type Layout = protos.google.cloud.documentai.v1.Document.Page.ILayout;
type Anchor = protos.google.cloud.documentai.v1.Document.ITextAnchor;
function ranges(anchor?: Anchor | null): [number, number][] {
  return (anchor?.textSegments ?? []).map(s => [Number(s.startIndex ?? 0), Number(s.endIndex ?? 0)]);
}
export function mapGoogleDocument(document: GoogleDocument): DocumentOcrResult {
  const fullText = document.text ?? '';
  const characters = Array.from(fullText);
  const warnings = new Set<string>();
  const result: DocumentOcrResult = { provider: 'google-document-ai', fullText, tokens: [], lines: [], tables: [], pageCount: document.pages?.length ?? 0, warnings: [] };
  function text(layout?: Layout | null): string {
    const spans = ranges(layout?.textAnchor);
    if (!spans.length) warnings.add('OCR_MISSING_TEXT_ANCHOR');
    return spans.map(([start, end]) => {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > characters.length) { warnings.add('OCR_INVALID_TEXT_ANCHOR'); return ''; }
      return characters.slice(start, end).join('');
    }).join('');
  }
  function box(layout: Layout | null | undefined, width: number, height: number): NormalizedBoundingBox {
    const polygon = layout?.boundingPoly;
    const normalized = polygon?.normalizedVertices;
    const vertices = normalized?.length ? normalized.map(v => ({ x: v.x ?? 0, y: v.y ?? 0 }))
      : width > 0 && height > 0 ? (polygon?.vertices ?? []).map(v => ({ x: (v.x ?? 0) / width, y: (v.y ?? 0) / height })) : [];
    if (!vertices.length || vertices.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y))) { warnings.add('OCR_MISSING_GEOMETRY'); return [0, 0, 0, 0]; }
    if (vertices.some(v => v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1)) {
      warnings.add('OCR_CLIPPED_GEOMETRY');
      return [0, 0, 0, 0]; // Invalid source geometry must never become acceptable by clamping.
    }
    const b: NormalizedBoundingBox = [Math.min(...vertices.map(v => v.y)), Math.min(...vertices.map(v => v.x)), Math.max(...vertices.map(v => v.y)), Math.max(...vertices.map(v => v.x))].map(clampConfidence) as NormalizedBoundingBox;
    if (!validBox(b)) warnings.add('OCR_INVALID_GEOMETRY');
    return b;
  }
  function confidence(layout?: Layout | null): number | null {
    if (!layout || !Object.hasOwn(layout, 'confidence') || layout.confidence == null) return null;
    if (!Number.isFinite(layout.confidence) || layout.confidence < 0 || layout.confidence > 1) warnings.add('OCR_INVALID_CONFIDENCE');
    return clampConfidence(layout.confidence);
  }
  (document.pages ?? []).forEach((page, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const width = page.dimension?.width ?? 0, height = page.dimension?.height ?? 0;
    const tokens = (page.tokens ?? []).map((token, i) => ({ id: `p${pageNumber}_t${i + 1}`, text: text(token.layout), confidence: confidence(token.layout), boundingBox: box(token.layout, width, height), page: pageNumber }));
    result.tokens.push(...tokens);
    (page.tables ?? []).forEach((table, i) => {
      result.tables!.push({ id: `p${pageNumber}_table${i + 1}`, page: pageNumber, headerRowCount: table.headerRows?.length ?? 0,
        rows: [...(table.headerRows ?? []), ...(table.bodyRows ?? [])].map(row => (row.cells ?? []).map(cell => ({
          text: text(cell.layout), sourceRanges: ranges(cell.layout?.textAnchor).map(([start, end]) => ({ start, end })),
          rowSpan: cell.rowSpan ?? 1, columnSpan: cell.colSpan ?? 1,
        }))),
      });
    });
    (page.lines ?? []).forEach((line, i) => {
      const spans = ranges(line.layout?.textAnchor);
      const tokenIds = tokens.filter((_, t) => ranges(page.tokens?.[t].layout?.textAnchor).some(([start, end]) => spans.some(([a, b]) => start >= a && end <= b && end > start))).map(t => t.id);
      result.lines.push({ id: `p${pageNumber}_l${i + 1}`, text: text(line.layout), confidence: confidence(line.layout), boundingBox: box(line.layout, width, height), page: pageNumber, tokenIds });
    });
    if ((page.imageQualityScores?.detectedDefects ?? []).length) warnings.add('OCR_IMAGE_QUALITY_DEFECT');
  });
  if (!fullText.trim()) warnings.add('OCR_EMPTY_TEXT');
  if (!result.lines.length) warnings.add('OCR_NO_LINES');
  result.warnings = Array.from(warnings);
  return result;
}
export class GoogleDocumentAiProvider implements DocumentOcrProvider {
  readonly providerId = 'google-document-ai';
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async extract(input: DocumentOcrInput): Promise<DocumentOcrResult> {
    if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
    const project = this.env.GOOGLE_CLOUD_PROJECT_ID, location = this.env.GOOGLE_CLOUD_LOCATION, processor = this.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
    const version = this.env.GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION?.trim();
    if (!project || !location || !processor || !/^[a-z0-9-]+$/.test(location) || !/^[a-zA-Z0-9_-]+$/.test(project) || !/^[a-zA-Z0-9_-]+$/.test(processor)) throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
    if (version && !/^[a-zA-Z0-9_-]+$/.test(version)) throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
    const client = new v1.DocumentProcessorServiceClient({ apiEndpoint: `${location}-documentai.googleapis.com` });
    const cancel = () => { void client.close().catch(() => {}); };
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (input.signal?.aborted) throw new DocumentPipelineError('OCR_TIMEOUT');
      const name = `projects/${project}/locations/${location}/processors/${processor}${version ? `/processorVersions/${version}` : ''}`;
      const [response] = await client.processDocument({ name,
        rawDocument: { content: input.bytes, mimeType: input.mimeType },
        processOptions: { ocrConfig: { hints: { languageHints: ['vi'] }, enableImageQualityScores: true } },
      }, { timeout: DOCUMENT_LIMITS.timeoutMs, retry: null });
      if (!response.document) throw new DocumentPipelineError('OCR_INVALID_RESPONSE');
      return mapGoogleDocument(response.document);
    } catch (error) {
      if (error instanceof DocumentPipelineError) throw error;
      const code = typeof error === 'object' && error ? (error as { code?: number | string }).code : undefined;
      const authFailure = code === 7 || code === 16 || code === 'ENOENT' || (error instanceof Error && /default credentials|credentials.*file/i.test(error.message));
      throw new DocumentPipelineError(input.signal?.aborted || code === 4 ? 'OCR_TIMEOUT' : authFailure ? 'OCR_NOT_CONFIGURED' : code === 8 ? 'OCR_RATE_LIMITED' : 'OCR_UNAVAILABLE');
    } finally {
      input.signal?.removeEventListener('abort', cancel);
      await client.close().catch(() => {});
    }
  }
}
