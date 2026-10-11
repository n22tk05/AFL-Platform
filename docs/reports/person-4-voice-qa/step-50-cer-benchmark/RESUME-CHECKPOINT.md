# Checkpoint nhận diện biểu mẫu — 11/10/2026, chặng 50

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh mới: `feat/ocr-region-and-admin-workflow` (tạo từ HEAD `codex/form-recognition-and-multiline`, bảo toàn 100% thay đổi local; không commit, không push).
- Đã hoàn thành đo lường định lượng CER/WER trên Ground Truth độc lập (3 phôi quét thật):
  - Hải Phòng (Hỗ trợ mai táng - Trang 7): CER **1.00%**, WER **2.16%**.
  - Bộ Xây dựng (Đơn cấp phép xây dựng - Trang 59): CER **2.61%**, WER **2.91%** (giảm hơn 50% sau sửa lỗi).
  - Phụ lục CP (Giấy ủy quyền - Trang 61): CER **6.98%**, WER **8.94%**.
- Thuật toán cải tiến: Bổ sung `suppress_overlapping_boxes` (NMS/IoU containment) trong `services/vietocr-service/text_layout.py` và `app.py`. Loại bỏ triệt để hiện tượng trùng lặp các mảnh text con lọt vào OCR pipeline.
- Bằng chứng kiểm thử:
  - Python tests: 38/38 PASS.
  - TypeScript typecheck: 0 lỗi (`tsc --noEmit`).
  - Recognition test suite: 92/92 PASS.
  - Voice test suite: 19/19 PASS.
  - Local QA & API integrity suite: PASS.
- Tồn đọng cho Chặng 51:
  - Cải tiến `form-region-recognition.ts` và `json-content-classifier.ts` để phân định chuẩn 5 vai trò vùng: `static_text`, `label`, `description`, `input`, `checkbox`.
  - Thiết lập cơ chế Ambiguity Guard: bảo đảm các vùng không chắc chắn đều mang `needs_review: true`.
