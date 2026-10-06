import Ajv from 'ajv';
import schema from '@/shared/document-export.schema.json';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';
import { sourceBlocks } from './json-assembler';
import { extractFieldPairs } from './json-content-classifier';
export { schema as documentExportSchema };
const validateSchema = new Ajv({ allErrors: true, strict: true }).compile<DocumentJsonExport>(schema);
export interface JsonValidation { valid: boolean; schemaValid: boolean; sourceCoverageValid: boolean; issues: string[] }
/** Reject lossy JSON values BEFORE stringify/Ajv. No stripping, coercion,
 * prototype instances, buffers or circular references in the export contract. */
function serializable(value: unknown, path: string, active: Set<object>, issues: string[]) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) issues.push('NON_FINITE:' + path); return; }
  if (typeof value !== 'object') { issues.push('NON_JSON_VALUE:' + path); return; }
  if (active.has(value)) { issues.push('CIRCULAR:' + path); return; }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) { issues.push('NON_PLAIN_OBJECT:' + path); return; }
  active.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)
      || Array.isArray(value) && !/^(?:0|[1-9]\d*)$/.test(key)) { issues.push('LOSSY_PROPERTY:' + path); continue; }
    serializable(descriptor.value, path + '/' + key, active, issues);
  }
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value,i)) issues.push('SPARSE_ARRAY:' + path);
  active.delete(value);
}
export function validateJsonExport(value: unknown, expected?: DocumentOcrResult): JsonValidation {
  const issues: string[] = []; serializable(value, '', new Set(), issues);
  if (issues.length) return { valid: false, schemaValid: false, sourceCoverageValid: false, issues };
  if (!validateSchema(value)) return { valid: false, schemaValid: false, sourceCoverageValid: false, issues: validateSchema.errors?.map(e => 'SCHEMA:' + e.instancePath + ':' + e.message) ?? ['SCHEMA'] };
  const doc = value;
  const fail = (code: string) => issues.push(code);
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length || ids.some(id => !id)) fail('DUPLICATE_ID:' + label); };
  unique([...doc.lines.map(l => l.id), ...doc.blocks.map(b => b.id)], 'source');
  unique(doc.blocks.map(b => b.kind + ':' + b.page + ':' + b.providerId), 'provider');
  unique(doc.nodes.map(n => n.id), 'nodes');
  unique([...doc.structure.fields.map(f => f.id), ...doc.structure.checkboxes.map(c => c.id), ...doc.structure.tables.map(t => t.id), ...doc.structure.sections.map(s => s.id)], 'structure');
  const lineIds = new Set(doc.lines.map(l => l.id)), blockIds = new Set(doc.blocks.map(b => b.id)), nodeIds = new Set(doc.nodes.map(n => n.id));
  const lines = new Map(doc.lines.map(l => [l.id, l])), blocks = new Map(doc.blocks.map(b => [b.id, b]));
  const usedLines = new Set<string>(), usedBlocks = new Set<string>();
  const sourceUse = new Map<string, number>();
  const refs = (item: { sourceLineIds: string[]; sourceBlockIds: string[] }) => {
    for (const id of item.sourceLineIds) if (!lineIds.has(id)) fail('MISSING_LINE_REFERENCE:' + id);
    for (const id of item.sourceBlockIds) if (!blockIds.has(id)) fail('MISSING_BLOCK_REFERENCE:' + id);
  };
  if (doc.pages.length !== doc.source.pageCount || doc.pages.some((p, i) => p.page !== i + 1)) fail('PAGE_ORDER');
  const validPage = (page: number | null) => page === null || page <= doc.source.pageCount;
  if ([...doc.lines, ...doc.blocks, ...doc.nodes].some(s => !validPage(s.page))) fail('INVALID_PAGE');
  if (doc.pages.some(p => (p.status === 'failed') !== (p.error !== null))) fail('PAGE_ERROR_STATUS');
  const box = (b: number[] | null) => { if (b && (b[0] >= b[2] || b[1] >= b[3])) fail('BBOX_ORDER'); };
  doc.blocks.forEach(b => box(b.bbox)); doc.review.regions.forEach(r => box(r.bbox));
  doc.review.attempts.forEach(a => a.blocks.forEach(b => box(b.bbox)));
  if (doc.lines.map(l => l.text + l.newline).join('') !== doc.rawText || !doc.lines.length) fail('RAW_TEXT_COVERAGE');
  let offset = 0;
  doc.lines.forEach((line, i) => {
    if (line.order !== i || line.start !== offset || line.end !== offset + line.text.length || doc.rawText.slice(line.start, line.end) !== line.text) fail('SOURCE_LINE_RANGE');
    offset = line.end + line.newline.length;
  });
  doc.blocks.forEach((b, i) => { if (b.order !== i) fail('BLOCK_ORDER'); });
  let previousPage = 0;
  doc.nodes.forEach((node, i) => {
    refs(node);
    if (!node.sourceLineIds.length && !node.sourceBlockIds.length) fail('UNGROUNDED_NODE');
    node.sourceLineIds.forEach(id => usedLines.add(id)); node.sourceBlockIds.forEach(id => usedBlocks.add(id));
    for (const id of [...node.sourceLineIds, ...node.sourceBlockIds]) sourceUse.set(id, (sourceUse.get(id) ?? 0) + 1);
    if (node.order !== i) fail('NODE_ORDER');
    if (node.page !== null) { if (node.page < previousPage) fail('NODE_PAGE_ORDER'); previousPage = node.page; }
    const texts = [...node.sourceLineIds.map(id => lines.get(id)?.text), ...node.sourceBlockIds.map(id => blocks.get(id)?.text)];
    if (texts.some(t => t !== node.text)) fail('SOURCE_NODE_TEXT_CHANGED');
  });
  if (usedLines.size !== lineIds.size || usedBlocks.size !== blockIds.size) fail('SOURCE_NODE_COVERAGE');
  if (Array.from(sourceUse.values()).some(count => count !== 1)) fail('SOURCE_NODE_DUPLICATED');
  const reference = (id: string) => { if (!nodeIds.has(id)) fail('MISSING_NODE_REFERENCE:' + id); };
  [...doc.structure.headers, ...doc.structure.titles, ...doc.structure.dateLines, ...doc.structure.freeText, ...doc.structure.unclassified].forEach(reference);
  for (const section of doc.structure.sections) { reference(section.headingNodeId); section.nodeIds.forEach(reference); }
  for (const signature of doc.structure.signatures) reference(signature.nodeId);
  const unknown = doc.nodes.filter(n => n.type === 'unknown').map(n => n.id);
  if (JSON.stringify(unknown) !== JSON.stringify(doc.structure.unclassified)) fail('UNKNOWN_COVERAGE');
  for (const field of doc.structure.fields) {
    refs(field); reference(field.nodeId);
    const node = doc.nodes.find(n => n.id === field.nodeId);
    const pairs = node?.type === 'field_label' ? [{ label: node.text, rawValue: null, valueState: 'blank' }] : extractFieldPairs(node?.text ?? '');
    if (!pairs.some(p => p.label === field.label && p.rawValue === field.rawValue && p.valueState === field.valueState)) fail('FIELD_RAW_CHANGED');
    if (node && (JSON.stringify(field.sourceLineIds) !== JSON.stringify(node.sourceLineIds) || JSON.stringify(field.sourceBlockIds) !== JSON.stringify(node.sourceBlockIds))) fail('FIELD_SOURCE_CHANGED');
    if (field.normalizedValue !== field.rawValue && !field.reviewReasons.includes('USER_EDIT') && !field.reviewReasons.includes('DOTTED_PADDING_REMOVED')) fail('NORMALIZED_WITHOUT_EVIDENCE');
  }
  for (const c of doc.structure.checkboxes) {
    refs(c); reference(c.nodeId);
    const node = doc.nodes.find(n => n.id === c.nodeId);
    if (node && (JSON.stringify(c.sourceLineIds) !== JSON.stringify(node.sourceLineIds) || JSON.stringify(c.sourceBlockIds) !== JSON.stringify(node.sourceBlockIds))) fail('CHECKBOX_SOURCE_CHANGED');
  }
  for (const table of doc.structure.tables) {
    if (table.page > doc.source.pageCount || table.headerRowCount > table.rows.length) fail('TABLE_PAGE_OR_HEADER');
    const occupied = new Set<string>();
    for (const [rowIndex, row] of table.rows.entries()) for (const cell of row) {
      refs(cell);
      if (rowIndex + cell.rowSpan > table.rows.length || cell.columnIndex + cell.columnSpan > 1000) { fail('CELL_SPAN_OUT_OF_BOUNDS'); continue; }
      for (let r = rowIndex; r < rowIndex + cell.rowSpan; r++) for (let c = cell.columnIndex; c < cell.columnIndex + cell.columnSpan; c++) {
        const slot = r + ':' + c;
        if (occupied.has(slot)) fail('CELL_OVERLAP');
        occupied.add(slot);
      }
      if (cell.rowIndex !== rowIndex || (!cell.sourceLineIds.length && !cell.sourceBlockIds.length)) fail('UNGROUNDED_CELL');
      if (!cell.sourceRanges.length && (!cell.sourceBlockIds.length || cell.rawValue !== '' || cell.sourceBlockIds.some(id => blocks.get(id)?.text !== ''))) fail('UNGROUNDED_CELL');
      if (cell.sourceRanges.some(r => r.end <= r.start || r.end > doc.rawText.length) || cell.sourceRanges.map(r => doc.rawText.slice(r.start, r.end)).join('') !== cell.rawValue) fail('CELL_RAW_CHANGED');
      const actualLineIds = doc.lines.filter(line => cell.sourceRanges.some(r => line.start < r.end && line.end > r.start)).map(line => line.id);
      if (JSON.stringify(actualLineIds) !== JSON.stringify(cell.sourceLineIds)) fail('CELL_RANGE_SOURCE_MISMATCH');
      if (cell.normalizedValue !== cell.rawValue) fail('CELL_NORMALIZED_WITHOUT_EVIDENCE');
      if (cell.sourceLineIds.some(id => lines.get(id)?.page !== null && lines.get(id)?.page !== table.page)) fail('CELL_CROSSES_PAGE');
      if (cell.sourceBlockIds.some(id => blocks.get(id)?.page !== table.page)) fail('CELL_CROSSES_PAGE');
    }
  }
  const failedPages = doc.pages.filter(p => p.status === 'failed').length;
  const readable = /[\p{L}\p{N}]/u.test(doc.rawText) || doc.blocks.some(b => /[\p{L}\p{N}]/u.test(b.text));
  if (doc.status === 'success' && (!readable || failedPages) || doc.status === 'partial' && (!readable || failedPages === doc.pages.length)) fail('DOCUMENT_STATUS');
  if (!doc.requiresReview && (doc.nodes.some(n => n.status === 'needs_review') || doc.warnings.length)) fail('REVIEW_REQUIRED');
  if (expected) {
    if (doc.rawText !== expected.fullText || JSON.stringify(doc.blocks) !== JSON.stringify(sourceBlocks(expected))) fail('PROVIDER_SOURCE_CHANGED');
  }
  if (JSON.stringify(doc).length > 12_000_000) fail('JSON_TOO_LARGE');
  return { valid: issues.length === 0, schemaValid: true, sourceCoverageValid: issues.length === 0, issues };
}
export function parseJsonExport(value: unknown): DocumentJsonExport {
  const validation = validateJsonExport(value);
  if (!validation.valid || !validateSchema(value)) throw new Error('INVALID_JSON_EXPORT:' + validation.issues.join(','));
  return value;
}
