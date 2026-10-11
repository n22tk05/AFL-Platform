# Đánh giá độ tin cậy và tải đối soát ở bước tạo phôi

**Phạm vi:** `/admin/upload`, nhận diện trên phôi trắng. Không lưu biểu mẫu kiểm thử, không gọi Gemini, không ghi database và không dùng dữ liệu công dân.

## Kết quả đo OCR

Các bộ chấm dùng ground truth đã khóa trước; CER/WER bỏ dấu câu và dãy chấm viết nhưng giữ nguyên từ in sẵn. Bản development và blind baseline dùng cùng ảnh khi so sánh.

| Biểu mẫu holdout | Bản blind CER / WER | Bản development CER / WER | Nhận xét |
| --- | ---: | ---: | --- |
| Nghị định 175/2024, đơn đề nghị cấp giấy phép xây dựng, tr. 59 | 31,40% / 32,73% | 5,81% / 6,55% | Cải thiện rõ; vẫn còn lỗi cần sửa trước khi tự tin dùng nội dung OCR làm nhãn. |
| Nghị định 175/2024, giấy ủy quyền, tr. 61 | 6,98% / 8,94% | 6,98% / 8,94% | OCR không đổi, nhưng vùng/nhãn nhận diện cải thiện mạnh theo benchmark bên dưới. |
| Biểu mẫu trợ cấp mai táng Hải Phòng, tr. 7 | 15,83% / 17,27% ở lần đầu | 1,58% / 2,52% | Cải thiện sau tách crop nhiều dòng; một trang, không đại diện tổng thể. |

### Đối chiếu vùng nhập với baseline

| Holdout | TP / FP / FN blind → development | Nhãn chính xác blind → development | Ghi chú |
| --- | ---: | ---: | --- |
| Giấy ủy quyền P61 | 10 / 4 / 10 → 20 / 0 / 0 | 1/9 → 9/20 | Bỏ 4 vùng dư và tìm đủ vùng đúng; nhãn còn 11/20 chưa khớp tuyệt đối. |
| Đơn xây dựng P59 | 20 / 6 / 9 → 29 / 0 / 0 | 1/12 → 9/23 | Loại 6 vùng dư, khôi phục 9 vùng thiếu; còn nhãn cần đối soát. |
| Khai sinh P70 | 26 / 5 / 3 → 29 / 0 / 0 | 7/20 → 23/29 | Loại 5 vùng dư, khôi phục 3 vùng thiếu và cải thiện nhãn. |
| Đăng ký kết hôn P20 | 23 / 5 / 6 → 26 / 5 / 3 | 4/19 → 21/24 | Tìm thêm 3 vùng đúng và cải thiện nhãn; vẫn còn 5 FP, chưa đạt tiêu chí không có vùng dư. |

## Bằng chứng tải đối soát

- Benchmark vùng development cải thiện TP/FP/FN trên cả bốn holdout; ba holdout giảm FP về 0, holdout kết hôn còn 5 FP. Đây là giảm sửa vùng sai so với bản blind, chưa phải đo thời gian thao tác admin.
- Trên trang tải phôi đang mở, luồng upload cho 38 ô và gắn cảnh báo 38/38. Ô tĩnh “Kính gửi” đã không còn thành trường nhập liệu sau sửa nhận diện trước đó.
- Trong bốn bản OCR development lưu hiện có, tỷ lệ block OCR dưới ngưỡng 0,93 lần lượt là 20/24, 37/43, 36/40 và 32/38. Ngưỡng hiện tại vì thế đánh dấu gần như toàn bộ trang; chưa có calibration cho thấy nó tách tốt trường sai khỏi trường đúng.
- Một số tệp benchmark được tạo trước lần chạy giao diện mới nhất. Chúng là bằng chứng phát triển/holdout, không phải kiểm định thống kê trên bộ 20 mẫu độc lập.

## Thay đổi trong chặng này

- Bộ chấm văn bản OCR nhận được cả response một trang lẫn mảng response đa trang có thứ tự. Nếu một trang lỗi hoặc thiếu `rawText`, evaluator từ chối kết quả thay vì âm thầm chấm thiếu trang.
- Thêm test cho response đa trang, response một trang và lỗi một phần. Giữ nguyên cách tính CER/WER.
- Không nới trạng thái bắt buộc review và không tự duyệt trường nào: ngưỡng confidence chưa được hiệu chỉnh; giảm cảnh báo bằng cách bỏ ngưỡng lúc này có thể khiến lỗi OCR trông như kết quả đáng tin.

## Kiểm thử

- `npx tsx --test src/modules/documents/tests/ocr-text-evaluation.test.ts src/modules/forms/tests/form-region-recognition.test.ts`: PASS, 60/60.
- `npx tsc --noEmit --incremental false`: PASS.
- Chạy evaluator trên các tệp development và blind baseline của tr. 59, tr. 61 và phôi Hải Phòng thành công; response mảng đa trang được đọc đúng thứ tự.
- Kiểm tra giao diện thật trên `http://localhost:3001/admin/upload`: trang vẫn giữ kết quả 38 trường, 38 cảnh báo; không có thay đổi nhận diện trong chặng đo lường này.

## Kết luận và điều kiện giảm tải tiếp theo

Pipeline đã giảm lỗi OCR ở hai holdout văn bản có so sánh và cải thiện so với blind baseline ở cả bốn bộ benchmark vùng. Ba benchmark vùng không còn FP; benchmark kết hôn vẫn còn 5 FP. Tải cảnh báo hiện bị chi phối bởi confidence chưa calibration và nhãn chưa chính xác; chưa an toàn để đổi cảnh báo thành “đạt” hay bỏ bước admin xác nhận. Chưa có phép đo trực tiếp thời gian admin, nên mức giảm khối lượng được chứng minh bằng ít vùng dư/thiếu và nhãn chính xác hơn, không phải bằng phút tiết kiệm.

Chặng tiếp theo cần khóa thêm tập phôi trắng độc lập, gắn ground truth cho text và vùng nhập, ghi lại confidence theo từng block gắn với lỗi thật, sau đó đo precision/recall theo dải confidence. Chỉ khi dải được hiệu chỉnh giữ được recall vùng nhập và không tăng false positive mới được giảm ưu tiên/cảnh báo cho trường phù hợp. Benchmark hôn nhân cần xử lý riêng 5 vùng dư và 3 vùng thiếu trước khi dùng làm tiêu chí chấp nhận.
