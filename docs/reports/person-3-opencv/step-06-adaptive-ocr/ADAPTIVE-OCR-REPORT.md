# Adaptive image preprocessing and safe OCR retry

Ngày: 04/10/2026. Triển khai trực tiếp theo yêu cầu người dùng; không push.

## Nguyên nhân và audit

- Đã đọc AGENTS.md, README, ARCHITECTURE, DOCUMENT-EXTRACTION, document-quality,
  document-detector, perspective-transform, debug-pipeline, documents, API và scan-document.
- Cảnh báo nghi lóa phát sinh trong image-quality.ts: tile sáng gần clipping và
  sáng hơn các tile xung quanh được xem là hotspot. prepare-image.ts gom các cảnh
  báo mờ/lóa/độ phân giải thấp rồi throw trước khi OCR được gọi.
- Pipeline chuẩn bị ảnh còn giảm cạnh dài xuống 1600px và chạy cả debug nhận diện ô.
  Ảnh deskew có được gửi tới OCR khi qua gate; không phải luôn gửi file gốc.
- Gate hình học ở document-quality/document-detector khác gate chất lượng chữ.
  Ngưỡng diện tích, cạnh, rectangularity, edge support và confidence hình học được
  giữ nguyên. Không dùng quad bị từ chối để crop.
- Cấu hình local thực tế: DOCUMENT_OCR_PROVIDER=vietocr. GoogleDocumentAiProvider
  vẫn tồn tại; khi chọn google-document-ai, OCR là Google Document AI, Gemini là
  provider riêng chỉ xử lý text để phân loại và trích xuất schema. Không đổi config,
  credential, billing, quyền cloud hoặc tích hợp Mistral.
- Screenshot cảnh báo không chứng minh false positive. Fixture trắng có nét rõ và
  fixture clipping được bổ sung; kết quả chỉ xác minh chính sách/heuristic trên ảnh
  tổng hợp, không kết luận nguyên nhân của một ảnh camera chưa được cung cấp.

## Pipeline trước và sau

Trước: ảnh -> giảm xuống 1600px -> debug detection/warp -> quality errors -> throw
hoặc một lần OCR -> structured extraction -> review.

Sau: kiểm tra định dạng/kích thước -> detection trên bản nhỏ, warp trên source gốc
-> ảnh màu primary -> quality analysis -> tối đa hai enhanced candidates nếu cần
-> OCR primary -> tối đa một retry enhanced tuần tự -> đối chiếu tất định
-> hiển thị nguồn/raw attempts/vùng cần kiểm tra -> người dùng sửa/xác nhận -> Session RAM.

Luồng Markdown dùng cùng adaptive OCR rồi assembler/validator/review hiện có;
không gọi Gemini. Pipeline debug tìm ô vẫn phục vụ chức năng riêng, không còn là
điều kiện bắt buộc để chuẩn bị ảnh ở scan-document.

## Tiền xử lý và capability

- Contrast: grayscale, bilateral nhẹ; nếu thiếu bilateralFilter dùng Gaussian nhẹ.
  CLAHE khi runtime có CLAHE/createCLAHE; nếu thiếu dùng linear contrast nhẹ.
  Sau đó unsharp nhẹ, không áp dụng in-place.
- Lighting: grayscale, Gaussian background estimation, chia ở floating point với
  floor mẫu số 16, saturating conversion, tăng contrast nhẹ. Không morphology mạnh.
- Runtime @techstark/opencv-js 5.0.0 thực tế: Mat=function, CLAHE=function,
  createCLAHE=undefined, bilateralFilter=function. Real WASM integration đã chạy
  cả hai variants. Unit tests cũng chạy fallback khi thiếu optional capabilities.
- Nếu ảnh được phân tích là rõ nhưng OCR bất ngờ yếu và không có client candidate,
  server dùng Sharp để tạo contrast sau lần đọc đầu: grayscale/blur/linear contrast/
  unsharp nhẹ. Đây là fallback hỗ trợ được, không gọi nó là OpenCV CLAHE.
- Primary màu không bị ghi đè. Không threshold-only input, generative super-resolution,
  inpainting hoặc tái tạo chữ/số. Upscale không được xem là khôi phục thông tin.
- Resize detection dùng scaleX/scaleY riêng; bỏ giới hạn OCR 1600px. Primary native
  hoặc warp trong cap 4096px/12 triệu pixel. Enhanced upscale tối đa 2x, trong
  8192px/12 triệu pixel. Server tự tính axis scales từ dimensions giải mã, từ chối
  enhanced có crop/aspect ratio khác. Bounding boxes normalized thuộc primary frame;
  không khẳng định đã map ngược về ảnh gốc trước warp.
- PNG là mặc định; JPEG quality 0.95 nếu PNG vượt 8 MB. Mỗi file tối đa 8 MB,
  request primary + tối đa hai variants tối đa 26 MB. Các variants được tạo/giải mã
  tuần tự trong RAM; Mat/object CLAHE/transform được delete trong finally, URL bị
  revoke khi thay ảnh, lỗi, hết phiên và unmount. Không giữ Mat trong React state.

## Chính sách warning và hard error

Mờ, tương phản thấp, ảnh nhỏ, bóng, nghi lóa là warning để chọn tiền xử lý; không
throw chỉ vì chất lượng chữ. possibleGlare cần clipping, gradient/texture xung quanh,
độ sáng tương đối, vùng liên tục và ROI nội bộ. Vùng trắng hợp lệ vẫn có thể bị nghi
ngờ; không kết luận chữ mất chỉ vì vùng trắng không có edge. recognitionUncertain
đến từ OCR/đối chiếu; unreadable dùng khi chưa đọc được sau thử xử lý.

File hỏng/không giải mã được, MIME không hỗ trợ, dimension bằng 0, vượt byte/pixel,
warp không hữu hạn/singular/horizon đi qua ROI vẫn hard error. API fully decodes
trước OCR; signature/header đúng không đủ. Không nới các guard chống quad suy biến.

Không tìm giấy: upload có thể đọc toàn ảnh, documentDetectionFailed=true,
deskewApplied=false và requiresReview. Camera giữ preview và yêu cầu hành động
Thử đọc toàn ảnh; không tự dùng quad confidence thấp và không gọi source chưa warp
là deskew. Chụp lại không phải phản ứng mặc định với ảnh hợp lệ nhưng chất lượng thấp.

## Retry, provenance và đối chiếu

- Primary luôn được OCR trước. Chỉ retry khi text rỗng/không đọc được, thiếu line,
  geometry/confidence, ký tự hỏng, provider quality warning hoặc tỷ lệ score thấp.
- Config ban đầu: retryConfidence=0.8, lowConfidenceFraction=0.2, alignmentIoU=0.65.
  Đây là heuristic cần hiệu chỉnh, không phải chân lý hay độ chính xác đã đo.
- Tối đa hai OCR attempts tuần tự/request/page, cùng một OCR time budget mặc định
  60 giây theo DOCUMENT_OCR_TIMEOUT_MS. Không retry config/auth/input/quota/transport/
  timeout errors; cancellation ngăn call tiếp. Retry lỗi giữ primary và error code an toàn.
- Google OCR SDK retry=null; Gemini HTTP attempts=1. Luồng structured tối đa
  2 OCR + 1 classify + 1 extract = 4 API calls; Markdown tối đa 2 OCR calls.
- Giữ raw text/lines/tokens của mỗi attempt cùng variant, provider, timing, scaleX/Y,
  selectedAttempt và lý do chọn trong RAM. Confidence provider thiếu luôn null.
  Không textCoverage giả hoặc log full OCR/ảnh/base64/secret.
- Primary được giữ mặc định. Chỉ chọn toàn enhanced nếu primary không đọc được,
  hoặc primary có ký tự hỏng và numeric strings giống nhau, enhanced đọc được.
  Không chọn vì nhiều chữ hay confidence cao hơn. Không nối/merge hai chuỗi.
- Alignment chỉ được công nhận khi match line IoU đủ cao và duy nhất ở cả hai
  hướng. Text/numeric disagreement không alignment được vẫn warning toàn trang;
  không tạo bounding box giả. Tiền, CCCD, ngày, số biên bản và biển số khác nhau
  phải kiểm tra. Gemini chỉ nhận OCR đã chọn, không phân xử các giá trị cạnh tranh.
- Source warning/disagreement chuyển accepted fields thành needs_review. Session RAM
  và guide không nhận chúng cho đến khi người dùng xác nhận. Raw attempts/review
  metadata không được lưu Session RAM; chỉ các giá trị nghiệp vụ đã duyệt được lưu.
- VietOCR document provider tắt development synthesizer và không tự gán confidence
  0.95 khi thiếu điểm. Generic adapter mock chỉ còn ở các test/dev opt-in riêng.

## UI và vùng không đọc được

Hiển thị Đang tối ưu hình ảnh / Đang đọc nội dung / Đang kiểm tra kết quả. Sau OCR
có primary/enhanced preview, raw từng attempt, overlay confidence thấp/disagreement,
trường sửa/xác nhận và lựa chọn ảnh khác/chụp lại. Không có tọa độ đáng tin thì kiểm
tra toàn trang. Text rỗng hiện Chưa đọc được vùng này, giữ source; không thành công
trích xuất hay valid empty Markdown. Possible blank cũng buộc manual review kể cả
provider trả text. Lỗi OCR Markdown giữ provenance an toàn để hiển thị vùng nguồn.

Request ID và AbortController kiểm soát mọi asynchronous output. Đổi ảnh/mode/hint,
xóa phiên, hết hạn hoặc bắt đầu request mới xóa output, confirmations và review cũ.
Response cũ không được ghi đè request mới. Consent bằng hành động đọc và Session RAM
15 phút được giữ; không gửi giấy tờ thật lên cloud để test, không persistence ảnh.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| npm run test:opencv | 41/41 pass |
| npm run test:documents | 104/104 pass trong workspace, gồm 8 test normalizer của thay đổi khác không đưa vào commit |
| VietOCR adapter unit tests | 3/3 pass |
| npm run test:local | QA fixtures 6/6 + API integrity pass, provider/DB giả |
| TypeScript --noEmit --incremental false | Pass |
| npm run build | Production compile, lint, type validation, page generation pass |
| npm run test:documents:browser | 13/13 pass trên Chrome, production server, OCR bị intercept |
| git diff --check phần nhiệm vụ / staged diff | Pass |
| git diff --check toàn workspace | Whitespace có sẵn trong CameraScannerModal.tsx:163; giữ nguyên, ngoài commit |

Sandbox Windows báo spawn EPERM cho test runner/build/browser; các lệnh này được
chạy lại ngoài sandbox sau approval. Test server tắt provider/Google configuration
và browser fail-closed intercept các OCR route. Không dùng credential cloud để test.

Browser xác minh ảnh rõ/thấp tương phản/nhỏ ba lần liên tiếp; preview primary và
contrast, lighting preview với bóng, warning không chặn đọc, camera fallback có
hành động rõ, unreadable source overlay, review trước tải/lưu, thay ảnh/mode xóa
output, response cũ không ghi đè, object URL cleanup khi camera detection exception
và success. Không có pageerror/console error trong các ca valid được theo dõi.

## Giới hạn và việc chưa kiểm chứng

- Chưa chạy Google Document AI/Gemini/VietOCR thật end-to-end hoặc benchmark ảnh
  camera thật; không tuyên bố accuracy từ ảnh tổng hợp. Harness live hiện có yêu cầu
  --live và dataset đã ẩn thông tin/được đồng ý; không chạy trong nhiệm vụ này.
- Glare/blank/blur và confidence là heuristic. Không khôi phục được chữ đã bị clipping
  hoặc chi tiết không tồn tại. Đối chiếu rất thận trọng, có thể yêu cầu kiểm tra cả
  trang; chỉ có line/axis-scale alignment, không region merge.
- Ảnh vượt cap bị từ chối. Bộ nhớ pixel được giới hạn theo dimensions và tuần tự
  giải phóng; chưa đo peak RSS hoặc benchmark latency trên điện thoại.
- Server fallback contrast không có preview enhanced từ server; primary vẫn là
  source và các tọa độ normalized cùng frame. Client-generated candidates có preview.
- Pipeline debug/Admin/CameraScannerModal riêng không được refactor trong nhiệm vụ.
  Những thay đổi khác đang tồn tại trong FormUploadModal, CameraScannerModal,
  form.controller và markdown-assembler/normalizer được bảo toàn, ngoài commit.
- Không push. Commit của nhiệm vụ được báo bằng hash trong phản hồi cuối.

## File của nhiệm vụ

- `package.json`
- `package-lock.json`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DOCUMENT-EXTRACTION.md`
- `docs/reports/person-3-opencv/step-06-adaptive-ocr/ADAPTIVE-OCR-REPORT.md`
- `src/app/scan-document/page.tsx`
- `src/components/documents/OcrAttemptReview.tsx`
- `src/modules/documents/adaptive-ocr.ts`
- `src/modules/documents/adaptive-preprocessing.ts`
- `src/modules/documents/api.ts`
- `src/modules/documents/config.ts`
- `src/modules/documents/image-quality.ts`
- `src/modules/documents/markdown.types.ts`
- `src/modules/documents/prepare-image.ts`
- `src/modules/documents/providers/google-document-ai.ts`
- `src/modules/documents/providers/gemini-structured.ts`
- `src/modules/documents/providers/vietocr-provider.ts`
- `src/modules/documents/services/document-extraction.service.ts`
- `src/modules/documents/services/markdown-export.service.ts`
- `src/modules/documents/tests/adaptive-ocr.test.ts`
- `src/modules/documents/tests/adaptive-preprocessing.test.ts`
- `src/modules/documents/tests/document-extraction.test.ts`
- `src/modules/documents/tests/image-quality.test.ts`
- `src/modules/documents/tests/markdown-export.test.ts`
- `src/modules/documents/tests/opencv-ownership.test.ts`
- `src/modules/ocr/vietocr-adapter.ts`
- `src/modules/ocr/tests/vietocr-adapter.test.ts`
- `src/modules/opencv/perspective-transform.ts`
- `src/shared/document-extraction.types.ts`
- `src/shared/contracts.ts`
- `tests/browser/document-extraction.spec.ts`
- `scripts/generate-document-image-fixtures.mjs`
- `tests/fixtures/documents/README.md`
- `tests/fixtures/documents/clear.png`
- `tests/fixtures/documents/low-contrast.png`
- `tests/fixtures/documents/small.png`
- `tests/fixtures/documents/shadow.png`
- `tests/fixtures/documents/clipped.png`
- `tests/fixtures/documents/blank.png`
- `tests/fixtures/documents/no-paper.png`
- `src/modules/documents/errors.ts`
- `src/modules/documents/markdown-api.ts`
