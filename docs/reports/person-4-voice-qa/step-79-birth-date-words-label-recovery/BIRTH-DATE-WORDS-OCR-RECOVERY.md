# Step 79 — Recover the birth-date-in-words caption from row evidence

## Mục tiêu

Sửa một lỗi OCR quan sát được trên holdout khai sinh P70 mà không tự xác nhận trường: OCR chỉ đọc `nghi bằng chữ`, trong khi nhãn in là `ghi bằng chữ` và thuộc dòng ngày sinh.

## Thay đổi

- Khi cùng hàng có nhãn `Ngày, tháng, năm sinh`, nhãn OCR `nghi bằng chữ`, vùng nhập cho ngày số nằm ở giữa, và vùng thứ hai nằm bên phải caption, hệ thống tái dựng nhãn hiển thị `Ngày sinh ghi bằng chữ`.
- Bổ sung provenance `OCR_LABEL_RECONSTRUCTED_FROM_SAME_ROW_DATE_CONTEXT`, gắn block ngày sinh nguồn và luôn giữ `needs_review`.
- Không sửa `nghi bằng chữ` khi thiếu nhãn ngày sinh/vùng thứ nhất cùng hàng; có test âm tính cho trường hợp này.
- Không thay đổi OCR text thô từ VietOCR hoặc tọa độ input region; đây là sửa nhãn có điều kiện dựa trên quan hệ bố cục.

## Kết quả P70

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| True positives | 29/29 | 29/29 |
| False positives / false negatives | 0 / 0 | 0 / 0 |
| Nhãn exact với fixture | 24/29 | 25/29 |
| Trường `Ngày sinh ghi bằng chữ` | `nghi bằng chữ` | `Ngày sinh ghi bằng chữ`, vẫn `needs_review` |
| IoU tọa độ của trường này | 0.686 | 0.686 |
| Mục ưu tiên review | 21 | 21 |

Bốn nhãn không exact còn lại ở P70 là nhãn demographic được nối thêm scope `người được khai sinh` từ heading trực tiếp; đây là nội dung ngữ cảnh do ứng dụng thêm, không phải OCR thô. Cần báo cáo riêng exact OCR/label và chất lượng ngữ nghĩa scope khi hoàn thiện benchmark.

## Kiểm thử

- Recognition/manifest/multipage/assets: **123/123 passed**.
- OpenCV: **57/57 passed**; TypeScript và production build passed.
- Browser holdout P20, P70, P89, P43, P49: **5/5 passed** trên build mới.
- Không ghi DB, không lưu biểu mẫu thử, không gọi Gemini; các test chặn asset/admin prompt writes.

## Giới hạn và hướng tiếp theo

- Không cải thiện hình học ở bước này. Trung bình IoU hiện tại của các holdout development P20/P70/P59/P61 nằm khoảng **0.72–0.75** tùy mẫu; nhiều box bị ngắn hoặc lệch vài pixel, nhưng hướng sai số khác nhau giữa mẫu nên chưa áp dụng padding toàn cục.
- P70 giữ 21 mục ưu tiên review dù có 29/29 trường hình học được match; cần đo riêng số mục admin thực sự phải sửa và thời gian review, không dùng `needsReview` đơn thuần làm nghiệm thu.
- Bước tiếp theo là xây báo cáo tọa độ có pixel delta theo cạnh trên/dưới/trái/phải, phân tầng theo `writing_guide`/checkbox/table cell và kiểm định bằng mẫu holdout chưa dùng để chọn ngưỡng.
- Cần đo OCR text thô riêng trước khi suy luận ngữ nghĩa và lưu lại cả hai để admin thấy rõ đâu là VietOCR, đâu là hiệu chỉnh có provenance.
