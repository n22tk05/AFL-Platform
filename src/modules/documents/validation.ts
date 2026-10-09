import type { DocumentOcrResult, ExtractedField, NormalizedBoundingBox, StructuredDocumentResult } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from './config';
import { DocumentPipelineError } from './errors';
import { TRAFFIC_FIELDS, CRITICAL_FIELDS } from './schema';

export const clampConfidence = (n: number): number => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export const spaces = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim();
export function validBox(box: unknown): box is NormalizedBoundingBox {
  return Array.isArray(box) && box.length === 4 && box.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
    && box[0] < box[2] && box[1] < box[3];
}
export function parseDate(raw: string): string | null {
  const text = spaces(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text)
    ?? /^ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})$/i.exec(text);
  if (!iso && !local) return null;
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local![3], +local![2], +local![1]];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1000 || y > 9999 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function parseMoney(raw: string): number | null {
  const s = spaces(raw).replace(/\s*(đồng|vnd|đ|₫)\s*$/i, '').trim();
  // VND integers only; mixed/ambiguous decimal separators require review.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)$/.test(s)) return null;
  const value = Number(s.replace(/[., ]/g, ''));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function normalizeField(key: string, raw: string): string | number | null {
  if (key === 'fineAmount') return parseMoney(raw);
  if (key === 'recordDate' || key === 'paymentDeadline') return parseDate(raw);
  return spaces(raw) || null;
}
export function valueErrors(key: string, value: unknown): string[] {
  if (value === null || value === '') return ['Chưa có giá trị đọc được.'];
  if (key === 'fineAmount') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? [] : ['Số tiền không hợp lệ.'];
  if (typeof value !== 'string') return ['Giá trị phải là văn bản.'];
  if (key === 'citizenId' && !/^\d{12}$/.test(value)) return ['CCCD phải có 12 chữ số.'];
  if ((key === 'recordDate' || key === 'paymentDeadline') && !parseDate(value)) return ['Ngày không hợp lệ.'];
  if (key === 'vehiclePlate' && !/^\d{2}[A-ZĐ]{1,2}[0-9]?[- .]?\d{3,6}(?:\.\d{2})?$/i.test(value)) return ['Cần đối chiếu định dạng biển số.'];
  return [];
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function parseStructuredResult(response: unknown, ocr: DocumentOcrResult, threshold: number = DOCUMENT_LIMITS.acceptanceThreshold): StructuredDocumentResult {
  let parsed: unknown = response;
  try { if (typeof response === 'string') parsed = JSON.parse(response); } catch { throw new DocumentPipelineError('INVALID_STRUCTURED_RESPONSE'); }
  if (!object(parsed) || !object(parsed.fields) || Object.keys(parsed).some(k => k !== 'fields') || Object.keys(parsed.fields).some(k => !Object.hasOwn(TRAFFIC_FIELDS, k))) throw new DocumentPipelineError('INVALID_STRUCTURED_RESPONSE');
  const fields: Record<string, ExtractedField> = {};
  const index = new Map(ocr.lines.map(line => [line.id, line]));
  for (const [key, label] of Object.entries(TRAFFIC_FIELDS)) {
    const candidate = parsed.fields[key];
    const empty: ExtractedField = { key, label, value: null, rawText: null, confidence: 0, evidenceText: null, sourceLineIds: [], sourceBoundingBoxes: [], status: 'unreadable', validationErrors: ['Không có bằng chứng đọc được.'] };
    if (candidate === undefined) { fields[key] = empty; continue; }
    if (!object(candidate) || Object.keys(candidate).some(k => !['value','rawText','confidence','evidenceText','sourceLineIds'].includes(k))
      || !(candidate.value === null || typeof candidate.value === 'string' || (typeof candidate.value === 'number' && Number.isFinite(candidate.value)))
      || !(candidate.rawText === null || typeof candidate.rawText === 'string')
      || !(candidate.evidenceText === null || typeof candidate.evidenceText === 'string')
      || typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence)
      || !Array.isArray(candidate.sourceLineIds) || candidate.sourceLineIds.some(id => typeof id !== 'string')) throw new DocumentPipelineError('INVALID_STRUCTURED_RESPONSE');
    const ids = Array.from(new Set(candidate.sourceLineIds as string[]));
    const lines = ids.flatMap(id => index.has(id) ? [index.get(id)!] : []);
    const raw = candidate.rawText as string | null;
    const evidence = candidate.evidenceText as string | null;
    const errors: string[] = [];
    if (!ids.length || lines.length !== ids.length) errors.push('Thiếu dòng nguồn hoặc mã dòng không tồn tại.');
    const source = lines.map(line => line.text).join('\n');
    const grounded = !!raw?.trim() && !!evidence?.trim() && source.includes(evidence) && evidence.includes(raw);
    if (!grounded) errors.push('Giá trị không có bằng chứng trong các dòng OCR nguồn.');
    if (lines.some(line => !validBox(line.boundingBox))) errors.push('Tọa độ nguồn không hợp lệ.');
    if (lines.some(line => line.confidence === null)) errors.push('OCR không cung cấp độ tin cậy.');
    if (candidate.confidence < 0 || candidate.confidence > 1 || lines.some(l => l.confidence !== null && (!Number.isFinite(l.confidence) || l.confidence < 0 || l.confidence > 1))) errors.push('Độ tin cậy nằm ngoài giới hạn.');
    const tokenIds = new Set(lines.flatMap(line => line.tokenIds));
    const tokens = ocr.tokens.filter(token => tokenIds.has(token.id));
    const confidence = Math.min(clampConfidence(candidate.confidence), ...lines.map(line => clampConfidence(line.confidence ?? 0)), ...tokens.map(token => clampConfidence(token.confidence ?? 0)));
    const normalized = raw === null ? null : normalizeField(key, raw);
    // Gemini selects evidence only. Even equivalent reformattings must not pass.
    const conflict = normalized === null || candidate.value !== raw;
    if (candidate.value !== null && conflict) errors.push('Giá trị trích xuất phải giống nguyên văn OCR; không cho phép mô hình sửa hoặc chuẩn hóa.');
    errors.push(...valueErrors(key, candidate.value === null ? null : normalized));
    if (confidence < threshold) errors.push('Độ tin cậy chưa đạt ngưỡng duyệt.');
    const value = grounded && !conflict && candidate.value !== null ? normalized : null;
    if (CRITICAL_FIELDS.has(key) && ocr.warnings.length) errors.push('Trường quan trọng cần đối chiếu cảnh báo OCR.');
    fields[key] = { key, label, value, rawText: raw, evidenceText: grounded ? evidence : null,
      confidence, sourceLineIds: ids, sourceBoundingBoxes: lines.flatMap(l => validBox(l.boundingBox) ? [l.boundingBox] : []),
      status: candidate.value === null ? 'unreadable' : errors.length ? 'needs_review' : 'accepted', validationErrors: errors };
  }
  const values = Object.values(fields);
  return { documentType: 'traffic_violation_record', fields, fullText: ocr.fullText,
    overallConfidence: values.reduce((n, f) => n + f.confidence, 0) / values.length,
    requiresReview: values.some(f => f.status !== 'accepted'), warnings: [...ocr.warnings] };
}
