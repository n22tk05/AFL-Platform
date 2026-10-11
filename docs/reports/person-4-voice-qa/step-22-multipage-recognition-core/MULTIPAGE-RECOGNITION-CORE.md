# Chặng 11 — Lõi nhận diện biểu mẫu đa trang

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Chặng này **chưa bật upload/lưu/phê duyệt đa trang**; chỉ xây lõi ghép các kết quả OCR/OpenCV của từng ảnh trang thành một bản nháp đối soát. Không gửi ảnh lên cloud hoặc ghi DB trong kiểm thử.

## Thay đổi

- `assembleMultipageReviewDraft` nhận 1–20 trang theo thứ tự 1, 2, …; mỗi trang có kích thước và kết quả OCR/OpenCV trong hệ tọa độ riêng. Nó dùng pipeline một trang hiện có, không trộn tọa độ giữa các trang; ảnh gốc chưa được nhận/lưu bởi hàm này.
- Box, vùng nhập, candidate và nguồn OCR được gắn ID có tiền tố trang; `pageNumber` đi cùng box, input region, bằng chứng và tóm tắt từng trang. Trang chỉ có ghi chú giữ bằng chứng nhưng không tạo field giả. Giới hạn toàn bộ biểu mẫu 200 field.
- Bộ lắp manifest từ OCR một trang nay từ chối metadata/block mang số trang khác 1 thay vì âm thầm mất field.

## Kiểm chứng

| Ca | Kết quả |
| --- | --- |
| Hai trang dùng lại cùng ID OCR và candidate | Box/region/source ID không đụng nhau; box và region gắn đúng trang |
| Trang 2 chỉ ghi chú | Có bằng chứng trang 2, không có bước nhập giả |
| Trang thiếu số, lặp số, kích thước sai hoặc OCR frame sai | Từ chối rõ ràng |
| Bộ nhận diện cục bộ | 46/46 PASS; TypeScript PASS; `git diff --check` PASS (chỉ cảnh báo LF/CRLF) |

## Chưa hoàn thành và rào chắn an toàn

Đây là **bản nháp nhận diện**, không phải manifest đa trang đã lưu được. Validator, artifact store, API upload và FE hiện cố ý còn giới hạn một trang. Prisma `FormGeometricBox` và `WorkflowStep` chưa có cột trang; repository đang khôi phục `pageNumber: 1`, còn Gemini cũng gắn bước vào trang 1. Vì vậy tuyệt đối không mở lưu đa trang chỉ bằng cách nới validator: làm vậy sẽ làm mất ánh xạ trang khi đọc lại hoặc công bố.

## Chặng tiếp

1. Thiết kế migration và hợp đồng dữ liệu cho page number của box/step, kích thước từng trang và các input region có thể nối sang trang kế; kiểm tra RLS/backup trên DB thử nghiệm trước khi đụng dữ liệu thật.
2. Upload từng ảnh trang với asset bất biến và giới hạn tổng dung lượng; xác minh đúng thứ tự, không trùng/thiếu trang. Sau đó cập nhật artifact store, validator, transaction lưu và đọc lại; test DB staging.
3. FE chọn/chuyển trang, chỉnh field và vùng theo trang, giữ trang chỉ ghi chú; Gemini sinh đúng một bước/box với trang lấy từ manifest; citizen/voice tô sáng đúng trang. Test trình duyệt hai trang và phê duyệt âm tính.
4. Lập bộ đo độc lập đa chủ đề cho precision/recall theo loại vùng; các trường mơ hồ phải yêu cầu admin đối soát, không tự duyệt.
