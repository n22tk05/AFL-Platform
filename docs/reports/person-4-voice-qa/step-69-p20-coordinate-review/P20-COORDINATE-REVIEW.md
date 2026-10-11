# Step 69 — P20 coordinate review and signature-guide suppression

## Mục tiêu chặng

Giảm một ô cần admin đối soát không thuộc luồng nhập liệu công dân, đồng thời giữ nguyên các ô trống thực sự và kiểm tra lại qua màn hình `/admin/upload`.

## Thay đổi

- Bộ nhận diện loại dòng chấm ngay dưới chỉ dẫn ký rõ ràng như “(Ký, ghi rõ họ, chữ đệm, tên)” thành `static_text` với lý do `SIGNATURE_GUIDE_NOT_CITIZEN_INPUT`, không đưa vào danh sách ô cần nhập.
- Chỉ áp dụng khi candidate là một dòng `writing_guide`, không có nhãn, nằm ngay dưới vùng chỉ dẫn ký, cách không quá 7.5% chiều cao trang và phủ ngang tối thiểu 75% chỉ dẫn. Dòng nhập thông thường không có ngữ cảnh ký tiếp tục được giữ lại.
- Điều chỉnh dòng viết phần tình trạng hôn nhân xuống thấp hơn nhãn theo khoảng cách giữa các hàng trên phôi; vẫn gắn cờ cần review vì tọa độ suy diễn.
- Sửa tọa độ ground truth `signing_day`: loại chữ in “ngày” khỏi vùng trống, theo đúng phạm vi annotation ban đầu.

## Kết quả kiểm chứng P20

- Tải lại bản build và chạy lại upload trên UI local bằng phôi trắng `hcmc-holdout-p20.png`; không lưu phôi, không gọi Gemini và không ghi database.
- Trước lọc chữ ký: 30 ô, 25 ô ưu tiên review. Sau lọc: **29 ô, 24 ô ưu tiên review**.
- So với ground truth đã hiệu chỉnh phạm vi: **29/29 true positives, 0 false positives, 0 false negatives, 29/29 nhãn chính xác, 15/15 vùng continuation đúng** tại ngưỡng IoU ≥ 0.5.
- 24 ô còn ưu tiên review vẫn là các trường hợp có bằng chứng suy diễn như phạm vi nhiều dòng/cột, phần ngày hoặc checkbox; không tự hạ mức review chỉ vì một mẫu đạt metric tốt.
- Dòng ký được lưu như vùng tĩnh bị loại, không thành ô nhập hay cảnh báo cho admin.

## Test và giới hạn

- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts`: **72/72 passed**, gồm positive test cho vùng ký và negative test bảo vệ dòng nhập thường.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run build`: passed; còn các lint warnings có sẵn về `<img>` và dependency `useMemo`.
- Kiểm thử browser `/admin/upload` qua VietOCR hoàn tất; kết quả được tải xuống từ UI và đối chiếu với fixture độc lập. Browser benchmark test có thêm assertion cho vùng ký bị loại.
- Regression browser P20 chạy lại thành công: `1 passed` sau khi cập nhật test từ modal thư viện cũ sang trang `/admin/upload` hiện tại. Test chặn API ghi tài sản/kịch bản và không lưu phôi.
- Kết quả chỉ chứng minh mẫu holdout P20 này; chưa chứng minh giảm tải tổng quát qua các loại biểu mẫu hoặc ảnh chụp camera. 24/29 trường vẫn cần review do pipeline cố ý bảo thủ. Cần đo thời gian admin và xác nhận trên holdout khác trước khi thay đổi độ ưu tiên review.
