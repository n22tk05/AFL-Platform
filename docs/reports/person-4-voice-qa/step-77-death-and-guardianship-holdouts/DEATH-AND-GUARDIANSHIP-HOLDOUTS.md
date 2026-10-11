# Step 77 — Holdout generalization for death and multi-person forms

## Mục tiêu

Kiểm tra việc scope người đã chết trên hai cách viết khác nhau, xác minh việc chuẩn hóa nhãn gạch đầu dòng không làm giảm an toàn, và giữ biểu mẫu nhiều chủ thể ở trạng thái review khi chưa có bằng chứng rõ ràng.

## Thay đổi

- Nhận diện scope khai tử dựa trên cụm tường minh `khai tử cho người có tên dưới đây`, dùng được cho cả “đăng ký lại khai tử” và “ghi vào Sổ hộ tịch việc khai tử”.
- Chấp nhận tiền tố gạch đầu dòng khi nhận diện nhãn không dấu câu (ví dụ `- Dân tộc.`); khi scope trực tiếp có mặt, nhãn được chuẩn hóa và gắn với người đã chết.
- `LABEL_POSITION_ESTIMATED` vẫn là lý do ưu tiên review; rule scope không xóa cờ hình học.
- P49 (giám hộ/nhận cha mẹ con) vẫn không nhận `ACTOR_SCOPE_GROUNDED`; các scope người yêu cầu/đối tượng khác nhau tiếp tục cần admin review.

## Kết quả upload

| Mẫu | Trước | Sau | Ghi chú |
| --- | --- | --- | --- |
| HCMC Funeral P43 | 30 phát hiện, 19 nhãn, 22 ưu tiên review | 30 phát hiện, 19 nhãn, 16 ưu tiên review | 6 trường của người chết grounded/suggested; bao gồm `Dân tộc người đã chết`; requestor giữ riêng |
| HCMC Funeral P89 | 30 phát hiện, 21 nhãn, 17 ưu tiên review ở lần đầu | 30 phát hiện, 21 nhãn, 15 ưu tiên review | 6 trường grounded; không có ground truth đầy đủ nên chưa kết luận về FP/FN hoặc IoU |
| HCMC Guardianship P49 | — | 34 phát hiện, 23 nhãn, 24 ưu tiên review | Không có scope grounded bị gán nhầm; phần đa chủ thể vẫn được giữ review |

P43 giảm 6 mục ưu tiên so với baseline upload (22→16), do rule áp dụng trên 6 nhãn sau một mệnh đề trực tiếp. Đây là proxy từ máy, không phải thời gian review hay số lần admin sửa.

## Hồi quy và chất lượng

- Browser upload P43 scope, P49 multi-person, P89, P20, P70: **5/5 passed**.
- P20 tiếp tục đo 29/29 trường và 9/10 scope pair thành suggestion; P70 không hồi quy trong browser holdout.
- Nhận diện/manifest/assets/đa trang: **119/119 passed**.
- OpenCV: **57/57 passed**; TypeScript và production build: passed.
- Không ghi DB, không lưu asset, không gọi Gemini; browser test vẫn yêu cầu xác nhận admin cho mọi workflow.

## Lỗi còn mở

- P43 còn hai trường `MISSING_LABEL` ở đầu trang (candidate_001 và candidate_011 trong draft); nhìn trên ảnh chúng nằm trong vùng tiêu đề/đường trang trí, có khả năng là false positives. Chưa loại tự động vì cần xác minh loại candidate và thêm test âm tính phù hợp.
- P49 còn nhiều trường sai/thiếu scope nhưng đều giữ ưu tiên review; chưa có quy tắc an toàn tổng quát cho biểu mẫu giám hộ/nhận cha mẹ con.
- P43/P49 chưa có ground truth đầy đủ về nhãn, loại ô, hình học và continuation; không báo cáo precision/recall, exact-label hoặc IoU.
- Cần tạo ground truth holdout độc lập, đo số lần sửa nhãn/vùng và thời gian admin trước–sau. Mục tiêu giảm tải tổng thể chưa đạt nghiệm thu.
