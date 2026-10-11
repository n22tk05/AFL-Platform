# Step 74 — Evidence-based review prioritization for repeated tables

## Mục tiêu

Giảm số ô bị đẩy vào hàng ưu tiên review ở bước `/admin/upload` khi bố cục bảng lặp đã được nhận diện nhất quán, nhưng không tự xác nhận hay xuất bản biểu mẫu.

## Thay đổi

- Phân biệt bảng lặp được map bằng header trực tiếp, không phải header carry/row suy diễn kéo dài, và có ít nhất hai hàng nhiều ô thẳng cột với header: các ô văn bản nhận reason `TABLE_ROW_COLUMN_GROUNDED` (gợi ý, không ưu tiên đỏ).
- Bảng không đủ hai hàng, header thiếu, hàng không khớp header, checkbox matrix và bảng nối trang vẫn giữ các reason ưu tiên review hiện có.
- Khi người dùng mở upload, status `suggested` vẫn chỉ là gợi ý. UI tiếp tục yêu cầu admin đối soát nhãn/vùng; API duyệt độc lập vẫn yêu cầu `reviewConfirmed: true` và workflow chờ duyệt.
- Thêm test âm tính: bảng chỉ có một hàng dữ liệu tiếp tục `needs_review`.

## Kết quả trên holdout độc lập

| Biểu mẫu | Trường cần chú ý trước | Sau | Giảm hàng ưu tiên | Nhãn chính xác | Hình học | Ô bảng còn bị ưu tiên |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| QT-09-HSB | 28/33 | 4/33 | 85.7% | 24/24 | IoU trung bình 0.927, thấp nhất 0.901; 0 FP/FN | 0/24 |
| CT01 (F20-p1) | 51/60 | 6/60 | 88.2% | 45/45 | IoU trung bình 0.967, thấp nhất 0.930; 0 FP/FN | 0/45 |

Tổng cộng **69/69 ô** giữ nhãn chính xác và tọa độ đã đo, trong khi **69 ô** chuyển khỏi hàng ưu tiên sang gợi ý có thể đối soát. Số trường chú ý còn lại là trường khác bảng; không tự động duyệt biểu mẫu. Đây là phép đo giảm số mục trong hàng ưu tiên, chưa phải đo thời gian thực tế của admin.

## Kiểm thử

- VietOCR service: **38/38 passed**.
- Nhận diện vùng/nhãn TypeScript: **76/76 passed**.
- Nhận diện đa trang: **7/7 passed**; header nối trang và hàng suy diễn vẫn cần review.
- Browser upload production build: **2/2 passed** trên QT-09-HSB và CT01; test chặn ghi asset/sinh kịch bản, không ghi DB.
- Production build và TypeScript check: thành công. Còn các cảnh báo lint hiện hữu về `<img>` và dependencies `useMemo`.
- Kiểm tra xác nhận cuối: `form.controller.ts` từ chối request thiếu `reviewConfirmed: true`; chỉ workflow `PENDING_REVIEW` được repository chuyển sang `ACTIVE` sau bước duyệt.

## Giới hạn và tiếp theo

- Hai phôi là bằng chứng ban đầu cho bảng lặp ba hàng, chưa đại diện cho mọi biểu mẫu, font, scan nghiêng, bảng mở đáy hay trang tiếp nối.
- Chưa đo thao tác/thời gian admin. Bước tiếp theo là benchmark ba hoặc nhiều dạng bảng độc lập nữa, chạy trước/sau trên UI, ghi số nhãn/tọa độ phải sửa và thời gian; rollback/hạn chế rule nếu xuất hiện sai số.
- Kiểm tra rộng hơn trang upload vẫn cần sửa selector cũ ở test `/admin/library` (test tìm button trong khi UI hiện link); lỗi đó dừng trước OCR và không được tính là kết quả nhận diện.

## An toàn dữ liệu

- Chỉ dùng hai phôi trắng trong bộ tài liệu kiểm thử; không dùng dữ liệu công dân.
- Không lưu workflow/asset vào DB, không gọi Gemini và không tự duyệt hay công bố biểu mẫu.
