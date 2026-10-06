# Mẫu Báo Cáo Lỗi Bóc Tách OCR → JSON (Bug Report Template)

> **Dự án:** AFL-Platform  
> **Áp dụng cho:** Báo cáo các khiếm khuyết trong pipeline trích xuất tài liệu sang JSON có cấu trúc.  
> **Nguyên tắc:** Mỗi báo cáo lỗi bắt buộc phải có bằng chứng kỹ thuật (mã dòng, tọa độ, json path), có thể tái hiện tất định, không báo lỗi cảm tính.

---

## 1. Thông Tin Chung

- **Mã lỗi (Bug ID):** `BUG-OCR-JSON-YYYYMMDD-XXX` (Ví dụ: `BUG-OCR-JSON-20261006-001`)
- **Fixture ID liên quan:** `[TC01 | TC02 | TC03 | TC04 | TC05 | TC06 | TC07 | TC08 | TC09 | TC10 | KHÁC]`
- **Tên file ảnh:** `tcXX_....png`
- **Commit / Phiên bản kiểm thử:** `git rev-parse HEAD` (Ví dụ: `ee73b4e` trên branch `nguyen-the-anh`)
- **Thời điểm kiểm thử:** `YYYY-MM-DD HH:mm:ss`
- **Người / Agent báo cáo:** `QA & Independent Evaluation`

---

## 2. Phân Loại Lỗi & Mức Độ Ảnh Hưởng

### 2.1 Loại Lỗi (Bug Category)
*Chọn duy nhất 1 loại chính thể hiện tầng phát sinh lỗi:*
- [ ] **OCR Error:** Model VietOCR đọc sai ký tự, mất dấu tiếng Việt, đọc thiếu hoặc nuốt ký tự trên ảnh gốc.
- [ ] **Structure Error:** OCR đọc đúng text, nhưng JSON Assembler gán sai nhãn/giá trị, đảo thứ tự, mất dòng, hoặc vỡ cấu trúc bảng/checkbox.
- [ ] **Export Error:** JSON bị lỗi cú pháp, vi phạm JSON Schema, lỗi encoding UTF-8, hoặc HTTP API trả về mã trạng thái sai.
- [ ] **UI Error:** Giao diện hiển thị sai, không cập nhật khi đổi ảnh mới, hoặc nút tải file JSON bị lỗi.

### 2.2 Mức Độ Ảnh Hưởng (Severity Level)
- [ ] **Blocker (Nghiêm trọng cấp 1):** Làm sai lệch giá trị pháp lý/tài chính (sai số tiền phạt, mất số 0 đầu của CCCD, đổi nhãn người nộp thuế); crash server; mất hoàn toàn dòng OCR quan trọng.
- [ ] **Major (Nghiêm trọng cấp 2):** Lệch cột trong bảng; checkbox gán sai trạng thái; mất dấu tiếng Việt làm đổi nghĩa của từ; file tải về bị vỡ font encoding.
- [ ] **Moderate (Trung bình cấp 3):** Gán sai phân loại dòng tự do (nhầm giữa `free_text` và `legal_reference`); cảnh báo confidence chưa chuẩn; giao diện hiển thị vệt highlight lệch nhẹ.
- [ ] **Minor (Nhẹ cấp 4):** Khoảng trắng dư thừa ở đầu/cuối chuỗi không ảnh hưởng ngữ nghĩa; lỗi chính tả trong thông báo lỗi tiếng Việt.

---

## 3. Các Bước Tái Hiện Lỗi (Steps to Reproduce)

1. Khởi động dịch vụ VietOCR: `services/vietocr-service/start.ps1` (port 8000).
2. Khởi động Web Server: `npm run dev` (port 3001).
3. Gửi yêu cầu qua API:
   ```bash
   curl -X POST http://localhost:3001/api/documents/json \
     -H "Content-Type: multipart/form-data" \
     -F "file=@tests/fixtures/ocr-json/<TÊN_FILE_FIXTURE>.png"
   ```
   *(Hoặc truy cập trình duyệt tại `/scan-document` và tải lên file tương ứng)*
4. Quan sát kết quả trả về trong payload JSON tại đường dẫn `<JSON_PATH>`.

---

## 4. Bằng Chứng & Chi Tiết Lỗi

### 4.1 Nội dung Mong đợi (Expected Result)
*Mô tả chính xác dữ liệu theo `ground-truth.json`:*
```json
{
  "key": "citizenId",
  "label": "Số CCCD",
  "value": "038092008765",
  "rawText": "Số CCCD: 038092008765"
}
```

### 4.2 Nội dung Thực tế (Actual Result)
*Dữ liệu thực tế nhận được từ API / UI:*
```json
{
  "key": "citizenId",
  "label": "Số CCCD",
  "value": "38092008765",
  "rawText": "Số CCCD: 38092008765"
}
```

### 4.3 Bằng chứng Định vị (Evidence & Coordinates)
- **Vị trí trên ảnh gốc:** Bounding box tọa độ tương đối `[ymin, xmin, ymax, xmax]`, ví dụ: `[0.30, 0.08, 0.35, 0.50]`.
- **Mã dòng OCR nguồn (Source Line ID):** `line_004` (từ `ocr.lines`).
- **Đường dẫn JSON (JSON Path):** `data.document.structure.fields[3].value`.
- **Raw OCR text trả về từ adapter:** `"Số CCCD: 038092008765"` (nếu lỗi ở bước assembly).

---

## 5. Đề Xuất Hướng Điều Tra (Investigation Notes)

> [!NOTE]
> *Kiểm thử viên KHÔNG tự sửa production code. Ghi lại các gợi ý kỹ thuật để Codex hoặc kỹ sư phát triển điều tra nhanh chóng:*

- **Module nghi vấn:** `[json-content-classifier.ts | json-assembler.ts | json-field-extractor.ts | json-table-assembler.ts | vietocr-adapter.ts]`
- **Gợi ý kiểm tra:**
  1. Kiểm tra xem hàm `normalizeField()` hoặc hàm bóc tách chuỗi số có vô tình chuyển kiểu dữ liệu qua `Number()` làm mất số `0` ở đầu hay không.
  2. Kiểm tra biểu thức chính quy `FIELD_LABEL_REGEX` có khớp thiếu trường hợp hay không.
  3. Kiểm tra logic ghép ô bảng trong `json-table-assembler.ts` khi gặp ô có giá trị rỗng.
