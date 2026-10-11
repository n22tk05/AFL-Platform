# Chặng 28 — Đo lỗi nhãn OCR F05, không nhầm nhãn có chữ với nhãn đúng

Ngày 10/10/2026. Nhánh `codex/form-recognition-and-multiline`. Đo trên hai trang phôi trắng F05 local; không dùng dữ liệu công dân, Gemini hoặc DB. Ảnh và JSON chi tiết nằm trong `private-documents/recognition-evaluation/` (ignored), không đưa vào Git.

## Thay đổi

- Bộ nhận diện bảng lấy nhãn từ vùng cột mô tả của cả hàng khi contour ô mô tả bị đứt; nếu OCR đọc số thứ tự thành một block riêng trong cột STT, ghép block đó vào nhãn. Block OCR đã chứa số thứ tự không bị ghép trùng. Nhờ đó hàng `1.5` có cả số và nội dung, 36/36 ô lựa chọn trang đầu có nhãn; trang sau vẫn 30/30.
- VietOCR bỏ dự đoán dài, độ tin cậy thấp từ crop hẹp chỉ chứa vài nét. Trên F05-p2, hai chữ giả `Contraction` trong ô trống không còn xuất hiện. Bộ lọc giữ nguyên số ngắn có độ tin cậy thấp để không xóa STT thật; test riêng bao phủ cả hai trường hợp.
- Fixture `recognition-f05-row-identifiers.json` chép 33 số hàng từ ảnh. Browser benchmark đo đúng **số thứ tự đầu nhãn** tách khỏi hình học; ngưỡng hồi quy hiện là 26/33, không phải tiêu chí nghiệm thu OCR.

## Kết quả trên F05

| Phép đo | Trang p2 | Trang p3 | Diễn giải |
| --- | ---: | ---: | --- |
| Ô Có/Không khớp hình học | 36/36 | 30/30 | IoU≥0,5, không dư ô; chưa đo độ đúng chữ |
| Ô có nhãn không rỗng | 36/36 | 30/30 | Không đồng nghĩa nhãn chính xác |
| Số hàng đầu nhãn đúng tuyệt đối | 15/18 | 11/15 | Tổng 26/33; 7 số sai |

Số sai: `1.4→14`, `2.4→24`, `2.5→25`, `3.4→34`, `4.5→45`, `5.2→52`, `5.4→sa`. Ngoài ra một số chữ nội dung sai hoặc thiếu dòng, ví dụ hàng `4.5`, `5.2`, `5.4`; **chưa có bản chép chuẩn toàn văn để tính CER/WER**. Đây là lỗi nhận dạng chữ của OCR, không được sửa tự động bằng chuỗi cố định của F05. Tất cả 66 ô tiếp tục `needs_review`, gồm hai ô suy ra viền trên trang p3. Cán bộ cần đối chiếu ảnh và sửa nhãn trước khi sinh kịch bản/phê duyệt.

## Kiểm chứng

- `npm run test:recognition`: 56/56 PASS, gồm trường hợp chỉ có STT nhưng không có mô tả phải để nhãn rỗng; VietOCR Python `unittest discover`: 27/27 PASS.
- `npm run typecheck`, `npm run build`: PASS. Build chỉ cảnh báo `<img>` hiện có ở `FormUploadModal.tsx`.
- Browser local F05 1/1, CT01 hai trang 1/1 và bộ browser mặc định 4/4 PASS; không lưu asset hoặc gọi Gemini. `git diff --check` không có lỗi whitespace (Git chỉ báo chuyển LF/CRLF khi chạm file).
- Sau `next build`, Next dev cũ tại `:3001` không mở modal trong test. Đã khởi động lại dev server; CT01 và bộ mặc định chạy lại PASS. VietOCR `:8000` đã khởi động lại để nạp bộ lọc mới.

## Việc tiếp theo

1. Chép chuẩn toàn văn nhãn trên ít nhất F05 và một form scan khác; đo CER/WER và tỷ lệ thiếu dòng theo hàng, không chỉ số hàng. Thử phương án OCR lại từng ô mô tả/tiền xử lý dòng, so sánh trên holdout, không hardcode mẫu.
2. Mở rộng benchmark nhiều loại form và chất lượng ảnh; đo precision/recall vùng nhập, checkbox, static và lỗi số ô dư trước khi giảm mức `needs_review`.
3. Kiểm thử staging workflow `ACTIVE` gồm API/FE/Voice/ảnh và quyền asset/DB theo checkpoint chặng 25. Chưa gọi bản hiện tại là sẵn sàng công bố tự động.
