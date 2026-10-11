# Checkpoint sau chặn trang chú thích — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Step-14 đến step-21 vẫn **uncommitted**. Không reset/clean/stash/merge/push khi chưa có yêu cầu; không dùng Dely theo lựa chọn người dùng.
- Đọc `NOTES-ONLY-PAGE-RECOGNITION.md` tại đây và checkpoint step-20. Không sửa số cũ để che hồi quy.
- Code step-21: `src/modules/forms/services/form-region-recognition.ts`, `src/components/admin/FormUploadModal.tsx`, unit recognition và opt-in browser test. Không đổi Python OCR, Prisma schema hay API.
- Hai trang âm tính local F20-p2 và F14-p5 lần lượt từ 21/6 field giả xuống 0, ứng viên vẫn trong vùng bằng chứng; FE cấm lưu/sinh khi 0 field. F20-p1 giữ 71 field/51 nhãn và 45/45 ô bảng đúng; F19-p5 giữ 31 field/8 nhãn và bốn ô tích mục tiêu đúng.
- Test: recognition 43/43, OpenCV 54/54, browser nhận diện 7/7 (gồm 4 phôi thật), browser mặc định 11/11 (`IMAGE_VOICE_TEST_URL=http://127.0.0.1:3001`), TypeScript, build riêng và `git diff --check` PASS. Build chỉ còn cảnh báo Next.js về `<img>` xem blob local; không gửi cloud, không ghi DB.
- OCR cổng 8000 và Next dev cổng 3001 có trong phiên này; lần sau xác minh health/port. `private-documents/recognition-evaluation/` là dữ liệu Git-ignored; không dùng ảnh có thông tin công dân cho cloud.
- Ưu tiên tiếp: contract đa trang thật thay vì chỉ `pageNumber` kiểu dữ liệu; annotation/holdout độc lập đa chủ đề; giảm false-positive và mất nhãn của field thực; QR/ảnh/dấu, checkbox đã đánh dấu; DB staging cho lưu/phê duyệt. Không tự publish khi còn vùng mơ hồ.
