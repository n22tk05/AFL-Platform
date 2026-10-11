import sharp from 'sharp';
import { checkImage, InputError, limitedBody } from './api';
import { DOCUMENT_LIMITS } from './config';
import { validateDetailedDocument } from './detailed-export';
import type { DetailedDocument } from '@/shared/detailed-document.types';

export interface DetailedInput { bytes: Uint8Array; mimeType: string; quad: number[][] | null; recognizeWords: boolean; signal: AbortSignal }
type Extractor = (input: DetailedInput) => Promise<unknown>;
const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export async function extractDetailed(input: DetailedInput): Promise<unknown> {
  const endpoint = new URL(process.env.VIETOCR_ENDPOINT || 'http://127.0.0.1:8000/predict');
  endpoint.pathname = endpoint.pathname.replace(/\/predict\/?$/, '/predict/detailed');
  if (!endpoint.pathname.endsWith('/predict/detailed')) throw new InputError('OCR_ENDPOINT_INVALID', 503);
  const response = await fetch(endpoint, { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([input.signal, AbortSignal.timeout(150_000)]),
    body: JSON.stringify({ image: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`, quad: input.quad, recognizeWords: input.recognizeWords }) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new InputError(response.status === 429 ? 'OCR_BUSY' : response.status === 413 ? 'DETAILED_LIMIT_EXCEEDED'
      : response.status === 400 ? 'INVALID_DOCUMENT_GEOMETRY' : 'OCR_UNAVAILABLE', response.status === 429 ? 429 : response.status === 413 ? 413 : response.status === 400 ? 400 : 503);
  }
  // Stream-cap the provider response too; a declared length alone is insufficient.
  const bytes = await limitedBody(new Request('http://localhost/provider', { method: 'POST', body: response.body,
    headers: response.headers, duplex: 'half' } as RequestInit));
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InputError('OCR_INVALID_RESPONSE', 502); }
}

export async function handleDetailedExtraction(req: Request, extractor: Extractor = extractDetailed): Promise<Response> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) throw new InputError('UNSUPPORTED_CONTENT_TYPE', 415);
    const raw = await limitedBody(req);
    let form: FormData;
    try { form = await new Response(Buffer.from(raw), { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new InputError('INVALID_REQUEST', 400); }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new InputError('MISSING_FILE', 400);
    if (file.size > DOCUMENT_LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await checkImage(bytes, file.type);
    const mode = form.get('recognizeWords') ?? 'true';
    if (mode !== 'true' && mode !== 'false') throw new InputError('INVALID_REQUEST', 400);
    let quad: number[][] | null = null;
    if (form.has('quad')) {
      try { quad = JSON.parse(String(form.get('quad'))); }
      catch { throw new InputError('INVALID_DOCUMENT_GEOMETRY', 400); }
      if (!Array.isArray(quad) || quad.length !== 4 || quad.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n))))
        throw new InputError('INVALID_DOCUMENT_GEOMETRY', 400);
    }
    if (req.signal.aborted) throw new InputError('OCR_CANCELLED', 499);
    const metadata = await sharp(bytes).metadata();
    const rotated = [5,6,7,8].includes(metadata.orientation ?? 1);
    const width = (rotated ? metadata.height : metadata.width)!;
    const height = (rotated ? metadata.width : metadata.height)!;
    if (quad?.some(([x,y]) => x < 0 || y < 0 || x > width-1 || y > height-1)) throw new InputError('INVALID_DOCUMENT_GEOMETRY', 400);
    if (process.env.DOCUMENT_OCR_PROVIDER && process.env.DOCUMENT_OCR_PROVIDER !== 'vietocr') throw new InputError('OCR_NOT_CONFIGURED', 503);
    const result = await extractor({ bytes, mimeType: file.type, quad, recognizeWords: mode === 'true', signal: req.signal });
    try { validateDetailedDocument(result); }
    catch { throw new InputError('OCR_INVALID_RESPONSE', 502); }
    if (result.source.width !== width || result.source.height !== height) throw new InputError('OCR_FRAME_MISMATCH', 502);
    return Response.json({ success: true, data: result satisfies DetailedDocument }, { headers });
  } catch (error) {
    const safe = error instanceof InputError ? error : new InputError(req.signal.aborted ? 'OCR_CANCELLED'
      : error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'OCR_TIMEOUT' : 'OCR_UNAVAILABLE', req.signal.aborted ? 499 : 503);
    const messages: Record<string, string> = {
      OCR_BUSY: 'VietOCR đang xử lý tài liệu khác. Hãy thử lại sau.',
      OCR_INVALID_RESPONSE: 'Kết quả đọc không đạt kiểm tra dữ liệu; hãy cập nhật dịch vụ VietOCR và chạy lại.',
      OCR_FRAME_MISMATCH: 'Tọa độ không cùng kích thước ảnh nguồn. Hãy chạy lại với dịch vụ đã cập nhật.',
      DETAILED_LIMIT_EXCEEDED: 'Trang vượt ngân sách chi tiết. Hãy chia thành các trang nhỏ hơn; chưa xuất kết quả đầy đủ.',
      INVALID_DOCUMENT_GEOMETRY: 'Bốn góc tài liệu không hợp lệ. Hãy chọn lại vùng giấy hoặc dùng ảnh scan đã thẳng.',
      OCR_TIMEOUT: 'Hết thời gian đọc. Thử chế độ đọc nhanh hoặc chia trang nhỏ hơn.',
      OCR_UNAVAILABLE: 'VietOCR chưa sẵn sàng. Chạy dịch vụ cục bộ đã cập nhật ở cổng 8000.',
    };
    return Response.json({ success: false, error: { code: safe.code, message: messages[safe.code] ?? 'Chọn JPEG/PNG hợp lệ, tối đa 8 MB và 12 triệu pixel.' } }, { status: safe.status, headers });
  }
}
