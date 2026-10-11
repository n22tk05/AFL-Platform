# Checkpoint sau OCR header bảng — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Toàn bộ thay đổi step-14 đến step-19 còn **uncommitted**. Không reset/clean/stash/merge/push khi chưa có yêu cầu. Không dùng Dely theo lựa chọn trực tiếp của người dùng.
- Đọc báo cáo `RULED-TABLE-HEADER-OCR.md` trong thư mục này và checkpoint step-18. Báo cáo cũ là mốc lịch sử, không chỉnh số cũ để che thay đổi.
- Code mới của step-19: `services/vietocr-service/text_layout.py`, `services/vietocr-service/app.py`, hai test Python tương ứng và `tests/browser/form-recognition.spec.ts`. OCR local cổng 8000 đã restart trong phiên này; Next dev cổng 3001 đang chạy. Lần sau xác minh health/port trước khi dùng.
- Kết quả CT01: 36 dòng OCR; 71 field/51 nhãn; 45/45 table cell có nhãn đúng nguyên văn và IoU≥0.5, mean 0.9668; 20 field chưa nhãn. TK01: 29 field/5 nhãn, 24 field chưa nhãn. Đây là development set, không đủ để tự publish.
- Kiểm chứng step-19: Python unit 25/25; recognition 40/40; OpenCV 54/54; browser phôi thật 2/2; browser mặc định 11/11 với `IMAGE_VOICE_TEST_URL=http://127.0.0.1:3001`; TypeScript, build production riêng (`AFL_BUILD_DIR=.next-recognition-build`) và `git diff --check` PASS. Chưa gọi Gemini/TTS, chưa ghi DB.
- Tiếp theo: annotation độc lập toàn phôi khác chủ đề; đo precision/recall/IoU theo loại; QR/ảnh/dấu, bảng đa tầng/không kẻ, nhiều trang/PDF; transaction trên DB staging. Tránh cloud với ảnh có dữ liệu cá nhân.
