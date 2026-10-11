# Chặng 45 — Tách crop OCR nhiều dòng trên ảnh trang

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Dùng trang 59 phôi xây dựng Chính phủ làm **tập phát triển sau baseline mù**, không sửa fixture 29 vùng hay benchmark gốc. PDF là benchmark bố cục lịch sử, không xác nhận hiệu lực pháp lý hiện tại.

## Nguyên nhân và sửa pipeline

- VietOCR mặc định đưa cả vùng x≈158–1132, y≈733–878 (145 px, chứa bốn dòng văn bản) vào **một** crop. Model trả `0361000000099`, confidence ≈0,29; phần “công việc”, “trong thời gian từ…đến…” biến mất khỏi OCR. Đây là lỗi phân đoạn trước model, không thể sửa bằng cách gán nhãn từ chuỗi số đó.
- Hàm `split_multiline_region` đã có sẵn và unit test riêng nhưng chỉ dùng cho một số crop bảng. Đo offline trên cùng ảnh cho thấy khi bật trên ảnh trang, vùng cao được tách thành bốn crop y≈733–780, 770–813, 803–848, 838–878. Model đọc các dòng với confidence lần lượt ≈0,93; 0,884; 0,92; 0,679, trong đó giữ được “thực hiện công việc” và “trong thời gian từ…đến…”.
- Hai nhánh request ảnh trang (`image` và `lines` gồm một trang) nay gọi `segment_document_lines(..., split_multiline=True)`. Crop dòng tường minh vẫn đi thẳng tới model; không tự chia dữ liệu do caller chỉ định. Test route khẳng định cả ba trường hợp. Trang trống vẫn không gọi model.
- OCR mới nhận diện chữ in bao quanh contour vuông giả, nên luật `PRINTED_STRUCTURE_ARTIFACT` hiện có loại nó thay vì sinh checkbox. Không thêm ngưỡng kích thước có nguy cơ mất checkbox thật. Một số crop nhỏ trùng dòng lớn (`án.`, `tại`) vẫn tồn tại; hồi quy hiện không thấy box dư từ chúng, nhưng cần tiếp tục đối soát OCR reading order.

## Kết quả trên phôi xây dựng

| Chỉ số, IoU ≥0,5 | Chặng 44 | Chặng 45 |
| --- | ---: | ---: |
| Trường pipeline sinh | 26 | **25** |
| TP / FN / FP | 25 / 4 / 1 | **25 / 4 / 0** |
| Nhãn ngữ cảnh khớp trên TP | 7/25 | **7/25** |
| Trường cần review | 25 | **24** |

Đây là cải thiện OCR và loại một FP, **chưa** thu hồi bốn FN. `work_description`, `term_to`, `request_department_suffix` nay có candidate chấm ngắn đúng gần vùng nhưng vẫn bị guard ngữ cảnh giữ ở `unresolved`; `term_from` chưa có candidate tương ứng. Không bật mọi dấu chấm trong câu thành input vì đã gây FP trên phôi khác. Kịch bản admin vẫn phải đối soát các trường mơ hồ.

## Kiểm chứng

- Python OCR unit **36/36**, recognition **84/84**, Voice **19/19**, TypeScript và Next build PASS.
- Browser opt-in **18/18 PASS** sau khi nạp lại VietOCR/Next: F19/F20/F14, CT01, F05, Quảng Trị, khai sinh, kết hôn, xây dựng, admin/citizen. Test xây dựng yêu cầu OCR có “trong thời gian từ” và “thực hiện công việc”, không còn crop văn bản cao quá 6% trang ở đoạn này, cùng **25 TP/4 FN/0 FP**.
- `/admin/library` tại `:3001` HTTP 200; VietOCR `:8000/health` ready. Lượt browser đầu tiên bị kẹt trước OCR vì Next dev trả HTTP 500 sau build; khởi động lại Next và chạy lại đã qua. Browser suite chặn asset/model writes, không dùng DB thật, Gemini thật, dữ liệu công dân hoặc audio cache.
- Fixture SHA-256 `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`; benchmark mù SHA-256 `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`, đều không đổi.

## Tiếp theo

1. Thiết kế ghép guide ngắn trong câu với token OCR sát bên (`công việc`, `từ`, `đến`, `Sở Xây dựng`) dựa trên hình học và review, đo FP trên F20/CT01/Quảng Trị trước khi giữ. Tìm nguyên nhân OpenCV bỏ `term_from`.
2. Đối soát crop OCR trùng/reading order và thêm holdout độc lập có checkbox, multiline, bản scan khác để tránh overfit trang xây dựng.
3. Chạy staging admin review → ACTIVE → citizen/Voice và kiểm tra DB/RLS trong môi trường tách biệt; bộ browser hiện chỉ là kiểm thử local không ghi dữ liệu.
