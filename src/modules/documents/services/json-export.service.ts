import { randomUUID } from 'node:crypto';
import type { DocumentOcrInput, DocumentOcrProvider } from '@/shared/document-extraction.types';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError } from '../errors';
import { runAdaptiveOcr } from '../adaptive-ocr';
import { assembleJson } from '../json-assembler';
import { validateJsonExport } from '../json-validator';
/** No LLM. One stable ID across the bounded OCR attempts and review/export. */
export class JsonExportService {
  constructor(private readonly ocr: DocumentOcrProvider) {}
  async convert(input: DocumentOcrInput & { deskewApplied?: boolean }): Promise<DocumentJsonExport> {
    const documentId = randomUUID();
    const adaptive = await runAdaptiveOcr({ providerId: this.ocr.providerId, extract: async image => {
      const output = await this.ocr.extract(image);
      if (output.provider !== 'vietocr') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
      if (typeof output.fullText !== 'string' || !Array.isArray(output.lines) || !Array.isArray(output.tokens)
        || !Number.isInteger(output.pageCount) || output.pageCount < 1 || output.pageCount > 100) throw new DocumentPipelineError('OCR_INVALID_RESPONSE');
      return output;
    } }, input, DOCUMENT_LIMITS.timeoutMs);
    const result = adaptive.ocr ?? { provider: this.ocr.providerId ?? 'vietocr', fullText: '', lines: [], tokens: [], pageCount: 1,
      pages: [{ page: 1, status: 'failed' as const, error: adaptive.errorCode ?? 'OCR_UNAVAILABLE', width: null, height: null }], warnings: adaptive.review.warnings };
    const document = assembleJson(result, { documentId, mimeType: input.mimeType, imageDimensions: input.imageDimensions, deskewApplied: input.deskewApplied, review: adaptive.review });
    const validation = validateJsonExport(document, result);
    if (!validation.valid) throw new DocumentPipelineError('OCR_INVALID_RESPONSE', adaptive.review);
    return document;
  }
}
