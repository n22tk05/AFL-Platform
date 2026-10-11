# Chặng 13 — Admin phân tích và đối soát nhiều trang

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. FE admin nhận 1–20 ảnh JPEG/PNG với tổng dung lượng tối đa 32 MB, cho đổi thứ tự trước khi phân tích. Mỗi trang chạy OpenCV và VietOCR riêng; bản nháp được ghép bằng lõi chặng 11 và dùng hợp đồng máy chủ chặng 12. Chưa nhận PDF trực tiếp.

## Luồng đã nối

1. Admin chọn các phôi trắng theo thứ tự trang; file sai định dạng/rỗng/quá lớn **không xóa** draft, ảnh, xác nhận hoặc tiến trình OCR đang chạy. Chọn bộ ảnh hợp lệ mới hoặc đổi thứ tự thì hủy kết quả cũ để buộc phân tích/đối soát lại.
2. Phân tích từng trang nối tiếp, giữ ảnh đã xử lý trong RAM của phiên modal. Box và bằng chứng có số trang; có bộ chọn trang và cảnh báo riêng nếu trang chỉ có chú thích, không có field. Admin chọn field/vùng để kéo tọa độ đúng trang, thêm vùng tiếp tục sang trang khác hoặc thêm field thủ công cho trang bị bỏ sót.
3. Sau khi admin xác nhận, FE kiểm tra manifest với các trang preview, upload từng asset có `pageNumber`, kiểm tra lại kích thước/thứ tự rồi gửi một manifest hoàn chỉnh tới `/api/llm/prompt`. Không gửi yêu cầu sinh khi chưa đủ box/nhãn/hình học hợp lệ; ảnh đã upload nhưng prompt lỗi chưa được tự động dọn khỏi kho bất biến.

## Kiểm chứng

| Ca | Kết quả |
| --- | --- |
| Browser giả lập hai trang: đổi thứ tự, OCR mỗi trang, ID box riêng, vùng tiếp tục qua trang 2, asset upload [1, 2], payload prompt đúng trang | PASS |
| Đổi sang SVG/rỗng trong và sau OCR | Draft/ảnh/xác nhận được giữ; lỗi đúng nguyên nhân; không gọi AI/asset ngoài ý muốn |
| CT01 trang 1 + trang chú thích 2 bằng OpenCV/VietOCR local thật | 71 field trên trang 1, 0 field trang 2; vẫn xem được ảnh và ẩn mọi bước giả ở trang 2 |
| Citizen/Voice giả lập ba trang, trang 2 chỉ ghi chú | Bước 1 sáng/đọc ở trang 1, bước 2 sáng/đọc ở trang 3; Q&A gửi `stepIndex: 2`, không hiện bước cho trang 2 |
| Browser mặc định toàn bộ | 13/13 PASS |
| `npm run test:recognition`, TypeScript, production build riêng, `git diff --check` | 49/49, PASS, PASS, PASS |

Test browser sinh kịch bản dùng mock 503 để không gọi Gemini thật hoặc ghi DB. Phôi nghiên cứu nằm ngoài Git; không dùng ảnh công dân. Build còn cảnh báo hiệu năng `<img>` blob preview đã biết, không chặn.

## Còn thiếu để demo hoàn chỉnh

- Cần kiểm thử API prompt + transaction thật trên **DB staging** với mã form thử riêng, từ `PENDING_REVIEW` qua admin approve tới citizen `ACTIVE`; test DB offline/ảnh mất/khóa sai không đổi trạng thái hay audit. Chỉ đọc `SELECT 1` trên DB hiện tại đã qua, chưa có bằng chứng transaction đa trang.
- Citizen/Voice đã qua browser test với workflow giả lập và vùng nối trang. Vẫn cần chạy cùng ca trên workflow `ACTIVE` trả từ DB thật, kiểm tra TTS/Q&A lấy đúng field sau phê duyệt.
- Kho ảnh local cần phương án chia sẻ/bền vững, dọn asset mồ côi và giới hạn tài nguyên toàn hệ trước triển khai nhiều máy chủ. Tech Lead cần xác minh RLS/grants Supabase và quyền cán bộ.
- Bộ đánh giá độc lập nhiều loại biểu mẫu vẫn cần mở rộng để đo precision/recall theo vùng static/label/description/input/checkbox; các trường mơ hồ tiếp tục yêu cầu admin duyệt.
