# Chặng 40 — Ô ngày ngắn và kiểm tra hồi quy liên biểu mẫu

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Trang 20 **Tờ khai ghi chú kết hôn** là tập phát triển sau baseline mù chặng 38; không dùng kết quả này như nghiệm thu độc lập. Benchmark baseline `.blind-baseline.benchmark.json` vẫn có SHA-256 `BEAA45BC0DB0424673B67CC0C7BFB24B31E79F50B49A7ED13C7C84FCB822DE23`.

## Vấn đề và thay đổi

- OpenCV trước đây bỏ qua chuỗi 5–7 chấm nên thiếu ô `tháng cấp` và ba ô ngày ký. Bộ dò hiện nhận các chuỗi ngắn có khoảng cách đều, nhưng gắn `shortGuide` để lớp ngữ nghĩa có thể phân biệt chúng với guide dài.
- Chỉ đưa `shortGuide` thành trường nhập khi OCR cùng hàng cho thấy cụm ngày–tháng–năm và nhãn ngữ cảnh tương ứng (`Làm tại:` hoặc `cấp ngày...`). Chuỗi ngắn khác được giữ trong chẩn đoán `SHORT_GUIDE_WITHOUT_DATE_CONTEXT`, không tạo ô nhập. Cách này khắc phục ba hồi quy ô thừa vừa phát hiện trên F20-p1, CT01 và QT-ANTT-01.
- Khi OCR gộp cả cụm ngày vào một dòng, ba guide riêng được gắn `Ngày/Tháng/Năm ký` hoặc `Ngày/Tháng/Năm cấp` theo thứ tự hình học, kèm provenance OCR và `DATE_PART_SCOPE_INFERRED`; toàn bộ vẫn `needs_review`. Guide `tháng cấp` không còn bị ghép vào trường địa điểm đăng ký nhiều dòng; ba guide ký không còn bị ghép vào `Làm tại`.
- Bộ đo ghi thêm `nearMisses` với IoU 0,15–<0,5 để hỗ trợ điều tra, **không** tính chúng là TP và không sửa chú giải gốc. JSON phát triển được xuất trước assertion để còn bằng chứng khi test thất bại.

## Kết quả trang kết hôn

| Chỉ số | Chặng 39 | Chặng 40 |
| --- | ---: | ---: |
| Trường phát hiện | 27 | 31 |
| TP / FN / FP, IoU ≥0,5 | 23 / 6 / 4 | **26 / 3 / 5** |
| Nhãn khớp chính xác trên TP | 16 | **21** |
| Dòng tiếp nối đúng | 15/15 | **15/15** |
| Nhóm nhiều dòng đủ | 9/9 | **9/9** |

Ba FN còn lại có vùng dự đoán gần nhưng dưới ngưỡng: `marital_history` IoU 0,495 (chưa có nhãn), `signing_day` IoU 0,484 (đã có nhãn `Ngày ký`), `copy_no` IoU 0,233 (đã có nhãn `Không`). Đây vẫn là FN+FP theo tiêu chí đã khóa; ảnh gợi ý sai lệch chú giải/vị trí ở một số ô nhưng phải có người đối soát độc lập trước khi đổi fixture. Hai FP khác là một guide ngắn gần phần cam đoan và dòng chấm chữ ký; không tự công bố thành field. Ngưỡng FP của regression tăng từ 4 lên 5 vì guide `Ngày ký` vừa phát hiện vẫn bị tính FP do IoU dưới 0,5; assertion riêng yêu cầu near-miss `Ngày ký` tồn tại, không tăng TP giả.

## Kiểm chứng

- Test đơn vị mới: chuỗi 5–7 chấm đều; chấm thưa không phải guide; date OCR gộp; guide ngắn thiếu ngữ cảnh không sinh ô. Focused 44/44 PASS.
- Bộ trình duyệt opt-in 17/17 PASS với F19/F20/F14, CT01, F05, Quảng Trị, khai sinh, kết hôn, admin/citizen. Lượt đầu bắt được ba hồi quy ô thừa; sau khi thêm guard OCR, cả ba và toàn bộ suite đều PASS. Không ghi asset thật hay gọi Gemini trong suite.
- `npm run test:recognition` **75/75**, `npm run test:voice` **19/19**, TypeScript và build PASS. Build còn cảnh báo `<img>` đã biết trong modal upload, không phải lỗi biên dịch. Sau build, khởi động lại Next `:3001` và VietOCR `:8000`; `/admin/library` HTTP 200, `/health` trả `ready: true`, citizen smoke 1/1 PASS. Không dùng DB thật, audio cache hoặc dữ liệu công dân.

## Chưa hoàn thành

1. Đối soát chú giải ba near-miss bởi người không xem output, nhất là tọa độ ô `Không`; giữ cả chú giải và benchmark hiện tại cho đến lúc xác nhận. Sau đó xử lý nhãn lịch sử hôn nhân và loại dòng chữ ký/cam đoan giả.
2. Đánh giá một phôi trắng mới từ **nguồn/mẫu khác**, chưa dùng để phát triển; đo TP/FN/FP, nhãn, loại trường và multiline trước khi điều chỉnh thuật toán. Đã xem các trang 43/49/89 của cùng Công báo TP.HCM: tuy chưa chạy OCR, chúng cùng họ bố cục/hộ tịch với trang 20 nên không đủ mạnh làm holdout độc lập kế tiếp.
3. Staging admin review → ACTIVE → FE công dân/Voice và kiểm tra DB/RLS trên môi trường tách biệt vẫn chưa chạy; không kết luận quy trình sản xuất đã nghiệm thu.
