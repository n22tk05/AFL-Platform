import type { DocumentOcrInput, DocumentOcrProvider } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError, withDeadline } from '../errors';
import { assembleMarkdown } from '../markdown-assembler';
import { validateMarkdown } from '../markdown-validator';
import { MARKDOWN_LIMITS, type MarkdownDraft } from '../markdown.types';

/** Google OCR -> deterministic assembly -> validation -> human review. No LLM. */
export class MarkdownExportService {
  constructor(private readonly ocr: DocumentOcrProvider) {}

  async convert(input: DocumentOcrInput): Promise<MarkdownDraft> {
    const result = await withDeadline(signal => this.ocr.extract({ ...input, signal }), MARKDOWN_LIMITS.timeoutMs, 'OCR_TIMEOUT', input.signal);
    if (result.provider !== 'google-document-ai' && result.provider !== 'vietocr') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
    if (result.pageCount !== 1 || result.fullText.length > DOCUMENT_LIMITS.ocrCharacters || result.fullText.split(/\r\n?|\n/).length > DOCUMENT_LIMITS.ocrLines) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
    if (!result.fullText.trim()) throw new DocumentPipelineError('OCR_EMPTY_TEXT');
    const assembled = assembleMarkdown(result);
    const validation = validateMarkdown(assembled.markdown);
    if (validation.issues.some(issue => issue.code === 'MARKDOWN_TOO_LARGE')) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
    const scores = result.tokens.length ? result.tokens.map(token => token.confidence) : result.lines.map(line => line.confidence);
    const confidence = scores.length && scores.every(score => score !== null && Number.isFinite(score) && score >= 0 && score <= 1)
      ? (scores as number[]).reduce((minimum, score) => Math.min(minimum, score), 1) : null;
    const warnings = [...result.warnings.map(code => `Cảnh báo OCR: ${code}`), ...assembled.warnings];
    if (confidence === null) warnings.push('Không đủ điểm tin cậy OCR; hãy đối chiếu toàn bộ nội dung với ảnh.');
    else if (confidence < DOCUMENT_LIMITS.acceptanceThreshold) warnings.push('Có vùng chữ có điểm tin cậy thấp; cần đối chiếu tên riêng, số liệu và dấu tiếng Việt.');
    return { provider: result.provider as 'google-document-ai' | 'vietocr', rawText: result.fullText, markdown: validation.markdown,
      pageCount: result.pageCount, confidence, warnings, contractVersion: 1, status: 'review_required', validation };
  }
}
