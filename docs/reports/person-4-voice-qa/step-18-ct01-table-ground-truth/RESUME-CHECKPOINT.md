# Checkpoint sau đo bảng CT01 — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Toàn bộ step-14 đến step-18 còn **uncommitted**. Không reset/clean/stash/merge/push khi chưa có yêu cầu. Không dùng Dely theo lựa chọn trực tiếp của người dùng.
- Đọc `../step-17-ocr-evidence-and-inline-fields/RESUME-CHECKPOINT.md` và `ANNOTATED-TABLE-GEOMETRY.md` ở đây. Báo cáo cũ là mốc lịch sử; không sửa số trước đây để che hồi quy.
- Test mới dùng `tests/fixtures/recognition-ct01-table-ground-truth.json` và helper trong `tests/browser/form-recognition.spec.ts`. 45/45 cell bảng CT01 khớp tại IoU≥0.5; mean 0.9668, min 0.9299; nhãn nguyên văn 36/45. Đây là **development set một bảng**, không phải quality gate toàn dự án.
- Trước thay đổi này, Python 22/22, recognition 40/40, OpenCV 54/54, documents 153/153, browser mặc định 11/11, browser phôi thật 2/2, TypeScript và build PASS. Sau thêm annotation/test, browser CT01 opt-in 1/1 PASS; chạy lại typecheck/diff nếu tiếp tục sửa.
- Next dev cổng 3001 và VietOCR mới cổng 8000 đang chạy trong phiên này; lần sau kiểm tra health/port, không giả định PID. Không sửa DB production, không gọi Gemini/TTS cloud trong benchmark.
- Tiếp theo: ground truth độc lập cho field ngoài bảng và TK01; đo precision/recall/IoU theo loại trên holdout; sửa header ngày sinh thiếu chữ; detector QR/ảnh/dấu; contract đa trang và DB staging test. Không tuyên bố hai form đã đủ để publish.
