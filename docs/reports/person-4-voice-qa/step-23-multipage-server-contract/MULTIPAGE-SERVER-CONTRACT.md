# Chặng 12 — Hợp đồng máy chủ cho biểu mẫu đa trang

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Chặng này nối số trang từ manifest đã đối soát qua Gemini, artifact ảnh, repository đọc lại và route ảnh công khai. **Chưa bật FE upload nhiều file và chưa thử DB thật**; không coi đây là nghiệm thu đa trang hoàn chỉnh.

## Quyết định dữ liệu

Giữ Prisma schema hiện tại trong chặng này. Tọa độ chính và thứ tự bước vẫn nằm trong bảng quan hệ; số trang, loại ô và các vùng nối trang được lưu cùng ảnh trong artifact JSON bất biến có hash, trỏ từ `originalPdfUrl` của form. Khi đọc lại workflow, repository đối chiếu metadata đó với từng `boxId` và tọa độ đã lưu. Artifact thiếu bước, trang, ảnh hoặc kích thước đúng sẽ bị từ chối trước khi công bố. Cách này tránh migration vội; **không** giải quyết tính bền vững của ổ đĩa local trên nhiều máy chủ, quyền RLS/Supabase hoặc xác thực từng cán bộ.

## Thay đổi

- Manifest/Workflow chấp nhận tối đa 20 trang liên tiếp, trang đầu khớp `imageDimensions`. Box và bước thuộc trang hiện hữu; tất cả box đa trang cần metadata loại/vùng và một bước tương ứng. Vùng tiếp tục có thể nằm ở trang sau nhưng vùng đầu phải khớp tọa độ chính và trang của bước.
- Asset upload nhận `pageNumber` nguyên 1–20 (mặc định 1 cho client cũ). Artifact xác minh từng URL hash, kích thước và thứ tự trang; route ảnh chỉ trả trang của workflow `ACTIVE`, còn admin phải có khóa.
- Gemini lấy `pageNumber` từ box đã duyệt, không tin trang do model trả. Repository giữ/trả lại trang qua artifact và chặn metadata thiếu bước trên biểu mẫu đa trang. FE citizen hiện có thể tô sáng theo `step.pageNumber` khi nhận workflow hợp lệ.

## Test cục bộ

| Kiểm tra | Kết quả |
| --- | --- |
| Hai ảnh khác kích thước, bước trang 1/2, vùng nối trang, lưu và đọc lại qua repository giả lập | PASS |
| Trang trùng/khuyết, frame sai, bước đổi trang, metadata thiếu box, ảnh trang 2 mất | Bị từ chối |
| Công dân đọc ảnh trang 2 khi `ACTIVE`, không đọc khi chờ duyệt | PASS |
| Gemini giả lập cố gán cả hai bước vào trang 1 | Máy chủ vẫn trả [1, 2] |
| `npm run test:recognition` | 49/49 PASS |
| `npm run test:forms-api`, `npm run test:api-integrity`, `npm run test:voice` | PASS; Voice 19/19 |
| TypeScript, production build riêng, `git diff --check` | PASS; build còn cảnh báo `<img>` blob preview đã biết |

Không gọi Gemini thật hoặc ghi dữ liệu công dân. Truy vấn chỉ đọc `SELECT 1` qua `DATABASE_URL` đã kết nối thành công; test repository dùng transaction giả lập, nên **transaction trên DB staging và RLS chưa được xác minh**.

## Chặng tiếp

1. FE admin chọn/thêm/sắp trang JPEG/PNG, chạy OpenCV/VietOCR riêng từng trang, ghép `assembleMultipageReviewDraft`, giữ ảnh và bằng chứng cho trang 0 field, không làm mất draft khi file mới sai. Đối soát vùng nhiều dòng có chọn trang; upload từng ảnh với `pageNumber`, rồi sinh kịch bản một lần.
2. Browser test hai trang phôi thật: chuyển trang, field cùng ID OCR không đụng, trang chú thích không có bước, phê duyệt và citizen/voice tô sáng đúng trang. Test âm tính mất asset/quyền sai/DB offline không ACTIVE/audit.
3. DB staging riêng: kiểm tra transaction lưu/review/approve và trạng thái sau reload; Tech Lead xác minh RLS/grants Supabase, quyền cán bộ và phương án asset dùng chung/bền vững trước khi triển khai nhiều máy chủ. Không đưa ảnh công dân vào thử nghiệm cloud.
