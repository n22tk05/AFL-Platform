/** Export v1 uses XYXY, unlike the legacy OCR/Form YXYX contract. */
export type ExportBox = [number, number, number, number];
export type ContentType = 'national_heading' | 'motto' | 'document_title' | 'document_code' | 'date_line' | 'section_heading' | 'field_label_value' | 'field_label' | 'blank_input' | 'checkbox_item' | 'signature_title' | 'signature_instruction' | 'bullet_item' | 'legal_reference' | 'blank_line' | 'unknown';
export interface SourceLine {
  id: string; page: number | null; order: number; text: string; newline: string;
  start: number; end: number; provenance: 'text-splitting';
}
export interface SourceBlock {
  id: string; providerId: string; page: number; order: number; text: string;
  bbox: ExportBox | null; confidence: number | null; kind: 'line' | 'token';
}
export interface Evidence {
  method: 'regex' | 'none' | 'provider_layout' | 'pixel_heuristic'; rule: string | null;
  verified: boolean;
}
export interface GroundedNode {
  id: string; type: ContentType; text: string; page: number | null; order: number;
  sourceLineIds: string[]; sourceBlockIds: string[];
  status: 'needs_review' | 'confirmed'; evidence: Evidence; reviewReasons: string[];
}
export interface ExportField {
  id: string; nodeId: string; label: string; rawValue: string | null; normalizedValue: string | null;
  valueState: 'observed' | 'blank' | 'unreadable'; status: 'needs_review' | 'confirmed';
  evidence: Evidence; reviewReasons: string[]; sourceLineIds: string[]; sourceBlockIds: string[];
}
export interface ExportCheckbox {
  id: string; nodeId: string; label: string; state: 'checked' | 'unchecked' | 'unknown';
  evidence: Evidence; status: 'needs_review' | 'confirmed'; reviewReasons: string[];
  sourceLineIds: string[]; sourceBlockIds: string[];
}
export interface ExportTableCell {
  rowIndex: number; columnIndex: number; rowSpan: number; columnSpan: number;
  rawValue: string; normalizedValue: string | null; sourceLineIds: string[]; sourceBlockIds: string[];
  sourceRanges: { start: number; end: number }[];
}
export interface DocumentJsonExport {
  schemaVersion: '1.0.0'; documentId: string; status: 'success' | 'partial' | 'failed';
  provider: { name: string; model: string | null };
  source: { mimeType: 'image/png' | 'image/jpeg'; pageCount: number; frame: 'processed-primary'; deskewApplied: boolean | null };
  rawText: string;
  pages: { page: number; status: 'success' | 'failed'; error: string | null; width: number | null; height: number | null; coordinateSystem: 'normalized-xyxy'; readingOrder: 'provider' | 'geometric-heuristic' | 'text-splitting' }[];
  lines: SourceLine[]; blocks: SourceBlock[]; nodes: GroundedNode[];
  structure: {
    headers: string[]; titles: string[]; dateLines: string[];
    sections: { id: string; headingNodeId: string; nodeIds: string[] }[];
    fields: ExportField[]; checkboxes: ExportCheckbox[];
    tables: { id: string; page: number; headerRowCount: number; rows: ExportTableCell[][]; evidence: Evidence; status: 'needs_review' }[];
    signatures: { nodeId: string; identity: null; evidence: Evidence; status: 'needs_review' }[];
    freeText: string[]; unclassified: string[];
  };
  warnings: string[]; requiresReview: boolean;
  review: {
    selectedAttempt: number | null; selectionReason: string | null;
    attempts: { attempt: number; variant: string; provider: string; rawText: string | null; blocks: SourceBlock[]; errorCode: string | null }[];
    regions: { bbox: ExportBox | null; reason: string; status: string }[];
  };
}
