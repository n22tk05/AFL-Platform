# Suy luận phạm vi cột cho nhãn OCR có gạch đầu dòng

**Mục tiêu:** giảm thao tác sửa nhãn cho biểu mẫu hai cột mà không hạ mức kiểm duyệt bắt buộc. Chỉ dùng phôi trắng holdout P20; không lưu biểu mẫu, ghi database hoặc gọi Gemini.

## Phát hiện

- OCR P20 đọc hai nhãn cột là `- Quốc tịch:`. Bộ suy luận cột nhận diện hai tiêu đề “Họ, chữ đệm, tên bên nữ/nam”, nhưng bộ lọc nhãn tổng quát không bỏ tiền tố `-`, nên bỏ qua hai trường Quốc tịch.
- Trường hợp này gây trùng nhãn và làm admin phải tự xác định bên nào thuộc cột nào dù bằng chứng hình học và tiêu đề cột đã có.

## Thay đổi

- Chuẩn hóa tiền tố `-` / `•` trước khi so nhãn với danh sách nhãn cá nhân tổng quát.
- Sau khi suy luận, dùng nhãn đã chuẩn hóa để xuất `Quốc tịch bên nữ` / `Quốc tịch bên nam`; giữ `COLUMN_ACTOR_SCOPE_INFERRED` để yêu cầu admin xác minh, không tự bỏ qua review.
- Thêm test hồi quy với hai tiêu đề cột ghép cặp và nhãn `- Quốc tịch:` lặp lại; xác nhận đúng thứ tự bên nữ/bên nam và không còn `REPEATED_LABEL_SCOPE_REVIEW`.

## Kiểm chứng

- Test mục tiêu trước khi sửa: thất bại vì trả hai nhãn `- Quốc tịch` chưa phân biệt.
- Test mục tiêu sau sửa: pass; bộ `form-region-recognition` + `ocr-text-evaluation`: **69/69 pass**.
- `npx tsc --noEmit --incremental false`: pass.
- `npm run build`: pass; còn các cảnh báo `<img>` và dependency hook có sẵn ngoài phạm vi.
- Đã chạy lại OCR P20 trên `/admin/upload` bằng bản build mới. UI hiển thị #10 `Quốc tịch bên nữ`, #12 `Quốc tịch bên nam`; tổng vẫn 30 trường và 23 trường cần ưu tiên đối soát. Không lưu phôi.
- Tọa độ không đổi so với lượt trước: benchmark P20 gần nhất vẫn **26 TP / 4 FP / 3 FN** tại IoU ≥ 0,5; 2 nhãn đúng được bổ sung nâng kết quả nhãn từ **23/26 lên 25/26** trên các dự đoán khớp. Kết quả này chỉ đo một holdout, không phải nghiệm thu tổng quát.

## Giới hạn và việc tiếp theo

- Hai trường suy luận cột vẫn cần admin xác nhận; không thể giảm số cảnh báo nếu chưa hiệu chuẩn độ tin cậy/phân loại rủi ro trên nhiều biểu mẫu.
- P20 còn các vùng sát ngưỡng IoU (lịch sử hôn nhân và ngày ký), checkbox “Không” lệch đáng kể, cùng một guide gần vùng chữ ký chưa phân loại chắc chắn. Không dịch bbox chỉ để vượt ngưỡng.
- Cần đo thời gian đối soát admin trên nhiều biểu mẫu trắng độc lập và đánh giá precision/recall của cảnh báo trước khi thay đổi chính sách review.
