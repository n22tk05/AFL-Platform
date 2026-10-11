# Checkpoint F05 đa trang — 10/10/2026

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Step-14 đến step-27 chưa commit/push; giữ toàn bộ thay đổi, không reset/clean/stash; không dùng Dely theo yêu cầu người dùng.
- Đọc `F05-TABLE-CONTINUATION-RESULTS.md` và checkpoint step-25/26. Chặng này sửa `form-region-recognition.ts`, `form-manifest-assembler.ts`, `multipage-form-recognition.ts`, cảnh báo trong `FormUploadModal.tsx`, test TS/browser và fixture F05 p2/p3.
- F05 hai trang có 36+30 ô lựa chọn, ghép hình học 66/66 trên fixture ở IoU≥0,5; nhãn OCR 34+30 có giá trị nhưng nhiều lỗi chữ và 2 nhãn trang đầu còn trống. Tất cả cần duyệt. Trang 3 có 2 ô suy ra từ hàng đầu mở viền, lý do `OPEN_TOP_ROW_INFERRED`.
- CT01 F20-p1 còn 70 đề xuất sau khi loại một ô giả trong tiêu đề; 45/45 ô bảng vẫn khớp, trang ghi chú 0. Browser F05/CT01/TK01/ghi chú/default và test local qua. Next `:3001` và VietOCR `:8000` đã được bật local trong phiên; kiểm tra listener lại trước khi chạy browser ở phiên sau.
- Việc kế tiếp: chú giải **nội dung nhãn** và đo word/field accuracy, cải thiện OCR các hàng dài và số thứ tự; mở holdout scan khác để đánh giá precision/recall; kiểm tra FE/Voice và staging HTTP trên workflow ACTIVE, quyền DB/asset storage theo step-25. Không gọi bản hiện tại là tự động xuất bản an toàn.
