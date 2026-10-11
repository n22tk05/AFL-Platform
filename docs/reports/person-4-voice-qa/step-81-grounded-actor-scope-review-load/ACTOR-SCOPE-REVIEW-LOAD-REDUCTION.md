# Step 81 — Giảm tải rà soát bằng scope chủ thể có căn cứ

## Mục tiêu

Giảm số ô bị yêu cầu rà soát chỉ vì gán chủ thể, khi phôi có heading tường minh xác định đối tượng của trường. Đây là phân loại đề xuất, không thay thế việc quản trị viên duyệt biểu mẫu.

## Thay đổi

- Nhận heading khai sinh `Đề nghị ... đăng ký khai sinh cho người dưới đây:` là bằng chứng tường minh cho scope `người được khai sinh`.
- Các heading `Họ ... tên người mẹ/cha/yêu cầu` vốn đã được nhận diện tường minh; thống nhất chúng thành scope grounded thay vì scope suy luận yếu.
- Giữ ranh giới scope theo vị trí và section; không nâng scope câu hỏi checkbox, ngày ký hoặc nhãn khác nếu thiếu bằng chứng tương ứng.
- Tạo regression khẳng định các ô được đề xuất vẫn chưa tự duyệt.

## Kết quả kiểm thử P70

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Trường phát hiện | 29 | 29 |
| Trường khớp ground truth | 29/29 | 29/29 |
| Nhãn chính xác | 25 | 25 |
| Ô cần rà soát | 21 | 6 |
| Scope chủ thể grounded | 2 | 17 |

Mười lăm scope mẹ/cha/trẻ được phân loại lại nhờ heading tường minh. Hai scope người yêu cầu đã grounded từ trước. Giảm 15 ô cần rà soát, tương đương 71.4% theo proxy này; đây chưa phải phép đo thời gian admin thực tế. Không đổi tọa độ hoặc kết quả nhận diện hình học; không có ô nào chuyển thành `approved`.

## Kiểm chứng

- Browser upload P70 chạy OCR thật trên phôi trống, chặn endpoint ghi tài sản và sinh kịch bản; kết quả 29 trường, 25 nhãn chính xác, 6 needs-review; passed.
- Browser regression khai tử tổng quát, biến thể P43 và biểu mẫu giám hộ P49; passed 3/3, không làm gộp nhầm chủ thể hoặc tự duyệt.
- Recognition unit suite: 123/123 passed; TypeScript passed; production build passed.
- Trang `/admin/upload` đã mở trên ứng dụng local để xác nhận giao diện hiện hành. Không lưu biểu mẫu vào database.

## Giới hạn và bước tiếp

- `needsReview` là proxy tải admin, không đo thời gian xử lý hoặc số lần sửa. Cần ghi nhận các thao tác review (số trường sửa, thời gian, lý do) trên tập biểu mẫu thử có đồng thuận.
- Browser benchmark P70 là bộ hồi quy phát triển, không phải holdout độc lập mới. Không xem tỷ lệ 29/29 là bằng chứng tổng quát cho mọi biểu mẫu.
- Tiếp tục ưu tiên lỗi làm tăng sửa thủ công: sai box/edge, nhãn OCR, candidate dư/thiếu và grouping nhiều dòng. Đo riêng từng metric trước khi thay đổi ngưỡng chung.
- Duy trì bước xác nhận và phê duyệt của admin, đặc biệt trước khi công bố workflow.
