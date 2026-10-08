# Bàn giao tích hợp ảnh → kịch bản → FE

## Những thay đổi đã nối trong đợt này

- Admin library/review dùng `formCode` và API thật với khóa quản trị trong RAM; không công bố từ localStorage. Review saved snapshot phải được xác nhận trước khi gọi approve.
- Upload ảnh phôi: OpenCV tạo ảnh processed và candidate; cùng ảnh đó gửi `POST /api/documents/json`. Assembler chuyển nhãn OCR XYXY sang YXYX để đối chiếu, nhưng highlight vẫn là **vùng cần viết** của detector. Thiếu/trùng/không rõ nhãn phải sửa thủ công.
- Sau xác nhận: upload phôi qua API có khóa → manifest có trang verified → `POST /api/llm/prompt` → snapshot PENDING_REVIEW lưu transaction. Chỉ mở review khi server trả `meta.persisted: true`.
- Gemini không đổi box ID, thứ tự hoặc geometry; text OCR không phải system instruction. Model thiếu cấu hình cho form mới phải báo lỗi, không chèn fixture chín bước.
- Review lấy ảnh nháp qua authenticated fetch → Blob URL để hiển thị. JSON lưu vẫn giữ URL server, không gửi Blob URL vào DB. Sửa tọa độ cập nhật cả manifest và bước trong transaction.
- Admin chọn NORTH/SOUTH, tạo MP3 cho nội dung hiện tại rồi lưu workflow. Server chỉ giữ audio URL khớp hash của text/index/voice config; MP3 cũ của text khác bị bỏ. Chưa có MP3 thì citizen dùng đúng text qua SpeechSynthesis.
- Citizen chỉ đọc ACTIVE từ server. Q&A gửi `{formCode,stepIndex,userQuestion}`, một submit mỗi lượt mic, abort và bỏ kết quả cũ khi đổi context. Không tự mở lại bản mẫu/cache khi 404/503; không thay ảnh thiếu bằng phôi LPTB.
- QR đi thẳng `/citizen/guide?formCode=...`. Scan giữ pixel thật trong RAM, yêu cầu người dùng chọn loại mẫu đã ban hành; **chưa có nhận diện loại form tự động**.

UI quản trị đã chuyển sang thao tác mà server có thể xác nhận. Các thao tác local-only như công bố/lưu trữ/nhân bản phiên bản không được giữ làm đường đi thay thế; cần API revision/archive thật cho giai đoạn sau. Không coi sự giản lược UI này là nghiệm thu thiết kế/trợ năng cuối cùng.

## API đang dùng

| Chặng | Request | Response và cách FE dùng |
| --- | --- | --- |
| Đọc admin | `GET /api/admin/forms`, `GET .../[formCode]/workflow`, `x-admin-key` hoặc Bearer | Envelope chứa danh sách/workflow; 401/503 hiện lỗi, không dựng mock. |
| OCR phôi | `POST /api/documents/json` multipart `file` PNG processed, `deskewApplied` | `{success:true,data:DocumentJsonExport}`; không dùng chế độ download; đối chiếu kích thước processed frame. |
| Lưu phôi | `POST /api/admin/forms/assets`, `{formCode,imageBase64,blankTemplateConfirmed:true}` và khóa | `{success:true,data:{pageNumber:1,imageUrl,width,height}}`; thiếu/sai khóa 503/401 trước body/storage. |
| Sinh kịch bản | `POST /api/llm/prompt`, `{manifest}` và khóa | `data:FormWorkflow` có `formId/templateId` DB; `meta.persisted` phải true. ACTIVE không được ghi đè; lỗi không tạo local publication. |
| Review | `PUT /api/admin/forms/[formCode]/workflow`, workflow saved/edited | Thành công phải GET lại saved snapshot. Không sửa URL/trang/frame qua JSON review. |
| MP3 | `POST /api/tts`, `{text,stepIndex,region}`, khóa | `{success:true,data:{audioUrl,wordTimestamps}}`; deadline client 20 s. Gắn URL vào đúng bước rồi PUT/save. Đổi text phải tạo lại hoặc để audio rỗng. |
| Phê duyệt | `POST .../[formCode]/approve`, `{reviewConfirmed:true,performedBy,note}` | ACTIVE chỉ từ response server. `performedBy` mô tả, audit identity vẫn `shared_admin_key`. Dirty/đang tạo MP3 không được approve từ UI. |
| Ảnh review/citizen | `GET /api/admin/forms/[formCode]/pages/1?asset=<hash>` có khóa / `GET /api/forms/[formCode]/pages/1?asset=<hash>` công khai | PNG + no-store; bản nháp chỉ qua admin; công khai phải ACTIVE. Hash/path/frame sai không trả ảnh khác. |
| Citizen/Q&A | `GET /api/forms/[formCode]/workflow`, `POST /api/llm/qa` | Workflow ACTIVE và answer envelope; deadline Q&A client 10 s; browser không gửi `currentStep` hay dữ liệu chứng từ vào request QA. |

## Lưu phôi hiện tại và điều kiện triển khai

`FORM_TEMPLATE_ASSET_DIR` là đường dẫn server riêng chứa PNG/JSON hash bất biến; mặc định `private-documents/form-templates`. Không đặt trong `public`, không commit ảnh thật. Các file upload/metadata có thể còn orphan nếu generation/DB lỗi; chưa có job cleanup tự động.

Không đổi Prisma schema: `FormTemplate.originalPdfUrl` giữ reference `afl-template-v1:<hash>` cho metadata một trang. Các URL PDF cũ được giữ là legacy, không tự suy ra trang từ chúng. Đây là adapter tạm, cần thay bằng schema/storage revision trong kế hoạch đa trang. Phôi cũ chưa có metadata phải nhập/đối soát lại; không tự gắn ảnh LPTB.

**Không phù hợp serverless filesystem tạm hoặc nhiều instance không dùng chung volume.** Cần volume bền vững/chia sẻ, quyền đọc/ghi, backup, kiểm tra hash và migration storage trước khi triển khai rộng. Audio hiện nằm `public/audio`; cũng cần storage bền vững/chia sẻ. Việc private hóa ảnh nháp không đồng nghĩa audio draft hiện đã được bảo vệ bởi endpoint theo trạng thái: MP3 public theo hash; cần chính sách retention/quyền audio revision ở đợt triển khai tiếp theo. Chỉ phôi trống được upload, không hồ sơ công dân.

## Những việc còn cần phối hợp

| Owner | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE admin + nghiệp vụ | Phôi/manifest/script → review thực tế tại quầy | Upload modal, `FormGeometricManifest`, `FormWorkflow`, review/approve APIs | Cán bộ thấy đúng ảnh/ô, sửa nhãn và thứ tự, lưu rồi đối soát; lỗi không báo thành công | Cần UAT luồng mới, UI polish, xác minh căn cứ; phôi mẫu cũ có thể cần nhập lại. |
| OpenCV/VietOCR + QA | Bộ phôi độc lập → geometry/text có báo cáo sai số | `FieldCandidate`, `DocumentJsonExport`, assembler | Nhãn đúng nguồn, không highlight nhãn thay vùng viết; đo CER/WER, IoU và lỗi camera | Test hợp đồng không cải thiện độ chính xác OCR. Dịch vụ OCR/live weights và benchmark riêng chưa nghiệm thu trong phiên này. |
| FE citizen + Voice AI | ACTIVE workflow → đọc/nghe/hỏi tại thiết bị | `VoiceAssistantPanel`, hook Voice, Q&A | Đúng nội dung từng form/bước, không double submit/late audio; lỗi network có hướng xử lý | Browser tests dùng STT/speech giả lập; cần mic/loa/autoplay/iOS/Android và giọng thực. Web Speech có thể dùng dịch vụ của trình duyệt; không cam kết STT offline/on-device. |
| FE + QA | Giao diện thật → báo cáo trợ năng | Text/highlight/FAQ/mic/QR | Zoom, bàn phím, screen reader, giảm chuyển động và thao tác kéo box | `#D32F2F` trên trắng khoảng 4,98:1, không đạt AAA 7:1. Chưa có word-highlight đồng bộ timestamps hoặc kiểm định toàn bộ FE. |
| Voice AI + QA | Phôi thực và kịch bản đối soát → Gemini/TTS staging | Prompt/TTS APIs, region | MP3 hợp lệ, hai giọng không ghi đè; không tự suy luận pháp lý; script đủ ô | Chưa gọi cloud có phí/đánh giá phát âm. Labels/basis cần owner nghiệp vụ duyệt trước xuất bản. |
| FE + Tech Lead | `NEXT_PUBLIC_APP_URL` HTTPS + ACTIVE form → QR in thực tế | `/citizen/guide?formCode=...` | Điện thoại khác mở đúng form; archived không lộ hướng dẫn; có lỗi offline | Cần URL triển khai và quy trình thay QR/version; localhost của máy dev không phải URL quầy. |
| Tech Lead/BE | Runtime/DB/storage → triển khai an toàn | Prisma, Supabase/RLS, `FORM_TEMPLATE_ASSET_DIR`, audio storage | DB test riêng có rollback/concurrency; service role/RLS được kiểm tra; storage survives deploy | Phiên này không có DB test riêng đã xác nhận, không chạy migration hay ghi DB thật. Mock transaction không chứng minh isolation PostgreSQL thực. |
| Tech Lead/Auth | Cán bộ thật → danh tính/quyền audit | Auth cán bộ thay shared key | Revoke/rotate, phân vai và audit userId thật; không log token | Shared key là cầu nối, không phải danh tính cán bộ; chưa triển khai RBAC cán bộ. |
| Tech Lead/BE | Nhiều instance và chi phí cloud → quota dùng chung | Distributed limiter/queue, generation + QA + TTS | Counter/rate-limit thống nhất giữa server, backpressure và cảnh báo ngân sách | Counter RAM hiện chỉ giới hạn từng process; chưa có quota phân tán/abuse gate công khai. |
| Cả nhóm | Bộ nhiều trang → snapshot đúng trang và revision | Hợp đồng v2 trong `MULTIPAGE-FORMS-IMPLEMENTATION-PLAN.md` | MP1–MP8 có test riêng và migration an toàn | Chưa implementation PDF/multi-image/multi-page; không coi `pages[]` hiện tại là tính năng đa trang hoàn chỉnh. |

## Kiểm tra thủ công trên môi trường riêng

1. Khởi động VietOCR theo tài liệu service, cấu hình `VIETOCR_ENDPOINT`; xác minh health/model đã sẵn sàng. Thiếu OCR phải hiện lỗi, không sinh text mẫu.
2. Cấu hình secret chỉ ở server và nhập vào UI admin; chọn **DB thử nghiệm riêng**, không dùng DB production cho nghiệm thu tạo/phê duyệt.
3. Kiểm tra storage có quyền và bền vững; upload một JPEG/PNG phôi trống. Scan nghiêng chọn camera-photo; ảnh scan chọn clean-scan.
4. Đối chiếu nhãn và vùng cần viết từng ô; xóa candidate không cần, thêm/vẽ/sửa ô thiếu, chỉnh thứ tự. Xác nhận rồi sinh script, không kỳ vọng Gemini khi chưa cấu hình key/model.
5. Review text/FAQ/căn cứ/geometry; tạo MP3 NORTH/SOUTH nếu cloud được phép; nghe thử, lưu và GET lại. Không dùng mã form đã ACTIVE để ghi đè script.
6. Xác nhận, approve, mở QR bằng một phiên citizen khác; chuyển ít nhất hai bước/hai form và thử một lượt mic. Tắt mạng/DB/OCR có kiểm soát để kiểm tra lỗi không chuyển ACTIVE giả.
7. Lưu báo cáo định lượng riêng cho data thật. Không sửa các báo cáo cũ để biến fixture thành nghiệm thu 11 FR.

## Lệnh kiểm tra không gọi cloud/DB thật

- `npm run test:p2p`: API clients + negative publication + Voice + manifest/assets; storage test chỉ dùng thư mục tạm.
- `npm run test:local`: fixture/hợp đồng và API integrity mocks; không gọi là nghiệm thu 11 FR.
- `npx tsx --test src/modules/documents/tests/*.test.ts src/modules/opencv/tests/*.test.ts src/modules/ocr/tests/vietocr-adapter.test.ts`.
- `npm run typecheck`.
- PowerShell build riêng: `$env:AFL_BUILD_DIR='.next-document-json-build'; $env:AFL_BUILD_THREADS='1'; npm run build`.
- Dùng build đó: `npx next start -p 3101`; terminal khác `npm run test:image-voice:browser`. Browser suite intercept OCR/admin/model/TTS/Q&A HTTP và giả lập speech/STT; OpenCV chạy thật trong test upload. Dừng server test sau chạy.

Không chạy các lệnh generate audio/cloud stress/DB persistence thật trong suite mặc định. Báo cáo trạng thái/kết quả từng chặng nằm trong `IMPLEMENTATION-PROGRESS.md`.
