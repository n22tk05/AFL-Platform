import type { DocumentOcrResult, OcrReview } from '@/shared/document-extraction.types';
import type { DocumentJsonExport, SourceLine, SourceBlock, GroundedNode, ExportBox } from '@/shared/document-export.types';
import { classifyLine, CHECKBOX_REGEX } from './json-content-classifier';
import { extractFields } from './json-field-extractor';
import { assembleTablesFromOcr } from './json-table-assembler';

export function exportBox(box: readonly number[] | null | undefined): ExportBox | null {
  return box == null ? null : [box[1], box[0], box[3], box[2]];
}
export function sourceBlocks(ocr: DocumentOcrResult): SourceBlock[] {
  return [...ocr.lines.map(line => ({ line, kind: 'line' as const })), ...ocr.tokens.map(line => ({ line, kind: 'token' as const }))].map(({ line, kind }, order) => ({
    id: `block-${order}`, providerId: line.id, page: line.page, order, text: line.text,
    bbox: exportBox(line.boundingBox), confidence: line.confidence ?? null, kind,
  }));
}
/** Preserve exact separators including CRLF, trailing newline and blank lines.
 * Offsets are JavaScript UTF-16 code units, end exclusive. */
export function splitSourceText(rawText: string): SourceLine[] {
  const lines: SourceLine[] = []; let start = 0;
  for (const match of rawText.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ id: `line-${lines.length}`, page: null, order: lines.length, text: rawText.slice(start, match.index), newline: match[0], start, end: match.index!, provenance: 'text-splitting' });
    start = match.index! + match[0].length;
  }
  lines.push({ id: `line-${lines.length}`, page: null, order: lines.length, text: rawText.slice(start), newline: '', start, end: rawText.length, provenance: 'text-splitting' });
  return lines;
}
export interface AssemblyOptions {
  documentId: string; mimeType: 'image/jpeg' | 'image/png';
  imageDimensions?: { width: number; height: number }; deskewApplied?: boolean; review?: OcrReview;
}
export function assembleJson(ocr: DocumentOcrResult, options: AssemblyOptions): DocumentJsonExport {
  if (!Number.isInteger(ocr.pageCount) || ocr.pageCount < 1 || ocr.pageCount > 100) throw new Error('INVALID_OCR_PAGE_COUNT');
  const lines = splitSourceText(ocr.fullText), blocks = sourceBlocks(ocr);
  const warnings = [...ocr.warnings, 'OCR_ACCURACY_NOT_MEASURED', 'TEXT_CLASSIFICATION_REQUIRES_REVIEW', 'NO_VERIFIED_IMAGE_SIGNATURE_OR_STAMP_DETECTOR'];
  if (!ocr.model) warnings.push('PROVIDER_MODEL_NOT_REPORTED');
  const mapping = new Map<string, SourceLine>(); let cursor = 0;
  for (const block of blocks.filter(b => b.kind === 'line')) {
    const index = lines.findIndex((line, i) => i >= cursor && line.text === block.text);
    if (index >= 0) { mapping.set(block.id, lines[index]); lines[index].page = block.page; cursor = index + 1; }
    else warnings.push('PROVIDER_LINE_NOT_ALIGNED_WITH_FULL_TEXT');
  }
  const used = new Set([...mapping.values()].map(l => l.id));
  const entries: { node: GroundedNode; rank: number }[] = [];
  const make = (text: string, page: number | null, sourceLineIds: string[], sourceBlockIds: string[]): GroundedNode => ({
    id: '', ...classifyLine(text), text, page, order: 0, sourceLineIds, sourceBlockIds,
    status: 'needs_review', reviewReasons: ['COMPARE_WITH_SOURCE_IMAGE'],
  });
  for (const block of blocks) {
    const line = mapping.get(block.id);
    entries.push({ node: make(block.text, block.page, line ? [line.id] : [], [block.id]), rank: block.order });
  }
  for (const line of lines.filter(l => !used.has(l.id))) {
    const before = blocks.filter(b => mapping.has(b.id) && mapping.get(b.id)!.order < line.order).at(-1);
    const after = blocks.find(b => mapping.has(b.id) && mapping.get(b.id)!.order > line.order);
    const page = ocr.pageCount === 1 ? 1 : before?.page === after?.page ? before?.page ?? null : null;
    line.page = page;
    const rank = before ? before.order + (line.order + 1) / (lines.length + 1) : after ? after.order - 1 + (line.order + 1) / (lines.length + 1) : line.order;
    entries.push({ node: make(line.text, page, [line.id], []), rank });
  }
  const nodes = entries.sort((a, b) => (a.node.page ?? ocr.pageCount + 1) - (b.node.page ?? ocr.pageCount + 1) || a.rank - b.rank)
    .map(({ node }, order) => ({ ...node, id: `node-${order}`, order }));
  if (!blocks.length) warnings.push('SOURCE_IS_TEXT_SPLITTING_NO_GEOMETRY');
  if (blocks.some(b => b.bbox === null)) warnings.push('OCR_GEOMETRY_MISSING');
  if (!blocks.length || blocks.some(b => b.confidence === null)) warnings.push('OCR_CONFIDENCE_MISSING');
  const structure: DocumentJsonExport['structure'] = { headers: [], titles: [], dateLines: [], sections: [], fields: extractFields(nodes), checkboxes: [], tables: [], signatures: [], freeText: [], unclassified: [] };
  let section: DocumentJsonExport['structure']['sections'][number] | undefined;
  for (const node of nodes) {
    if (section && nodes.find(n => n.id === section!.headingNodeId)?.page !== node.page) section = undefined;
    if (node.type === 'section_heading') {
      section = { id: `section-${node.id}`, headingNodeId: node.id, nodeIds: [] }; structure.sections.push(section);
    } else section?.nodeIds.push(node.id);
    if (['national_heading', 'motto'].includes(node.type)) structure.headers.push(node.id);
    if (node.type === 'document_title') structure.titles.push(node.id);
    if (node.type === 'date_line') structure.dateLines.push(node.id);
    if (node.type === 'unknown') structure.unclassified.push(node.id);
    if (['unknown', 'bullet_item', 'legal_reference', 'document_code', 'blank_input', 'blank_line', 'signature_instruction'].includes(node.type)) structure.freeText.push(node.id);
    if (node.type === 'signature_title') structure.signatures.push({ nodeId: node.id, identity: null, evidence: { ...node.evidence }, status: 'needs_review' });
    if (node.type === 'checkbox_item') {
      const pattern = new RegExp(CHECKBOX_REGEX.source, 'gu'), matches = [...node.text.matchAll(pattern)];
      for (const [i, match] of matches.entries()) {
        const symbol = match[0];
        structure.checkboxes.push({
          id: `checkbox-${node.id}-${i}`, nodeId: node.id,
          label: node.text.slice(match.index! + symbol.length, matches[i + 1]?.index ?? node.text.length).trim(),
          state: /[xX☑☒]/u.test(symbol) ? 'checked' : /[☐]/u.test(symbol) || /^\[\s*\]$/u.test(symbol) ? 'unchecked' : 'unknown',
          sourceLineIds: [...node.sourceLineIds], sourceBlockIds: [...node.sourceBlockIds],
          evidence: { ...node.evidence }, status: 'needs_review', reviewReasons: ['OCR_SYMBOL_NOT_GEOMETRIC_CHECKBOX_VERIFICATION'],
        });
      }
    }
  }
  structure.tables = assembleTablesFromOcr(ocr, lines, blocks);
  if (lines.some(line => line.page === null)) warnings.push('TEXT_SPLIT_PAGE_UNKNOWN');
  if (!structure.tables.length) warnings.push('TABLE_LAYOUT_NOT_PROVIDED');
  const pages = Array.from({ length: ocr.pageCount }, (_, i) => {
    const page = i + 1, provided = ocr.pages?.find(p => p.page === page);
    return { page, status: provided?.status ?? 'success' as const, error: provided?.error ?? null,
      width: provided?.width ?? (ocr.pageCount === 1 ? options.imageDimensions?.width ?? null : null),
      height: provided?.height ?? (ocr.pageCount === 1 ? options.imageDimensions?.height ?? null : null),
      coordinateSystem: 'normalized-xyxy' as const, readingOrder: blocks.length ? ocr.readingOrder ?? 'provider' as const : 'text-splitting' as const };
  });
  const hasText = /[\p{L}\p{N}]/u.test(ocr.fullText) || blocks.some(b => /[\p{L}\p{N}]/u.test(b.text));
  const failedCount = pages.filter(p => p.status === 'failed').length;
  const status = !hasText || failedCount === pages.length ? 'failed' : failedCount || ocr.warnings.some(w => /EMPTY|RETRY_FAILED|POSSIBLE_BLANK/u.test(w)) ? 'partial' : 'success';
  return { schemaVersion: '1.0.0', documentId: options.documentId, status, provider: { name: ocr.provider, model: ocr.model ?? null },
    source: { mimeType: options.mimeType, pageCount: ocr.pageCount, frame: 'processed-primary', deskewApplied: options.deskewApplied ?? null },
    rawText: ocr.fullText, pages, lines, blocks, nodes, structure, warnings: [...new Set(warnings)], requiresReview: true,
    review: {
      selectedAttempt: options.review?.selectedAttempt ? options.review.selectedAttempt : null, selectionReason: options.review?.selectionReason ?? null,
      attempts: options.review?.attempts.map(a => ({ attempt: a.attempt, variant: a.variant, provider: a.provider, rawText: a.raw?.fullText ?? null, blocks: a.raw ? sourceBlocks(a.raw) : [], errorCode: a.errorCode ?? null })) ?? [],
      regions: options.review?.regions.map(r => ({ bbox: exportBox(r.boundingBox), reason: r.reason, status: r.status })) ?? [],
    },
  };
}
