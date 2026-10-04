import type { DocumentOcrInput, DocumentOcrProvider } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError } from '../errors';
import { runAdaptiveOcr } from '../adaptive-ocr';
import { assembleMarkdown } from '../markdown-assembler';
import { validateMarkdown } from '../markdown-validator';
import { MARKDOWN_LIMITS, type MarkdownDraft } from '../markdown.types';

/** VietOCR -> deterministic assembly -> validation -> human review. No LLM. */
export class MarkdownExportService {
  constructor(private readonly ocr: DocumentOcrProvider) {}

  async convert(input: DocumentOcrInput): Promise<MarkdownDraft> {
    const adaptive = await runAdaptiveOcr({ providerId: this.ocr.providerId, extract: async image => {
      const output = await this.ocr.extract(image);
      if (output.provider !== 'vietocr') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
      return output;
    } }, input, MARKDOWN_LIMITS.timeoutMs);
    const result = adaptive.ocr;
    if (!result) throw new DocumentPipelineError(adaptive.errorCode ?? 'OCR_UNAVAILABLE', adaptive.review);
    if (result.provider !== 'vietocr') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
    if (result.pageCount !== 1 || result.fullText.length > DOCUMENT_LIMITS.ocrCharacters || result.fullText.split(/\r\n?|\n/).length > DOCUMENT_LIMITS.ocrLines) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
    if (!result.fullText.trim() || input.imageWarnings?.includes('POSSIBLE_BLANK')) {
      return { provider: result.provider, rawText: result.fullText, markdown: '', pageCount: result.pageCount,
        confidence: null, warnings: [...adaptive.review.warnings, 'Chưa đọc được vùng này. Đối chiếu ảnh nguồn; chụp lại là lựa chọn bổ sung.'],
        contractVersion: 1, status: 'review_required', validation: validateMarkdown(''), ocrReview: adaptive.review };
    }
    const assembled = assembleMarkdown(result);
    const validation = validateMarkdown(assembled.markdown);
    if (validation.issues.some(issue => issue.code === 'MARKDOWN_TOO_LARGE')) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
    const scores = result.tokens.length ? result.tokens.map(token => token.confidence) : result.lines.map(line => line.confidence);
    const confidence = scores.length && scores.every(score => score !== null && Number.isFinite(score) && score >= 0 && score <= 1)
      ? (scores as number[]).reduce((minimum, score) => Math.min(minimum, score), 1) : null;
    const warnings = [...result.warnings.map(code => `Cảnh báo OCR: ${code}`), ...assembled.warnings];
    if (confidence === null) warnings.push('Không đủ điểm tin cậy OCR; hãy đối chiếu toàn bộ nội dung với ảnh.');
    else if (confidence < DOCUMENT_LIMITS.acceptanceThreshold) warnings.push('Có vùng chữ có điểm tin cậy thấp; cần đối chiếu tên riêng, số liệu và dấu tiếng Việt.');
    return { provider: result.provider, rawText: result.fullText, markdown: validation.markdown,
      pageCount: result.pageCount, confidence, warnings, contractVersion: 1, status: 'review_required', validation, ocrReview: adaptive.review };
  }
}
