# Tách confidence OCR khỏi cảnh báo ưu tiên

**Phạm vi:** phân cấp cảnh báo ở `/admin/upload`; không đổi tọa độ, nhãn OCR, yêu cầu người duyệt hoặc API lưu phôi. Test bằng phôi trắng công khai Hải Phòng; không lưu form, không gọi Gemini, không ghi database.

## Bằng chứng hiệu chỉnh

Ghép các ô với ground truth trên bốn holdout ở ngưỡng IoU ≥ 0,5, rồi lấy trung bình confidence của OCR block được ô nhận diện tham chiếu:

| Holdout | Ô khớp tọa độ | Nhãn khớp | Confidence trung bình nhãn đúng | Confidence trung bình nhãn sai |
| --- | ---: | ---: | ---: | ---: |
| Giấy ủy quyền P61 | 14 | 8 | 0,813 | 0,863 |
| Đơn xây dựng P59 | 28 | 8 | 0,837 | 0,849 |
| Khai sinh P70 | 29 | 23 | 0,858 | 0,871 |
| Đăng ký kết hôn P20 | 26 | 21 | 0,848 | 0,853 |

Trên tập ghép được này confidence trung bình của nhãn sai còn cao hơn nhãn đúng ở cả bốn bộ. Đây chưa phải calibration tổng quát, nhưng đủ bác bỏ việc dùng ngưỡng 0,93 đơn lẻ như cảnh báo ưu tiên sai nhãn.

## Thay đổi

- `OCR_LOW_CONFIDENCE` vẫn nằm trong `reviewReasons` để admin thấy tín hiệu gốc, nhưng không tự chuyển ô thành `needs_review`.
- Các rủi ro hình học/nhãn/scope và confidence không có sẵn vẫn ưu tiên cảnh báo.
- Bảng chi tiết chỉ liệt kê nguyên nhân thuộc nhóm ưu tiên; bằng chứng trung tính như `LABEL_GEOMETRY_MATCH`, `SAME_LINE_CONTINUATION` và `MULTILINE_CONTINUATION` không còn bị trình bày như lỗi.
- Thanh ô dùng màu/cảnh báo riêng: tam giác hổ phách cho đối soát ưu tiên, biểu tượng thông tin xanh cho confidence OCR chưa hiệu chỉnh.
- Phần mô tả nhắc rõ trạng thái gợi ý không thay thế xác nhận admin. Checkbox xác nhận từng ô và khóa quản trị vẫn chặn thao tác lưu.

## Kiểm thử và quan sát giao diện

- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 62/62.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS. Còn cảnh báo lint `<img>` và dependency `useMemo` ở các vùng UI khác; không chặn build.
- Chạy build production mới trên `http://localhost:3001/admin/upload`, tải lại cùng phôi trắng và chạy OpenCV/VietOCR: 38 ô, 24 cảnh báo ưu tiên và 14 thông tin OCR. Luồng hiển thị kết quả đúng sau khi khởi động lại Next production server để nạp bundle mới.
- Chọn ô #1 cho thấy chỉ còn `REPEATED_LABEL_SCOPE_REVIEW`; chọn ô #5 hiển thị thông tin confidence chưa hiệu chỉnh với biểu tượng xanh, không gọi đó là lỗi ô.
- Nút “Lưu phôi và Khởi tạo kịch bản chờ duyệt” vẫn bị khóa vì chưa có khóa quản trị và chưa tích checkbox xác nhận. Không bấm nút, không tạo dữ liệu lưu trữ.

## Việc còn lại

- 24/38 ô vẫn cần cảnh báo ưu tiên do các lý do như ước lượng vị trí nhãn hoặc phạm vi nhãn lặp. Cần đo từng loại lý do với ground truth, không tự bỏ cảnh báo dựa trên confidence.
- 5 FP còn lại ở holdout kết hôn cần quy tắc loại vùng riêng và test regression trước khi mở rộng.
- Chưa đo thời gian thao tác admin hoặc tỷ lệ sửa nhãn/box qua nhiều cán bộ. Hiện có bằng chứng giảm 14 cảnh báo không phân biệt ở phôi demo và benchmark tương đối so với blind baseline, chưa thể kết luận tiết kiệm thời gian tổng thể.
