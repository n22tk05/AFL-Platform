import type { NormalizedBoundingBox } from './contracts';
export type { NormalizedBoundingBox } from './contracts';
export interface DocumentOcrInput { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png'; signal?: AbortSignal }
export interface OcrToken {
  id: string;
  text: string;
  confidence: number | null;
  /** [ymin, xmin, ymax, xmax] relative to the processed page, never pixels. */
  boundingBox: NormalizedBoundingBox;
  page: number;
}
export interface OcrLine extends OcrToken { tokenIds: string[] }
export interface DocumentOcrResult {
  provider: string;
  fullText: string;
  tokens: OcrToken[];
  lines: OcrLine[];
  pageCount: number;
  warnings: string[];
}
export interface DocumentOcrProvider { extract(input: DocumentOcrInput): Promise<DocumentOcrResult> }
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
}
export interface StructuredExtractionProvider {
  classify(ocr: DocumentOcrResult, signal?: AbortSignal): Promise<DocumentType>;
  extract(ocr: DocumentOcrResult, type: 'traffic_violation_record', signal?: AbortSignal): Promise<unknown>;
}
