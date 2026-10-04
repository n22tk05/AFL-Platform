import sharp from 'sharp';
import type { DocumentOcrInput, OcrImageVariant } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS, ADAPTIVE_IMAGE_CONFIG } from './config';
import { DocumentExtractionService, manualReview } from './services/document-extraction.service';
import { analyzeImageQuality, validateImageDimensions, IMAGE_WARNING_MESSAGES } from './image-quality';

export class InputError extends Error { constructor(public code: string, public status: number) { super(code); } }
export async function limitedBody(req: Request): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > DOCUMENT_LIMITS.requestBytes)) throw new InputError('REQUEST_TOO_LARGE', 413);
  const reader = req.body?.getReader(); if (!reader) throw new InputError('EMPTY_REQUEST', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > DOCUMENT_LIMITS.requestBytes) { await reader.cancel(); throw new InputError('REQUEST_TOO_LARGE', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function checkImage(bytes: Uint8Array, mime: string) {
  if (bytes.length > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
  if (!['image/jpeg', 'image/png'].includes(mime)) throw new InputError('UNSUPPORTED_MIME', 415);
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (!(mime === 'image/jpeg' ? jpeg : png)) throw new InputError('INVALID_IMAGE', 400);
  try {
    const decoder = sharp(bytes, { limitInputPixels: DOCUMENT_LIMITS.imagePixels, failOn: 'warning' });
    const metadata = await decoder.metadata();
    validateImageDimensions(metadata.width ?? 0, metadata.height ?? 0);
    if ((metadata.pages ?? 1) !== 1 || metadata.format !== (mime === 'image/png' ? 'png' : 'jpeg')) throw new InputError('UNSUPPORTED_IMAGE', 415);
    // Metadata alone accepts some truncated files. Fully decode in bounded RAM
    // before any provider is constructed or called; never write an image to disk.
    const decoded = await decoder.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const quality = analyzeImageQuality({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength) });
    return { width: decoded.info.width, height: decoded.info.height, quality };
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(error instanceof RangeError || (error instanceof Error && /pixel limit/i.test(error.message)) ? 'IMAGE_LIMIT_EXCEEDED' : 'INVALID_IMAGE', 400);
  }
}
type ParsedDocument = DocumentOcrInput & { deskewApplied: boolean; documentHint: string };
export async function parseDocumentImage(req: Request): Promise<ParsedDocument> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/json')) throw new InputError('UNSUPPORTED_CONTENT_TYPE', 415);
  const raw = await limitedBody(req);
  let bytes: Uint8Array, mime: string, deskewApplied = false, documentHint = 'auto', documentDetectionFailed = false;
  let suppliedWarnings: unknown = []; const files: { variant: OcrImageVariant['variant']; file: File }[] = [];
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await new Response(Buffer.from(raw), { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new InputError('INVALID_REQUEST', 400); }
    const file = form.get('file'); if (!file || typeof file === 'string') throw new InputError('MISSING_FILE', 400);
    if (file.size > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
    bytes = new Uint8Array(await file.arrayBuffer()); mime = file.type;
    deskewApplied = form.get('deskewApplied') === 'true'; documentHint = String(form.get('documentHint') || 'auto');
    documentDetectionFailed = form.get('documentDetectionFailed') === 'true';
    try { suppliedWarnings = JSON.parse(String(form.get('imageWarnings') || '[]')); } catch { throw new InputError('INVALID_REQUEST', 400); }
    for (const variant of ['contrast', 'lighting'] as const) {
      const values = form.getAll(variant); if (values.length > 1) throw new InputError('INVALID_VARIANTS', 400);
      const candidate = values[0]; if (candidate === undefined) continue;
      if (typeof candidate === 'string') throw new InputError('INVALID_VARIANTS', 400);
      if (candidate.size > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
      files.push({ variant, file: candidate });
    }
  } else {
    let body;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new InputError('INVALID_REQUEST', 400); }
    if (!body || typeof body.imageBase64 !== 'string') throw new InputError('MISSING_IMAGE', 400);
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageBase64);
    if (!match) throw new InputError('INVALID_IMAGE', 400);
    mime = match[1]; bytes = Buffer.from(match[2], 'base64');
    if (Buffer.from(bytes).toString('base64') !== match[2]) throw new InputError('INVALID_IMAGE', 400);
    deskewApplied = body.deskewApplied === true; documentHint = body.documentHint ?? 'auto';
    documentDetectionFailed = body.documentDetectionFailed === true; suppliedWarnings = body.imageWarnings ?? [];
  }
  if (!Array.isArray(suppliedWarnings) || suppliedWarnings.length > 12 || suppliedWarnings.some(w => typeof w !== 'string' || !Object.hasOwn(IMAGE_WARNING_MESSAGES, w))) throw new InputError('INVALID_IMAGE_WARNINGS', 400);
  if (!['auto','traffic_ticket','traffic_violation_record','citizen_identity_card','land_document','unknown'].includes(documentHint)) throw new InputError('INVALID_DOCUMENT_HINT', 400);
  if (documentDetectionFailed && deskewApplied) throw new InputError('INVALID_GEOMETRY_METADATA', 400);
  const primary = await checkImage(bytes, mime);
  const enhancements: OcrImageVariant[] = [];
  for (const { variant, file } of files) {
    const variantBytes = new Uint8Array(await file.arrayBuffer());
    const image = await checkImage(variantBytes, file.type);
    const scaleX = image.width / primary.width, scaleY = image.height / primary.height;
    // Same primary frame, with only rounded uniform upscaling. No arbitrary
    // crop can be assigned the primary image's normalized evidence coordinates.
    if (scaleX < 1 || scaleY < 1 || scaleX > ADAPTIVE_IMAGE_CONFIG.maxUpscale || scaleY > ADAPTIVE_IMAGE_CONFIG.maxUpscale
      || Math.abs(scaleX - scaleY) > 1 / primary.width + 1 / primary.height) throw new InputError('INVALID_VARIANT_GEOMETRY', 400);
    enhancements.push({ variant, bytes: variantBytes, mimeType: file.type as DocumentOcrInput['mimeType'], width: image.width, height: image.height, scaleX, scaleY });
  }
  const imageWarnings = Array.from(new Set([...primary.quality.warnings, ...suppliedWarnings as string[], ...(documentDetectionFailed ? ['DOCUMENT_DETECTION_FAILED'] : [])]));
  return { bytes, mimeType: mime as DocumentOcrInput['mimeType'], signal: req.signal, enhancements, imageWarnings, documentDetectionFailed, deskewApplied, documentHint };
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
export async function handleDocumentExtraction(req: Request, factory: () => DocumentExtractionService): Promise<Response> {
  try {
    const input = await parseDocumentImage(req);
    let service: DocumentExtractionService;
    try { service = factory(); } catch {
      const data = manualReview('OCR_NOT_CONFIGURED'); data.warnings.unshift('OCR provider unavailable');
      data.warnings.push(...input.imageWarnings ?? []); return json({ success: true, data });
    }
    return json({ success: true, data: await service.extractDocumentInformation(input) });
  } catch (error) {
    const safe = error instanceof InputError ? error : new InputError('INVALID_REQUEST', 400);
    return json({ success: false, error: { code: safe.code, message_vi: 'Không thể đọc yêu cầu. Chọn ảnh JPEG/PNG hợp lệ, tối đa 8 MB và 12 triệu pixel.' } }, safe.status);
  }
}
