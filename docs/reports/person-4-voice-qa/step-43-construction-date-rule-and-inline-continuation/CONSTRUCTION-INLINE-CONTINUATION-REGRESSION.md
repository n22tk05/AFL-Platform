# Chặng 43 — Gạch ngày trang trí và ô chấm bị tách đoạn

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Dùng trang 59 phụ lục biểu mẫu xây dựng từ nguồn Chính phủ như **tập phát triển sau baseline mù**, không sửa fixture hay baseline. PDF này chỉ là benchmark bố cục lịch sử, không khẳng định hiệu lực pháp lý hiện tại.

## Sửa và kiểm soát hồi quy

- Một gạch đơn nằm ngay dưới dòng `ngày... tháng... năm..` trước đây thành ô nhập `Văn bản số`. Quy tắc mới chỉ loại gạch `underline` ngắn, nằm gọn và sát đáy dòng ngày có đủ ba thành phần; lưu evidence `DECORATIVE_DATE_UNDERLINE`. Gạch nhập bên cạnh nhãn `Ngày sinh:` vẫn được giữ.
- Hai đoạn chấm trên cùng hàng của ô `Đại diện cho` trước đây thành hai trường, đoạn thứ hai mất nhãn. Nay nối thành một trường có **hai `inputRegions` riêng**, không tô một hình chữ nhật bao trùm. Chỉ nối hai `dotted` guide không ngắn, khoảng cách ≤3% bề ngang, không có OCR xen giữa, và trường trước vẫn là **một dòng đơn**.
- Lần chạy đầu của quy tắc nối đã gộp nhầm ô cột phải vào trường nhiều dòng trên biểu mẫu kết hôn. Browser regression bắt được 6 thay vì ≥8 trường có actor scope. Điều kiện một dòng đơn và test âm hai cột khắc phục; kết hôn trở lại 26 TP, 21 nhãn chính xác, 15 continuation và 9 nhóm đúng.
- Benchmark trường nay đo hợp của các `inputRegions` **liền nhau trên cùng hàng** khi so với một span chú giải; trường nhiều dòng vẫn dùng vùng đầu và kiểm continuation riêng. Baseline mù không có trường đa vùng, nên kết quả đã lưu không đổi. Không sửa chú giải để khớp output.

## Đo trên phôi xây dựng

| Chỉ số, IoU ≥0,5 | Baseline mù chặng 41 | Chặng 42 | Chặng 43 |
| --- | ---: | ---: | ---: |
| Vùng/trường pipeline sinh | 26 | 23 | **21** |
| TP / FN / FP | 20 / 9 / 6 | 20 / 9 / 3 | **20 / 9 / 1** |
| Nhãn ngữ cảnh đúng trên TP | 1/20 | 1/20 | **2/20** |
| Trường cần review | 25 | 22 | **20** |

FP còn lại là một contour vuông giả trong câu, hiện không có nhãn và vẫn ở trạng thái `needs_review`. Chín FN gồm các ô chấm ngắn ở phần đầu và trong câu; chưa xử lý vì bật quy tắc chấm ngắn không có OCR neo đã từng tăng FP ở các biểu mẫu khác. Kết quả này **chưa đủ** để admin duyệt tự động.

## Kiểm chứng

- Recognition **82/82**, Voice **19/19**, TypeScript và Next build PASS; `git diff --check` exit 0 (chỉ có cảnh báo CRLF trên Windows).
- Browser opt-in đầy đủ **18/18 PASS** sau sửa hồi quy: F19/F20/F14, CT01, F05, Quảng Trị, khai sinh, kết hôn, xây dựng, admin/citizen. `:3001/admin/library` HTTP 200, VietOCR `:8000/health` ready.
- Browser suite chặn endpoint ghi asset/model, không dùng DB thật, Gemini thật, thông tin công dân hay audio cache. Fixture SHA-256 `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`; baseline benchmark SHA-256 `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`, đều nguyên vẹn.

## Tiếp theo

1. Bổ sung bằng chứng OCR cho chấm ngắn trong câu rồi kiểm đồng thời trên holdout và các mẫu hồi quy, không tạo field từ dấu câu đơn lẻ.
2. Kiểm contour vuông giả với ngữ cảnh chữ in/checkbox thật trên nguồn độc lập trước khi thêm quy tắc loại trừ; giữ evidence cho admin khi còn nghi vấn.
3. Tìm thêm holdout độc lập có checkbox và nhiều dòng, rồi kiểm staging admin review → ACTIVE → citizen/Voice và DB/RLS trong môi trường tách biệt.
