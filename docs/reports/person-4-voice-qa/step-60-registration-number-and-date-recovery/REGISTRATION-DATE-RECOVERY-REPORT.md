# Khôi phục nhãn số đăng ký và ngày cấp ở bước tạo phôi

**Phạm vi:** cụm “Đã đăng ký kết hôn tại / số / cấp ngày / tháng - năm” trên phôi trắng P20 tại `/admin/upload`. Không lưu biểu mẫu, không gọi Gemini, không ghi database và không dùng dữ liệu công dân.

## Phát hiện

- VietOCR trả riêng các block “Đã đăng ký kết hôn tại(4)”, “số”, “cấp ngày...” và “tháng - năm”. Tọa độ OCR thật của chúng được kiểm tra qua `/api/documents/json`.
- OpenCV có đủ các guide tương ứng, nhưng heuristic nối dòng lệch đã gộp guide “Ngày cấp” thành dòng tiếp diễn của trường “Đã đăng ký kết hôn tại”; guide của “số” cũng bị gộp vào trường đó.
- OCR “số” có confidence 0,531. Vì vậy suy luận nhãn mới vẫn yêu cầu admin đối soát; không coi confidence là chứng minh nhãn đúng.

## Thay đổi

- Tách guide “Số đăng ký” khỏi trường nhiều dòng khi có đồng thời nhãn đăng ký, block OCR “số” nằm ngay sau nhãn và guide thẳng hàng ở bên phải.
- Tách guide ngày cấp khỏi nhóm tiếp diễn khi có cụm OCR xác nhận “cấp ngày...” và “tháng - năm”; gán nhãn ngày, tháng, năm theo thứ tự trái sang phải.
- Giữ nguyên các vùng còn lại của “Đã đăng ký kết hôn tại”, không tạo nhãn nếu thiếu bằng chứng OCR tương ứng. Các suy luận đều giữ trạng thái `needs_review`.

## Kiểm chứng

- Test nhận diện P20 tổng hợp bằng tọa độ OCR/guide thực tế: xác nhận “Đã đăng ký kết hôn tại” vẫn có 2 vùng, “Số đăng ký” được tách riêng, và 3 guide thành “Ngày cấp”, “Tháng cấp”, “Năm cấp”.
- Test âm tính xác nhận một số điện thoại không được gán nhầm thành “Số đăng ký”.
- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 65/65.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS; còn cảnh báo `<img>` và `useMemo` không liên quan ở các trang khác.
- Trên giao diện production local, quét lại phôi trắng P20: 31 trường, 22 trường cần chú ý; dải kết quả có đủ `Số đăng ký`, `Ngày cấp`, `Tháng cấp`, `Năm cấp`. Không lưu bản nháp, không tích xác nhận review, nút lưu vẫn khóa.
- So khớp tạm thời riêng 5 vùng của cụm này với ground truth P20: 5/5 nhãn khớp chính xác; IoU vùng chính lần lượt là 0,962 (`registered_at`), 0,887 (`registration_number`), 0,640 (`registration_day`), 0,617 (`registration_month`) và 0,818 (`registration_year`). Đây là phép đo cục bộ theo từng vùng, không thay thế benchmark toàn trang.

## Giới hạn và việc tiếp theo

- Đây là cải thiện cục bộ trên một cụm nhãn có cấu trúc xác định, chưa chứng minh giảm thời gian admin hoặc cải thiện toàn bộ benchmark P20. Không cập nhật điểm benchmark rộng chỉ từ một trường hợp.
- Số trường tăng từ 30 lên 31 vì guide ngày cấp trước đây bị nhập vào trường nhiều dòng; 22 cảnh báo gồm cả các trường mới tách cần kiểm tra, do đó chưa thể tuyên bố tổng khối lượng duyệt đã giảm.
- P20 vẫn cần xử lý các vùng dư/thiếu và các nhãn không liên quan đến cụm ngày. Tiếp theo cần so khớp lại cả 29 ground-truth fields, audit các false positive, rồi kiểm tra quy tắc mới trên các biểu mẫu khác có cụm “cấp ngày”.
- Không được bỏ bước xác nhận của admin hay hạ trạng thái review dựa trên confidence chưa hiệu chỉnh.
