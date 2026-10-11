# Điều hướng nhanh các ô cần đối soát

## Mục tiêu

Giảm thao tác tìm ô cảnh báo trong danh sách dài ở `/admin/upload`, nhưng không giảm cảnh báo, sửa thứ tự trường, tự xác nhận hay thay đổi bước dữ liệu.

## Thay đổi

- Thêm hàm điều hướng tuần tự qua ô `needs_review` hoặc ô chưa có nhãn; ô gợi ý không bị đưa vào hàng đợi ưu tiên.
- Thêm nút hiển thị vị trí hiện tại trong hàng đợi và chuyển tới ô ưu tiên kế tiếp.
- Giữ nguyên thứ tự nhận diện, trạng thái, nhãn, tọa độ và yêu cầu admin xác nhận.
- Khi chuyển tới ô khác trang, giao diện đồng bộ trang xem trước tương ứng.

## Kiểm chứng

- Test hàm điều hướng: bỏ qua ô gợi ý, tiến tiếp, quay vòng và không có đích khi hàng đợi trống.
- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts`: **69/69 pass**.
- `npx tsc --noEmit --incremental false`: pass.
- `npm run build`: pass; còn cảnh báo `<img>` và dependency `useMemo` đã có ở các trang khác.
- `npm run test:recognition`: **109/110 pass**; một test tích hợp cũ hỏng do mock Prisma thiếu `formFieldMetadata.deleteMany` trong `form-assets-integration.test.ts`. Test điều hướng và các test nhận diện khác đều pass; không sửa phần mock/DB ngoài phạm vi.
- Chạy trực tiếp luồng upload P70 trên `http://localhost:3001/admin/upload` với phôi trắng công khai: 29 trường, 23 trường cần chú ý. Nút bỏ qua các ô gợi ý và chuyển từ ô #1 tới ô ưu tiên #3 (`1/23`), tiếp tới #4 (`2/23`), rồi quay vòng từ ô #29 về #3 (`1/23`).
- Trên lần chạy UI cuối, khi chọn lại ô gợi ý #1, nút trở về nhãn tổng `23 ô cần chú ý` thay vì hiển thị sai vị trí hiện tại trong hàng đợi.
- Nút lưu vẫn bị khóa vì chưa nhập khóa quản trị và chưa xác nhận rà soát; không lưu biểu mẫu, không ghi DB, không gọi Gemini.

## Tác động và giới hạn

Tác động được xác nhận là giảm tìm kiếm thủ công giữa các ô gợi ý và ô ưu tiên. Chưa đo thời gian thực tế của admin; 23/29 ô trên P70 vẫn cần ưu tiên đối soát. Đây là cải thiện điều hướng, không phải giảm số trường cần kiểm tra hoặc tăng độ chính xác nhận diện.

## Tiếp theo

Tiếp tục phân loại các nguyên nhân cảnh báo theo kết quả holdout độc lập; chỉ giảm mức ưu tiên khi có bằng chứng tọa độ/nhãn lặp lại trên nhiều biểu mẫu và giữ nguyên yêu cầu phê duyệt thủ công. Đo thời gian đối soát trước/sau trên tác vụ mô phỏng để xác nhận lợi ích UX.
