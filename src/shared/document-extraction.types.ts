import type { NormalizedBoundingBox } from './contracts';
export type { NormalizedBoundingBox } from './contracts';
export type OcrVariant = 'primary' | 'contrast' | 'lighting';
export interface OcrImageVariant {
  variant: 'contrast' | 'lighting'; bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png';
  width: number; height: number; scaleX: number; scaleY: number;
}
export interface DocumentOcrInput {
  bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png'; signal?: AbortSignal;
  imageDimensions?: { width: number; height: number };
  enhancements?: OcrImageVariant[]; imageWarnings?: string[]; documentDetectionFailed?: boolean;
}
export interface OcrToken {
  id: string;
  text: string;
  confidence: number | null;
  /** [ymin, xmin, ymax, xmax] relative to the processed page, never pixels. */
  boundingBox: NormalizedBoundingBox | null;
  page: number;
}
export interface OcrLine extends OcrToken { tokenIds: string[] }
/** Unicode character offsets into fullText, end exclusive. */
export interface OcrTextRange { start: number; end: number }
export interface OcrTableCell {
  text: string;
  /** Provider line IDs identify even empty cells; never inferred from text. */
  sourceLineIds?: string[];
  sourceRanges: OcrTextRange[];
  rowSpan: number;
  columnSpan: number;
}
export interface OcrTable {
  id: string;
  page: number;
  headerRowCount: number;
  rows: OcrTableCell[][];
}
export interface DocumentOcrResult {
  provider: string;
  model?: string;
  readingOrder?: 'provider' | 'geometric-heuristic' | 'text-splitting';
  pages?: { page: number; status: 'success' | 'failed'; error: string | null; width: number | null; height: number | null }[];
  fullText: string;
  tokens: OcrToken[];
  lines: OcrLine[];
  pageCount: number;
  warnings: string[];
  /** Optional provider-supplied table layout, never inferred by an LLM. */
  tables?: OcrTable[];
}
export interface DocumentOcrProvider { readonly providerId?: string; extract(input: DocumentOcrInput): Promise<DocumentOcrResult> }
export interface OcrAttempt {
  attempt: number; variant: OcrVariant; provider: string; timingMs: number;
  scaleX: number; scaleY: number; raw: DocumentOcrResult | null; errorCode?: string;
}
export interface OcrReviewRegion {
  boundingBox: NormalizedBoundingBox | null;
  status: 'recognitionUncertain' | 'unreadable'; reason: string;
  sources: { attempt: number; lineId: string; text: string; boundingBox: NormalizedBoundingBox | null }[];
}
export interface OcrReview {
  attempts: OcrAttempt[]; selectedAttempt: number; selectionReason: string;
  regions: OcrReviewRegion[]; warnings: string[]; requiresReview: boolean;
  documentDetectionFailed: boolean;
}
export type DocumentType = 'traffic_violation_record' | 'citizen_identity_card' | 'land_document' | 'unknown';
export type ExtractedFieldStatus = 'accepted' | 'needs_review' | 'unreadable';
export interface ExtractedField<T = unknown> {
  key: string;
  label: string;
  value: T | null;
  rawText: string | null;
  confidence: number;
  evidenceText: string | null;
  sourceLineIds: string[];
  sourceBoundingBoxes: NormalizedBoundingBox[];
  status: ExtractedFieldStatus;
  validationErrors: string[];
}
export interface StructuredDocumentResult {
  documentType: DocumentType;
  fields: Record<string, ExtractedField>;
  fullText: string;
  overallConfidence: number;
  requiresReview: boolean;
  warnings: string[];
}
/** Versioned migration of the old array contract; all in-repo consumers use v2. */
export interface DocumentExtractionResult extends StructuredDocumentResult {
  contractVersion: 2;
  status: 'extracted' | 'manual_review_required';
  processingTimeMs: number;
  deskewApplied: boolean;
  ocrReview?: OcrReview;
}
export interface StructuredExtractionProvider {
  classify(ocr: DocumentOcrResult, signal?: AbortSignal): Promise<DocumentType>;
  extract(ocr: DocumentOcrResult, type: 'traffic_violation_record', signal?: AbortSignal): Promise<unknown>;
}
