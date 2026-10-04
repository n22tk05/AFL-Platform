import { DOCUMENT_LIMITS } from './config';
import type { OcrReview } from '@/shared/document-extraction.types';

export interface MarkdownIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}
export interface MarkdownValidation {
  markdown: string;
  valid: boolean;
  issues: MarkdownIssue[];
}
export interface MarkdownDraft {
  contractVersion: 1;
  status: 'review_required';
  provider: 'google-document-ai' | 'vietocr' | 'offline-demo';
  /** Exact provider text, before escaping or adding Markdown syntax. */
  rawText: string;
  markdown: string;
  pageCount: number;
  confidence: number | null;
  warnings: string[];
  validation: MarkdownValidation;
  ocrReview?: OcrReview;
}
export const MARKDOWN_LIMITS = Object.freeze({
  timeoutMs: DOCUMENT_LIMITS.timeoutMs,
  // Escaping source punctuation and table delimiters can expand raw OCR text.
  markdownCharacters: DOCUMENT_LIMITS.ocrCharacters * 8,
});
