# Kế hoạch kiểm thử sản phẩm và nhật ký thực thi

Ngày: 08/10/2026. Vai trò: Người 4 — Voice AI & QA. Mục tiêu: kiểm tra ứng dụng hiện tại bằng thao tác thực trên UI, ghi nhận expected/actual, phân biệt lỗi ứng dụng, lỗi hạ tầng và phần chưa kiểm chứng; sửa trong phạm vi role, tạo regression test cho lỗi sửa được.

Không dùng Dely. Không đổi dữ liệu ACTIVE thật, schema, RLS, secrets hoặc dữ liệu công dân. Chỉ dùng phôi synthetic của chặng 09. Không gọi cloud trong regression mặc định. Các test dùng HTTP/STT giả lập phải được ghi riêng, không coi là kết quả end-to-end trên DB thật.

## Các chặng và điều kiện

| Chặng | Thao tác | Bằng chứng / tiêu chí |
|---|---|---|
| A — môi trường | Kiểm tra Web 3001, OCR 8000, API forms/admin; mở trang chủ trên browser hiển thị | HTTP/health, screenshot; lỗi DB không sinh thành công giả |
| B — citizen | Trang chủ → chọn phôi → guide; thiếu mã/sai mã; upload; hủy và thử lại | URL, trạng thái lỗi, không đọc kịch bản fixture khi public API lỗi |
| C — admin & OCR | Thư viện → chưa nhập khóa/khóa sai → mở upload → thiếu thông tin/không xác nhận → upload phôi synthetic → OCR → đối soát | Không gọi AI/ghi DB khi chưa auth; JSON/text/coords cùng frame, có cảnh báo review |
| D — voice lifecycle | Play → mic → nhả → Q&A → chuyển bước/form; FAQ; unsupported/error; bấm nhanh/cancel | Một lượt nói chỉ một Q&A; không dội âm, không phát câu trả lời cũ, không treo mic/playback |
| E — sửa & regression | Reproduce trước sửa → sửa role Voice/QA → test lại | Case có thể phát hiện lỗi thật; ghi nguyên nhân và chủ trì phần ngoài role |
| F — kết luận | TypeScript/tests/build; bàn giao bug list và thao tác tái hiện | Không nghiệm thu nhánh bị DB/mic thật chặn; tab sản phẩm giữ mở cho người dùng |

## Ma trận test

| ID | Điều kiện và thao tác | Kỳ vọng | Chủ trì nếu lỗi |
|---|---|---|---|
| LIVE-01 | Mở /, chọn BẮT ĐẦU SỬ DỤNG | /citizen, dữ liệu từ API thật hoặc lỗi rõ ràng | FE/Tech Lead |
| LIVE-02 | API forms offline; mở /citizen và /citizen/guide | Không danh sách/nội dung ACTIVE giả, không phát fixture | Voice QA/FE |
| LIVE-03 | Mở /citizen/scan; chưa chọn form/ảnh; back, chọn lại | Hướng dẫn và trạng thái nút đúng; hủy không giữ ảnh/câu hỏi cũ | FE |
| LIVE-04 | Mở /admin/library không khóa; nhập khóa sai | Chưa auth không đọc danh sách; sai khóa 401, không gọi AI | Voice QA/FE |
| LIVE-05 | Mở upload, thiếu mã/tên/blank confirmation; nhấn phân tích | Validation không OCR/AI/write | FE |
| LIVE-06 | Upload demo-blank.png, xác nhận trống, nhấn phân tích | OpenCV + VietOCR thật; text/coords cần human review, không công bố ngay | OpenCV/OCR/QA |
| LIVE-07 | Chưa nhập khóa/chưa đối soát đủ; thử sinh kịch bản | Không tạo workflow hay phê duyệt | Voice QA/FE |
| LIVE-08 | DB hoạt động: tạo mã DEMO mới → sửa lời hướng dẫn → TTS → save → approve | Draft public 404; ACTIVE có đúng image/step/audio; audit shared admin key | Tech Lead/Voice QA/FE |
| LIVE-09 | ACTIVE: guide, Play, mic hold/release, FAQ, next/back | Không lặp text mẫu, dừng phát trước nghe, đúng form/bước | Voice QA |
| LIVE-10 | Guide không ACTIVE/DB offline; thử refresh/navigate | Không khôi phục ACTIVE từ localStorage/cache | Voice QA/FE |
| CTRL-01 | Browser regression với workflow và STT/HTTP giả lập có ghi rõ | Mic error/cancel/context switch không gọi QA hoặc phát stale text | Voice QA |
| CTRL-02 | Driver TTS/audio/speech lỗi và re-entry | Không treo playback hoặc bật mic sai; lỗi luôn settle | Voice QA |
| UI-01 | Viewport điện thoại; các trang citizen/admin/upload | Không tràn trang che nút chính; chọn form/voice vẫn thao tác được | FE |

## Cách ghi thao tác

Mỗi case ghi: thời điểm, URL, thao tác chính xác, expected, actual, HTTP/console liên quan (không secrets), screenshot và root cause xác nhận hoặc giả thuyết. Ghi PASS/FAIL/BLOCKED riêng. Không ghi credential/header xác thực hay PII vào artifact, không trace toàn bộ browser session có khóa admin.

Nhật ký kết quả được cập nhật ở PRODUCT-WORKFLOW-TEST-RESULTS.md trong cùng thư mục; screenshot/evidence local tại private-documents/product-workflow-test/. Không sửa báo cáo cũ đang được người dùng chỉnh.
