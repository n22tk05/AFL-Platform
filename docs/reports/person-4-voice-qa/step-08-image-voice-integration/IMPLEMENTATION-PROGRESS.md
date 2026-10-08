# Tiến độ implementation: ảnh → manifest → Voice AI → FE

## Phạm vi

Triển khai trực tiếp, không dùng Dely. Không commit/push, không ghi DB thật, không gọi cloud có phí trong các bộ test mặc định. Giữ nguyên chỉnh sửa có sẵn của `.gitignore` và `package-lock.json`; không sửa báo cáo cũ hoặc tài liệu người dùng đang viết.

Đợt này nối luồng upload một JPEG/PNG. Kế hoạch nhiều trang nằm trong `MULTIPAGE-FORMS-IMPLEMENTATION-PLAN.md`; nhập nhiều ảnh/PDF và migration đa trang **chưa được triển khai**. Phôi được lưu server, không dựa vào localStorage.

## Các chặng và tiến độ

| Chặng | Đã làm | Test case sau chặng | Trạng thái |
| --- | --- | --- | --- |
| 1 — FE/API/quyền | Đúng route/formCode; khóa admin trong RAM; review/save/approve qua API; citizen chỉ đọc ACTIVE từ server; scan pixel thật | Route đúng; 404/503 không hồi sinh local ACTIVE; server list rỗng không thêm local; request đúng form; guard cấu trúc JSON review. 6/6 + suite API client có sẵn PASS | Hoàn tất cục bộ |
| 2 — Voice/Q&A | Đọc text/audio của bước hiện tại; fallback media; một lượt mic một submit; bỏ STT/Q&A/audio cũ; deadline và echo guard | Media lỗi đọc đúng text; cancel/late callback; hai thứ tự end/release; duplicate release; context cũ; envelope; timeout/abort. 7/7 PASS | Hoàn tất cục bộ |
| 3 — OpenCV/OCR/Gemini | Cùng processed frame; ghép nhãn với vùng viết; đối soát thủ công nhãn mơ hồ; chỉnh thứ tự; pin box/order/geometry cho model | XYXY → YXYX; highlight không lấy bbox nhãn; type theo detector; container/cluster; nhãn mơ hồ/trùng; frame/bounds/limit; model đảo thứ tự. 6/6 PASS | Hoàn tất cục bộ |
| 4 — Asset/persistence/audio | Phôi immutable private; metadata đọc lại từ server; ảnh nháp có auth; sửa geometry transaction; chọn NORTH/SOUTH và lưu MP3 đúng nội dung | Hash/path/frame/form mismatch; upload auth/privacy; public draft/offline; private preview không lộ key; TTS envelope/deadline/audio binding; mock transaction/readback; approve thiếu ảnh không ACTIVE/audit; lỗi asset không làm DB offline. 9/9 PASS | Hoàn tất cục bộ |
| 5 — Tích hợp/báo cáo | Kế hoạch MP1–MP8, bàn giao theo owner, hồi quy và build; kiểm tra FE thật với HTTP/speech fixtures | 219/219 documents + OpenCV + VietOCR adapter; 4/4 browser; fixture QA 6/6 + API integrity PASS; TypeScript/build/git diff check PASS | Hoàn tất kiểm chứng cục bộ và bàn giao |

## Bằng chứng sửa lỗi

- Chặng 1: bộ test mới ban đầu 1 pass/4 fail cho sai route, hồi sinh local ACTIVE và entry point chưa nối API; sau sửa 5/5, thêm guard JSON editor thành 6/6.
- Chặng 2: source-wiring guard bắt được hook/panel cũ không dùng playback/submission/cancellation owners. 7/7 sau nối. Browser fake STT kiểm tra request đúng form/bước và không double submit.
- Chặng 3: test model trả ngược thứ tự ban đầu fail; sau pin theo manifest thì PASS. Không giả nhãn “Ô kê khai N”; các nhãn thiếu/mơ hồ phải được đối soát.
- Chặng 4: tests viết ảnh synthetic vào thư mục tạm, xác minh digest/kích thước và đọc lại bằng store khác. DB dùng mock; không chứng minh rollback/isolation PostgreSQL thật.
- Hồi quy bắt được fixture supervision dùng FAQ rỗng, không còn phù hợp validator bắt buộc FAQ hợp lệ; đã cập nhật riêng fixture đó, giữ nguyên phép bắt index 0-based. 219/219 sau sửa. Các lỗi TypeScript trong upload và browser test đã được sửa và chạy lại.
- Build từng phát cảnh báo ref cleanup; đã chuyển cancel sang callback ổn định, không tắt lint rule.
- Case browser mở JSON editor ban đầu timeout vì spec chưa mở phần details; đã sửa đúng thao tác UI rồi chạy lại 4/4 trên build cuối. Không sửa ứng dụng để lách phép kiểm tra đó.

## Kiểm chứng cuối

Kiểm tra lại khi tiếp tục task ngày 08/10/2026: TypeScript, `test:p2p`, `test:local` và `git diff --check` đều PASS. HEAD vẫn `bf26973`, không commit/push. Các log `FORM_ASSET_UNAVAILABLE`/`INVALID_GEMINI_WORKFLOW` trong suite là lỗi được cố ý tạo cho test âm tính, không phải lời gọi cloud thật thất bại.

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:p2p` | PASS: API client có sẵn + 6 route/review/publication + 7 Voice + 15 manifest/assets |
| `npm run test:local` | PASS: 6 fixture/hợp đồng + API integrity assertions; không phải nghiệm thu 11 FR |
| `npx tsx --test src/modules/documents/tests/*.test.ts src/modules/opencv/tests/*.test.ts src/modules/ocr/tests/vietocr-adapter.test.ts` | 219/219 PASS |
| `npm run typecheck` | PASS sau sửa lỗi kiểu dữ liệu test |
| Build riêng `AFL_BUILD_DIR=.next-document-json-build`, `AFL_BUILD_THREADS=1` | PASS: compile/lint/type/static pages; không còn cảnh báo lint của code mới |
| `npm run test:image-voice:browser` trên Chrome headless | 4/4 PASS trên build cuối; test JSON editor + save/TTS/approve, đúng text/context và upload OpenCV |
| `git diff --check` | Không lỗi whitespace; Git có thông báo LF/CRLF của workspace |

Browser suite dùng FE thật và OpenCV thật trong upload; chặn HTTP OCR/model/TTS/DB bằng fixtures, giả lập STT/speech. Không chứng minh chất lượng VietOCR/Gemini/giọng cloud hoặc microphone thật. Lệnh test mặc định không chạy stress cloud, generation audio hay persistence DB thật.

## Còn cần xử lý

1. Triển khai đa trang theo MP1–MP8: contract v2, revision/page schema, storage và quyền, per-page OCR/model batching, FE review/citizen/QR theo revision. Hiện backend từ chối nhiều trang thay vì giả đã hỗ trợ.
2. DB thử nghiệm riêng: migration/transaction/isolation/concurrency/RLS; xác thực từng cán bộ thay shared key và quota phân tán.
3. Storage bền vững/chia sẻ cho phôi và audio, backup/cleanup orphan; không dùng filesystem tạm serverless. Audio draft hiện vẫn public theo hash, cần chính sách quyền/retention revision.
4. UAT phôi thật, ground truth OCR/geometry, hai giọng cloud, mobile autoplay/mic, screen reader/zoom/giảm chuyển động. Tương phản #D32F2F trên trắng khoảng 4,98:1, không khẳng định AAA 7:1.
5. QR với URL HTTPS thật, quy trình thay phiên bản/lưu trữ, nhận diện loại form tự động và PDF. Scan hiện yêu cầu người dùng chọn đúng form.

Đầu vào/đầu ra/API/tiêu chí/owner từng việc còn lại nằm trong `IMAGE-VOICE-INTEGRATION-HANDOFF.md`. Không gọi trạng thái “hoàn tất cục bộ” là sẵn sàng triển khai rộng.
