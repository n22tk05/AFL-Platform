/** Actionable hints, not calibrated probabilities or an accuracy guarantee. */
export const CAMERA_FEEDBACK: Record<string, string> = {
  DOCUMENT_CORNERS_NEED_REVIEW: 'Chưa xác định chắc bốn mép giấy. Dùng “Chỉnh 4 góc giấy” và chọn đúng phần tài liệu.',
  MULTIPLE_PAGES_DETECTED: 'Ảnh có thể chứa nhiều tờ giấy. Chọn bốn góc của một tờ; đọc từng tờ riêng.',
  CAMERA_LOW_LIGHT: 'Ảnh thiếu sáng. Đã thử cân bằng nền; nếu chữ vẫn mờ, tăng ánh sáng tán xạ và giữ máy chắc.',
  CAMERA_LOW_CONTRAST: 'Chữ và nền có độ tương phản thấp. Đối chiếu bản gốc; tránh chụp qua lớp nhựa hoặc ảnh đã nén nhiều lần.',
  CAMERA_BLUR_POSSIBLE: 'Có dấu hiệu mất nét/rung. Chạm lấy nét vào chữ, giữ máy đứng yên; phần nét đã mất có thể cần chụp lại.',
  CAMERA_GLARE_POSSIBLE: 'Có vùng sáng mạnh trên nền tối. Kiểm tra chữ dưới vùng lóa; đổi góc đèn hoặc tắt flash khi chụp lại.',
  CAMERA_TEXT_TOO_SMALL: 'Có chữ nhỏ cần đối chiếu. Hệ thống đã thử đọc những nét nhỏ đủ rõ; chụp gần hơn nếu số hoặc dấu còn sai.',
  DESKEW_OUTPUT_LIMIT: 'Giới hạn độ phân giải ngăn nắn góc này. Chọn riêng vùng giấy hoặc giảm kích thước ảnh.',
};
