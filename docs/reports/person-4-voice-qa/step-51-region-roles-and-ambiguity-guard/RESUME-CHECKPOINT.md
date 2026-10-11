# Checkpoint nhận diện biểu mẫu — 11/10/2026, chặng 51

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `feat/ocr-region-and-admin-workflow`. Giữ các sửa đổi local; không reset/clean/stash/commit/push.
- Đã hoàn thành phân định 5 vai trò vùng: `static_text`, `label`, `description`, `input`, `checkbox`.
- Đã gắn trường `role?: RegionRole` vào `FormGeometricBox` trong `src/shared/contracts.ts` và gán tự động trong `form-region-recognition.ts`.
- Mở rộng `json-content-classifier.ts` với `DESCRIPTION_INSTRUCTION_REGEX` và `NOTE_PREFIX_REGEX` để bóc tách lời chú thích dưới dòng/trong ngoặc đơn (`description_instruction`).
- Củng cố Ambiguity Guard: Mọi xung đột hình học (label collision $\ge \min(w \times 0.4, 0.035)$) hoặc nhãn mơ hồ đều được kích hoạt `needs_review: true`.
- Bằng chứng kiểm thử:
  - Recognition test suite: **94/94 PASS** (bao gồm 2 test mới cho vai trò vùng và ambiguity guard).
  - Voice test suite: **19/19 PASS**.
  - Local QA & API integrity: **PASS**.
  - TypeScript typecheck: **0 lỗi**.
- Kế hoạch Chặng 52 (triển khai tự động tiếp theo):
  - Thuật toán bóc tách điền khuyết nội dòng (`Inline Cloze Multi-Field Segmentation`).
  - Thuật toán gom nhóm vùng nhiều dòng (`Multiline Region Grouping`).
