# Step 82 — Tách ranh giới trường trong hợp đồng và benchmark phôi mới

## Nguồn và phạm vi

- Ảnh `public/assets/forms/hop-dong-lao-dong/page-1.png`, 1200×1700, hash SHA-256 `40F0C6218DA39EE3163E2E88800E52EE0DBAA8D796EAC68879BACC080125501F`.
- Ảnh là mẫu phôi trống nằm trong tài sản công khai của repository; kiểm tra trực quan không thấy dữ liệu cá nhân được điền.
- Không tìm thấy lượt dùng ảnh này trong các kiểm thử/benchmark recognition đã tồn tại trước bước này. Ground truth 14 trường ở phần A và thông tin cá nhân phần B được đánh dấu thủ công trước lần OCR đầu.
- Chỉ chấm geometry của dải `y=0.25–0.62`; các điều khoản hợp đồng phía dưới trang chưa nằm trong annotation.

## Lỗi và sửa đổi

- OCR/OpenCV nhận đúng đường chấm dưới nhãn `Tại`, nhưng vùng này bị gộp thành dòng nhiều-line thứ hai của `Số CMND/CCCD`. Ranh giới nhãn ngắn nằm sát/chồng nhẹ với biên trái của candidate nên bộ ghép continuation không phát hiện nó.
- Giờ văn bản ngắn nằm giữa hai dòng, sát mép trái của guide tiếp theo, chặn ghép multiline. Nhãn vị trí ngắn `Tại` được giữ thành một trường riêng nhưng vẫn `needs_review` do vị trí nhãn suy luận.
- Loại bỏ chuỗi dấu chấm/dấu dẫn lặp ở cuối nhãn xuất ra; ví dụ `Cấp ngày....` trở thành `Cấp ngày`, không thay đổi geometry.
- Thêm unit và browser regression bảo đảm CCCD, ngày cấp và nơi cấp giữ ba vùng riêng; `Tại` không được tự duyệt.

## Đo trước/sau

| Chỉ số trong 14 trường đã chú giải | Lần đầu | Sau sửa |
| --- | ---: | ---: |
| True positive | 13/14 | 14/14 |
| Nhãn trùng chính xác | 12/14 | 14/14 |
| False positive / false negative | 0 / 1 | 0 / 0 |
| Tổng trường draft | 21 | 22 |
| `needs_review` toàn trang | 6 | 7 |

Lỗi cấu trúc được sửa làm thêm một trường `Tại` cần admin xác nhận thay vì âm thầm gộp nó vào CCCD; đây là đánh đổi có chủ đích để giữ đúng quy trình. Trường mới được đề xuất `needs_review`, không `approved`.

Sai số tọa độ trên 13 trường khớp từ lần đầu giữ nguyên sau sửa: mean absolute edge error `4.867 px`, P90 `12.4 px`, 13/52 cạnh trong 2 px. Tính cả trường thứ 14 mới: mean `5.438 px`, P90 `13.2 px`, 13/56 cạnh trong 2 px. Vì vậy kết quả này chứng minh sửa phân đoạn/nhãn và không làm đổi 13 box trước; chưa chứng minh cải thiện tọa độ.

## Kiểm chứng

- Browser upload xử lý ảnh phôi trống trên server kiểm thử; route ghi asset và sinh kịch bản bị chặn, không ghi DB. Browser regression: **6/6** (hợp đồng, khai sinh, hôn nhân, khai tử hai biến thể, giám hộ).
- Recognition + manifest/integration suite, OpenCV, typecheck và production build đều qua.
- UI `/admin/upload` vẫn được mở trên ứng dụng local; server kiểm thử dùng cổng riêng và đã dừng sau kiểm thử.

## Giới hạn và công việc tiếp

- Mẫu hợp đồng là một benchmark mới cho lần chạy đầu, nhưng sau khi dùng phát hiện và sửa lỗi thì **không còn là blind holdout độc lập để xác nhận cuối**; giữ nó làm regression phát triển.
- Cần thêm một phôi trống khác chưa qua OCR/tuning, chú giải độc lập trước khi chạy, rồi báo cáo precision/recall/false candidates, exact labels, IoU/edge error và tải review.
- Annotation hiện chưa bao phủ các điều khoản phía dưới trang; không suy rộng kết quả 14 trường sang toàn biểu mẫu.
- `needs_review` tăng 6→7 vì trước đây một trường bị gộp sai và không được flag; đo tải admin bằng thời gian và số lần chỉnh vẫn còn thiếu.
