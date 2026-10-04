import { InputError, parseDocumentImage } from './api';
import { DocumentPipelineError } from './errors';
import type { MarkdownExportService } from './services/markdown-export.service';

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const messages: Record<string, string> = {
  OCR_NOT_CONFIGURED: 'Chưa cấu hình VietOCR hợp lệ. DOCUMENT_OCR_PROVIDER chỉ hỗ trợ vietocr; kiểm tra VIETOCR_ENDPOINT trên máy chủ.',
  OCR_RATE_LIMITED: 'Dịch vụ VietOCR đang bận xử lý hoặc giới hạn yêu cầu. Hãy thử lại sau vài giây.',
  OCR_TIMEOUT: 'Quá thời gian chờ nhận diện chữ (Gateway Timeout). Hãy thử lại hoặc chọn ảnh có độ tương phản rõ nét hơn.',
  OCR_EMPTY_TEXT: 'Không đọc được nội dung. Hãy dùng ảnh rõ nét, đủ sáng và đầy đủ trang giấy.',
  OCR_LIMIT_EXCEEDED: 'Kết quả vượt giới hạn một trang. Hãy chia nhỏ tài liệu.',
  OCR_INVALID_RESPONSE: 'Phản hồi OCR không đầy đủ hoặc sai định dạng. Hãy thử lại.',
  OCR_UNAVAILABLE: 'Không thể kết nối dịch vụ VietOCR. Hãy kiểm tra tiến trình OCR cổng 8000 và VIETOCR_ENDPOINT trên máy chủ.',
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
    return Response.json({ success: false, error: { code, ocrReview: error instanceof DocumentPipelineError ? error.ocrReview : undefined, message_vi: messages[code] ?? (error instanceof InputError
      ? 'Hãy chọn ảnh JPEG/PNG hợp lệ, tối đa 8 MB.' : 'Không thể kết nối dịch vụ VietOCR. Hãy kiểm tra tiến trình OCR cổng 8000 và VIETOCR_ENDPOINT trên máy chủ.') } }, { status, headers });
  }
}
