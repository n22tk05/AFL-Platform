# Checkpoint OCR theo hàng bảng — 10/10/2026

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`. Toàn bộ thay đổi chặng 14–29 còn local/chưa commit. Không reset/clean/stash; không dùng Dely theo yêu cầu người dùng.
- Đọc `ROW-OCR-HOLDOUT-RESULTS.md` cùng checkpoint chặng 25/28. Chặng này thêm `ruled_matrix_label_cells` trong VietOCR, nối vào `segment_document_lines`, chấp nhận STT/mô tả tách block ở hàng đầu trang tiếp, thêm fixture toàn nhãn và CER browser.
- F05: 66/66 ô hình học, 33/33 số hàng, 24/33 nhãn khớp hoàn toàn, CER p2 4,55%, p3 16,24%. Sáu hàng CER riêng >15%; tất cả 66 ô vẫn `needs_review`. Ảnh/JSON chi tiết ignored tại `private-documents/recognition-evaluation/F05-p2-p3.holdout.live.*`.
- Test: recognition 56/56; Python 29/29; typecheck/build; browser phôi thật 6/6; browser mặc định 4/4 đều PASS. Next `:3001` và VietOCR `:8000` được bật local; xác minh listener lại trước phiên sau. Sau build cần restart Next dev để browser hoạt động đúng.
- Việc kế tiếp: đo và sửa thiếu dòng dài trên holdout khác; benchmark nhiều form/ảnh xấu; staging workflow ACTIVE/FE/Voice/DB/asset. Không tự động công bố và không commit/push khi chưa được yêu cầu.
