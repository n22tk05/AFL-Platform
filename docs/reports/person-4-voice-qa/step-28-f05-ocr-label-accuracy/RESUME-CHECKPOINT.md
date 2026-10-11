# Checkpoint nhận diện biểu mẫu — 10/10/2026

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`; toàn bộ thay đổi chặng 14–28 còn local/chưa commit. Không reset/clean/stash; không dùng Dely theo yêu cầu người dùng.
- Đọc `OCR-LABEL-ACCURACY-RESULTS.md` cùng checkpoint chặng 27 và 25 để tiếp tục. Chặng 28 sửa `form-region-recognition.ts`, `text_layout.py`, `app.py`, test TS/Python/browser và fixture số hàng F05.
- F05 2 trang: 66/66 ô lựa chọn khớp hình học, 66/66 có nhãn, nhưng chỉ 26/33 số hàng đúng và chữ nội dung vẫn sai/thiếu. Không dùng số ô/nhãn không rỗng để tuyên bố OCR chính xác. Hai chữ giả `Contraction` ở ô trống đã bị loại. Mọi ô vẫn `needs_review`.
- Kiểm chứng: recognition 56/56, Python 27/27, typecheck/build, F05, CT01 hai trang, browser mặc định đều PASS. Sau build phải restart Next dev trước khi chạy browser; lần test CT01 đầu hết thời gian do dev server cũ không mở modal, chạy lại PASS sau restart. `:3001` và `:8000` đang nghe; kiểm tra lại khi phiên mới bắt đầu.
- Việc kế tiếp: bản chép chuẩn toàn văn để đo CER/WER, thử OCR crop theo ô trên nhiều holdout, kiểm thử workflow ACTIVE/FE/Voice/DB/staging. Không commit/push khi chưa được yêu cầu.
