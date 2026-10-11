# Chặng 14 — Kiểm thử transaction đa trang và rà soát quyền DB

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Kiểm thử này kết nối Postgres cấu hình trong `.env` nhưng dùng mã form ngẫu nhiên và **rollback toàn bộ transaction**; không tạo biểu mẫu/audit lâu dài, không dùng dữ liệu công dân, không gọi Gemini. Ảnh thử chỉ nằm trong thư mục tạm và được dọn sau test.

## Kết quả transaction thực

Lệnh opt-in PowerShell: `$env:AFL_TEST_DB_ROLLBACK='1'; npm run test:recognition:db-rollback`. Test không chạy mặc định nếu thiếu biến này.

Trong một transaction `Serializable`, test thực hiện `saveDraft` hai trang, đọc lại bản `PENDING_REVIEW`, sửa lời hướng dẫn trang 2 bằng `saveReviewWorkflow`, rồi thử phê duyệt khi ảnh trang 2 bị thiếu. Lần phê duyệt âm tính trả `FORM_ASSET_UNAVAILABLE`, trạng thái vẫn `PENDING_REVIEW`, audit chưa có. Sau khi phục hồi ảnh thử, `approveWorkflow` tạo `ACTIVE` và đúng một audit trong transaction; đọc workflow công dân giữ số trang `[1, 2]` và vùng nhập nối từ trang 1 sang 2. Test cố ý ném lỗi kết thúc transaction và xác minh bên ngoài rằng mã form thử **không tồn tại**. Kết quả **1/1 PASS**, TypeScript và `git diff --check` PASS.

Đây là kiểm chứng repository/Prisma trên Postgres thật, mạnh hơn DB mock. Tuy nhiên không phải môi trường staging độc lập: chưa thử commit lâu dài, HTTP endpoint với DB thật, retry/concurrency, triển khai nhiều máy chủ hoặc RLS của từng cán bộ. Không dùng kết quả rollback để tuyên bố đã nghiệm thu production.

## Quyền Supabase hiện quan sát được

Truy vấn metadata chỉ đọc trên bảy bảng form trong schema `public` (`form_templates`, manifest, box, workflow, step, FAQ, audit) cho thấy tất cả **RLS tắt**, **0 policy**. Các quyền `SELECT/INSERT/UPDATE/DELETE` của cả `anon` và `authenticated` trên bảy bảng đều không được cấp. Cả kết nối `DATABASE_URL` (ứng dụng) và `DIRECT_URL` có `BYPASSRLS=true`, nên bật RLS đơn lẻ **không hạn chế được hai thông tin đăng nhập này**. Chưa kiểm tra cấu hình Data API trên dashboard, các view/function liên quan hoặc quyền của vai trò khác.

Điều này không chứng minh dữ liệu đang đọc được qua `anon`/`authenticated`: quyền bảng hiện thiếu nên các vai trò đó không truy cập trực tiếp. Nhưng vì bảng ở `public`, nếu ai đó cấp quyền sau này mà không bật RLS thì thiếu lớp bảo vệ hàng dữ liệu. [Hướng dẫn chính thức của Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) yêu cầu xét **cả grants và RLS** cho schema được expose. Tech Lead cần chốt mô hình truy cập và quyền tài khoản kết nối ứng dụng, bật RLS rồi kiểm thử allow/deny trên staging trước khi mở Data API hoặc phân quyền từng cán bộ; không thay đổi chính sách trên DB đang chạy trong chặng này.

## Việc tiếp theo

1. Dùng DB staging riêng để chạy lưu–phê duyệt **có commit**, gọi HTTP API admin/public thật rồi dọn bản ghi thử; kiểm tra `ACTIVE`/audit và rollback khi DB rớt hoặc ảnh thiếu.
2. Kiểm thử browser citizen/Voice trên workflow `ACTIVE` từ DB thay vì mock; xác nhận ảnh trang 2, lời đọc, Q&A đúng bước và trang ghi chú không có bước.
3. Thiết kế asset storage chia sẻ giữa máy chủ, dọn asset mồ côi, backup/restore và RLS/grants/policy test theo quyền cán bộ. Chỉ sau đó cân nhắc triển khai rộng.
