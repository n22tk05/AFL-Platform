# Chặng 51 — Phân định 5 Vai trò Vùng (Region Roles) & Cơ chế Bảo vệ Mơ hồ (Ambiguity Guard)

> **Nhánh thực hiện:** `feat/ocr-region-and-admin-workflow`  
> **Ngày:** 11/10/2026  
> **Người thực hiện:** Person 4 (Voice & OCR QA Lead)  
> **Mục tiêu:** Phân định rõ 5 vai trò vùng: `static_text`, `label`, `description`, `input`, `checkbox`; gán thuộc tính `role` vào `FormGeometricBox`; thiết lập cơ chế Ambiguity Guard chặt chẽ để mọi trường hợp mơ hồ/xung đột đều buộc gắn `needs_review: true`.

---

## 1. NÂNG CẤP PHÂN LOẠI 5 VAI TRÒ VÙNG (REGION ROLES)

Trước chặng 51, các khối văn bản OCR chỉ tồn tại dưới dạng `SourceBlock` phẳng. Hệ thống đã nâng cấp toàn diện:

1. **`contracts.ts`:**
   - Bổ sung `export type RegionRole = 'input' | 'checkbox' | 'character_slots' | 'label' | 'static_text' | 'description' | 'container' | 'unresolved';`
   - Bổ sung trường `role?: RegionRole;` vào `FormGeometricBox`.
2. **`document-export.types.ts`:**
   - Mở rộng `ContentType` thêm `'description_instruction'` để nhận diện ghi chú, chú thích dưới dòng.
3. **`json-content-classifier.ts`:**
   - Bổ sung `DESCRIPTION_INSTRUCTION_REGEX` và `NOTE_PREFIX_REGEX` để bóc tách chính xác các câu ghi chú trong ngoặc đơn như:
     - `(Kèm theo đơn này)`
     - `(Nếu có)`
     - `(Đối với nhà thầu là tổ chức)`
     - `(Các tài liệu được quy định tại Điều 115 Nghị định này)`
     - `Ghi chú: ...`, `Lưu ý: ...`
   - Đặt luật này đứng trước `field_label` để tuyệt đối không biến lời hướng dẫn trong ngoặc thành nhãn trường nhập liệu.
4. **`form-region-recognition.ts`:**
   - Nhận diện và gán vai trò:
     - `static_text`: Quốc hiệu, tiêu ngữ, tiêu đề văn bản, căn cứ pháp lý, dòng lưu văn thư.
     - `label`: Nhãn trường nhập liệu (`Họ và tên:`, `Địa chỉ:`, `Số CMND:`).
     - `description`: Lời chú thích/hướng dẫn điền.
     - `input`: Vùng nhập liệu viết tay, dòng chấm nét đứt (`single_line_text` / `multiline_text`).
     - `checkbox`: Hộp kiểm đơn, lựa chọn nhị phân.

---

## 2. THIẾT LẬP CƠ CHẾ AMBIGUITY GUARD (BẢO VỆ TÍNH MƠ HỒ)

1. **Phát hiện xung đột nhãn (Label Geometry Collision):**
   - Khi một ứng viên ô điền khuyết (`writing_guide`) có tọa độ x tiến quá sâu vào vùng nhãn in sẵn của trường kế tiếp ($\ge \min(w \times 0.4, 0.035)$), hệ thống lập tức đánh dấu `ambiguous = true` và bổ sung lý do `AMBIGUOUS_LABEL`.
2. **Ép buộc trạng thái `needs_review`:**
   - Mở rộng danh sách các lý do tự động chuyển trạng thái `box.recognition.status` sang `needs_review`:
     - `AMBIGUOUS_LABEL`
     - `AMBIGUOUS_ROLE`
     - `MISSING_LABEL`
     - `DUPLICATE_LABEL_NOT_A_CONTINUATION`
   - Đảm bảo AI và mô hình tự động không bao giờ tự ý công bố các trường chưa được con người thẩm định.

---

## 3. BẰNG CHỨNG KIỂM THỬ (EVIDENCE GATE)

1. **Unit Test Chuyên biệt (Chặng 51):**
   - `five region roles are explicitly distinguished and boxes expose role correctly`: PASS.
   - `ambiguous labels and unconfirmed scopes strictly trigger needs_review status`: PASS.
2. **Tổng kết Toàn bộ Test Suite:**
   - `test:recognition`: **94/94 PASS** (tăng 2 test chuyên biệt mới).
   - `test:voice`: **19/19 PASS**.
   - `test:local`: **PASS** (QA Suite 6/6, API Integrity PASS).
   - `typecheck`: **0 lỗi** (`tsc --noEmit`).

---

## 4. TỒN ĐỌNG BỘC LỘ & MỤC TIÊU CHO CHẶNG 52

Stress test trên các mẫu đơn thực tế (như Hợp đồng lao động HDLD-2021) chỉ ra:
1. **Dòng nhiều trường điền khuyết (Inline Multi-Field Lines):** Các dòng như `ngày... tháng... năm...` hoặc `Đại diện:... Chức vụ:... Quốc tịch:...` vẫn bị ghép thành một box đơn trải dài, gây nguy cơ chữ mẫu đè lên nhãn cố định của trường sau.
2. **Gom nhóm Multiline Region:** Các vùng điền khuyết kéo dài 2-3 dòng (địa chỉ, nội dung công việc) cần thuật toán gom cụm hình học liền mạch theo `anchorKey` gốc.
3. $\rightarrow$ Đây là mục tiêu trọng tâm sẽ triển khai ngay tại **Chặng 52**.
