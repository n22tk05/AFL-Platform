# Step 80 — Pixel-level coordinate error analysis

## Phạm vi

Đo sai số bốn cạnh của các field được match với blank-form truth trong browser upload; dùng chính `fieldRect` mà benchmark IoU sử dụng. Dấu dương nghĩa cạnh dự đoán nằm thấp/phải hơn truth; dấu âm nghĩa nằm cao/trái hơn.

## Chỉ số hiện tại

| Holdout | Match | Mean abs error/cạnh | P90 abs error | Cạnh trong 2 px |
| --- | ---: | ---: | ---: | ---: |
| HCMC Marriage P20 | 29/29 | 4.23 px | 7.23 px | 41/116 |
| HCMC Birth P70 | 29/29 | 3.84 px | 6.20 px | 30/116 |
| Central Construction P59 | 29/29 | 4.74 px | 11.00 px | 47/116 |
| Central Authorization P61 | 20/20 | 4.15 px | 9.00 px | 32/80 |

Mean signed error theo cạnh (top, left, bottom, right): P20 `(-1.64, +3.96, -3.17, -1.03)` px; P70 `(-0.41, -1.58, -3.38, -2.33)` px; P59 `(+1.24, +2.38, +1.21, -2.48)` px; P61 `(-0.35, -2.20, -3.25, -6.10)` px.

## Quyết định kỹ thuật

- Không thêm padding cố định vào box. Mô phỏng offline padding 3 px trái/phải/dưới tăng macro mean IoU (trung bình đều trên bốn mẫu) khoảng `0.732 → 0.792`, nhưng giảm riêng P59 khoảng `0.731 → 0.691`; điều này làm xấu một holdout và chưa an toàn để áp dụng chung.
- Hướng lỗi dưới/phải xuất hiện ở P20/P70/P61, trong khi P59 có hai cạnh đứng sai chiều ngược lại. Cần tìm tín hiệu thuật toán như chất lượng/độ liên tục đường chấm hoặc mode ảnh trước khi chọn hiệu chỉnh có điều kiện.
- Bốn mẫu là blank-form regression set đã dùng cho phát triển, không được xem là blind holdout mới. Cần thêm ít nhất một biểu mẫu và ảnh camera chưa dùng để tuning, có ground truth độc lập.

## Thay đổi benchmark

- Browser evaluator hiện ghi edge deltas bằng pixel cho từng match và thống kê mean absolute, P90, số cạnh trong 2 px cùng signed mean.
- Đây là metric tọa độ chứ không phải tiêu chí xuất bản. Hệ thống vẫn giữ xác nhận của admin bắt buộc.
- Browser regression tạo benchmark: P20, P70, P59, P61 đạt **4/4**; recognition tests **123/123**, OpenCV **57/57**, TypeScript passed.

## Còn thiếu

- P43/P49/P89 chưa có ground truth toàn diện cho precision/recall và edge error.
- Chưa có thời gian review hoặc số lần admin sửa thực đo.
- Chưa có pristine holdout mới để xác nhận bất kỳ ngưỡng/padding có điều kiện nào.
