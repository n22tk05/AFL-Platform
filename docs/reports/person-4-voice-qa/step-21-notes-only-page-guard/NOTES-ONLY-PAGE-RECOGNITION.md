# Chặng 10 — Không sinh trường nhập từ trang chỉ có chú thích

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Hai trang âm tính được xem trực tiếp trước khi sửa: CT01 trang 2 (chú thích cư trú) và F14 trang 5 (ghi chú thuế). Không có giá trị nhân thân trên hai trang này; chỉ chạy OpenCV/VietOCR local, không gửi cloud hoặc ghi DB.

## Lỗi và bằng chứng

Trang giải thích vẫn có nét chữ gần vuông và các hàng văn bản. Detector cũ biến chúng thành `checkbox`/`field_row`, còn dấu hai chấm trong câu văn bị dùng làm nhãn. Trước sửa, CT01 trang 2 sinh **21 field giả** và F14 trang 5 sinh **6 field giả** dù cả hai không có vùng kê khai.

`form-region-recognition.ts` nay chỉ nhận diện trang chú thích/hướng dẫn khi đồng thời có: tiêu đề ở đầu trang, ít nhất tám khối OCR dạng câu dài và không có bằng chứng hình học mạnh của vùng viết, ô bảng hoặc ô tích có viền rõ. Trong trường hợp này, ứng viên được giữ trong `regions` dưới vai trò `description`/`static_text` với lý do `NOTES_ONLY_PAGE_REVIEW_REQUIRED`; không tạo `boxes` hay bước giọng đọc. Trang có writing guide thật không bị chặn. Đây là phân loại bảo thủ theo bằng chứng, **không dựa vào tên form**.

Upload admin hiện vẫn chỉ hỗ trợ một trang. Với trang không có field, FE hiện hiển thị ảnh phôi, thông báo cần đối soát, liệt kê bằng chứng và cho tải JSON tọa độ; cán bộ có thể thêm ô thủ công nếu detector bỏ sót. Nút lưu/sinh kịch bản bị khóa khi chưa có field. Không có đường vòng công bố một trang chú thích như workflow 0 bước.

| Ca kiểm tra local | Field trước | Field sau | Nhận xét |
| --- | ---: | ---: | --- |
| CT01 trang 2, chỉ chú thích | 21 | 0 | 52 ứng viên còn trong bằng chứng đối soát |
| F14 trang 5, chỉ ghi chú | 6 | 0 | 20 ứng viên còn trong bằng chứng đối soát |
| CT01 trang 1, phôi có bảng | 71 | 71 | 45/45 ô bảng vẫn có nhãn nguyên văn |
| TK01 trang 5, phôi có ô tích | 31 | 31 | Bốn ô giới tính/chip vẫn được gắn nhãn |

## Kiểm chứng

- Unit recognition 43/43; OpenCV 54/54.
- Browser nhận diện 7/7, gồm bốn phôi thật: hai trang âm tính phải có 0 field, vẫn hiện ảnh đối soát và nút sinh bị khóa; hai trang biểu mẫu giữ số/nhãn. Các request lưu asset và sinh prompt đều bị chặn trong benchmark.
- Browser mặc định 11/11, TypeScript, production build riêng (`AFL_BUILD_DIR=.next-recognition-build`) và `git diff --check` PASS. Build còn cảnh báo hiệu năng Next.js cho ảnh `<img>` dùng để xem trước blob local; không phải lỗi build.

## Giới hạn và chặng kế

Đây chưa phải bộ đo precision/recall mù. OCR có thể đọc sai tiêu đề; trang hỗn hợp chú thích và ô nhập không được tự động coi là chỉ hướng dẫn. Cán bộ vẫn phải đối soát bằng chứng; không tự duyệt biểu mẫu. Bộ upload/validator/asset hiện **chỉ một trang**, nên việc trang 2 có 0 field chưa đồng nghĩa đã hỗ trợ PDF/đa trang.

Chặng đa trang cần giữ mỗi trang như một asset bất biến với kích thước/tọa độ riêng, chạy OCR/OpenCV từng trang, gộp box ID duy nhất và `pageNumber` xuyên manifest–Gemini–review–citizen. Trang chú thích 0 field vẫn nằm trong danh sách trang nhưng không sinh step. Sau đó kiểm tra page switching, field nhiều vùng qua trang, quyền đọc ảnh theo trạng thái và transaction lưu/phê duyệt trên DB staging riêng. Không vá trạng thái bằng `localStorage`.
