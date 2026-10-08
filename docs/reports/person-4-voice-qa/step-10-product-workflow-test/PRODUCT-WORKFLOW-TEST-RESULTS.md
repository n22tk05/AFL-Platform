# Kiểm thử sản phẩm thực tế — kết quả và bàn giao lỗi

Ngày 08/10/2026, khoảng 18:47–19:00 (Asia/Saigon). Phạm vi: Person 4 — Voice AI & QA. Không dùng Dely; không sửa báo cáo cũ, schema, RLS hoặc dữ liệu ACTIVE. Thay đổi của các phiên trước và thay đổi sẵn có của người dùng được giữ nguyên; không commit/push trong chặng này.

## 1. Kết luận

Đã mở ứng dụng thật trong browser hiển thị, thao tác citizen/admin/upload và chạy OpenCV + VietOCR thật trên phôi synthetic. API fail-closed và cửa đối soát manifest hoạt động trong các tình huống đã kiểm tra. **Chưa đủ điều kiện nghiệm thu end-to-end để demo luồng công bố/citizen ACTIVE**: database trả 503 ngay cả khi dùng khóa quản trị cấu hình đúng.

Đã sửa lỗi thuộc Voice: exception khi speech fallback hoặc hủy audio có thể để playback không kết thúc, khiến hook/half-duplex không được trả về trạng thái rảnh. Có test tái hiện trước sửa và regression sau sửa. Đây là lỗi xác nhận bằng driver kiểm thử, không phải kết luận đã tái hiện trên mic/loa vật lý.

## 2. Môi trường và bằng chứng

| Thành phần | Quan sát |
|---|---|
| Ứng dụng thật | http://127.0.0.1:3001, Next dev; tab giữ mở ở /citizen |
| VietOCR thật | http://127.0.0.1:8000/health → 200, ready=true, CPU, 8 threads |
| Public forms | GET /api/forms → 503, success=false, DATABASE_UNAVAILABLE |
| Admin forms | Thiếu khóa/sai khóa → 401 UNAUTHORIZED; khóa cấu hình đúng → 503 DATABASE_UNAVAILABLE |
| Public workflow | GET /api/forms/DEMO-VOICE-UI-20261008/workflow → 503, message_vi: Cơ sở dữ liệu tạm thời không khả dụng. |
| Bản demo QA riêng | http://127.0.0.1:3102; phôi/audio tạo ở chặng trước, chưa lưu/phê duyệt DB, không dùng hook hoặc API citizen của sản phẩm |
| Phôi test | private-documents/voice-demo/demo-blank.png; hai vùng viết Họ và tên / Địa chỉ liên hệ, không có dữ liệu công dân |
| Evidence | private-documents/product-workflow-test/api-preflight.json và 10 screenshot JPG trong cùng thư mục; không chứa credential |

Không cấp quyền thiết bị thay người dùng. Camera chưa có ảnh trong browser kiểm thử; mic thật chưa kiểm chứng. Console error/warn do browser API thu thập trả danh sách rỗng ở thời điểm kiểm tra; điều này không chứng minh sản phẩm không có lỗi.

## 3. Nhật ký thao tác thực tế

PASS chỉ áp dụng kỳ vọng được ghi tại hàng, không đồng nghĩa nghiệm thu toàn bộ chức năng. BLOCKED là chưa kiểm được đường thành công; FAIL là sai hành vi đã thấy.

| Case / thời điểm | Thao tác | Expected / Actual | Kết quả, evidence |
|---|---|---|---|
| LIVE-01/02, 18:48 | Mở / → BẮT ĐẦU SỬ DỤNG → /citizen | Khi DB lỗi, không dùng form/workflow mẫu. Thực tế danh sách rỗng, hiển thị máy chủ chưa khả dụng, không dùng kịch bản mẫu thay thế. | PASS fail-closed; BLOCKED danh sách thật. 01-citizen-db-offline.jpg |
| LIVE-03, 18:48 | Chụp phôi và chọn biểu mẫu → /citizen/scan; chưa chọn form; bấm Chụp ảnh tờ khai | Không tiếp tục nếu chưa có ảnh. Thực tế dropdown chỉ có placeholder, camera Unable to play media, bấm chụp báo Camera chưa có ảnh. | PASS chặn ảnh rỗng; BLOCKED camera thật. 02-scan-camera-unavailable.jpg |
| LIVE-03b, 18:48 | Bấm Bật/Tắt đèn flash | Phải tác động torch nếu hỗ trợ hoặc thông báo không hỗ trợ. Source hiện chỉ đổi isFlashOn/icon. Không có bằng chứng đèn thiết bị thay đổi. | FAIL triển khai chức năng torch qua kiểm tra source; chưa đo phần cứng. BUG-FE-03 |
| LIVE-04, 18:49 | /admin/library, chưa nhập khóa; nhập QA-invalid-key, Nạp lại; sau đó xóa khóa | Không đọc dữ liệu khi chưa auth. Thực tế thiếu khóa có hướng dẫn; sai khóa hiển thị UNAUTHORIZED. API tương ứng 401. | PASS auth gate; FAIL thông báo UX. BUG-FE-02 |
| LIVE-05, 18:49 | Thêm phôi trống; nhấn Phân tích khi chưa mã/tên/file/xác nhận | Validation chặn trước phân tích. Thực tế Chọn phôi trống và nhập mã/tên biểu mẫu. | PASS điều kiện rỗng; chưa tách riêng từng điều kiện |
| LIVE-06, 18:49 | Điền mã DEMO-VOICE-UI-20261008, tên DEMO kiểm thử UI, không dùng làm thủ tục; chọn demo-blank.png; xác nhận trống; Phân tích OpenCV và VietOCR | Hai vùng viết phải được đối soát. Thực tế 11 ứng viên, tất cả CHƯA RÕ NHÃN; OCR có chữ nhiễu trong ô trống. | FAIL chất lượng phát hiện/ghép nhãn; PASS không tự công bố. 03-real-ocr-needs-review.jpg |
| LIVE-07, 18:49 | Quan sát nút Lưu/sinh sau OCR khi chưa có khóa/chưa đối soát | Không cho gửi AI/publish. Nút bị disabled; không thực hiện sinh hay phê duyệt. | PASS trạng thái nút; chứng cứ không gọi AI/DB trái phép nằm ở test cục bộ, không có browser trace đầy đủ |
| LIVE-06b, 18:51 | Sau PNG đã phân tích, thay bằng tests/fixtures/demo-blank.svg qua file chooser kiểm thử | File không hỗ trợ phải có trạng thái lựa chọn rõ, không để kết quả cũ bị hiểu là kết quả file mới. Thực tế báo JPEG/PNG tối đa 8 MB nhưng giữ ảnh/draft 11 ô cũ. | FAIL stale draft. 04-invalid-replacement-retains-draft.jpg |
| LIVE-10a, 18:54 | Đóng upload; mở /citizen/guide không query | Không đọc workflow nếu không mã. Thực tế trang chưa được ban hành, không có panel voice. | PASS fail-closed; thông báo thiếu mã chưa riêng biệt. 05-guide-missing-code.jpg |
| LIVE-10b, 18:56 | Mở /citizen/guide?formCode=DEMO-VOICE-UI-20261008 | API 503 không được hiển thị thành đang thẩm định/chưa ban hành. Thực tế mọi lỗi rơi vào trang chưa được ban hành chính thức. | PASS không phát fixture; FAIL phân loại lỗi UX. 06-guide-db-offline.jpg |
| UI-01, 18:56 | Viewport 390×844; guide lỗi → Quay về trang chính → Thư viện → Thêm phôi trống → Đóng | Có thể thấy và thao tác nút chính. Dialog mở/đóng được, không tràn toàn trang theo scrollWidth=375 < innerWidth=390. Select chế độ ảnh có mép phải bị cắt trong screenshot. | PASS điều hướng cơ bản; cần FE sửa/đo select. 07/08/09-mobile-*.jpg |
| DEMO-01, 18:59 | Mở 3102, bấm Play native cho bước Họ và tên NORTH | MP3 phải giải mã/phát được. paused=false, readyState=4, duration=7.92s, error=null. | PASS media demo; không xác nhận nội dung nghe bằng tai |
| DEMO-02, 18:59 | Đang phát → Dòng kế tiếp → SOUTH → Play → Dòng trước | Đổi bước/giọng dừng audio, đổi nhãn/text. Bước 2 Địa chỉ liên hệ: NORTH 9s, SOUTH 8.448s; khi Play SOUTH currentTime=0.190855, paused=false, error=null. | PASS demo media/state; 10-qa-demo-south-audio.jpg; không chứng minh hook sản phẩm |
| LIVE-08/09 | Tạo draft → duyệt → citizen ACTIVE → voice/mic/Q&A/QR | Phải dùng bản duyệt từ DB và đúng từng bước. Không thực hiện được vì public/admin DB 503. Không bypass gate để công bố. | BLOCKED; phải chạy lại khi hạ tầng được sửa |

Text OCR thật có các dòng Họ và tên / Địa chỉ liên hệ, nhưng bên trong cả hai ô trống xuất hiện `Contransitionalists`. Cảnh báo gồm OCR_TEXT_DISAGREEMENT, OCR_ACCURACY_NOT_MEASURED, TEXT_CLASSIFICATION_REQUIRES_REVIEW, NO_VERIFIED_IMAGE_SIGNATURE_OR_STAMP_DETECTOR, PROVIDER_MODEL_NOT_REPORTED, TABLE_LAYOUT_NOT_PROVIDED. Không coi text hoặc tọa độ này đã đạt độ chính xác thực tế.

## 4. Lỗi, nguyên nhân và người phụ trách

| ID / mức | Nguyên nhân đã xác nhận hoặc giả thuyết | Hướng xử lý và tiêu chí test lại | Chủ trì / trạng thái |
|---|---|---|---|
| INFRA-01 / P1 chặn demo | API thật trả DATABASE_UNAVAILABLE cả public và admin có khóa đúng. Phiên trước có lỗi pooler Tenant or user not found; phiên này chỉ xác nhận HTTP, không khẳng định project bị tạm dừng. | Xác minh project/connection string/user/password theo Dashboard, không ghi secrets vào báo cáo. GET forms/workflow 200; transaction draft/approve chạy trên môi trường test riêng rồi mới nghiệm thu demo. Không tắt TLS/RLS để né lỗi. | Tech Lead — chưa sửa |
| BUG-VOICE-01 / P1 | voice-playback.service.ts fallback gọi speak không try/catch; cancel reset currentTime hoặc cancelSpeech có thể throw trước khi onPlaying(false)/resolve. Audio lỗi không chủ động pause trước speech. | Đã catch speech failure, teardown từng thao tác an toàn, dừng media trước speech, chặn fallback lặp/late event; báo lỗi tới hook/UI, settle đúng một lần. 9 regression case đạt. | Person 4 — đã sửa, cần test thiết bị thật sau DB |
| BUG-FE-01 / P2 | FormUploadModal.tsx:137 return khi file sai trước cancel/setFile/setDraft/setReviewConfirmed; file/processed/draft cũ giữ nguyên. | Quyết định rõ reject-and-keep-old với nhãn file cũ hoặc clear toàn bộ derived state; không giữ draft có thể bị hiểu là thuộc file mới. Test valid A → invalid B, khi đang OCR, khi đã review; generation bị invalidation, không gọi generate trên dữ liệu không rõ nguồn. Không có bằng chứng đã publish sai trong phiên này. | FE — bàn giao, không sửa ngoài role |
| BUG-FE-02 / P2 | Admin library catch hiển thị Error.message của API client; lỗi auth thành UNAUTHORIZED thô. | Map 401/503 sang tiếng Việt, có retry phù hợp, không tiết lộ key. Test thiếu/sai/đúng khóa nhưng DB lỗi có thông báo khác nhau. | FE — bàn giao |
| BUG-FE-03 / P2 | citizen/scan:149 chỉ setIsFlashOn; không đọc capabilities/applyConstraints torch. | Chỉ bật control nếu device hỗ trợ; thực thi torch hoặc ghi rõ không hỗ trợ; test thiết bị có/không torch. Không coi toggle icon là bật đèn. | FE — bàn giao |
| BUG-FE-04 / P2 | citizen/guide:36 catch bỏ thông tin lỗi; workflow=null dùng chung cho thiếu mã, 404 và 503. | Giữ trạng thái missing-code/not-found/service-unavailable riêng; 503 phải báo máy chủ và retry, tuyệt đối không tải fixture. Test bằng HTTP 404/503/abort. | FE — bàn giao |
| BUG-CV-01 / P1 chất lượng demo | Hai vùng viết thành 11 ứng viên và không ghép được nhãn. Assembler chỉ bỏ isContainer/phrase_cluster, ghép nhãn từ structure.fields/checkboxes và xóa nhãn trùng/ambiguity. Chưa có trace detector/ground truth để xác nhận ứng viên nào là duplicate. | Person 3 xuất candidate source/rect/score và OCR block IDs; đối chiếu ảnh processed-primary. Ground truth 2 ô: precision/recall, IoU, sai số tọa độ; không đưa title/border vào workflow. Manual review là gate tạm thời, không thay thế detector đúng. | Person 3 OpenCV + FE bridge — chưa sửa |
| BUG-OCR-01 / P1 chất lượng demo | OCR sinh chữ ở ô trống, đã thấy qua UI. Giả thuyết segmentation lấy đường viền vào crop cho model line-only; app.py:162/245 và predict_lines cần trace crop để kết luận. Không gán confidence là bằng chứng đúng. | Lưu crop debug synthetic, kiểm tra vùng không chữ/border không sinh text; bộ test blank field + chữ thật, CER/WER có ground truth; không mất chữ mờ hợp lệ khi lọc. Không tự động dùng chữ nhiễu làm nhãn. | Person 3 OCR — chưa sửa |
| UI-02 / P2 | Screenshot 390×844 cho thấy select chế độ ảnh bị cắt mép phải; class border p-2 ml-2 và native option dài cần kiểm tra kích thước control. Chưa có bbox riêng để kết luận CSS đầy đủ. | FE đo rect control, giới hạn width/min-width trong dialog; test 320/390/768 với options dài, không che nút, keyboard/focus trap. | FE — cần xác nhận và sửa |

Không sửa các thành phần FE/OpenCV/database ở trên trong chặng này để giữ phạm vi Person 4. Những file ngoài role đang dirty là phần việc sẵn có từ các phiên trước, không phải bản sửa mới của kiểm thử này.

## 5. Test và thay đổi mới

- Sửa src/modules/voice-ai/services/voice-playback.service.ts; src/modules/voice-ai/hooks/use-voice-assistant.ts truyền lỗi playback vào state và onError để panel hiện có hiển thị.
- Thêm src/modules/voice-ai/tests/playback-lifecycle.test.ts; package.json test:voice bao gồm file mới, không gọi cloud, không ghi audio public hoặc dữ liệu thật.
- Trước sửa: 6 case playback, 5 FAIL / 1 PASS; failure gồm exception sync, unhandledRejection, không pause trước speech, teardown throw. Sau sửa: 9/9 PASS, thêm unsupported speech/error reporting/duplicate fallback.
- npm run test:p2p: 46 TAP case PASS (forms 6 + voice client 7 + voice readiness/playback 18 + manifest/assets 15), cộng các assertion suite API client hiện có.
- npm run test:local: fixture/hợp đồng 6/6 và API integrity assertion suite PASS. Provider lỗi trong các negative test là có chủ đích. Đây không phải nghiệm thu 11 FR.
- Documents/OpenCV/VietOCR adapter: 219/219 test cục bộ PASS; không đo accuracy OCR thật hoặc sai số hình học trên tập ground truth. Tổng hai nhóm TAP đã chạy: 265 PASS.
- npm run typecheck PASS. AFL_BUILD_DIR=.next-document-json-build AFL_BUILD_THREADS=1 npm run build PASS (compile, lint/types, static pages).
- git diff --check không có lỗi whitespace; Git cảnh báo đổi LF/CRLF trên Windows. Không chạy lại browser suite Playwright trong chặng này; thao tác UI được thực hiện bằng browser hiển thị. Kiểm thử lifecycle bằng fake drivers không chứng minh mic/loa thật.

## 6. Thứ tự hoàn thiện workflow

1. **Tech Lead — gỡ INFRA-01 trước**: DB hoạt động, xác minh quyền/RLS, test transaction trên DB riêng. QA hiện không được đánh dấu thành công bằng cache hay đổi form thật sang ACTIVE.
2. **Person 3 + FE — ổn định phôi demo**: giữ cùng frame/ảnh, sửa dư ô/OCR vùng trống, review nhãn/box; đóng BUG-FE-01 để tránh dùng nhầm draft. Demo trước mắt có thể đối soát thủ công hai ô, nhưng phải ghi rõ là manual.
3. **Person 4 + FE — chạy lại đường thành công thật**: mã DEMO mới → OCR → review → Gemini → draft → sửa text/FAQ → TTS cả hai cấu hình → save → approve → public workflow/image 200; trước approve phải 404. Lưu workflow/audio identity/HTTP đã lược secrets, không chỉ screenshot.
4. **QA thiết bị**: có đồng ý camera/mic rồi test Chrome/Android thật, giữ/nhả, autoplay blocked, speech unsupported, chuyển bước khi đang hỏi/đọc, FAQ text+audio, mất mạng, tải lại và QR trên máy khác. Cần nghe đối chiếu text/audio, không chỉ đo duration.
5. **Phạm vi chưa kiểm được**: luồng nhiều trang chưa được nghiệm thu. Assembler/upload hiện giới hạn một trang; cần chặng triển khai đa trang với pageNumber/frame/ảnh riêng theo báo cáo step-08, không coi các trường pageNumber ở FE là pipeline đa trang hoàn chỉnh. Quota nhiều máy chủ, danh tính từng cán bộ và security deployment vẫn là bàn giao Tech Lead.

Điều kiện chốt demo: có ít nhất một mã DEMO công bố qua transaction thật, citizen nhận đúng workflow/ảnh/audio của mã đó, hai bước đọc khác nội dung, Q&A chỉ dùng bước đã duyệt, lỗi dịch vụ hiển thị rõ và không resurrect fixture. Bản preview 3102 hữu ích để nghe thử nhưng **không đáp ứng điều kiện này**.
