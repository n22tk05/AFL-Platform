# Chặng 8 — OCR theo ô header bảng có kẻ dòng

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Không dùng cloud, không lưu biểu mẫu vào DB.

## Lỗi gốc và sửa đổi

Ở phôi trắng CT01, bước phân đoạn OCR toàn trang gộp nét chữ của hai cột và bỏ dòng đầu `Ngày, tháng,` trong header. OCR trực tiếp trên phần ảnh được cắt đúng ô đọc được dòng đó; vì vậy không nên đoán nhãn từ một chỗ khác trên trang.

`services/vietocr-service/text_layout.py` nay tìm cặp đường kẻ ngang dài và các đường kẻ dọc giao nhau để xác định hàng header. Chỉ xử lý các ô có mực chữ thật; ô dữ liệu trắng không được đưa vào mô hình. `services/vietocr-service/app.py` thay các crop toàn trang chồng lên hàng này bằng crop từng ô, sau đó phân đoạn lại từng dòng trong ô và chuyển tọa độ về ảnh gốc. Vùng không có bảng vẫn đi theo đường cũ. Giới hạn số vùng OCR vẫn được kiểm tra.

## Kết quả lặp lại được

| Kiểm tra local | Trước | Sau |
| --- | ---: | ---: |
| CT01, dòng header nhận được | Chỉ `năm sinh` | `Ngày, tháng,` + `năm sinh` |
| CT01, table cell có nhãn đúng nguyên văn | 36/45 | 45/45 |
| CT01, table cell khớp hình học IoU ≥ 0.5 | 45/45 | 45/45 |
| CT01, field / field có nhãn | 71 / 51 | 71 / 51 |
| TK01, field / field có nhãn | 29 / 5 | 29 / 5 |

CT01 vẫn có 36 dòng OCR sau lọc; không sinh thêm nhãn giả từ vùng trắng. Mean IoU bảng CT01 là 0.9668, min 0.9299, không đổi vì chỉ sửa text header. Bài browser opt-in chạy OpenCV WASM + VietOCR local trên hai ảnh phôi trắng, chặn mọi request lưu asset/sinh prompt. Python unit 25/25, recognition unit/integration 40/40, OpenCV 54/54, browser phôi thật 2/2, browser mặc định 11/11, TypeScript, production build riêng (`AFL_BUILD_DIR=.next-recognition-build`) và `git diff --check` PASS. Browser mặc định cần `IMAGE_VOICE_TEST_URL=http://127.0.0.1:3001` khi Next dev chạy cổng 3001; lần chạy đầu không đặt biến này trỏ sang cổng 3101 nên bị `ERR_CONNECTION_REFUSED`, không phải lỗi thuật toán.

## Giới hạn

- Đây vẫn là **development set một bảng**, không phải nghiệm thu trên holdout mù. Bộ annotation chưa bao phủ 20 field chưa nhãn của CT01, 24 field chưa nhãn của TK01, hay static/checkbox/slot ngoài bảng.
- Heuristic hiện chỉ xử lý cặp kẻ ngang đầu tiên có các ô chứa chữ; bảng không kẻ, đường kẻ đứt, ảnh nghiêng/mờ, nhiều bảng hoặc header nhiều tầng cần mẫu và ground truth riêng. Không được suy từ 45/45 thành độ chính xác toàn hệ thống.
- Nhiều nhãn OCR của header vẫn có confidence dưới 0.93 nên biểu mẫu tiếp tục `needs_review`; không có tự động phê duyệt. Cần độc lập xác nhận nhãn và tọa độ trên nhiều mẫu khác chủ đề trước khi nới điều kiện review.

## Bước kế

1. Tạo annotation độc lập cho toàn bộ field, vùng không nhập và loại trường của một phôi trắng khác với CT01/TK01; đo precision, recall, IoU và lỗi ghép nhãn theo từng loại.
2. Mở rộng kiểm chứng bảng đa tầng/không kẻ và QR/ảnh/dấu trên mẫu trắng hợp pháp; không gửi hồ sơ đã điền cho dịch vụ cloud.
3. Đối soát contract đa trang/PDF và thử transaction trên DB staging riêng trước khi dùng dữ liệu thật.
