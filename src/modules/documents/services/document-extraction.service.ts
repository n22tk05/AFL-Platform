import type { DocumentExtractionResult, DocumentOcrInput, DocumentOcrProvider, StructuredExtractionProvider, OcrReview } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError, withDeadline } from '../errors';
import { parseStructuredResult } from '../validation';
import { runAdaptiveOcr } from '../adaptive-ocr';

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
    let ocrReview: OcrReview | undefined;
    let result: DocumentExtractionResult;
    try {
      const adaptive = await runAdaptiveOcr(this.ocr, input, this.timeoutMs);
      ocrReview = adaptive.review;
      const ocr = adaptive.ocr;
      if (!ocr) throw new DocumentPipelineError(adaptive.errorCode ?? 'OCR_UNAVAILABLE');
      fullText = ocr.fullText;
      if (fullText.length > DOCUMENT_LIMITS.ocrCharacters || ocr.lines.length > DOCUMENT_LIMITS.ocrLines) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
      if (!fullText.trim() || !ocr.lines.length || ocr.pageCount !== 1 || input.imageWarnings?.includes('POSSIBLE_BLANK')) {
        return { ...manualReview('OCR_EMPTY_OR_UNSUPPORTED_PAGES', fullText), warnings: [...ocr.warnings, 'OCR_EMPTY_OR_UNSUPPORTED_PAGES'], ocrReview,
          deskewApplied: !!input.deskewApplied, processingTimeMs: Date.now() - start };
      }
      const type = await withDeadline(signal => this.structured.classify(ocr, signal), this.timeoutMs, 'STRUCTURED_UNAVAILABLE', input.signal);
      const hint = input.documentHint === 'traffic_ticket' ? 'traffic_violation_record' : input.documentHint;
      if (type !== 'traffic_violation_record' || (hint && hint !== 'auto' && hint !== type)) result = manualReview('UNSUPPORTED_OR_MISMATCHED_DOCUMENT_TYPE', fullText);
      else {
        const candidate = await withDeadline(signal => this.structured.extract(ocr, type, signal), this.timeoutMs, 'STRUCTURED_UNAVAILABLE', input.signal);
        result = { ...parseStructuredResult(candidate, ocr, this.threshold), contractVersion: 2, status: 'extracted', processingTimeMs: 0, deskewApplied: false };
        // Review metadata never enters Session RAM. Uncertain source regions and
        // disagreement invalidate automatic acceptance, even with high confidence.
        if (ocrReview.requiresReview) {
          for (const field of Object.values(result.fields)) if (field.status === 'accepted') {
            field.status = 'needs_review'; field.validationErrors.push('Cần xác nhận thủ công do chất lượng ảnh hoặc đối chiếu OCR.');
          }
          result.requiresReview = true;
        }
      }
    } catch (error) {
      const code = error instanceof DocumentPipelineError ? error.code : fullText ? 'STRUCTURED_UNAVAILABLE' : 'OCR_UNAVAILABLE';
      result = manualReview(code, fullText);
      if (code.startsWith('OCR_')) result.warnings.unshift('OCR provider unavailable');
    }
    return { ...result, ocrReview, warnings: Array.from(new Set([...result.warnings, ...ocrReview?.warnings ?? []])),
      processingTimeMs: Date.now() - start, deskewApplied: !!input.deskewApplied };
  }
}
