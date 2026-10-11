# Báo Cáo Kỹ Thuật Chặng 52: Thuật Toán Bóc Tách Điền Khuyết Nội Dòng & Gom Nhóm Vùng Nhiều Dòng (Inline Cloze & Multiline Grouping)

## 1. Mục Tiêu & Bối Cảnh Nghiên Cứu
Trong các biểu mẫu hành chính và hợp đồng thực tế tại Việt Nam (như Hợp đồng lao động, Tờ khai Lệ phí trước bạ, Đơn đề nghị cấp phép):
1. **Điền khuyết nội dòng đa trường (Inline Multi-Field Rows):** Một dòng văn bản in thường chứa nhiều trường điền khuyết liên tiếp, ví dụ:
   - `Đại diện bên A: .................... Chức vụ: .................... Quốc tịch: ....................`
   - `Họ và tên: .................... Năm sinh: .......... Giới tính: ..........`
   - Khi detector OpenCV phát hiện 1 đường kẻ/chấm dài liên tục (hoặc candidate bao trùm cả dòng), thuật toán trước đây gán toàn bộ candidate cho trường đầu tiên và va chạm (`collidingAnchor`) với các nhãn tiếp theo, dẫn đến nhãn bị xóa trắng (`AMBIGUOUS_LABEL`) và các trường phía sau bị bỏ sót hoàn toàn.
2. **Gom nhóm vùng nhiều dòng (Multiline Grouping Safeguards):** Các trường nhập liệu mở rộng chiếm 2–3 dòng (`Nội dung công việc`, `Ý kiến nhận xét`) cần được tự động gộp thành 1 trường logical `multiline_text` với nhiều `inputRegions`. Tuy nhiên, nếu dòng kế tiếp có nhãn riêng nhưng nằm cách xa (gap > 0.02), thuật toán trước đây không phát hiện được `newRowLabel` và nuốt chửng nhãn dòng sau vào trường multiline phía trên.

---

## 2. Các Cải Tiến Kỹ Thuật Đã Triển Khai

### 2.1 Mở Rộng Từ Vựng Nhận Diện Hợp Đồng & Biểu Mẫu (`json-content-classifier.ts`)
Bổ sung các mẫu nhãn tiếng Việt đặc thù của hợp đồng kinh tế và hồ sơ hành chính vào `EXTENDED_LABEL`:
- `(?:Người\s+)?Đại\s+diện(?:\s*(?:cho|bên)\s+[A-Za-z0-9]+)?` (nhận diện `Đại diện:`, `Đại diện bên A:`, `Đại diện bên B:`, `Người đại diện:`)
- `Chức\s+vụ(?:\s*người\s*đại\s*diện)?`
- `Thời\s+hạn(?:\s*hợp\s*đồng)?`
- `Mức\s+lương|Tiền\s+lương`
- `Địa\s+điểm\s+làm\s+việc|Nơi\s+làm\s+việc`
- `Công\s+việc(?:\s*phải\s*làm)?`
- `Thời\s+giờ\s+làm\s+việc`
- `Số\s+sổ\s+(?:BHXH|bảo\s+hiểm\s+xã\s+hội)`
- `Năm\s+sinh`

### 2.2 Thuật Toán Bóc Tách Candidate Nội Dòng (`segmentInlineCandidates`)
Triển khai hàm phân đoạn hình học thông minh trong `src/modules/forms/services/form-region-recognition.ts`:
- Quét mọi candidate `writing_guide` hoặc `field_row` tự do (chưa bị tiêu thụ bởi bảng hoặc ô ký tự).
- Xác định các nhãn neo (anchors) nằm trên cùng hàng ngang (`aligned`: khoảng cách tâm Y $\le \text{lineScale} \times 0.8$).
- Nếu phát hiện nhãn neo trung gian nằm lọt vào bên trong phạm vi hoành độ của candidate ($A_k.rect[1] > E.rect[1] + 0.02$ và $A_k.rect[1] < E.rect[3] - 0.02$):
  - Phân vùng candidate thành các sub-candidates tương ứng với từng nhãn:
    $$x_{start} = \max(E.rect[1], A_i.rect[3] + 0.003)$$
    $$x_{end} = \min(E.rect[3], A_{i+1}.rect[1] - 0.003)$$
  - Tạo các candidate con `_sub_1`, `_sub_2`,... với tọa độ chính xác, tỷ lệ co giãn chuẩn hóa, giữ nguyên `guideStyle` và tính lại `shortGuide`.
  - Kết quả: Không còn hiện tượng 1 đường kẻ nuốt chửng các nhãn phía sau; mỗi nhãn được ghép đúng với tiểu vùng điền khuyết của mình với $\text{IoU} \ge 0.6$ và $0$ va chạm nhãn.

### 2.3 Bảo Vệ Ranh Giới Hàng & Gom Nhóm Nhiều Dòng An Toàn
- **Trọng số khoảng cách dọc:** Tăng hệ số phạt khoảng cách dọc $score = verticalGap \times 6 + horizontalGap$ và bổ sung quy tắc bẻ hòa: Nếu nhãn tốt nhất nằm cùng hàng ngang ($\Delta Y \le 0.015$), nhãn ở hàng trên cách xa $\ge 0.01$ không được coi là cạnh tranh mơ hồ (`ambiguous`).
- **Phát hiện `newRowLabel` chuẩn xác:** Mở rộng kiểm tra nhãn dòng mới bằng cả `anchors` và `blocks` với dung sai ngang mở rộng ($gap \le 0.25$), ngăn chặn triệt để việc nuốt chửng trường có nhãn riêng vào trường multiline của dòng trên.

---

## 3. Kết Quả Kiểm Thử Toàn Trình (Verification Gate)
1. **Kiểm thử Đơn vị Mới:**
   - `test('inline multi-field row splits continuous candidate into discrete non-overlapping sub-boxes with IoU >= 0.6')`:
     - Đầu vào: 1 dòng `Đại diện bên A: ... Chức vụ: ... Quốc tịch: ...` và 1 candidate dài bao trùm cả 3 trường.
     - Kết quả: Tách thành đúng 3 boxes riêng biệt, 0 lỗi `AMBIGUOUS_LABEL`, biên độ mỗi box $\ge 0.15$ bề rộng trang, các vùng không đè lấn nhau ($current[3] \le next[1] + 0.01$).
   - `test('multiline fields group continuation rows without swallowing subsequent row labels')`:
     - Đầu vào: `Nội dung công việc` (2 dòng liên tiếp) và `Địa điểm làm việc` (dòng thứ 3 có nhãn riêng).
     - Kết quả: `Nội dung công việc` gộp đúng 2 vùng thành `multiline_text`; `Địa điểm làm việc` duy trì độc lập là `single_line_text` với 1 vùng.
2. **Toàn bộ Test Suite:**
   - `npm run test:recognition`: **96/96 PASS** (tăng từ 94 lên 96).
   - `npm run test:voice`: **19/19 PASS**.
   - `npm run test:local`: **QA 6/6 PASS, API integrity PASS**.
   - `npm run typecheck`: **0 lỗi TypeScript**.
   - `python unittests`: **38/38 PASS**.

---

## 4. Tồn Đọng Chuyển Giao Cho Chặng 53
- **Chặng 53: Lưu trữ & Phiên bản hóa Ngữ cảnh OCR trên CSDL (`FormOcrContext Persistence`)**:
  - Khi lưu trữ biểu mẫu nhiều trang phức tạp (hoặc khi rollback), Prisma Interactive Transaction hiện có timeout mặc định (khoảng 5000ms), đôi khi gặp lỗi `P2028: Transaction expired` khi xử lý văn bản lớn hoặc mạng nội bộ trễ.
  - Cần nâng `transactionOptions: { timeout: 60000, maxWait: 10000 }` trong `prisma-form.repository.ts` và `form-persistence.service.ts`.
  - Lưu trữ đầy đủ `FormOcrContext` song song với `FormGeometricManifest` để hỗ trợ tính năng tái sinh kịch bản AI không làm lộ dữ liệu PII.
