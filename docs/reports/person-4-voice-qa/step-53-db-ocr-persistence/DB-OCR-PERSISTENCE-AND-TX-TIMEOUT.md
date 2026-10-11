# Báo Cáo Kỹ Thuật Chặng 53: Lưu Trữ & Phiên Bản Hóa Ngữ Cảnh OCR Trên CSDL (FormOcrContext Persistence & Tx Timeout)

## 1. Mục Tiêu Kỹ Thuật Chặng 53
1. **Triệt tiêu nguy cơ Transaction Timeout (`P2028: Transaction expired`):**
   - Khi lưu trữ các biểu mẫu hành chính nhiều trang với số lượng ô và bước lớn (hàng chục đến hàng trăm records), Prisma interactive transaction mặc định chỉ cho phép thời gian thực thi ngắn (5000ms), dễ gây lỗi rollback ngoài ý muốn trong môi trường mạng nội bộ hoặc máy chủ tải cao.
   - Cấu hình thống nhất `DB_TX_OPTIONS = { timeout: 60000, maxWait: 10000, isolationLevel: 'Serializable' }` trên toàn bộ 5 luồng giao dịch cơ sở dữ liệu trong `PrismaFormRepository`.
2. **Lưu trữ & Phiên bản hóa Ngữ cảnh OCR Bất biến (`FormOcrContext` Persistence):**
   - Hỗ trợ lưu trữ cấu trúc `FormOcrContext` (tọa độ từ, khối văn bản thô, thứ tự đọc) song song với `FormWorkflow` và `FormGeometricManifest` bên trong kho lưu trữ biểu mẫu bất biến `FormArtifactStore` (`afl-template-v1:{hash}`).
   - Cho phép màn hình kiểm duyệt Admin (`/admin/review/[id]`) tải lại đầy đủ ngữ cảnh OCR để tái tạo kịch bản AI với độ chính xác cao nhất mà không cần upload lại file ảnh hoặc gọi lại dịch vụ VietOCR tốn kém.
   - Bảo mật PII: Dữ liệu OCR được bảo vệ ở cấp độ tệp máy chủ nội bộ (permission `0o600`), không lộ sang các API public của người dân.

---

## 2. Chi Tiết Triển Khai

### 2.1 Cấu Hình Transaction Timeout Chuẩn Hóa (`prisma-form.repository.ts`)
Áp dụng `DB_TX_OPTIONS` cho toàn bộ các phương thức giao dịch trong `PrismaFormRepository`:
- `saveDraft(manifest, workflow)`: Nâng hạn ngạch thời gian lên 60.000ms.
- `saveGeometricManifest(manifest)`: Nâng hạn ngạch thời gian lên 60.000ms.
- `saveWorkflow(workflow)`: Nâng hạn ngạch thời gian lên 60.000ms.
- `updateReviewedWorkflow(formCode, workflow)`: Nâng hạn ngạch thời gian lên 60.000ms.
- `approveWorkflow(formCode, performedBy, ...)`: Nâng hạn ngạch thời gian lên 60.000ms.
- Đính kèm `ocrContext: display?.ocrContext` khi phương thức `getWorkflowForReview(formCode)` truy vấn dữ liệu từ tệp lưu trữ biểu mẫu.

### 2.2 Tích Hợp `FormOcrContext` Vào Kho Lưu Trữ Bất Biến (`form-artifact-store.ts`)
- Mở rộng giao diện `FormDisplayArtifact`:
  ```typescript
  export interface FormDisplayArtifact {
    kind: 'afl-template-v1';
    formCode: string;
    pages: FormPageMetadata[];
    circularInfo?: string;
    department?: string;
    fields?: FieldDisplayMetadata[];
    ocrContext?: FormOcrContext;
  }
  ```
- Mở rộng hợp đồng `FormWorkflow`: bổ sung `ocrContext?: unknown;`.
- Trong `FormArtifactStore.save(workflow)`: Tự động xác thực và đóng gói `ocrContext` hợp lệ vào nội dung JSON đã băm (SHA-256) trước khi ghi đĩa.

---

## 3. Kết Quả Kiểm Thử (Verification Gate)
1. **Kiểm thử Đơn vị Mới:**
   - `test('FormArtifactStore persists and round-trips FormOcrContext immutably without altering template status')`:
     - Lưu trữ tệp biểu mẫu kèm `FormOcrContext` 1 trang (khối văn bản 'Tiêu đề biểu mẫu', bbox [0.05, 0.1, 0.8, 0.15], confidence 0.98).
     - Đọc lại qua `store.read(ref, formCode)` và xác minh `assert.deepEqual(readBack?.ocrContext, ocrContext)`.
     - Kết quả: PASS (59.6ms).
2. **Kiểm thử Rollback Toàn trình trên PostgreSQL:**
   - Chạy `multipage-db-rollback.test.ts` với `$env:AFL_TEST_DB_ROLLBACK="1"`:
     - Biểu mẫu 2 trang phức tạp thực hiện toàn trình `saveDraft` -> `getWorkflowForReview` -> `saveReviewWorkflow` -> `approveWorkflow` -> rollback ngoại lệ.
     - Kiểm tra toàn bộ trạng thái trong cơ sở dữ liệu: Rollback sạch sẽ 100%, không để lại rác trong bảng `form_templates`, `form_workflows`, hay `form_audit_logs`.
     - Thời gian chạy thành công: 6.86s.
3. **Bộ Kiểm thử Nhận Diện & Toàn Dự án:**
   - `npm run test:recognition`: **97/97 PASS** (tăng từ 96 lên 97).
   - `npm run test:voice`: **19/19 PASS**.
   - `npm run test:local`: **QA 6/6 PASS, API integrity PASS**.
   - `npm run typecheck`: **0 lỗi TypeScript**.

---

## 4. Tồn Đọng Chuyển Giao Cho Chặng 54
- **Chặng 54: Nối Hợp Đồng Review ↔ Voice / Frontend (Review & Frontend Contracts)**:
  - Tự động chuẩn hóa (slugify) `boxId` tuân thủ nghiêm ngặt regex `/^[A-Za-z0-9_-]{1,64}$/` để loại trừ hoàn toàn các ký tự có dấu hoặc dấu cách vô tình gây lỗi `INVALID_WORKFLOW` trong `FormArtifactStore`.
  - Triển khai thuật toán co giãn động chữ mẫu SVG (auto text-scaling) trong component `VisualTwin.tsx` (tự động hạ cỡ chữ từ 18pt xuống 14pt-12pt khi văn bản dài hơn bề rộng ô) để tránh lỗi chữ đỏ tràn viền ô biểu mẫu.
  - Hỗ trợ lọc theo `targetActor` (`CITIZEN` vs `EMPLOYER` / `OFFICER`) trên trang hướng dẫn `/citizen/guide`.
