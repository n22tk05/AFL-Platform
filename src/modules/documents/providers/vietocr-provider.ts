import type { DocumentOcrInput, DocumentOcrProvider, DocumentOcrResult } from '@/shared/document-extraction.types';
import { VietOcrAdapter, VietOcrTimeoutError, type VietOcrConfig } from '@/modules/ocr/vietocr-adapter';
import { DocumentPipelineError } from '../errors';

/**
 * VietOCR Vietnamese Document OCR Provider
 * Integrates line segmentation with VietOCR recognition
 */
export class VietOcrProvider implements DocumentOcrProvider {
  readonly providerId = 'vietocr';
  private readonly adapter: VietOcrAdapter;

  constructor(config: Partial<VietOcrConfig> = {}) {
    // Citizen documents must never use the adapter's development synthesizer.
    this.adapter = new VietOcrAdapter({ ...config, allowOfflineFallback: false });
  }

  async extract(input: DocumentOcrInput): Promise<DocumentOcrResult> {
    if (typeof window !== 'undefined') {
      throw new Error('SERVER_ONLY');
    }

    if (input.signal?.aborted) {
      throw new DocumentPipelineError('OCR_TIMEOUT');
    }

    try {
      const base64 = Buffer.from(input.bytes).toString('base64');
      const dataUrl = `data:${input.mimeType};base64,${base64}`;

      // Call VietOCR recognition (microservice auto-segments full documents into lines)
      const detected = await this.adapter.recognizeDocumentWithLayout(
        dataUrl,
        input.signal,
      );

      const lines = detected.lines.map((l, idx) => ({
        id: l.lineId || `line_${String(idx + 1).padStart(3, '0')}`,
        text: l.rawText,
        confidence: l.confidence,
        boundingBox: l.coordinates,
        page: 1,
        tokenIds: [],
      }));

      // Assemble fullText with natural paragraph and header breaks
      let fullText = '';
      const ranges = new Map<string, { start: number; end: number }>();
      let offset = 0;
      for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        let separator = '';
        if (i > 0) {
          const prev = lines[i - 1];
          const verticalGap = cur.boundingBox && prev.boundingBox ? cur.boundingBox[0] - prev.boundingBox[2] : 0;
          if (verticalGap > 0.025) {
            separator = '\n\n';
          } else {
            separator = '\n';
          }
        }
        fullText += separator + cur.text;
        offset += Array.from(separator).length;
        ranges.set(cur.id, { start: offset, end: offset + Array.from(cur.text).length });
        offset += Array.from(cur.text).length;
      }

      const byId = new Map(lines.map(line => [line.id, line]));
      const tables = detected.tables.map(table => ({
        id: table.id, page: 1, headerRowCount: table.headerRowCount,
        rows: table.rows.map(row => row.map(cell => ({
          // Each fragment is tied to its exact source range, even for multiline cells.
          text: cell.lineIds.map(id => byId.get(id)!.text).join(''),
          sourceLineIds: cell.lineIds,
          sourceRanges: cell.lineIds.map(id => ranges.get(id)!).filter(range => range.end > range.start),
          rowSpan: 1, columnSpan: 1,
        }))),
      }));
      const warnings: string[] = [...detected.warnings];
      if (!fullText.trim()) {
        warnings.push('OCR_EMPTY_TEXT');
      }

      return {
        provider: 'vietocr',
        readingOrder: 'geometric-heuristic',
        fullText,
        lines,
        tokens: [],
        tables,
        pageCount: 1,
        warnings,
      };
    } catch (error) {
      if (error instanceof DocumentPipelineError) throw error;
      if (input.signal?.aborted || error instanceof VietOcrTimeoutError) throw new DocumentPipelineError('OCR_TIMEOUT');
      const message = error instanceof Error ? error.message : '';
      throw new DocumentPipelineError(/status 429/i.test(message) ? 'OCR_RATE_LIMITED' : /not configured|status 401|status 403/i.test(message) ? 'OCR_NOT_CONFIGURED' : /Invalid|alignment|Duplicate|Unknown/i.test(message) ? 'OCR_INVALID_RESPONSE' : 'OCR_UNAVAILABLE');
    }
  }
}
