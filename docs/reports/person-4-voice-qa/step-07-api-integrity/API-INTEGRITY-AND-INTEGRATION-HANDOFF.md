# Bàn giao kỹ thuật: toàn vẹn API và tích hợp Voice AI

Ngày: 26/09/2026. Phạm vi đợt này: API quản trị, kiểm tra manifest/workflow, công bố bản đã duyệt, TTS, Q&A và bằng chứng QA cục bộ. Không thay đổi Prisma schema, không nghiệm thu giao diện hay đầu ra OpenCV thực.

## Hợp đồng API hiện tại

| API | Quyền và đầu vào | Kết quả quan trọng |
| --- | --- | --- |
| `POST /api/llm/prompt` | `Authorization: Bearer <ADMIN_SECRET_KEY>` hoặc `x-admin-key`; `{ "manifest": FormGeometricManifest }`, tối đa 256 KiB | Lưu manifest và workflow `PENDING_REVIEW` trong một transaction; `409` nếu form `ACTIVE`, `503` nếu DB không sẵn sàng. |
| `POST /api/tts` | Khóa admin; `{ "text": string (1–2000 ký tự), "stepIndex": integer (1–1000), "region": "NORTH" | "SOUTH" }`, tối đa 8 KiB | `audioUrl` theo hash nội dung/giọng/cấu hình, `wordTimestamps`; `503` nếu không có MP3 hợp lệ. Không sinh file giả. |
| `POST /api/admin/forms/[formCode]/approve` | Khóa admin; `{ "reviewConfirmed": true, "performedBy"?: string, "note"?: string }`, tối đa 4 KiB | `409` nếu chưa xác nhận hoặc workflow/box không hợp lệ; `503` khi DB lỗi. Audit `performedBy=shared_admin_key`; tên request chỉ là `reviewerName` mô tả. |
| `GET /api/forms/[formCode]/workflow` | Công khai | `200` chỉ khi cả form và workflow `ACTIVE`; `404` cho nháp/chờ duyệt/lưu trữ; `503` khi DB lỗi. |
| `POST /api/llm/qa` | Công khai; `{ "formCode": string, "stepIndex": integer, "userQuestion": string (1–500 ký tự) }`, tối đa 4 KiB | Server lấy bước từ workflow `ACTIVE`; `404` nếu không có. Không nhận `currentStep` do client tự khai. Gemini giới hạn 3 lời gọi đồng thời/máy và timeout 5 giây. |

Thiếu `ADMIN_SECRET_KEY` trả `503`, khóa sai hoặc thiếu trả `401` trước khi gọi AI hoặc ghi DB. Quản trị hiện dùng khóa chung, **chưa** xác thực được từng cán bộ. Workflow mới từ Gemini có `audioUrl` rỗng cho đến khi âm thanh thật được tạo và gắn vào quy trình công bố; không được dùng `/audio/step_XX.mp3` của form khác làm mặc định.

## Các đầu việc phụ thuộc

### FE: màn hình kiểm duyệt quản trị

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE + cán bộ nghiệp vụ | Manifest, workflow chờ duyệt → màn hình đối chiếu box, nội dung và nút xác nhận rõ ràng | `FormGeometricManifest`, `FormWorkflow`; `POST /api/admin/forms/[formCode]/approve` với `reviewConfirmed: true` | Cán bộ thấy đủ ô/bước, không phê duyệt ngầm; hiển thị lỗi `409/503`; không đưa khóa admin vào bundle công dân | Chưa có UI và cơ chế cấp khóa an toàn cho FE quản trị; tên cán bộ chưa là danh tính xác thực. |

### FE: màn hình công dân

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE | `formCode` từ QR → các bước hướng dẫn, highlight, FAQ và âm thanh | `GET /api/forms/[formCode]/workflow` → `FormWorkflow` | Không hiện nội dung khi `404/503`; không lấy bản nháp từ cache hoặc dữ liệu tĩnh; highlight đúng `highlightCoords` | Chưa có màn hình công dân hoàn chỉnh và xử lý trạng thái không có audio mới. |

### FE: tích hợp hook hỏi đáp

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE | Form đang hiển thị, `stepIndex`, câu hỏi STT → câu trả lời/FAQ | `useVoiceAssistant().askQuestion(formCode, stepIndex, questionText)`; `POST /api/llm/qa` | Không gửi `currentStep`; câu hỏi cùng `boxId` ở hai form không dùng nhầm ngữ cảnh; fallback khi API không khả dụng | Chưa tích hợp hook vào màn hình thật và chưa kiểm thử luồng mic/loa trên thiết bị. |

### FE và Voice AI: chọn giọng, xuất bản audio

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE quản trị + Voice AI | Lời hướng dẫn đã duyệt, vùng giọng → MP3 và timestamp tương ứng, rồi gắn URL vào workflow | `POST /api/tts` với `region: NORTH/SOUTH`; `audioUrl`, `wordTimestamps` | Hai nội dung/vùng giọng khác nhau không ghi đè; chỉ dùng MP3 hợp lệ; URL của bản đã duyệt trỏ đúng audio | Chưa có UI chọn giọng và API/quy trình gắn URL audio vào workflow sau tổng hợp. Cần thiết kế bước này trước khi yêu cầu audio bắt buộc khi phê duyệt. |

### FE: trợ năng

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE + QA | Chữ mẫu, màu nền, kích thước chữ và điều khiển mic → giao diện cho người cao tuổi | `exampleRedText`, `highlightCoords`, `wordTimestamps`; WCAG 2.1 | Đo tương phản trên màu **thực tế**; kiểm tra zoom, bàn phím, nhãn đọc màn hình, trạng thái mic/loa trên thiết bị | `#D32F2F` trên trắng chỉ khoảng **4,98:1**, không đạt AAA 7:1. Cần chọn màu/nền khác và đo lại; fixture không chứng minh trợ năng thực tế. |

### FE: luồng QR

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| FE + Tech Lead | QR in tại quầy → `formCode` → workflow đã duyệt | `GET /api/forms/[formCode]/workflow` | QR trỏ đúng form, mã URL encode/decode ổn định; form nháp/chờ duyệt/lưu trữ không lộ nội dung; có màn hình lỗi offline | Chưa có QR thực tế và quy trình in/thay thế QR khi lưu trữ hoặc đổi phiên bản. |

### OpenCV: manifest thật

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| OpenCV | PDF/ảnh mẫu thật → `FormGeometricManifest` với `formId`, `formCode`, `imageDimensions`, box duy nhất và tọa độ chuẩn hóa | `POST /api/llm/prompt`; `normalizedCoords=[ymin,xmin,ymax,xmax]` trong `[0,1]` | Không có ID trùng, tọa độ hữu hạn và đúng thứ tự; một box ↔ một bước; manifest dưới 256 KiB | Mới có fixture, chưa có pipeline OpenCV thật và bộ dữ liệu nhiều mẫu để đối chiếu. |

### OpenCV + FE: sai số tọa độ

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| OpenCV + FE + QA | Ảnh/PDF chuẩn và box dự đoán → báo cáo sai số trên các màn hình/cỡ ảnh | `normalizedCoords`, `highlightCoords` | Đo IoU/sai số mép box trên bộ mẫu độc lập, định nghĩa ngưỡng chấp nhận với nghiệp vụ trước nghiệm thu | Chưa có ground truth, ngưỡng sai số, kiểm thử xoay/cắt ảnh và đo trên thiết bị FE. |

### Tech Lead: quyền Supabase và danh tính cán bộ

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| Tech Lead / DB | Prisma connection, bảng form/workflow/audit/cache → ma trận quyền và RLS được xác minh trên Supabase | `FormTemplate`, `FormWorkflow`, `FormAuditLog`, `VoiceCache`; server credentials | Kiểm tra RLS/grants/role bằng tài khoản thử nghiệm; chỉ backend có quyền ghi; công dân không đọc bản nháp qua kênh khác; audit gắn danh tính cán bộ đã xác thực | Chưa xác minh RLS/quyền Supabase trên môi trường thật. `ADMIN_SECRET_KEY` là khóa chia sẻ, không nhận diện cá nhân; cần auth từng cán bộ trước triển khai rộng. |

### Tech Lead: quota nhiều máy chủ

| Người phụ trách | Đầu vào → đầu ra | API/kiểu dữ liệu | Tiêu chí nghiệm thu | Điểm còn thiếu |
| --- | --- | --- | --- | --- |
| Tech Lead + Voice AI | Lưu lượng TTS/Gemini nhiều instance → cơ chế quota chung, timeout và giám sát | `/api/llm/qa`, `/api/llm/prompt`, `/api/tts` | Giới hạn theo IP/người dùng/quầy và quota chung vẫn đúng khi chạy nhiều máy; có cảnh báo, fallback và kiểm thử tải | Giới hạn 3 lời gọi Gemini Q&A hiện chỉ nằm trong **một tiến trình**; chưa có rate limit/quota phân tán. Đây là điều kiện trước triển khai rộng. |

## Bằng chứng và giới hạn

- Test cục bộ dùng mock, không gọi cloud hay ghi đè audio: auth âm tính, manifest trùng ID, chặn form ACTIVE, DB offline, draft không công khai, workflow rỗng/sai box không có audit, TTS không tạo file giả, hash audio khác nhau, Q&A không nhận bước giả từ client.
- Bộ QA hiện chỉ kiểm tra **fixture/hợp đồng dữ liệu**, không tuyên bố nghiệm thu 11 FR. Các MP3 mẫu được kiểm tra header MPEG chứ không chỉ đuôi tên file. Tương phản đo được `#D32F2F`/trắng ≈ 4,98:1.
- Chưa chạy transaction trên database thử nghiệm riêng vì chưa có môi trường DB an toàn được xác nhận; chưa kiểm chứng giọng Cloud TTS/Gemini thật hay UI/thiết bị. Không dùng DB sản xuất để kiểm thử.
