# Tài Liệu Bàn Giao Bộ Nghiệm Thu Độc Lập Cho Codex (Handoff to Codex)

> **Dành cho:** Codex Agent (Đang phụ trách triển khai chuyển đổi pipeline OCR Markdown → JSON)  
> **Người bàn giao:** QA & Independent Evaluation  
> **Ngày:** 2026-10-06  
> **Mục tiêu:** Hướng dẫn sử dụng bộ dữ liệu kiểm thử và kế hoạch nghiệm thu độc lập để xác minh chất lượng bóc tách tài liệu sang định dạng JSON.

---

## 1. Danh Sách Tài Nguyên Đã Chuẩn Bị

Toàn bộ tài nguyên được cô lập hoàn toàn trong 2 thư mục:

1. **Bộ Fixtures & Ground Truth:**
   - Thư mục: `tests/fixtures/ocr-json/`
   - File sinh ảnh: `generate-fixtures.mjs` (chạy `node tests/fixtures/ocr-json/generate-fixtures.mjs` để tái tạo 10 file `.png`).
   - File danh mục: `manifest.json` (mô tả metadata, kích thước, đặc thù kiểm tra của từng test case).
   - File đối chiếu chuẩn: `ground-truth.json` (thứ tự đọc toàn văn, giá trị then chốt, quan hệ cấu trúc, danh sách trường để trống).

2. **Tài Liệu Nghiệm Thu & Quy Chuẩn:**
   - Thư mục: `docs/ocr-json-evaluation/`
   - `evaluation-plan.md`: Chi tiết 4 nhóm phép kiểm (A: Chất lượng OCR, B: Bảo toàn dữ liệu, C: Cấu trúc, D: Trạng thái & Export) kèm bảng đề xuất ngưỡng đánh giá.
   - `bug-report-template.md`: Mẫu báo cáo lỗi tiêu chuẩn khi phát hiện khiếm khuyết.

---

## 2. Các Tình Huống Có Nguy Cơ Thất Bại Cao Nhất (High-Risk Scenarios)

Dựa trên việc audit mã nguồn hiện tại của AFL-Platform, Codex cần đặc biệt lưu ý 5 điểm nghẽn rủi ro sau:

1. **Mất số `0` ở đầu chuỗi (Leading Zero Truncation - TC06, TC02):**
   - *Rủi ro:* Số CCCD `038092008765` hoặc Số biên bản `001248/BB-VPHC` nếu bị chuyển đổi qua `Number()` hoặc `parseInt()` sẽ trở thành `38092008765` hoặc `1248`.
   - *Yêu cầu:* Giữ nguyên kiểu chuỗi `string` cho mọi mã định danh và số chứng từ.

2. **Dòng chấm điền form bị nhận nhầm thành giá trị (Dotted Line Confusion - TC02):**
   - *Rủi ro:* Trên biểu mẫu trắng, dòng `Ngày sinh: ....................` có thể khiến regex gán `value: "...................."`.
   - *Yêu cầu:* Nếu chuỗi giá trị chỉ chứa dấu chấm, gạch dưới hoặc khoảng trắng, assembler bắt buộc phải chuẩn hóa thành `value: null`.

3. **Gộp nhầm nhiều trường trên cùng một dòng (Multi-Field Overlap - TC03):**
   - *Rủi ro:* Dòng `1. Họ và tên: LÊ THỊ MAI   2. Giới tính: Nữ` có thể bị gán toàn bộ vào trường `Họ và tên`.
   - *Yêu cầu:* Tách cụm theo khoảng cách ngang hoặc nhận diện regex đa trường trên một dòng.

4. **Lệch cột trong bảng do ô trống (Table Column Shift - TC04):**
   - *Rủi ro:* Bảng 5 cột nhưng hàng 2 trống cột Ghi chú, hàng 3 trống cột Diện tích. Nếu gom hàng không giữ vị trí ô trống, các cột bên phải sẽ bị trượt sang trái.
   - *Yêu cầu:* Duy trì đúng số lượng phần tử trong mảng mỗi hàng bằng đúng `columnCount` của tiêu đề, gán `null` cho ô trống.

5. **Âm thầm bỏ rơi các dòng không thuộc mẫu (Silently Dropping Unclassified Text - TC09):**
   - *Rủi ro:* Các dòng ghi chú viết tay, điều khoản pháp lý, mã tra cứu không khớp `FIELD_LABEL_REGEX` có thể bị assembler bỏ qua.
   - *Yêu cầu:* Nguyên tắc 100% dòng OCR: Mọi dòng trong `ocr.lines` phải xuất hiện trong mảng `lines[]` hoặc `structure.freeText` của JSON output.

---

## 3. Phân Định: Kiểm Tra Tự Động vs Kiểm Tra Bằng Mắt

### 3.1 Các phép kiểm có thể tự động hóa (Automated Checks)
Codex có thể viết test suite (hoặc dùng tsx/playwright) để chạy tự động:
- **Cú pháp JSON & Schema Validation:** Kiểm tra kết quả trả về từ endpoint `/api/documents/json` có parse được không và có đủ các thuộc tính `contractVersion`, `document`, `validation` không.
- **Tỷ lệ bảo toàn dòng OCR:** $\frac{\text{Số dòng OCR xuất hiện trong JSON}}{\text{Tổng số dòng OCR}} == 100\%$.
- **Khớp chính xác giá trị quan trọng (TC01, TC06):** So sánh `value` của CCCD, Số biên bản, Tiền phạt với `ground-truth.json`.
- **Độ dài hàng của Bảng (TC04):** Kiểm tra mọi hàng trong `table.dataRows` có đúng 5 phần tử không.
- **Xử lý trang trắng (TC10):** Xác minh endpoint trả về mã cảnh báo `OCR_EMPTY_TEXT` hoặc `POSSIBLE_BLANK`, không có trường dữ liệu giả nào được sinh ra.

### 3.2 Các phép kiểm bắt buộc xem bằng mắt (Visual & Interactive Checks)
- **Kiểm tra encoding file tải xuống:** Mở file `.json` tải về bằng Notepad / VS Code trên Windows để xác nhận dấu tiếng Việt không bị lỗi font (Mojibake).
- **Kiểm tra giao diện đối chiếu (Split-Screen UI):** Tải ảnh lên tại trang `/scan-document`, kiểm tra khung viền highlight có khớp đúng vị trí trường chữ trên ảnh hay không.
- **Kiểm tra trạng thái khi đổi ảnh:** Tải ảnh TC01, sau đó chọn ảnh TC06 mà không reload trang; xác nhận dữ liệu của TC01 biến mất hoàn toàn và được thay thế bằng TC06.

---

## 4. Dữ Liệu và Điều Kiện Còn Thiếu (Gaps & Limitations)

1. **Bộ dữ liệu ảnh thật có xác nhận của con người:**
   - Bộ 10 fixture hiện tại là **ảnh tổng hợp (synthetic)** nhằm đảm bảo tính an toàn PII và tính tất định.
   - Chưa có tập dữ liệu ảnh chụp thực tế (camera thật từ người dân) có bản chép lại (transcript) được con người ký duyệt.
   - Khi chạy trên ảnh thật, độ chính xác OCR có thể thấp hơn và các kết quả đo lường ban đầu phải coi là **provisional (tạm thời)**.
2. **VietOCR Microservice Local Runtime:**
   - Việc chạy toàn trình phụ thuộc vào tiến trình FastAPI Python cổng 8000.
   - Nếu tiến trình Python chưa chạy hoặc PyTorch chưa tải weights, API sẽ trả về `OCR_UNAVAILABLE` hoặc `manual_review_required`. Đây là hành vi đúng (fail-safe) chứ không phải lỗi của JSON assembler.

---

## 5. Hướng Dẫn Từng Bước Cho Codex Để Xác Minh Pipeline

Khi Codex hoàn thành các module trong pipeline JSON, hãy thực hiện theo thứ tự sau:

1. **Bước 1: Chạy test tĩnh (Typecheck & Lint):**
   ```bash
   npx tsc --noEmit
   npm run lint
   ```
2. **Bước 2: Viết Unit Test cho Assembler:**
   Tạo unit test nạp `DocumentOcrResult` giả lập tương ứng với các dòng text của TC01, TC03, TC04, TC06 và kiểm tra JSON sinh ra có khớp với `ground-truth.json` hay không.
3. **Bước 3: Chạy Integration Test Endpoint `/api/documents/json`:**
   Khởi động server và gửi 10 file ảnh trong `tests/fixtures/ocr-json/` qua API route mới.
4. **Bước 4: Đối chiếu tiêu chí tại `docs/ocr-json-evaluation/evaluation-plan.md`:**
   Nếu phát hiện lỗi, sử dụng mẫu `docs/ocr-json-evaluation/bug-report-template.md` để ghi nhận và sửa đổi.
5. **Bước 5: Tuyệt đối không đánh dấu PASS nếu chưa thực sự chạy kiểm thử trên môi trường chạy.**
