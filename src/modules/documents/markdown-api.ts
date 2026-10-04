import { InputError, parseDocumentImage } from './api';
import { DocumentPipelineError } from './errors';
import type { MarkdownExportService } from './services/markdown-export.service';

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const messages: Record<string, string> = {
  OCR_NOT_CONFIGURED: 'Chưa cấu hình Google Document AI Enterprise OCR hoặc quyền truy cập. Kiểm tra project, location, processor và Application Default Credentials trên máy chủ.',
  OCR_RATE_LIMITED: 'Dịch vụ OCR đang giới hạn yêu cầu. Hãy kiểm tra quota và thử lại sau.',
  OCR_TIMEOUT: 'Quá thời gian chờ nhận diện chữ (Gateway Timeout). Hãy thử lại hoặc chọn ảnh có độ tương phản rõ nét hơn.',
  OCR_EMPTY_TEXT: 'Không đọc được nội dung. Hãy dùng ảnh rõ nét, đủ sáng và đầy đủ trang giấy.',
  OCR_LIMIT_EXCEEDED: 'Kết quả vượt giới hạn một trang. Hãy chia nhỏ tài liệu.',
  OCR_INVALID_RESPONSE: 'Phản hồi OCR không đầy đủ hoặc sai định dạng. Hãy thử lại.',
};

/** Returns a draft for human review, never an automatic file attachment. */
export async function handleMarkdownConversion(req: Request, factory: () => MarkdownExportService): Promise<Response> {
  try {
    const input = await parseDocumentImage(req);
    const data = await factory().convert(input);
    return Response.json({ success: true, data }, { headers });
  } catch (error) {
    const code = error instanceof InputError || error instanceof DocumentPipelineError ? error.code : 'DOCUMENT_EXPORT_FAILED';
    const status = error instanceof InputError ? error.status
      : code === 'OCR_NOT_CONFIGURED' ? 503
      : code === 'OCR_RATE_LIMITED' ? 429 : code === 'OCR_TIMEOUT' ? 504
      : code === 'OCR_EMPTY_TEXT' || code === 'OCR_LIMIT_EXCEEDED' ? 422 : 502;
    return Response.json({ success: false, error: { code, message_vi: messages[code] ?? (error instanceof InputError
      ? 'Hãy chọn ảnh JPEG/PNG hợp lệ, tối đa 8 MB.' : 'Không thể kết nối dịch vụ OCR. Hãy kiểm tra microservice VietOCR hoặc cấu hình Document AI.') } }, { status, headers });
  }
}
