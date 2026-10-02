import type { DocumentOcrInput } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from './config';
import { DocumentExtractionService, manualReview } from './services/document-extraction.service';

export class InputError extends Error { constructor(public code: string, public status: number) { super(code); } }
async function limitedBody(req: Request): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > DOCUMENT_LIMITS.requestBytes)) throw new InputError('REQUEST_TOO_LARGE', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new InputError('EMPTY_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > DOCUMENT_LIMITS.requestBytes) { await reader.cancel(); throw new InputError('REQUEST_TOO_LARGE', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
function checkImage(bytes: Uint8Array, mime: string): asserts mime is DocumentOcrInput['mimeType'] {
  if (bytes.length > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
  if (!['image/jpeg', 'image/png'].includes(mime)) throw new InputError('UNSUPPORTED_MIME', 415);
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (!(mime === 'image/jpeg' ? jpeg : png)) throw new InputError('INVALID_IMAGE', 400);
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
export async function parseDocumentImage(req: Request): Promise<DocumentOcrInput> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/json')) throw new InputError('UNSUPPORTED_CONTENT_TYPE', 415);
  const raw = await limitedBody(req);
  let bytes: Uint8Array, mime: string;
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await new Response(Buffer.from(raw), { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new InputError('INVALID_REQUEST', 400); }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new InputError('MISSING_FILE', 400);
    if (file.size > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
    bytes = new Uint8Array(await file.arrayBuffer()); mime = file.type;
  } else {
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new InputError('INVALID_REQUEST', 400); }
    if (!body || typeof body !== 'object' || !('imageBase64' in body) || typeof body.imageBase64 !== 'string') throw new InputError('MISSING_IMAGE', 400);
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageBase64);
    if (!match) throw new InputError('INVALID_IMAGE', 400);
    mime = match[1]; bytes = Buffer.from(match[2], 'base64');
    if (Buffer.from(bytes).toString('base64') !== match[2]) throw new InputError('INVALID_IMAGE', 400);
  }
  checkImage(bytes, mime);
  return { bytes, mimeType: mime, signal: req.signal };
}
/** Same handler for route and injected tests. No raw provider exceptions reach clients. */
export async function handleDocumentExtraction(req: Request, factory: () => DocumentExtractionService): Promise<Response> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data') && !contentType.includes('application/json')) throw new InputError('UNSUPPORTED_CONTENT_TYPE', 415);
    const raw = await limitedBody(req);
    let bytes: Uint8Array, mime: string, deskewApplied = false, documentHint = 'auto';
    if (contentType.includes('multipart/form-data')) {
      const form = await new Response(Buffer.from(raw), { headers: { 'Content-Type': contentType } }).formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') throw new InputError('MISSING_FILE', 400);
      if (file.size > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
      bytes = new Uint8Array(await file.arrayBuffer()); mime = file.type;
      deskewApplied = form.get('deskewApplied') === 'true';
      documentHint = String(form.get('documentHint') || 'auto');
    } else {
      const body = JSON.parse(new TextDecoder().decode(raw));
      if (!body || typeof body.imageBase64 !== 'string') throw new InputError('MISSING_IMAGE', 400);
      const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageBase64);
      if (!match) throw new InputError('INVALID_IMAGE', 400);
      mime = match[1]; bytes = Buffer.from(match[2], 'base64');
      if (Buffer.from(bytes).toString('base64') !== match[2]) throw new InputError('INVALID_IMAGE', 400);
      deskewApplied = body.deskewApplied === true;
      documentHint = typeof body.documentHint === 'string' ? body.documentHint : 'auto';
    }
    checkImage(bytes, mime);
    if (!['auto','traffic_ticket','traffic_violation_record','citizen_identity_card','land_document','unknown'].includes(documentHint)) throw new InputError('INVALID_DOCUMENT_HINT', 400);
    let service: DocumentExtractionService;
    try { service = factory(); } catch {
      const data = manualReview('OCR_NOT_CONFIGURED'); data.warnings.unshift('OCR provider unavailable');
      return json({ success: true, data });
    }
    const data = await service.extractDocumentInformation({ bytes, mimeType: mime, signal: req.signal, deskewApplied, documentHint });
    return json({ success: true, data });
  } catch (error) {
    const safe = error instanceof InputError ? error : new InputError('INVALID_REQUEST', 400);
    return json({ success: false, error: { code: safe.code, message_vi: 'Không thể đọc yêu cầu. Hãy chọn ảnh JPEG/PNG hợp lệ, tối đa 8 MB.' } }, safe.status);
  }
}
