# Checkpoint OCR bảng nhiều dòng — 10/10/2026

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`; chặng 14–30 còn local/chưa commit. Không reset/clean/stash; không dùng Dely theo yêu cầu người dùng.
- Đọc `MULTILINE-ROW-SEGMENTATION-RESULTS.md` và checkpoint chặng 25/29. Chặng này thêm `split_multiline_region` trong `text_layout.py`, dùng chỉ cho ô lưới tại `app.py`, test Python và nâng ngưỡng browser CER.
- F05 hiện là **tập phát triển**, không còn holdout độc lập: 66/66 ô hình học, 33/33 số hàng, 31/33 nhãn đúng toàn văn; CER p2 0,23%, p3 0%. Hai sai khác p2 còn `1.5` dấu câu và `2.4` chữ. Tất cả ô tiếp tục `needs_review`.
- Kiểm chứng: recognition 56/56, Python 30/30, typecheck/build, browser phôi thật 6/6, browser mặc định 4/4 PASS. Next `:3001`, VietOCR `:8000` được bật local; xác minh listener ở phiên sau. Sau build cần restart Next dev trước browser.
- Việc kế tiếp: tập kiểm thử độc lập nhiều form/ảnh khác, đo precision–recall và CER, staging workflow ACTIVE/FE/Voice/DB/asset. Không commit/push khi chưa được yêu cầu.
