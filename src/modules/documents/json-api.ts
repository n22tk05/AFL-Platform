import { InputError, parseDocumentImage } from './api';
import { DocumentPipelineError } from './errors';
import { documentExportSchema } from './json-validator';
import type { JsonExportService } from './services/json-export.service';
import { safeJsonFilename } from './json-download';
export { safeJsonFilename } from './json-download';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' };
const messages: Record<string, string> = {
  OCR_NOT_CONFIGURED: 'VietOCR chưa được cấu hình hoặc thiếu quyền truy cập. Kiểm tra VIETOCR_ENDPOINT.',
  OCR_RATE_LIMITED: 'Dịch vụ VietOCR đang bận. Hãy thử lại sau.',
  OCR_TIMEOUT: 'Dịch vụ OCR quá thời gian chờ. Kiểm tra tiến trình VietOCR và cấu hình timeout.',
  OCR_EMPTY_TEXT: 'Chưa đọc được nội dung; hãy đối chiếu ảnh nguồn.',
  OCR_LIMIT_EXCEEDED: 'Kết quả vượt giới hạn xử lý tài liệu.',
  OCR_INVALID_RESPONSE: 'Phản hồi OCR sai contract; không thể xuất dữ liệu đáng tin cậy.',
  OCR_UNAVAILABLE: 'Không kết nối được VietOCR. Kiểm tra dịch vụ cổng 8000 và VIETOCR_ENDPOINT.',
};
const errorStatus = (code: string) => code === 'OCR_NOT_CONFIGURED' || code === 'OCR_UNAVAILABLE' ? 503 : code === 'OCR_RATE_LIMITED' ? 429 : code === 'OCR_TIMEOUT' ? 504 : code === 'OCR_EMPTY_TEXT' || code === 'OCR_LIMIT_EXCEEDED' ? 422 : 502;
const json = (value: unknown, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
export function handleJsonSchema(): Response { return json(documentExportSchema); }
export async function handleJsonConversion(req: Request, factory: () => JsonExportService): Promise<Response> {
  try {
    const input = await parseDocumentImage(req), data = await factory().convert(input);
    if (data.status === 'failed') {
      const code = data.pages.find(p => p.error)?.error ?? 'OCR_EMPTY_TEXT';
      return json({ success: false, data, error: { code, message_vi: messages[code] ?? messages.OCR_UNAVAILABLE } }, errorStatus(code));
    }
    if (new URL(req.url).searchParams.get('download') === '1') return json(data, 200, { 'Content-Disposition': 'attachment; filename="' + safeJsonFilename(data.documentId) + '"' });
    return json({ success: true, data });
  } catch (error) {
    const code = error instanceof InputError || error instanceof DocumentPipelineError ? error.code : 'DOCUMENT_EXPORT_FAILED';
    return json({ success: false, error: { code, message_vi: messages[code] ?? (error instanceof InputError ? 'Chọn JPEG/PNG hợp lệ, tối đa 8 MB và 12 triệu pixel.' : messages.OCR_UNAVAILABLE) } }, error instanceof InputError ? error.status : errorStatus(code));
  }
}
