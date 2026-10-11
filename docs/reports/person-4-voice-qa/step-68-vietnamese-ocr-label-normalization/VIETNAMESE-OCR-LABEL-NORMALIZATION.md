# Chuẩn hóa lỗi OCR phổ biến trong nhãn tiếng Việt

## Mục tiêu

Giảm việc admin sửa thủ công lỗi VietOCR nhầm `đ` thành `d` trong cụm nhãn cố định “chữ đệm”, không nới tiêu chí tọa độ hoặc giảm cảnh báo suy luận.

## Thay đổi

- Chuẩn hóa riêng mẫu `chữ dệm` thành `chữ đệm` khi xử lý văn bản nhận diện. Không sửa tổng quát ký tự `d` thành `đ`.
- Thêm test hồi quy cho nhãn “Họ, chữ dệm, tên người yêu cầu”.
- Không thay đổi tọa độ, vai trò, phân nhóm trường, lý do ưu tiên hoặc quy trình phê duyệt.

## Kiểm chứng

- Test vùng nhận diện: **70/70 pass**.
- `npx tsc --noEmit --incremental false`: pass.
- `npm run build`: pass; còn các cảnh báo lint `<img>` và dependency `useMemo` không thuộc chặng này.
- Chạy `/admin/upload` với phôi trắng P70 sau build mới: giao diện hiển thị “Họ, chữ đệm, tên người yêu cầu”. Bản JSON cục bộ ghép với ground truth đạt **29 TP / 0 FP / 0 FN**, nhãn chính xác **24/29** so với **23/29** ở lần chạy trước thay đổi.
- Giữ nguyên 23 ô cần chú ý và nút điều hướng ưu tiên; nút lưu vẫn khóa. Không lưu biểu mẫu, không ghi DB, không gọi Gemini.

## Giới hạn

Mức cải thiện đã được xác nhận trên một lỗi và một holdout. Chưa chứng minh giảm thời gian tổng thể của admin. P70 còn 5 nhãn không trùng tuyệt đối, trong đó các suy luận vai trò có thể hữu ích cho kịch bản nhưng cần người kiểm tra.

## Tiếp theo

Tiếp tục phân tích riêng nhóm tọa độ sát ngưỡng trên P20 và nhãn OCR bị cắt trên các holdout độc lập. Không hạ mức ưu tiên cho actor scope hoặc checkbox chỉ từ mẫu đơn lẻ.
