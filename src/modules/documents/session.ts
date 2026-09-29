import type { StructuredDocumentResult } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from './config';
import { LEGACY_FIELD_KEYS, TRAFFIC_FIELDS } from './schema';
import { normalizeField, valueErrors } from './validation';

export type FieldConfirmations = Record<string, string | number | null>;
export function reviewedFields(result: StructuredDocumentResult, confirmed: FieldConfirmations): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, field] of Object.entries(result.fields)) {
    if (!Object.hasOwn(TRAFFIC_FIELDS, key)) continue;
    const explicit = Object.hasOwn(confirmed, key);
    if (field.status === 'needs_review' && !explicit) throw new Error('Hãy xác nhận hoặc bỏ trống các trường cần kiểm tra.');
    const value = explicit ? confirmed[key] : field.status === 'accepted' ? field.value : null;
    if (value === null) continue;
    const normalized = typeof value === 'string' ? normalizeField(key, value) : value;
    // Plate validation is deliberately soft; a human can confirm a new format.
    if (!(explicit && key === 'vehiclePlate') && valueErrors(key, normalized).length) throw new Error('Giá trị xác nhận chưa hợp lệ.');
    if (typeof normalized !== 'string' && typeof normalized !== 'number') throw new Error('Giá trị xác nhận chưa hợp lệ.');
    values[key] = key === 'fineAmount' ? `${Number(normalized).toLocaleString('vi-VN')} đồng` : String(normalized);
  }
  return values;
}
/** Browser module memory only: no Web Storage, filesystem, images or raw OCR. */
export class DocumentSession {
  private fields: Record<string, string> | null = null;
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  constructor(private readonly now = Date.now, private readonly ttl: number = DOCUMENT_LIMITS.sessionTtlMs) {}
  save(result: StructuredDocumentResult, confirmed: FieldConfirmations): void {
    const fields = reviewedFields(result, confirmed);
    if (!Object.keys(fields).length) throw new Error('Chưa có trường đã duyệt để lưu.');
    this.clear(); this.fields = fields; this.expiresAt = this.now() + this.ttl;
    this.timer = setTimeout(() => this.clear(), this.ttl);
    this.timer.unref?.();
    this.notify();
  }
  read(): Record<string, string> | null {
    if (this.fields && this.now() >= this.expiresAt) this.clear();
    return this.fields ? { ...this.fields } : null;
  }
  clear(): void { clearTimeout(this.timer); this.fields = null; this.expiresAt = 0; this.notify(); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(): void { this.listeners.forEach(listener => listener()); }
}
export const documentSession = new DocumentSession();
export function prerequisiteValue(fields: Record<string, string> | null, sourceKey?: string): string | null {
  if (!fields || !sourceKey) return null;
  return fields[LEGACY_FIELD_KEYS[sourceKey] ?? sourceKey] ?? null;
}
