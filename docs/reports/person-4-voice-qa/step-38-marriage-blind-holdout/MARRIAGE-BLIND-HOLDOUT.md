# Chặng 38 — Baseline mù hai cột, nhiều dòng

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Dùng trang 20 của [Công báo TP.HCM số 246+247](https://congbao.hochiminhcity.gov.vn/DKC.MFiles.CB/Gazette/DownLoadFileResult/45874), **Tờ khai ghi chú kết hôn**. Trang này chưa từng dùng để chỉnh quy tắc trước lượt đo. Ảnh 1447×2047 được render từ PDF công khai; không có thông tin công dân thật.

## Phương pháp

- Đánh dấu thủ công 29 ô nhập/chọn trên ảnh gốc **trước** khi gọi pipeline; chín trường có tổng 15 dòng tiếp nối. Fixture `tests/fixtures/recognition-hcmc-marriage-p20-ground-truth.json` ghi vùng chính, vùng tiếp nối, nhãn kỳ vọng và phạm vi loại trừ chữ in/ghi chú/chữ ký/đường trang trí.
- Chạy UI admin `/admin/library` với phôi trắng, OpenCV và VietOCR local, chặn API ghi asset và Gemini. Benchmark ghép một-một theo loại trường và IoU ≥0,5 của vùng chính; đếm false positive trên **toàn trang**, không cắt phần đầu/cuối như thước đo khai sinh cũ. Dòng tiếp nối chỉ đạt khi IoU riêng ≥0,5 và thuộc đúng field đã ghép.
- Lưu đầu ra mù vào `private-documents/recognition-evaluation/HCMC-MARRIAGE-P20.blind-baseline.{ocr,draft,benchmark}.json` (ignored). SHA-256 của benchmark: `BEAA45BC0DB0424673B67CC0C7BFB24B31E79F50B49A7ED13C7C84FCB822DE23`. Sau khi đo, đổi browser opt-in sang `RECOGNITION_MARRIAGE_DEVELOPMENT` và đầu ra `.development.*` để không ghi đè baseline.

## Kết quả chưa chỉnh theo mẫu

| Chỉ số | Baseline mù |
| --- | ---: |
| Ô kỳ vọng / ô sinh | 29 / 28 |
| TP / FN / FP theo IoU ≥0,5 | **23 / 6 / 5** |
| Ô sinh có nhãn / cần review | 20 / 27 |
| Nhãn khớp nguyên văn trên 23 TP | **4** |
| TP có nhãn không rỗng | 19/23 |
| Dòng tiếp nối khớp riêng | 13/15 |
| Trường nhiều dòng khớp đủ số và vị trí dòng | 6/9 |

Sáu FN theo phép đo nghiêm ngặt: tháng cấp, nội dung tình trạng hôn nhân, ngày/tháng/năm ký, checkbox `Không`. Năm FP gồm guide tách ở hàng số đăng ký, hai guide quanh nội dung tình trạng hôn nhân, checkbox `Không` lệch chú giải và một guide khu chữ ký. Một số cặp FN/FP có thể là sai lệch chú giải thủ công hoặc tách trường, **không được tự sửa fixture dựa trên dự đoán**; cần kiểm ảnh độc lập trước khi kết luận detector bỏ sót.

## Nguyên nhân quan sát được

- Heading `Đề nghị cơ quan ghi vào sổ việc kết hôn sau đây:` bị mượn làm nhãn cho ô tên bên nữ và ghép thừa ba vùng; nhãn OCR `Họ, chữ đệm, tên bên nữ` không có dấu `:` nên chưa trở thành anchor.
- Hai cột nữ/nam lặp `Ngày, tháng, năm sinh`, `Dân tộc`, `Quốc tịch`, `Nơi cư trú`, `Giấy tờ tùy thân`; hình học phần lớn tìm đúng nhưng nhãn chưa mang chủ thể, gây 4/23 nhãn exact. Ô nam `Giấy tờ tùy thân` còn lỗi OCR `C3)`.
- Dòng `cấp ngày... tháng - năm`, dòng ngày ký và câu hỏi bản sao bị OCR gộp/sai ký tự; quy tắc ký ngày chặng 37 không chạy khi ba mảnh OCR không độc lập. Không nên thay bằng nhãn đoán chắc chắn; cần provenance và review.
- Các vùng nhiều dòng của cư trú và giấy tờ hai bên được giữ khá tốt (13/15 dòng tiếp nối); ba trường ghép chưa đủ là tên bên nữ, tên bên nam và địa điểm đăng ký, nên cần sửa anchor/ghép vùng thay vì thay detector toàn cục.

## Hướng tiếp theo

1. Giữ bản mù này bất biến, dùng bản `.development.*` cho thay đổi tiếp theo. Thử quy tắc chung: heading `...sau đây` không là nhãn nhập; tên chủ thể `bên nữ/bên nam` không dấu `:` tạo anchor và phạm vi theo cột, luôn `needs_review` khi suy luận.
2. Điều tra hai vùng nhiều dòng chưa khớp và các FN/FP bằng ảnh, OCR và candidate OpenCV; phân biệt lỗi chú giải với lỗi detector trước khi sửa.
3. Sau điều chỉnh, chọn **một phôi khác chưa tune** để kiểm độc lập lần nữa; không dùng kết quả phát triển của trang 20 làm nghiệm thu tổng thể.
