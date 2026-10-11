# Step 73 — Recover split multiline table-header text

## Mục tiêu

Khôi phục chữ bị mất trong tiêu đề cột nhiều dòng của bước tạo phôi `/admin/upload`, sau đó xác minh trên các phôi trắng độc lập, đồng thời giữ nguyên luồng duyệt của admin.

## Nguyên nhân và thay đổi

- Chẩn đoán đầu vào QT-09 cho thấy VietOCR đã nhận `cước công dân/` nhưng gộp dòng kế tiếp `hộ chiếu` vào cùng crop. Nguyên nhân là nhánh phân đoạn riêng của ô tiêu đề bảng gọi lại bộ phân đoạn với `split_multiline=False`.
- Ô tiêu đề phóng 1.5× nay cũng được phân đoạn dòng nhiều dòng (`split_multiline=True`). OCR trả riêng `hộ chiếu` với confidence 0.931.
- Chuẩn hóa tiêu đề bảng bỏ khoảng trắng quanh dấu `/`, nên mảnh OCR ghép thành nhãn nguyên văn `...công dân/hộ chiếu`.
- Bổ sung kiểm thử Python về giới hạn tọa độ crop; mở rộng kiểm thử TypeScript cho nhãn phân cách bằng `/`; bổ sung browser holdout CT01 chạy trên trang upload. Browser tests chặn endpoint ghi asset và sinh kịch bản.

## Kết quả holdout

| Phôi trắng, luồng `/admin/upload` | Ô kỳ vọng / khớp | Ô thừa | Nhãn chính xác | IoU trung bình / thấp nhất | Ô bảng vẫn cần review |
| --- | ---: | ---: | ---: | ---: | ---: |
| QT-09-HSB | 24 / 24 | 0 | 24 / 24 | 0.927 / 0.901 | 24 / 24 |
| CT01 (F20-p1) | 45 / 45 | 0 | 45 / 45 | 0.967 / 0.930 | 45 / 45 |

QT-09 tăng từ **21/24 lên 24/24** nhãn chính xác so với bước 72; tọa độ giữ nguyên. CT01 xác nhận thay đổi không làm giảm nhãn/hình học ở một bảng độc lập. Browser tests: **2/2 passed**, không gọi Gemini, không ghi DB và không lưu phôi.

## Kiểm thử

- VietOCR service: **38/38 passed**.
- Form-region recognition: **75/75 passed**.
- Production build: thành công; còn cảnh báo lint hiện hữu về `<img>` và dependencies `useMemo`.
- TypeScript `--noEmit --incremental false`: thành công.
- `git diff --check`: không có lỗi whitespace; Git chỉ cảnh báo chuyển CRLF cho hai file Python.

## Giới hạn và tiếp theo

- Chưa giảm được số trường review: QT-09 vẫn 28/33 trường cần chú ý; CT01 là 51/60. Mọi ô bảng trong cả hai holdout vẫn `needs_review` do `TABLE_ROW_COLUMN_GROUNDING` là lý do ưu tiên. Cải thiện OCR chưa chứng minh giảm số thao tác hay thời gian của admin.
- Tiếp theo: xây benchmark review effort (số trường ưu tiên, số lần sửa nhãn/tọa độ và thời gian thao tác) trên nhiều holdout; phân biệt rủi ro tọa độ chưa chắc với cấu trúc lặp đã được khớp, nhưng chỉ giảm ưu tiên sau khi kiểm định thêm các dạng bảng và bảo toàn xác nhận cuối cùng của admin.
- Một lượt kiểm tra research cũ ở `/admin/library` hết timeout trước phân tích vì test tìm nút “Thêm phôi trống” trong khi UI hiện là link tới `/admin/upload`; lượt đó không cung cấp bằng chứng OCR và không được tính vào kết quả holdout.

## An toàn dữ liệu

- Chỉ xử lý phôi trống kiểm thử đã có trong bộ fixture/tài liệu nghiên cứu.
- Không lưu phôi hoặc workflow vào DB, không dùng thông tin công dân, không gọi Gemini và không phê duyệt/công bố biểu mẫu.
