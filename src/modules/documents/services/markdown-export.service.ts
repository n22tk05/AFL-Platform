import type { DocumentOcrInput, DocumentOcrProvider } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from '../config';
import { DocumentPipelineError, withDeadline } from '../errors';

export interface MarkdownOutlineProvider {
  headingLines(text: string, signal?: AbortSignal): Promise<number[]>;
}

/** Gemini supplies structure; the exported words always come from Document AI. */
export class MarkdownExportService {
  constructor(private readonly ocr: DocumentOcrProvider, private readonly outline: MarkdownOutlineProvider) {}

  async convert(input: DocumentOcrInput): Promise<string> {
    const result = await withDeadline(signal => this.ocr.extract({ ...input, signal }), DOCUMENT_LIMITS.timeoutMs, 'OCR_TIMEOUT', input.signal);
    const fullText = result.fullText;
    if (!fullText.trim()) throw new DocumentPipelineError('OCR_EMPTY_TEXT');
    if (fullText.length > DOCUMENT_LIMITS.ocrCharacters || result.lines.length > DOCUMENT_LIMITS.ocrLines || result.pageCount !== 1) {
      throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
    }
    const lines = fullText.replace(/\r\n/g, '\n').split('\n');
    const headings = await withDeadline(signal => this.outline.headingLines(fullText, signal), DOCUMENT_LIMITS.timeoutMs, 'STRUCTURED_UNAVAILABLE', input.signal);
    if (!Array.isArray(headings) || headings.some(n => !Number.isInteger(n) || n < 1 || n > lines.length)) {
      throw new DocumentPipelineError('INVALID_STRUCTURED_RESPONSE');
    }
    const selected = new Set(headings);
    const markdown = lines.map((line, index) => selected.has(index + 1) && line.trim() ? `# ${line}` : line).join('\n');
    return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  }
}
