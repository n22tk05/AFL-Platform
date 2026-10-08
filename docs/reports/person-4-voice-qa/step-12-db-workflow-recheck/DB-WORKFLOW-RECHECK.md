# Kiểm thử lại workflow khi DB hoạt động

Ngày 08/10/2026. Phạm vi: Voice AI/QA và khớp nối FE–API–DB; không dùng Dely. Báo cáo này cập nhật tình trạng DB trong step-11, không chỉnh báo cáo cũ. Không thay schema, RLS, khóa, `.env`, thuật toán OCR hoặc dữ liệu biểu mẫu có sẵn. Không commit/push.

## Kết luận

Luồng **phôi giả → OpenCV/VietOCR thật → đối soát thủ công → Gemini thật → DB PENDING_REVIEW → review/audio → DB ACTIVE → công dân** đã chạy được trên ứng dụng local. Hai biểu mẫu có trước không thay đổi, được kiểm tra bằng hash dữ liệu DB gồm manifest, workflow, FAQ và audit. Đây là kiểm thử tích hợp một phôi synthetic một trang, không phải nghiệm thu mọi biểu mẫu, nhiều trang, 11 FR hoặc triển khai production.

Điều kiện demo hiện tại: runtime local dùng `GEMINI_MODEL=gemini-3.5-flash` tạm thời vì model mặc định `gemini-3.6-flash` trả 503 từ nhà cung cấp trong lượt đầu. Không sửa cấu hình lâu dài hoặc tự fallback âm thầm. OCR vẫn cần người đối soát 11 ứng viên thành hai ô. Micro chưa nghiệm thu được trên thiết bị/trình duyệt kiểm thử.

## Môi trường và dữ liệu

- Next dev: `http://127.0.0.1:3001`, build directory `.next-document-json-test`. OCR CPU local cổng 8000 báo ready. DB thật truy cập qua cấu hình hiện có.
- Runtime dev tạm: `GEMINI_MODEL=gemini-3.5-flash`, `VOICE_CACHE_ENABLED=false`. Tắt Gemini cache không đồng nghĩa xóa hoặc tắt cache MP3; TTS trong lượt này tái sử dụng MP3 thật đã có theo hash.
- Chỉ tạo một biểu mẫu mới: `DEMO-VOICE-LIVE-20261008-1791464633236`, tên **DEMO Voice QA — không dùng làm thủ tục**, v1, một trang, hai bước, không dữ liệu công dân và không căn cứ pháp lý bịa.
- Nguồn ảnh: `private-documents/voice-demo/demo-blank.png`; ground truth: `src/modules/voice-ai/tests/fixtures/demo-blank.expected-fields.json`.
- Biểu mẫu DEMO đang ACTIVE trong DB thật và hiện trong danh sách công dân. Không tự xóa dữ liệu/audit. Khi không cần demo, thống nhất với chủ DB cách lưu trữ/gỡ bằng luồng quản trị được phép; không xóa bảng hoặc dữ liệu thật để dọn test.
- Đã xóa khóa admin khỏi trường nhập/phiên UI trước khi mở trang công dân. Evidence và báo cáo không chứa khóa, connection string hoặc PII.

## Các chặng và test case

| Chặng | Thao tác / điều kiện kiểm tra | Kết quả thực tế |
|---|---|---|
| 1 — preflight | Public/admin list, OCR health, mã DEMO chưa tồn tại, lưu baseline hai form trước | PASS: DB/API 200; OCR ready; khóa thiếu/sai 401. Không tái sử dụng mã form cũ. |
| 2 — OCR → manifest | Upload PNG giả bằng UI; chạy OpenCV/VietOCR; đọc tọa độ từng ứng viên | Pipeline chạy thật. **OCR chưa đạt**: 11 ứng viên cho hai ô; nhãn ban đầu chưa rõ. Giữ ô nội bộ nguyên bản thứ 6 và 9, loại chín ứng viên dư, đặt nhãn Họ và tên/Địa chỉ liên hệ và xác nhận đối soát. Không chèn tọa độ fixture để giả làm detector đúng. |
| 3 — model/default | Lưu phôi và sinh kịch bản với model mặc định | FAIL provider: assets 200, Gemini 503, prompt API 502 AI_UNAVAILABLE. Không tạo draft trong DB, không báo thành công giả; asset upload thành công có thể để lại artifact chưa gắn form. |
| 3b — model/tạm | Khởi động lại runtime local với 3.5-flash, chạy lại từ upload | PASS: prompt API 200; review đọc PENDING_REVIEW; đúng hai bước box_006/box_009, nhãn và tọa độ khớp manifest đã lưu. Đây là response model thật, không fixture chín bước. |
| 4 — draft private | Đọc public workflow và ảnh trước duyệt; QA draft; approve không xác nhận; TTS index độc hại | PASS: workflow/image/QA 404; approve 409; TTS 400. Hash toàn bộ record DEMO trước/sau các request bị từ chối không đổi, không thêm audit. |
| 5 — review/audio | Đọc JSON Gemini; người kiểm thử sửa hướng dẫn/FAQ sang nội dung demo an toàn qua UI; save; TTS hai bước × Bắc/Nam | PASS: save API 200; bốn URL hash khác nhau, không chung file giữa nội dung/giọng. TTS endpoint trả MP3 cache thật đã có, không chứng minh có bốn cloud synthesis mới trong lượt này. Native player decode được, duration 9s, currentTime tăng tới 7.66s, không media error. Chưa đánh giá giọng vùng bằng nghe chủ quan. |
| 6 — approve | Lưu audio cùng workflow, xác nhận review, tên mô tả DEMO Voice QA, bấm phê duyệt | PASS: template/workflow cùng ACTIVE; đúng một audit APPROVE, performedBy=shared_admin_key. Tên nhập chỉ là metadata. |
| 7 — API public | Đọc ACTIVE, ảnh PNG, hai MP3, timestamp sidecar; Q&A từng bước có currentStep giả kèm request | PASS: public/admin steps giống nhau; ảnh/MP3 200 và byte MP3 hợp lệ; timestamp cùng hash, từ đúng hướng dẫn, mốc hữu hạn/thứ tự đúng. Q&A trả 200 faq_match, câu trả lời đúng FAQ đã duyệt từng bước, không dùng currentStep giả. Đây là kiểm thử API, không phải transcript micro. |
| 8 — immutable | PUT workflow ACTIVE và phê duyệt lần hai | PASS: cả hai 409; không đổi record hoặc audit. Hai form baseline tiếp tục giữ nguyên. |
| 9 — citizen/QR | QR đúng formCode; mở link không khóa admin; nghe lại/chuyển bước/quay lại | PASS UI: đúng phôi máy chủ, dòng 1 Họ và tên / dòng 2 Địa chỉ liên hệ, highlight chuyển đúng ô; text/FAQ/chữ minh họa đổi theo bước. Nghe lại hiển thị Đang đọc, chuyển bước trong lúc đọc không giữ text mẫu chung. Đối chiếu MP3/JSON/API chứng minh nội dung riêng; không có người nghe độc lập xác nhận toàn bộ âm thanh phát ra loa. QR link đã kiểm tra, chưa nghiệm thu camera quét QR trên điện thoại. |
| 10 — microphone | Đã được người dùng cho phép micro local; thử nút giữ/phím cách và yêu cầu người dùng nói câu giả | BLOCKED: không thu được transcript/Q&A từ lời nói. UI sau thử báo **Không tìm thấy Micro trên thiết bị của bác.** Không đổi quyền hệ thống, không giả lập transcript rồi gọi đó là mic thật. Cần kiểm tra Chrome/Edge và micro phần cứng. |
| 11 — FAQ / hoàn tất | Bấm Tôi ghi địa chỉ nào? và Xong tờ khai | FAQ hiện chưa đưa answer vào UI, xem đầu việc dưới. Nút hoàn tất dùng browser alert theo code; thao tác automation bị timeout, không quan sát được dialog hoàn tất nên không ghi PASS. Không có bằng chứng submit hồ sơ hoặc lưu tiến độ. |

Tọa độ retained (YXYX) trước khi DB chuyển Float: tên `[0.215, 0.081, 0.285, 0.919]`; địa chỉ `[0.372143, 0.081, 0.442143, 0.919]`. DB có sai số biểu diễn float nhỏ; verifier so sánh manifest và workflow sau đọc DB, không yêu cầu float gốc chính xác tuyệt đối. Sai số tọa độ OCR với ground truth vẫn thuộc báo cáo OCR step-11.

## Những điểm còn phải xử lý

| Ưu tiên | Chủ trì | Vấn đề / nguyên nhân | Việc tiếp theo và tiêu chí nghiệm thu |
|---|---|---|---|
| P1 trước demo tự động | OCR/OpenCV | 11 ứng viên cho hai ô; ô trống/nhãn OCR chưa đáng tin. Gate thủ công chặn sinh ngay nhưng không sửa detector | Theo `step-11-fe-feedback-and-ocr-handoff/OCR-EMPTY-FIELDS-AND-EXCESS-BOXES-HANDOFF.md`: lọc dư, kiểm soát hallucination vùng trắng, matching nhãn/ô, đo precision/recall và sai số tọa độ trên ảnh có ground truth. Không bỏ gate đối soát. |
| P1 ổn định dịch vụ | Voice AI + Tech Lead | Model mặc định 503; bản demo chạy nhờ override runtime tạm | Kiểm tra model khả dụng/quota và chọn cấu hình vận hành rõ ràng; test unavailable vẫn fail closed không sinh fixture lạ; không mặc nhiên sửa mặc định chỉ vì một lượt thử thành công. |
| P1 nội dung công dân | FE + Voice QA | UI vẫn ghi **CHỮ MẪU ĐỂ BÁC CHÉP THEO**, mâu thuẫn hướng dẫn không chép tên/địa chỉ giả | Đổi thành ví dụ minh họa và lời nhắc nhập thông tin của mình; nghiệm thu bằng user test tránh sao chép PII giả vào hồ sơ. Chưa sửa trong lượt kiểm thử này. |
| P2 FAQ | FE + Voice AI | Handler FAQ resetContext rồi chỉ playGuidance; không set answer. Sau FAQ, Nghe lại vẫn đọc hướng dẫn thay vì câu trả lời FAQ | Dùng một owner cập nhật answer + một owner playback, tránh triggerTouchToAsk và answer effect cùng phát hai lần. Test: click FAQ thấy answer, nghe lại đúng answer, đổi bước xóa answer, không lẫn form. |
| P2 phát lần đầu | FE + Voice AI | Vào trực tiếp link có thể bị autoplay policy: báo Không đọc được hướng dẫn; thao tác Nghe lại đã phát được | Phân biệt yêu cầu user gesture với media hỏng; đưa CTA Bấm Nghe lại để bắt đầu, test browser autoplay blocked + MP3 lỗi + fallback text riêng. |
| Chặn nghiệm thu mic | QA + FE | Speech API khả dụng không đảm bảo thiết bị có audio-capture. Chưa có transcript thật ở môi trường kiểm thử | Chrome/Edge có micro hoạt động: cho phép site, giữ nút nói câu giả, nhả, một POST QA đúng formCode/stepIndex, answer đúng bước; thử từ chối quyền, mất thiết bị, no-speech, đổi bước khi đang hỏi. |
| Cần tiếp tục | FE + QA | QR mới kiểm link; cuối luồng chỉ alert; nhiều trang chưa được test live bằng PDF thật | Test camera QR trên thiết bị, refresh/deep link, UX hoàn tất rõ ràng; test hai trang với box trùng tên khác page, chuyển ảnh/highlight/context đúng và persistence sau reload. Không coi test một trang này là đã nghiệm thu nhiều trang. |
| Trước mở rộng | Tech Lead | Chưa audit RLS/Supabase grants hay xác thực riêng cán bộ; quota hiện bound mỗi process | Xác minh quyền DB, audit danh tính cán bộ, quota dùng chung nhiều instance, retention/orphan artifact, bảo vệ chi phí OCR/public QA. Không tự thay chính sách DB trong lượt này. |

## Kiểm chứng cục bộ và thay đổi trong lượt này

- Thêm `src/modules/voice-ai/tests/live-workflow-verification.ts`: opt-in `--live`, giới hạn loopback và mã DEMO, baseline chống sửa form cũ, đọc Prisma thật, kiểm private/approve/audit/audio/QA/immutable. Không nằm trong test mặc định, không tự tạo hoặc phê duyệt form. Stage before dùng file baseline exclusive, không chạy lại cùng mã khi đã tồn tại.
- Lệnh đã chạy thành công: `npm run test:p2p` (**52 TAP** + assertions API client), `npm run test:local` (fixture/hợp đồng **6/6** + API integrity), `npm run typecheck`, `npm run build` với `AFL_BUILD_DIR=.next-workflow-recheck-build` và `AFL_BUILD_THREADS=1`.
- Build tách dev, không khởi động production hoặc đổi DB cho build. Include tsconfig do Next thêm cho build tạm đã được loại bỏ; bổ sung ignore thư mục output build kiểm thử, giữ nguyên thay đổi đã có.
- `npx playwright test --config playwright.image-voice.config.ts --list` phát hiện **8 case**, chỉ discovery, không phải tám case đã chạy. UI thật được thao tác qua công cụ browser; không chạy browser mock suite bằng shell trong lượt này.
- Trước/sau khi phê duyệt, chạy lần lượt `npx tsx src/modules/voice-ai/tests/live-workflow-verification.ts --live --form-code=DEMO-VOICE-LIVE-20261008-1791464633236 --stage=draft` và `--stage=active`; cả hai PASS. Rerun active sau bổ sung kiểm timestamp cũng PASS. Negative DB-offline đã có kiểm thử trước; lượt này không tắt DB thật để tạo lỗi.
- Không sửa FE/product runtime code trong lượt kiểm thử này. Các lỗi FE trên là phát hiện/bàn giao, không tuyên bố đã fix.

## Bằng chứng và cách demo

Evidence local, không commit: `private-documents/workflow-recheck/` gồm baseline + JSON before/draft/active, `voice-region-evidence.json`, ảnh default model thất bại, review ACTIVE, QR link, citizen phát bước tên, lỗi micro và `06-citizen-address-full.png`.

Mở `http://127.0.0.1:3001/citizen/guide?formCode=DEMO-VOICE-LIVE-20261008-1791464633236`. Bấm Nghe lại ở ô tên, chuyển dòng địa chỉ và quay lại để thấy nội dung khác nhau; không nhập hoặc đọc thông tin công dân thật. Bản hiện tại lưu audio bước tên giọng Nam và địa chỉ giọng Bắc để kiểm hai cấu hình. Muốn thống nhất giọng cho demo khác phải tạo/sửa bản nháp mới theo workflow quản trị, không ghi đè ACTIVE.

Sau khi restart máy/server, override model tạm không tự tồn tại; muốn tiếp tục kiểm thử tạo mới phải đặt lại biến môi trường đã thống nhất. Bản ACTIVE hiện có vẫn lấy kịch bản/audio đã duyệt từ DB, không cần Gemini để nghe hướng dẫn hoặc trả FAQ exact-match.
