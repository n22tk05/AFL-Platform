# CHẶNG 55: HOÀN THIỆN WORKFLOW ADMIN (ADMIN OPERATIONS & BATCH VOICE AUTOMATION)

## 1. Mục Tiêu Nghiệp Vụ & Bối Cảnh
Sau khi hoàn thiện bóc tách vùng, chuẩn hóa định danh và nối liền hợp đồng Review ↔ Voice / Frontend ở Chặng 54, quy trình vận hành thực tế của cán bộ quản trị (Admin) vẫn còn gặp các điểm nghẽn nghiêm trọng:
1. **Thao tác thủ công quá tải khi tạo âm thanh**: Với các biểu mẫu dài từ 20 đến 50 bước, cán bộ phải bấm chọn từng bước và bấm "Tạo MP3" hàng chục lần, rất tốn thời gian và dễ bỏ sót các bước chưa có audio.
2. **Thiếu khả năng phân loại và giám sát thư viện**: Trang `/admin/library` chưa có bộ lọc theo trạng thái vòng đời (`DRAFT`, `PENDING_REVIEW`, `ACTIVE`), thiếu tìm kiếm nhanh và chưa có chỉ số đo lường độ phủ âm thanh của biểu mẫu.
3. **Mù thông tin về sức khỏe dịch vụ nền**: Quản trị viên không biết microservice VietOCR (port 8000), cơ sở dữ liệu PostgreSQL hoặc Gemini AI có đang hoạt động ổn định hay không trước khi thực hiện các tác vụ nặng.

---

## 2. Các Cải Tiến Kỹ Thuật Đã Triển Khai

### 2.1 Sinh Giọng Nói Hàng Loạt 1-Click (Batch TTS Generation)
- Cập nhật `/admin/review/[id]/page.tsx`:
  - Xây dựng hàm `generateBatchAudio(onlyMissing: boolean)` tự động chạy tuần tự qua toàn bộ danh sách các bước cần xử lý (tất cả các bước hoặc chỉ những bước chưa có file MP3).
  - Tích hợp thanh tiến trình thời gian thực (`batchProgress`: `current / total`, hiển thị số lượng bước lỗi nếu có).
  - Khả năng ngắt/hủy tiến trình bất cứ lúc nào qua nút `Dừng sinh audio` (tận dụng `AbortController`).
  - Thanh đo độ phủ âm thanh (`Coverage Bar`): Hiển thị trực quan tỷ lệ phần trăm các bước đã có giọng đọc chuẩn hóa (`audioSteps / totalSteps`).

### 2.2 Nâng Cấp Giao Diện Thư Viện Quản Trị (`/admin/library`)
- Tích hợp bộ lọc 4 trạng thái với số lượng đếm realtime:
  - `Tất cả` (`ALL`)
  - `Bản nháp` (`DRAFT`)
  - `Chờ duyệt` (`PENDING_REVIEW`)
  - `Đang hoạt động` (`ACTIVE`)
- Bổ sung ô tìm kiếm tức thì theo mã biểu mẫu (`formCode`) hoặc tên biểu mẫu (`formTitle`).
- Thiết kế thẻ biểu mẫu chuyên nghiệp:
  - Huy hiệu trạng thái phân màu chuẩn mực (Xanh lá `ACTIVE`, Hổ phách `PENDING_REVIEW`, Xám `DRAFT`).
  - Huy hiệu số bước hướng dẫn và số phiên bản (`v{version}`).
  - Nút chuyển nhanh sang chế độ đối soát (`Đối soát kịch bản`), xem mã QR (`Mã QR`) và xem thử giao diện người dân (`Xem thử dân`).

### 2.3 Endpoint Giám Sát Sức Khỏe Hệ Thống (`/api/admin/health`)
- Xây dựng route API `src/app/api/admin/health/route.ts` với xác thực khóa quản trị (`adminAuthorizationService.authorize`):
  - Kiểm tra độ trễ và trạng thái sống của VietOCR (`http://127.0.0.1:8000/health`).
  - Kiểm tra kết nối CSDL PostgreSQL (`SELECT 1`).
  - Kiểm tra cấu hình API Key của Gemini LLM.
- Tích hợp Widget giám sát hệ thống ngay trên đầu trang Thư viện quản trị, hiển thị chỉ số ms thời gian thực.

---

## 3. Bằng Chứng Kiểm Thử & Kiểm Soát Hồi Quy

1. **Integration Test Giám Sát**:
   - `tests/integration/admin-health.test.ts`:
     - `admin health endpoint rejects unauthorized requests`: **PASS**.
     - `admin health endpoint returns service status when authorized`: **PASS** (Latency: 697ms).
2. **Validation Suites**:
   - `npm run test:local`: QA suite **6/6 PASS**, API integrity **PASS**.
   - `npm run test:recognition`: **98/98 PASS**.
   - `npm run test:voice`: **19/19 PASS**.
   - `npm run typecheck`: **0 lỗi** biên dịch.
