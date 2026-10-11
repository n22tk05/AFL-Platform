# Kế hoạch phát triển nhận diện biểu mẫu

Nhánh: `codex/form-recognition-and-multiline`. Phạm vi được người dùng mở cho toàn dự án. Không dùng Dely theo yêu cầu trước đó. Giữ nguyên tài liệu nghiên cứu chưa commit, không push/merge khi chưa được yêu cầu.

## Thiết kế

- Tách vùng hình học và trường nghiệp vụ: một field có một hoặc nhiều vùng, phân loại text, multiline, checkbox, ô ký tự và bảng.
- Tìm đường chấm/gạch bằng pixel thay vì dùng vùng cả dòng chữ làm tọa độ nhập.
- Ghép nhãn theo hàng/cột và ranh giới section; không biến tiêu đề, mô tả in sẵn, chữ ký, khung nhóm hoặc header bảng thành trường nhập.
- Giữ bằng chứng và lý do cần review. Admin luôn xác nhận, nhưng chỉ vùng mơ hồ cần sửa; không tự publish.
- Hợp đồng mở rộng theo trường optional, biểu mẫu legacy vẫn đọc được. Tọa độ là YXYX trên ảnh chuẩn. Không giao AI tự tạo tọa độ.
- Metadata nhiều vùng lưu qua artifact có hash đang dùng, không đổi Prisma schema hay ghi dữ liệu thật trong kiểm thử.

## Chặng và tiêu chí

| Chặng | Đầu ra | Test phân biệt đúng/sai |
|---|---|---|
| 1. Hình học và ngữ nghĩa | Detector đường chấm/gạch; bỏ vùng tĩnh; giữ ô inline; nhận bảng/checkbox/dãy ký tự | Ảnh pixel thật: đường chấm vs chữ; tọa độ không chứa nhãn; header không thành input; hai chủ thể không bị gom |
| 2. OCR và multiline | Không gọi model cho ô trắng có viền/chấm; phân đoạn chữ tách khỏi bảng; field nhiều region | Ô trắng có viền không infer; chữ thấp tương phản vẫn được giữ; hai dòng một field, nhãn mới chặn gộp |
| 3. Khớp review–Voice–FE | Editor từng region; nối/tách thủ công; một bước đọc cho một field; metadata giữ sau reload | Workflow giả mạo region bị từ chối; lưu/đọc/duyệt giữ region; FE nhiều highlight, không đọc lại từng dòng |
| 4. Hồi quy và baseline | Test cục bộ, typecheck/build và báo cáo tiến độ/số đo | Không cloud/DB thật trong test mặc định; đo ca đã có ground truth, không gọi 20 mẫu nghiên cứu là benchmark đã đạt |

## Giới hạn công bố

Chưa hứa chính xác tuyệt đối. 20 mẫu nghiên cứu có nhiều bản đã điền; không gửi các ảnh đó lên cloud. Upload PDF/đa trang và huấn luyện model mới không tự được xem là đã hoàn thành chỉ vì hợp đồng có pageNumber; cần nêu rõ khả năng thật trong báo cáo cuối.

## Tiến độ

- Nhánh mới đã tạo từ HEAD hiện tại; working tree đầu lượt chỉ có báo cáo step-14 chưa tracked.
- Baseline `test:image-voice`, `test:opencv`, `test:documents` đều chạy thành công trước khi sửa.
- Chặng 1: có detector đường chấm/gạch, grounding nhãn–vùng, bảng hai chủ thể/bảng lặp/ma trận chọn, dãy ký tự; đã sửa khung ngoài nuốt input và viền trong làm checkbox mất loại.
- Chặng 2: 19/19 test Python; OCR thật trên phôi tổng hợp cho 0 vùng chữ dư và 0 dự đoán trên trang/crop trắng có viền/chấm. Vẫn có lỗi dấu, không xem confidence là xác suất đúng.
- Chặng 3: metadata nhiều vùng được kiểm tra, lưu trong artifact có hash và trả lại khi đọc DB; editor sửa/gộp/tách vùng, citizen highlight nhiều vùng với một bước đọc. Có test chặn metadata ngoại lai trước khi duyệt/audit.
- Chặng 4: kết quả và cách chạy lại nằm trong `PROGRESS-AND-TECHNICAL-HANDOFF.md`. Không dùng cloud hoặc ghi DB thật trong bộ test mặc định.
