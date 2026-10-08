# FE — kế hoạch sửa draft cũ và phản hồi lỗi

Ngày 08/10/2026. Người yêu cầu đã cho phép sửa FE trong phạm vi này. Không dùng Dely, không sửa thuật toán OCR, database, schema, RLS hoặc tài liệu cũ đang chỉnh dở.

## Kế hoạch và tiến độ

| Chặng | Việc làm | Kết quả |
|---|---|---|
| 1 — trạng thái ảnh | Chọn lại file phải invalidation generation, abort request, giải phóng preview URL, xóa processed/draft/OCR/ô đang chọn/xác nhận review. File sai còn xóa file input và xác nhận phôi trống. | Đã triển khai clearAnalysis trong FormUploadModal. File input vẫn thao tác được khi OCR đang chạy để thay/hủy ảnh. Cả file hợp lệ mới cũng cần phân tích/đối soát lại. |
| 2 — lỗi | Giữ status/code ở tầng đọc workflow; phân biệt thiếu mã, 404, 503, mất mạng/response hỏng; admin dùng tiếng Việt thay code thô. | Đã triển khai WorkflowReadError, form-feedback.client và gắn vào library/upload/guide. 503/network có Thử lại; thiếu mã/404 không retry vô ích. Không dùng fixture hoặc cache ở public path. |
| 3 — kiểm chứng và bàn giao | Test hợp đồng, UI thật, TypeScript/build; viết báo cáo OCR tách riêng. | Test:p2p 52 TAP case PASS, fixture 6/6 + API integrity PASS; đã test UI thật, typecheck/build PASS. 4 case browser tự động đã viết, chưa chạy trong chặng này. |

## Hành vi sau sửa

- PNG đã OCR → SVG/ảnh rỗng/quá 8 MB: kết quả cũ không còn; file input và xác nhận phôi trống bị reset; thông báo giải thích ảnh lỗi và kết quả đã xóa. Không còn nút sinh kịch bản từ draft cũ.
- PNG A → PNG B: xóa kết quả A, hiển thị tên B; phải xác nhận phôi trống, phân tích và đối soát lại. Không giữ OCR/preview A để giả làm B.
- Thay file khi đang xử lý: request bị abort, generation thay đổi; response cũ không được set state, không tiếp tục asset/prompt ở phía client. Hủy client không cam kết rollback request đã được server thực thi.
- Khi DB lỗi, guide nói Máy chủ tạm thời không khả dụng; không nói form đang thẩm định. Thiếu mã nói Bác chưa chọn biểu mẫu. 404 nói Không tìm thấy biểu mẫu đã ban hành, không khẳng định form cụ thể là draft.
- Khóa sai nói Khóa quản trị không đúng, máy chủ thiếu cấu hình và DB lỗi có thông báo riêng. Lỗi server không nhận diện được dùng thông báo an toàn, không phơi SQL/credential details.

## Kiểm chứng đã chạy

| Case | Kết quả |
|---|---|
| Unit MIME/rỗng/size boundary | JPEG/PNG nhận; SVG/rỗng/>8 MB từ chối; đúng 8 MB nhận. |
| Unit auth/config/DB/AI/unknown/network | Thông báo phân loại tiếng Việt; thông tin server không nhận diện không lộ ra UI. |
| Unit public 404/503/JSON hỏng/sai contract/abort | Giữ phân loại lỗi; không hồi sinh browser workflow; AbortError được giữ; malformed/network có retry. |
| UI thật: guide mã DEMO, DB 503 → Thử lại | Có đúng thông báo 503; bấm retry chuyển về loading rồi trở lại lỗi dịch vụ; không có voice panel. Evidence 11-fe-guide-503-fixed.jpg. |
| UI thật: guide không mã | Bác chưa chọn biểu mẫu; không có Thử lại. |
| UI thật: library, QA-invalid-key | Khóa quản trị không đúng; không còn UNAUTHORIZED thô. Sau test đã xóa khóa giả. Evidence 12-fe-admin-auth-fixed.jpg. |
| UI thật: PNG synthetic → OCR thật → check review → SVG | Draft/ảnh/OCR/nút sinh đều có count=0; xác nhận phôi trống bỏ check. Bấm Phân tích bị validation chặn. Evidence 13-fe-invalid-file-reset-fixed.jpg. |
| UI thật: chọn PNG lại → bắt đầu phân tích → thay SVG khi busy | File input vẫn bật; trạng thái busy biến mất, không có draft cũ/late result; xác nhận bị reset. |
| npm run test:p2p | 52 TAP PASS: forms 12 + voice client 7 + voice 18 + manifest/assets 15; API client assertions PASS. |
| npm run test:local | Fixture/hợp đồng 6/6 + API integrity PASS; không gọi cloud/DB thật. |
| npm run typecheck; build | PASS; build dùng AFL_BUILD_DIR=.next-document-json-build, AFL_BUILD_THREADS=1. |

Evidence nằm trong private-documents/product-workflow-test; đây là phôi synthetic không chứa PII. UI được kiểm thử qua browser hiển thị, không có network trace đầy đủ để đếm mọi request; assertion không gọi AI/storage sau file lỗi nằm trong case browser tự động viết thêm, chưa chạy.

## Test browser đã thêm cho CI/FE

tests/browser/form-feedback.spec.ts gồm 4 case: invalid replacement sau review, invalid replacement khi OCR đang chờ (late response), 503 → retry → 404, sai khóa. HTTP/OCR ở các case này được giả lập; OpenCV browser thật được dùng cho fixture upload. playwright.image-voice.config.ts đã nhận file test mới; test 404/503 cũ cũng cập nhật đúng tiêu đề mới.

Chạy với web test local riêng, không production: `$env:IMAGE_VOICE_TEST_URL='http://127.0.0.1:3001'; npm run test:image-voice:browser`. Không coi các mock này là nghiệm thu OCR thật hoặc database transaction.

## Còn lại

- OCR/OpenCV vẫn tạo 11 ứng viên cho phôi hai ô trong lần test lại; thuật toán không thay đổi. Bàn giao riêng tại OCR-EMPTY-FIELDS-AND-EXCESS-BOXES-HANDOFF.md.
- Database vẫn 503: chưa kiểm được tạo/approve/public ACTIVE, mic/Q&A/QR toàn luồng. Không tuyên bố hoàn tất demo công bố thật.
- Flash phần cứng, select mobile, FAQ text và pipeline nhiều trang không thuộc bản sửa FE này; giữ các đầu việc riêng đã ghi ở step-10/step-08.
