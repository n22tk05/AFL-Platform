export type DetailedBox = [number, number, number, number];
export type DetailedPoint = [number, number];
export const DETAIL_KINDS = ['page', 'region', 'table', 'cell', 'line', 'word', 'word_group', 'checkbox', 'guide_line', 'unknown_region'] as const;
export type DetailKind = typeof DETAIL_KINDS[number];
export interface DetailedElement {
  id: string; parentId: string | null; page: 1; kind: DetailKind; order: number;
  bbox: DetailedBox; normalizedBox: DetailedBox; polygon: DetailedPoint[];
  processedBox: DetailedBox; cropBox: DetailedBox;
  textRaw: string; textReviewed?: string; ocrConfidence: number | null;
  recognitionStatus: 'recognized' | 'blank' | 'unreadable' | 'not_applicable';
  geometryOrigin: 'pixel_detector';
  textOrigin: 'none' | 'line_crop_ocr' | 'word_crop_ocr' | 'line_token_alignment';
  reviewReasons: string[]; readingOrder?: number;
  rowIndex?: number; columnIndex?: number; rowSpan?: number; columnSpan?: number;
  checkboxState?: 'checked' | 'unchecked' | 'unknown';
  labelIds?: string[];
}
export interface DetailedDocument {
  schemaVersion: 'detailed-1.0'; status: 'complete' | 'partial'; requiresReview: true;
  coordinateSystem: 'source-oriented-pixels-xyxy'; pixelBounds: 'half-open';
  source: { width: number; height: number }; processed: { width: number; height: number };
  transforms: { sourceToProcessed: number[][]; processedToSource: number[][]; skewDegrees: number };
  provider: { name: 'vietocr-local'; model: string; wordRecognition: boolean };
  elements: DetailedElement[]; warnings: string[]; fullText: string;
  coverage: { inkPixels: number; unassignedInkPixels: number; explainedInkRatio: number; isCompletenessGuarantee: false };
  counts: Partial<Record<DetailKind, number>>; timingMs: { detection: number; recognition: number; total: number };
}
