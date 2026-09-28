import type { DocumentExtractionResult, DocumentOcrInput, DocumentOcrProvider, StructuredExtractionProvider } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError, withDeadline } from '../errors';
import { parseStructuredResult } from '../validation';

export function manualReview(warning: string, fullText = ''): DocumentExtractionResult {
  return { contractVersion: 2, status: 'manual_review_required', documentType: 'unknown', fields: {}, fullText,
    overallConfidence: 0, requiresReview: true, warnings: [warning], processingTimeMs: 0, deskewApplied: false };
}
export class DocumentExtractionService {
  constructor(private readonly ocr: DocumentOcrProvider, private readonly structured: StructuredExtractionProvider,
    private readonly threshold: number = DOCUMENT_LIMITS.acceptanceThreshold, private readonly timeoutMs: number = DOCUMENT_LIMITS.timeoutMs) {}
  async extractDocumentInformation(input: DocumentOcrInput & { deskewApplied?: boolean; documentHint?: string }): Promise<DocumentExtractionResult> {
    const start = Date.now();
    let fullText = '';
    let result: DocumentExtractionResult;
    try {
      const ocr = await withDeadline(signal => this.ocr.extract({ ...input, signal }), this.timeoutMs, 'OCR_TIMEOUT', input.signal);
      fullText = ocr.fullText;
      if (fullText.length > DOCUMENT_LIMITS.ocrCharacters || ocr.lines.length > DOCUMENT_LIMITS.ocrLines) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
      if (!fullText.trim() || !ocr.lines.length || ocr.pageCount !== 1) return { ...manualReview('OCR_EMPTY_OR_UNSUPPORTED_PAGES', fullText), deskewApplied: !!input.deskewApplied, processingTimeMs: Date.now() - start };
      const type = await withDeadline(signal => this.structured.classify(ocr, signal), this.timeoutMs, 'STRUCTURED_UNAVAILABLE', input.signal);
      const hint = input.documentHint === 'traffic_ticket' ? 'traffic_violation_record' : input.documentHint;
      if (type !== 'traffic_violation_record' || (hint && hint !== 'auto' && hint !== type)) result = manualReview('UNSUPPORTED_OR_MISMATCHED_DOCUMENT_TYPE', fullText);
      else {
        const candidate = await withDeadline(signal => this.structured.extract(ocr, type, signal), this.timeoutMs, 'STRUCTURED_UNAVAILABLE', input.signal);
        result = { ...parseStructuredResult(candidate, ocr, this.threshold), contractVersion: 2, status: 'extracted', processingTimeMs: 0, deskewApplied: false };
      }
    } catch (error) {
      const code = error instanceof DocumentPipelineError ? error.code : fullText ? 'STRUCTURED_UNAVAILABLE' : 'OCR_UNAVAILABLE';
      result = manualReview(code, fullText);
      if (code.startsWith('OCR_')) result.warnings.unshift('OCR provider unavailable');
    }
    return { ...result, processingTimeMs: Date.now() - start, deskewApplied: !!input.deskewApplied };
  }
}
