import sharp from 'sharp';
import type { DocumentOcrInput, DocumentOcrProvider, DocumentOcrResult, OcrReview, OcrReviewRegion, NormalizedBoundingBox } from '@/shared/document-extraction.types';
import { ADAPTIVE_IMAGE_CONFIG as CONFIG, DOCUMENT_LIMITS } from './config';
import { DocumentPipelineError, withDeadline, type DocumentErrorCode } from './errors';
import { spaces, validBox } from './validation';

const letterOrNumber = new RegExp('[\\p{L}\\p{N}]', 'u');
const readable = (ocr: DocumentOcrResult) => ocr.pageCount === 1 && letterOrNumber.test(ocr.fullText);
const damaged = (text: string) => /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
// Observed numeric strings, not inferred field values or completeness estimates.
const numbers = (text: string) => Array.from(text.matchAll(/\d(?:[\d.,/\- ]*\d)?/g), m => m[0].trim()).sort();
const signature = (text: string) => JSON.stringify(numbers(text));
export function needsOcrRetry(ocr: DocumentOcrResult): boolean {
  if (!readable(ocr) || !ocr.lines.length || damaged(ocr.fullText) || ocr.warnings.length) return true;
  const scores = ocr.tokens.length ? ocr.tokens : ocr.lines;
  return scores.some(t => t.confidence === null || !Number.isFinite(t.confidence) || t.confidence < 0 || t.confidence > 1 || !validBox(t.boundingBox))
    || scores.filter(t => t.confidence !== null && t.confidence < CONFIG.retryConfidence).length / scores.length >= CONFIG.lowConfidenceFraction;
}
function iou(a: NormalizedBoundingBox, b: NormalizedBoundingBox) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (v: NormalizedBoundingBox) => (v[2] - v[0]) * (v[3] - v[1]);
  return intersection / (area(a) + area(b) - intersection);
}
function checkLimits(ocr: DocumentOcrResult) {
  if (ocr.fullText.length > DOCUMENT_LIMITS.ocrCharacters || ocr.lines.length > DOCUMENT_LIMITS.ocrLines
    || ocr.tokens.length > DOCUMENT_LIMITS.ocrCharacters || ocr.fullText.split(/\r\n?|\n/).length > DOCUMENT_LIMITS.ocrLines)
    throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
}
/** Primary wins by default. No confidence/length contest, concatenation or model
 * arbitration. Only mutually unique geometric matches may be called aligned. */
export function reconcileOcr(review: OcrReview): DocumentOcrResult | null {
  const successful = review.attempts.filter(a => a.raw !== null);
  const primary = successful[0]; if (!primary?.raw) return null;
  const second = successful[1]; let chosen = primary;
  if (second?.raw && readable(second.raw) && !damaged(second.raw.fullText)
    && (!readable(primary.raw) || (damaged(primary.raw.fullText) && signature(primary.raw.fullText) === signature(second.raw.fullText)))) {
    chosen = second;
    review.selectionReason = !readable(primary.raw) ? 'PRIMARY_EMPTY_ENHANCED_READABLE' : 'PRIMARY_DAMAGED_SAME_NUMERIC_STRINGS';
    review.warnings.push('OCR_ENHANCED_SELECTED_REVIEW');
  } else review.selectionReason = 'PRESERVE_PRIMARY_WITHOUT_RELIABLE_EVIDENCE_TO_REPLACE';
  review.selectedAttempt = chosen.attempt; const ocr = chosen.raw!;
  const region = (boundingBox: OcrReviewRegion['boundingBox'], reason: string, sources: OcrReviewRegion['sources'], status: OcrReviewRegion['status'] = 'recognitionUncertain') => {
    review.regions.push({ boundingBox, status, reason, sources });
  };
  for (const item of [...ocr.lines, ...ocr.tokens]) {
    if (item.confidence === null || !Number.isFinite(item.confidence) || item.confidence < CONFIG.retryConfidence || item.confidence > 1 || !validBox(item.boundingBox))
      region(validBox(item.boundingBox) ? item.boundingBox : null, item.confidence === null ? 'OCR_CONFIDENCE_MISSING' : 'OCR_LOW_CONFIDENCE_OR_GEOMETRY',
        [{ attempt: chosen.attempt, lineId: item.id, text: item.text, boundingBox: item.boundingBox }]);
  }
  if (second?.raw) {
    const a = primary.raw, b = second.raw;
    for (const line of a.lines) {
      if (!validBox(line.boundingBox)) continue;
      const matches = b.lines.filter(other => validBox(other.boundingBox) && iou(line.boundingBox, other.boundingBox) >= CONFIG.alignmentIou);
      if (matches.length !== 1) continue;
      const other = matches[0];
      const reverse = a.lines.filter(candidate => validBox(candidate.boundingBox) && iou(candidate.boundingBox, other.boundingBox) >= CONFIG.alignmentIou);
      if (reverse.length !== 1 || spaces(line.text) === spaces(other.text)) continue;
      const reason = signature(line.text) !== signature(other.text) ? 'OCR_NUMERIC_DISAGREEMENT' : 'OCR_TEXT_DISAGREEMENT';
      region(chosen === primary ? line.boundingBox : other.boundingBox, reason, [
        { attempt: primary.attempt, lineId: line.id, text: line.text, boundingBox: line.boundingBox },
        { attempt: second.attempt, lineId: other.id, text: other.text, boundingBox: other.boundingBox },
      ]);
    }
    if (signature(a.fullText) !== signature(b.fullText)) {
      review.warnings.push('OCR_NUMERIC_DISAGREEMENT'); region(null, 'OCR_NUMERIC_DISAGREEMENT', []);
    }
    if (spaces(a.fullText) !== spaces(b.fullText)) {
      review.warnings.push('OCR_TEXT_DISAGREEMENT'); region(null, 'OCR_TEXT_DISAGREEMENT', []);
    }
    if (!readable(a) && readable(b)) region(null, 'PRIMARY_UNREADABLE_ENHANCED_REQUIRES_REVIEW', []);
  }
  if (!readable(ocr)) region([0, 0, 1, 1], 'OCR_EMPTY_TEXT', [], 'unreadable');
  if (!ocr.lines.length && readable(ocr)) region(null, 'OCR_NO_LINE_GEOMETRY', []);
  if (review.warnings.includes('POSSIBLE_GLARE')) region(null, 'POSSIBLE_GLARE_REQUIRES_SOURCE_CHECK', []);
  if (review.warnings.includes('POSSIBLE_BLANK')) region([0, 0, 1, 1], 'POSSIBLE_BLANK_REQUIRES_SOURCE_CHECK', []);
  review.warnings = Array.from(new Set([...review.warnings, ...ocr.warnings]));
  review.requiresReview = review.regions.length > 0 || review.warnings.length > 0 || review.documentDetectionFailed;
  return { ...ocr, warnings: Array.from(new Set([...ocr.warnings, ...review.warnings])) };
}
/** Only after weak OCR on an otherwise clear primary: a non-generative server
 * fallback, without changing providers. Client OpenCV candidates are preferred. */
async function fallbackContrast(input: DocumentOcrInput) {
  const metadata = await sharp(input.bytes, { limitInputPixels: DOCUMENT_LIMITS.imagePixels, failOn: 'warning' }).metadata();
  const bytes = await sharp(input.bytes, { limitInputPixels: DOCUMENT_LIMITS.imagePixels, failOn: 'warning' }).grayscale().blur(CONFIG.denoiseSigma)
    .linear(CONFIG.contrastGain, CONFIG.contrastCenter * (1 - CONFIG.contrastGain))
    .sharpen({ sigma: CONFIG.unsharpSigma, m1: CONFIG.unsharpAmount, m2: CONFIG.unsharpAmount }).png().toBuffer();
  if (bytes.length > DOCUMENT_LIMITS.fileBytes) throw new DocumentPipelineError('OCR_LIMIT_EXCEEDED');
  return { variant: 'contrast' as const, bytes, mimeType: 'image/png' as const, scaleX: 1, scaleY: 1, width: metadata.width!, height: metadata.height! };
}
export async function runAdaptiveOcr(provider: DocumentOcrProvider, input: DocumentOcrInput, timeoutMs = DOCUMENT_LIMITS.timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
  const started = Date.now();
  const review: OcrReview = { attempts: [], selectedAttempt: 0, selectionReason: '', regions: [], warnings: [...input.imageWarnings ?? []], requiresReview: true,
    documentDetectionFailed: !!input.documentDetectionFailed };
  let errorCode: DocumentErrorCode | undefined;
  for (let attempt = 1; attempt <= CONFIG.maxAttempts; attempt++) {
    let image: Pick<DocumentOcrInput, 'bytes' | 'mimeType'> & { variant: 'primary' | 'contrast' | 'lighting'; scaleX: number; scaleY: number } = { ...input, variant: 'primary', scaleX: 1, scaleY: 1 };
    if (attempt > 1) {
      const first = review.attempts[0]?.raw;
      if (!first || !needsOcrRetry(first) || input.signal?.aborted || Date.now() - started >= timeoutMs) break;
      try {
        const preferLighting = input.imageWarnings?.some(w => ['POSSIBLE_GLARE', 'UNEVEN_LIGHTING'].includes(w));
        image = input.enhancements?.find(v => v.variant === (preferLighting ? 'lighting' : 'contrast')) ?? input.enhancements?.[0] ?? await fallbackContrast(input);
      } catch { review.warnings.push('ENHANCEMENT_UNAVAILABLE'); break; }
    }
    const callStarted = Date.now(); if (input.signal?.aborted || callStarted - started >= timeoutMs) break;
    try {
      // One image only; SDK retries stay disabled. Attempts share one time budget.
      const raw = await withDeadline(signal => provider.extract({ bytes: image.bytes, mimeType: image.mimeType, signal }), timeoutMs - (callStarted - started), 'OCR_TIMEOUT', input.signal);
      checkLimits(raw);
      review.attempts.push({ attempt, variant: image.variant, provider: raw.provider, timingMs: Date.now() - callStarted, scaleX: image.scaleX, scaleY: image.scaleY, raw });
    } catch (error) {
      errorCode = error instanceof DocumentPipelineError ? error.code : 'OCR_UNAVAILABLE';
      review.attempts.push({ attempt, variant: image.variant, provider: provider.providerId ?? review.attempts[0]?.provider ?? 'unavailable', timingMs: Date.now() - callStarted,
        scaleX: image.scaleX, scaleY: image.scaleY, raw: null, errorCode });
      review.warnings.push(attempt === 1 ? errorCode : `OCR_RETRY_FAILED_${errorCode}`);
      break; // Never retry auth, configuration, input, quota, transport or timeout errors.
    }
  }
  const ocr = reconcileOcr(review);
  if (!ocr && !errorCode) { errorCode = 'OCR_TIMEOUT'; review.warnings.push(errorCode); }
  if (!ocr) {
    review.selectionReason = 'OCR_NOT_COMPLETED';
    review.regions.push({ boundingBox: [0, 0, 1, 1], status: 'unreadable', reason: errorCode ?? 'OCR_UNAVAILABLE', sources: [] });
  }
  return { ocr, review, errorCode };
}
