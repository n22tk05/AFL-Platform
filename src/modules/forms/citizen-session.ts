import { DOCUMENT_LIMITS } from '@/modules/documents/config';
import { documentSession } from '@/modules/documents/session';
import { canonicalFormCode } from './client';

export interface CapturedFormImage {
  image: string;
  formCode: string | null;
}

/** Private captured pixels live only in this browser module, never Web Storage. */
export class CapturedFormSession {
  private capture: CapturedFormImage | null = null;
  private selectedForm: string | null = null;
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  constructor(private readonly now = Date.now, private readonly ttl = DOCUMENT_LIMITS.sessionTtlMs) {}

  save(image: string): void {
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
      || image.length > Math.ceil(DOCUMENT_LIMITS.fileBytes / 3) * 4 + 128) {
      throw new Error('Ảnh chụp không hợp lệ hoặc vượt giới hạn 8 MB.');
    }
    this.clear();
    this.capture = { image, formCode: null };
    this.startExpiry();
    this.notify();
  }

  selectForm(formCode: string): void {
    const capture = this.read();
    const code = canonicalFormCode(formCode);
    if (!code) throw new Error('Chưa chọn mã biểu mẫu hợp lệ.');
    if (!this.expiresAt) this.startExpiry();
    this.selectedForm = code;
    if (capture?.formCode && capture.formCode !== code) this.capture = null;
    else if (capture) this.capture = { ...capture, formCode: code };
    this.notify();
  }

  read(formCode?: string): CapturedFormImage | null {
    this.expire();
    if (!this.capture || (formCode && this.capture.formCode !== canonicalFormCode(formCode))) return null;
    return { ...this.capture };
  }

  selectedFormCode(): string | null { this.expire(); return this.selectedForm; }

  clear(): void {
    clearTimeout(this.timer); this.capture = null; this.selectedForm = null; this.expiresAt = 0; this.notify();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(): void { this.listeners.forEach(listener => listener()); }
  private expire(): void { if (this.expiresAt && this.now() >= this.expiresAt) this.clear(); }
  private startExpiry(): void {
    this.expiresAt = this.now() + this.ttl;
    this.timer = setTimeout(() => this.clear(), this.ttl); this.timer.unref?.();
  }
}

export const capturedFormSession = new CapturedFormSession();
export function discardLegacyCitizenStorage(storage?: Pick<Storage, 'removeItem'>): void {
  for (const key of ['afl_captured_form_image', 'afl_prerequisite_document_data']) {
    try { storage?.removeItem(key); } catch { /* Browser storage may be disabled. */ }
  }
}
export function clearCitizenSession(storage?: Pick<Storage, 'removeItem'>): void {
  capturedFormSession.clear(); documentSession.clear(); discardLegacyCitizenStorage(storage);
}
