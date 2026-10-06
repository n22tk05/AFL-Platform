# Bộ Dữ Liệu Kiểm Thử OCR → JSON (AFL-Platform)

## 1. Giới thiệu

Thư mục này chứa bộ fixture kiểm thử tổng hợp (synthetic fixtures) phục vụ đánh giá độc lập chất lượng bóc tách tài liệu từ hình ảnh sang định dạng JSON có cấu trúc (`DocumentContent` / `JsonExportDraft`), thay thế cho định dạng Markdown (`.md`) trước đây.

Toàn bộ dữ liệu trong thư mục này:
- **100% nhân tạo (synthetic)**: Không chứa thông tin định danh cá nhân thật (No PII).
- **Tất định (deterministic)**: Được sinh bằng mã nguồn toán học/vector SVG thông qua Sharp, có thể tái tạo hoàn toàn bất kỳ lúc nào.
- **Không phụ thuộc AI sinh ảnh**: Không dùng generative AI để tạo ảnh mẫu, bảo đảm ground truth là chân thực và tuyệt đối chính xác theo thiết kế.

## 2. Cách tái tạo ảnh Fixtures

Chạy lệnh:
```bash
node tests/fixtures/ocr-json/generate-fixtures.mjs
```

## 3. Danh mục 10 Kịch bản Kiểm thử

| ID | File | Kịch bản | Đặc điểm kiểm tra |
|---|---|---|---|
| **TC01** | `tc01_clean_accents.png` | Tiếng Việt rõ nét, đủ dấu | Toàn bộ hệ thống nguyên âm có dấu tiếng Việt, Quốc hiệu, Tiêu ngữ, khối ký tên 2 bên. |
| **TC02** | `tc02_dotted_form.png` | Form nhãn & dòng chấm | Phân biệt trường có giá trị điền vs trường để trống hoàn toàn; không nuốt nhãn, không nhận nhầm `....` làm giá trị. |
| **TC03** | `tc03_multi_field_line.png` | Nhiều trường trên 1 dòng | 2-3 trường nằm song song (Họ tên + Giới tính; Ngày sinh + Dân tộc + Quốc tịch); không gộp nhầm nhãn/giá trị. |
| **TC04** | `tc04_table_empty_cells.png` | Bảng có ô trống | Bảng 5 cột x 4 hàng; kiểm tra ô trống không làm thụt dòng hay lệch cột. |
| **TC05** | `tc05_checkboxes.png` | Checkbox đa dạng | Nhận diện đúng trạng thái checked (true) của `☑`, `[x]` và unchecked (false) của `☐`, `[ ]`. |
| **TC06** | `tc06_numbers_dates_money.png` | Số tiền, ngày, mã số | Không nuốt số `0` ở đầu (`001248`, `038092...`); giữ nguyên định dạng tiền tệ `2.500.000 đồng`. |
| **TC07** | `tc07_skewed_perspective.png` | Méo/nghiêng phối cảnh | Bản xoay 7 độ của TC06 trên nền xám; đánh giá khả năng nắn thẳng (deskew) và bảo toàn thứ tự đọc. |
| **TC08** | `tc08_low_contrast.png` | Tương phản thấp & mờ | Chữ xám trên nền xám mờ; đánh giá tính năng adaptive OCR retry với contrast enhancement. |
| **TC09** | `tc09_ambiguous_freetext.png` | Dòng tự do/không mẫu | Đoạn văn tự do, gạch đầu dòng, mã kiểm soát, dòng in chân trang; kiểm tra nguyên tắc bảo toàn 100% dòng OCR. |
| **TC10** | `tc10_blank_page.png` | Trang trắng | Trang không có ký tự; kiểm tra xử lý biên, không sinh dữ liệu giả định, trả về cảnh báo đúng. |

## 4. Dữ liệu Đối chiếu (Ground Truth)

File `ground-truth.json` chứa:
- Thứ tự đọc toàn văn mong đợi (`expectedFullTextInReadingOrder`).
- Các giá trị nghiệp vụ then chốt (`criticalValues`).
- Quan hệ cấu trúc nhãn - giá trị, hàng - cột, checkbox (`structuralRelationships`).
- Danh sách trường thực sự để trống (`emptyFields`).
- Các điểm không thể xác định chắc chắn (`uncertainPoints`).
