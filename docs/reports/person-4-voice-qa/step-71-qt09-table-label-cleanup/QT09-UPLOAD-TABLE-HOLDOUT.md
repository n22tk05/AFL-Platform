# Step 71 — QT-09 upload holdout and table-label cleanup

## Mục tiêu

Kiểm tra quy trình `/admin/upload` trên một phôi độc lập có bảng lặp nhiều cột; giảm nhiễu nhãn do OCR kéo chú thích hướng dẫn và số chú giải vào tiêu đề cột.

## Thay đổi

- Chuẩn hóa tiêu đề bảng sau khi ghép các mảnh OCR trong cùng ô tiêu đề.
- Bỏ phần ngoặc chú thích dài chỉ bắt đầu bằng “Trường hợp”, “Chi tiết”, “Ghi chú” hoặc “Lưu ý”; bỏ số chú giải dạng `(2)` ở cuối. Chuẩn hóa ba lỗi OCR quan sát được trong holdout “số diện thoại”, “trọ cấp”, và chữ thường “bhxh”. Giữ nguyên các dấu ngoặc phân biệt có ý nghĩa ngắn như `Nam`/`Nữ` và `(nếu có)`.
- Thêm unit regression cho chú thích bắt đầu ở một dòng OCR và kết thúc ở dòng khác, đồng thời giữ kiểm tra tiêu đề bảng lặp và bảng ngày sinh.
- Thêm browser regression sử dụng trực tiếp `/admin/upload` với QT-09-HSB; test chặn endpoint ghi tài sản/kịch bản và không bấm lưu.

## Kết quả

- Build production và type-check thành công; bộ unit vùng nhận diện **75/75 passed**.
- Browser regression trên bản build mới: **1/1 passed**. Hình học bảng: **24/24** ô đúng (IoU ≥ 0.5), **0** ô thừa, mean IoU **0.927**, minimum IoU **0.901**.
- Nhãn khớp chính xác tăng từ **12/24 lên 18/24** sau khi ghép và chuẩn hóa tiêu đề OCR. Bản ghi cũ `QT-09-HSB.independent` cho 6/24 nhưng được tạo bằng luồng modal cũ nên không dùng làm so sánh trước/sau thuần túy. Hai nhãn còn sai trên cả ba hàng là nhãn BHXH/hộ chiếu bị OCR cắt cụt và tiêu đề trợ cấp bị OCR lược mất từ; không tự hoàn thiện phần chữ bị thiếu.
- UI `/admin/upload` trả **33 trường, 28 cần chú ý**; cả 24 ô bảng tiếp tục được đánh dấu review. Không giảm cảnh báo dựa trên một holdout và không bỏ qua bước duyệt của admin.
- Thao tác kiểm tra trực tiếp trên UI chỉ nạp phôi trắng và phân tích; nút lưu chưa được bấm. Test xác nhận không có request ghi asset hoặc gọi sinh kịch bản.

## Còn lại

- Còn **6/24** nhãn chưa khớp nguyên văn do OCR cắt hoặc lược chữ; cần xử lý OCR/chuẩn hóa tiếng Việt riêng, có fixture chống hồi quy.
- Toàn biểu mẫu vẫn có 28/33 trường cần chú ý. Chưa đo thời gian review, số lần chỉnh sửa hoặc mức giảm công việc; chưa thể kết luận mục tiêu giảm tải đã đạt.
- `npm run test:recognition` còn một lỗi độc lập trong integration mock của `form-assets-integration.test.ts` (`Cannot read properties of undefined (reading 'deleteMany')` trong mock transaction); 115 test khác trong lần chạy đó qua. Unit nhận diện riêng và build đều qua.
- Tiếp theo: mở rộng đánh giá nhãn trên QT-09 và các bảng holdout khác, xử lý chú thích/header OCR có căn cứ; sau đó đo thao tác admin thực tế và hiệu quả điều hướng review trước khi hạ mức ưu tiên.

## An toàn dữ liệu

- Chỉ dùng phôi trắng công khai; không dùng dữ liệu công dân.
- Không ghi biểu mẫu hay workflow vào DB, không gọi Gemini và không phê duyệt/công bố dữ liệu.
