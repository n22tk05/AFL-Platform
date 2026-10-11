# Khôi phục ngữ cảnh checkbox Có/Không từ OCR bị ghép dòng

**Mục tiêu:** tự điền nhãn hai checkbox trên P20 chính xác hơn để admin không phải sửa nội dung; giữ cảnh báo cho suy luận ngữ cảnh và không thay đổi yêu cầu duyệt thủ công.

## Bằng chứng và cách sửa

- VietOCR đọc khối đầu thành `mình đề nghị cấp bản sao(% Có`, trong khi `Không` là khối kế tiếp ngay dưới. Quy tắc cũ gán cả chuỗi hỏng cho ô Có và không gắn câu hỏi cho ô Không.
- Với khối OCR gắn hình học trực tiếp với checkbox, nhận diện từ cuối dòng các lựa chọn Có/Không/Nam/Nữ; nhận dạng riêng cụm có bằng chứng `đề nghị cấp bản sao`, chấp nhận nhiễu tiền tố `mình` và dấu câu OCR.
- Cho phép cụm câu hỏi này gắn với checkbox Không ngay bên dưới khi vùng OCR giao theo chiều ngang và sát theo chiều dọc. Không dùng quy tắc chung cho các lựa chọn bên cạnh không có câu hỏi.
- Cả hai trường tiếp tục mang `CHECKBOX_QUESTION_SCOPE_INFERRED` và vẫn cần admin xác nhận.

## Kiểm chứng

- Test hồi quy tái hiện lỗi P20 và kiểm tra âm tính khi chỉ có `Có` / `Không` không câu hỏi: pass.
- Bộ test vùng nhận diện + OCR text: **70/70 pass**; TypeScript pass; `npm run build` pass (còn cảnh báo lint cũ về `<img>` và `useMemo`).
- Đã chạy lại `/admin/upload` trên bản build mới với phôi trắng P20. UI hiển thị `Đề nghị cấp bản sao — Có` và `Đề nghị cấp bản sao — Không`; 30 trường, 25 ưu tiên đối soát. Hai trường có cờ suy luận, không được tự động duyệt.
- Dùng draft mới và ground truth P20 đã hiệu chỉnh ở chặng 65: ghép một-một IoU ≥ 0,5 đạt **27 TP / 3 FP / 2 FN** và **27/27 nhãn chính xác trong các cặp tọa độ khớp**. Hai FN còn lại là `marital_history`, `signing_day` gần ngưỡng IoU; ba FP gồm hai vùng gần ngưỡng và một guide chưa gán nhãn.
- Không bấm lưu, không ghi DB và không gọi Gemini.

## Tác động và giới hạn

- Giảm thao tác sửa nhãn cho hai checkbox; không giảm số cảnh báo ưu tiên vì nguồn nhãn/câu hỏi vẫn là suy luận và cần kiểm tra.
- Đây là kết quả trên một holdout, không phải bằng chứng về thời gian tiết kiệm trung bình. Cần xác thực cùng mẫu OCR trên holdout có checkbox câu hỏi xuống dòng khác trước khi mở rộng quy tắc.
- P20 còn hai vùng sát ngưỡng tọa độ và một guide chưa gán nhãn; không nới ngưỡng để làm đẹp metric.
