export function templateFileError(file: Pick<File, 'type' | 'size'> | null): string | null {
  if (!file) return null;
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Chỉ nhận ảnh JPEG hoặc PNG. Bác vui lòng chọn lại ảnh phôi.';
  if (file.size === 0) return 'Ảnh phôi rỗng. Bác vui lòng chọn lại ảnh.';
  if (file.size > 8 * 1024 * 1024) return 'Ảnh phôi vượt 8 MB. Bác vui lòng chọn ảnh nhỏ hơn.';
  return null;
}

const messages: Record<string, string> = {
  UNAUTHORIZED: 'Khóa quản trị không đúng. Vui lòng kiểm tra và nhập lại khóa.',
  ADMIN_KEY_UNCONFIGURED: 'Máy chủ chưa cấu hình khóa quản trị. Vui lòng liên hệ người quản trị hệ thống.',
  DATABASE_UNAVAILABLE: 'Cơ sở dữ liệu tạm thời không khả dụng. Vui lòng thử lại sau.',
  AI_UNAVAILABLE: 'Dịch vụ sinh kịch bản chưa khả dụng. Vui lòng thử lại sau; chưa có kịch bản mới được xác nhận.',
  MANIFEST_REVIEW_REQUIRED: 'Vui lòng đối chiếu và xác nhận từng ô trước khi sinh kịch bản.',
  INVALID_MANIFEST: 'Manifest chưa hợp lệ. Vui lòng kiểm tra mã biểu mẫu, nhãn và tọa độ từng ô.',
  OCR_FRAME_MISMATCH: 'Ảnh và tọa độ OCR không cùng khung. Vui lòng phân tích lại ảnh phôi.',
  FRAME_MISMATCH: 'Kích thước ảnh lưu và manifest không khớp. Vui lòng phân tích lại ảnh phôi.',
  INVALID_INPUT_GEOMETRY: 'Tọa độ ô không hợp lệ. Vui lòng kiểm tra vùng cần điền.',
  INVALID_OCR_GEOMETRY: 'Tọa độ OCR không hợp lệ. Vui lòng phân tích lại ảnh phôi.',
  TOO_MANY_FORM_BOXES: 'Có quá nhiều ô được phát hiện. Vui lòng kiểm tra lại phôi và kết quả phát hiện ô.',
  NETWORK_ERROR: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
};

function details(reason: unknown): { status?: number; code?: string } {
  if (!reason || typeof reason !== 'object') return {};
  const error = reason as { status?: unknown; code?: unknown; message?: unknown };
  return { status: typeof error.status === 'number' ? error.status : undefined,
    code: typeof error.code === 'string' ? error.code : typeof error.message === 'string' ? error.message : undefined };
}

export function formErrorMessage(reason: unknown, fallback: string): string {
  const { status, code } = details(reason);
  if (code && typeof messages[code] === 'string') return messages[code];
  if (status === 401) return messages.UNAUTHORIZED;
  if (status === 503) return 'Máy chủ tạm thời không khả dụng. Vui lòng thử lại sau.';
  if (status === 404) return 'Không tìm thấy biểu mẫu đã ban hành. Vui lòng chọn biểu mẫu khác.';
  if (status === 409) return 'Dữ liệu chưa đủ điều kiện hoặc đã thay đổi. Vui lòng nạp lại và đối soát trước khi tiếp tục.';
  if (reason instanceof TypeError) return messages.NETWORK_ERROR;
  if (status === undefined && reason instanceof Error && /[À-ỹ]/.test(reason.message) && reason.message.length <= 240) return reason.message;
  return fallback;
}

export function citizenWorkflowFeedback(reason: unknown, hasFormCode: boolean): { title: string; message: string; retryable: boolean } {
  if (!hasFormCode) return { title: 'Bác chưa chọn biểu mẫu', message: 'Bác vui lòng quay về trang chính để chọn biểu mẫu cần kê khai.', retryable: false };
  const { status, code } = details(reason);
  if (status === 404 || code === 'WORKFLOW_NOT_PUBLISHED') return { title: 'Không tìm thấy biểu mẫu đã ban hành',
    message: 'Biểu mẫu không tồn tại hoặc chưa được ban hành. Bác vui lòng kiểm tra mã hoặc chọn biểu mẫu khác.', retryable: false };
  if (status === 503) return { title: 'Máy chủ tạm thời không khả dụng',
    message: 'Bác vui lòng thử lại sau. Ứng dụng không dùng kịch bản mẫu thay thế.', retryable: true };
  return { title: 'Chưa tải được hướng dẫn',
    message: 'Bác vui lòng kiểm tra kết nối và thử lại. Ứng dụng không dùng kịch bản mẫu thay thế.', retryable: true };
}
