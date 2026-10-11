# Checkpoint sau sửa ô tích TK01 — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Toàn bộ step-14 đến step-20 còn **uncommitted**. Không reset/clean/stash/merge/push khi chưa có yêu cầu. Không dùng Dely theo yêu cầu người dùng.
- Đọc `CHECKBOX-GEOMETRY-AND-GROUNDING.md` tại đây và checkpoint step-19. Báo cáo các chặng cũ không được sửa số để che hồi quy.
- Code step-20: `src/modules/opencv/checkbox-detector.ts`, `src/modules/forms/services/form-region-recognition.ts`, unit tests tương ứng và `tests/browser/form-recognition.spec.ts`. Không đổi Prisma schema, API, Python OCR hay DB.
- Phôi thật hiện tại: TK01 31 field / 8 nhãn / 30 needs-review; bốn ô `Nam`, `Nữ`, có/không chip được ghép đúng, còn 3 checkbox chưa nhãn. CT01 71 field / 51 nhãn; bảng 45/45 nhãn nguyên văn. Đừng suy ra accuracy toàn hệ thống từ hai development form.
- Test step-20: recognition 41/41, OpenCV 54/54, browser phôi thật 2/2, browser mặc định 11/11, TypeScript, production build riêng và `git diff --check` PASS. Python unit trước đó 25/25. Không gọi cloud, không ghi DB.
- OCR cổng 8000 và Next dev cổng 3001 đã chạy trong lượt này; lượt sau xác minh health/port. Bản benchmark/bản nháp ở `private-documents/recognition-evaluation/` bị Git ignore, không dùng cho dữ liệu cá nhân.
- Ưu tiên tiếp: ground truth độc lập đa chủ đề cho static/label/input/checkbox và trường nhiều dòng; giảm false-positive chưa nhãn, xử lý checkbox có dấu; QR/ảnh/dấu; đa trang/PDF và DB staging. Không tự publish khi còn vùng mơ hồ.
