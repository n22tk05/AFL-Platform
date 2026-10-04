import { VietOcrAdapter, type VietOcrLineInput } from '@/modules/ocr/vietocr-adapter';
import { InputError, limitedBody, checkImage } from './api';
import { CANDIDATE_OCR_CONFIG, DOCUMENT_LIMITS } from './config';
import type { NormalizedBoundingBox } from '@/shared/contracts';

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
type Recognizer = Pick<VietOcrAdapter, 'recognizeLines'>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function handleCandidateOcr(req: Request, factory: () => Recognizer = () => new VietOcrAdapter({ allowOfflineFallback: false, timeoutMs: DOCUMENT_LIMITS.timeoutMs })): Promise<Response> {
  try {
    if (!(req.headers.get('content-type') || '').includes('application/json')) throw new InputError('UNSUPPORTED_CONTENT_TYPE', 415);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await limitedBody(req))); }
    catch (error) { if (error instanceof InputError) throw error; throw new InputError('INVALID_REQUEST', 400); }
    if (!Array.isArray(body?.lines) || !body.lines.length) throw new InputError('EMPTY_REGIONS', 400);
    if (body.lines.length > CANDIDATE_OCR_CONFIG.maxRegions) throw new InputError('TOO_MANY_REGIONS', 413);
    const ids = new Set<string>();
    const lines: VietOcrLineInput[] = [];
    let pixels = 0;
    for (const line of body.lines) {
      if (!line || typeof line.lineId !== 'string' || !/^[A-Za-z0-9_.-]{1,120}$/.test(line.lineId) || ids.has(line.lineId)) throw new InputError('INVALID_REGION_ID', 400);
      ids.add(line.lineId);
      const box = line.coordinates;
      if (!Array.isArray(box) || box.length !== 4 || box.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
        || box[0] >= box[2] || box[1] >= box[3]) throw new InputError('INVALID_REGION_GEOMETRY', 400);
      const match = typeof line.image === 'string' && /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(line.image);
      if (!match) throw new InputError('INVALID_IMAGE', 400);
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.toString('base64') !== match[2]) throw new InputError('INVALID_IMAGE', 400);
      const image = await checkImage(bytes, match[1]);
      pixels += image.width * image.height;
      if (pixels > DOCUMENT_LIMITS.imagePixels) throw new InputError('IMAGE_LIMIT_EXCEEDED', 413);
      lines.push({ lineId: line.lineId, image: line.image, coordinates: box as NormalizedBoundingBox, originalWidth: image.width, originalHeight: image.height });
    }
    if (process.env.DOCUMENT_OCR_PROVIDER && process.env.DOCUMENT_OCR_PROVIDER !== 'vietocr') throw new InputError('OCR_NOT_CONFIGURED', 503);
    const started = performance.now();
    const recognized = await factory().recognizeLines(lines, req.signal);
    const predictions = lines.map(line => {
      const recognizedLine = recognized.find(item => item.lineId === line.lineId);
      return { lineId: line.lineId, text: recognizedLine?.rawText ?? '', confidence: recognizedLine?.confidence ?? null, coordinates: line.coordinates };
    });
    return json({ success: true, predictions, requiresReview: true,
      provenance: { provider: 'vietocr', variant: 'primary-crops', attempt: 1, timingMs: Math.round(performance.now() - started) },
      warnings: predictions.every(p => !p.text.trim()) ? ['OCR_EMPTY_TEXT'] : [] });
  } catch (error) {
    if (error instanceof InputError) return json({ success: false, error: 'Yêu cầu vùng OCR không hợp lệ hoặc vượt giới hạn. Chọn JPEG/PNG và tối đa 70 vùng.', code: error.code }, error.status);
    const message = error instanceof Error ? error.message : '';
    const busy = /status 429|busy/i.test(message);
    return json({ success: false, error: busy ? 'VietOCR đang bận. Hãy thử lại sau.' : 'VietOCR chưa sẵn sàng hoặc quá thời gian chờ. Kiểm tra dịch vụ cục bộ cổng 8000.', code: busy ? 'OCR_BUSY' : 'OCR_UNAVAILABLE' }, busy ? 429 : 503);
  }
}
