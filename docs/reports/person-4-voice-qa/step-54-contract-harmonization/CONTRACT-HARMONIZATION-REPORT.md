# CHẶNG 54: NỐI HỢP ĐỒNG REVIEW ↔ VOICE / FRONTEND & VISUAL TWIN DYNAMIC SCALING

## 1. Mục Tiêu Nghiệp Vụ & Bối Cảnh
Sau khi bóc tách nhãn inline và nhóm multiline thành công ở Chặng 52, các trường thông tin trên hợp đồng/biểu mẫu hành chính phức tạp có thể được chỉnh sửa/chia tách (`splitTextField`) bởi quản trị viên hoặc hệ thống. Tuy nhiên:
1. Các `boxId` được tạo mới nếu chứa dấu tiếng Việt, dấu cách hoặc ký tự đặc biệt sẽ gây vi phạm quy tắc định danh `REGION_ID` (`/^[A-Za-z0-9_-]{1,64}$/`), dẫn tới ngoại lệ `INVALID_WORKFLOW` khi lưu vào `FormArtifactStore`.
2. Biểu mẫu đa bên (như Hợp đồng lao động với Bên A - Người sử dụng lao động, Bên B - Người lao động, hoặc biểu mẫu thuế có phần cán bộ tiếp nhận) cần hỗ trợ lọc vai trò người điền (`targetActor`), giúp người dân tập trung đúng vào các ô mình cần khai mà không bị lạc giữa hàng chục ô của bên thứ ba.
3. Trên giao diện thị giác `VisualTwin`, ô cần điền cần hiển thị chữ mẫu mô phỏng trực tiếp, tự động co dãn kích cỡ font (`computeDynamicFontSize`) theo tỷ lệ chiều rộng thực tế của ô để không bị tràn vỡ giao diện trên màn hình di động/tablet.

---

## 2. Các Cải Tiến Kỹ Thuật Đã Triển Khai

### 2.1 Chuẩn Hóa Định Danh Ô: `slugifyBoxId`
- Tọa độ và hàm tiện ích trong `src/modules/forms/services/form-field-metadata.ts`:
  - Khử toàn bộ dấu tiếng Việt qua Unicode NFD normalization (`[\u0300-\u036f]`, `đ/Đ` -> `d/D`).
  - Thay thế các ký tự phân cách, dấu cách, dấu chấm, dấu hai chấm bằng ký tự gạch dưới `_`.
  - Cắt tỉa gạch nối/dưới dư thừa và giới hạn độ dài chặt chẽ $\le 64$ ký tự.
  - Áp dụng trực tiếp vào `mergeTextFields` và `splitTextField` trong `src/modules/forms/services/form-region-editor.ts`, đảm bảo mọi thao tác tách gộp vùng luôn tạo ra các ID hoàn toàn tuân thủ hợp đồng hệ thống.

### 2.2 Hợp Đồng Đa Bên: `TargetActor`
- Bổ sung `export type TargetActor = 'ALL' | 'CITIZEN' | 'EMPLOYER' | 'OFFICER';` trong `src/shared/contracts.ts`.
- Mở rộng `WorkflowStep` với trường `targetActor?: TargetActor`.
- Cập nhật `StepHeader.tsx` hiển thị huy hiệu vai trò phân quyền tương ứng (`Phần người dân điền`, `Phần người sử dụng LĐ`, `Phần cán bộ tiếp nhận`).
- Bổ sung bộ lọc vai trò trực quan trong `src/app/citizen/guide/page.tsx`: tự động hiển thị thanh chuyển đổi vai trò khi biểu mẫu có từ 2 vai trò trở lên, cho phép người dân chuyển qua lại tức thì giữa các trường của mình hoặc xem toàn bộ biểu mẫu.

### 2.3 Hiển Thị Chữ Mẫu Tự Động Co Dãn: `VisualTwin`
- Bổ sung thuộc tính `exampleRedText?: string` trong `VisualTwinProps`.
- Tích hợp thuật toán tính kích thước font động:
  $$\text{approxPxWidth} = (x_{max} - x_{min}) \times 480$$
  $$\text{targetFontSize} = \operatorname{clamp}\left(8, \operatorname{round}\left(\frac{\text{approxPxWidth}}{\text{length}} \times 1.4\right), 15\right)$$
- Ô checkbox hiển thị dấu tích `✓` căn giữa sắc nét.
- Ô nhập văn bản hiển thị chữ mẫu in hoa màu đỏ (`#D32F2F`), được bao bọc trong vùng `overflow-hidden` nội bộ để tuyệt đối không tràn ra ngoài ô, trong khi nhãn hướng dẫn phía trên (`bottom-full`) vẫn hiển thị đầy đủ không bị che khuất.

---

## 3. Bằng Chứng Kiểm Thử & Kiểm Soát Hồi Quy

1. **Unit Test Định Danh**:
   - `test('slugifyBoxId sanitizes accented text, punctuation and clamps length to 64 chars')`: PASS.
   - Thao tác `splitTextField` với nhãn tiếng Việt có dấu `'Ô số 2: Họ và tên'` tạo ra `boxId = 'O_so_2_Ho_va_ten'` và `regionId = 'O_so_2_Ho_va_ten_region_1'`.
2. **Recognition Suite**:
   - `npm run test:recognition`: **98/98 PASS** (100%).
3. **Voice AI Suite**:
   - `npm run test:voice`: **19/19 PASS** (100%).
4. **Local Integration Suite**:
   - `npm run test:local`: QA suite **6/6 PASS**, API integrity **PASS**.
5. **Static Typing**:
   - `npm run typecheck`: **0 lỗi** biên dịch.
