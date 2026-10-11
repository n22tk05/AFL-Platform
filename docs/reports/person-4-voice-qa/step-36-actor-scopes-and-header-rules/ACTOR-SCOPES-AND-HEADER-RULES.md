# Chặng 36 — Chủ thể của trường và đường kẻ trang trí

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Mẫu khai sinh trang 70 Công báo TP.HCM là **tập phát triển**, không còn là holdout mù kể từ chặng 35. Không gọi Gemini, không ghi cơ sở dữ liệu hoặc xuất bản biểu mẫu trong lượt đo này.

## Quy tắc và bằng chứng

- Từ các heading OCR `người yêu cầu`, `người mẹ`, `người cha` và phần `người được khai sinh`, bộ nhận diện gắn chủ thể cho nhãn chung như `Năm sinh`, `Dân tộc`, `Quốc tịch`, `Nơi cư trú`. Chỉ áp dụng cho trường chữ trong khoảng dọc giới hạn, ngừng qua heading phần khác; giữ `sourceBlockIds`, `ACTOR_SCOPE_INFERRED` và `needs_review`. Không coi suy luận này là sự xác nhận của cán bộ.
- Nhãn OCR `- Quốc tịch` được bỏ ký hiệu đầu trước khi xét chủ thể. `có L` cạnh ô vuông được chuẩn hóa thành lựa chọn `Có`; vị trí suy ra từ OCR vẫn cần review. Chưa tự gắn ngữ cảnh câu hỏi `Đề nghị cấp bản sao` cho cả hai checkbox.
- Cặp underline liền chồng nhau bị phân loại `PAIRED_DECORATIVE_RULE` ở cả đầu và cuối trang. Trước sửa, hai gạch ở đầu trang còn tạo hai field không nhãn và nằm ngoài cửa sổ tính false positive của benchmark; nay đã có assertion riêng.
- Ba tọa độ chú giải tay cho ngày/tháng/năm ký được đối chiếu lại trực tiếp trên ảnh 1450×2052 rồi sửa trong fixture. Đây là sửa **ground truth**, không phải cải thiện detector. Bản benchmark mù cũ được giữ nguyên để truy vết và không so trực tiếp tỷ lệ IoU qua hai phiên bản chú giải.

## Kết quả tập phát triển

| Chỉ số trên phôi khai sinh | Hiện tại |
| --- | ---: |
| Ô được sinh | 29 |
| Ô có nhãn | 26/29 |
| Ô được đánh dấu cần review | 29/29 |
| Vùng khớp chú giải sửa lại với IoU ≥ 0,5 | 29/29 |
| Dự đoán không khớp trong toàn trang | 0 |
| Nhãn khớp nguyên văn trên vùng khớp | 18/29 |

Hai gạch đầu trang và hai gạch cuối trang không còn là ô nhập; ba vùng ngày ký đã hiện rõ nhưng vẫn **không có nhãn**. `29/29` là hồi quy trên một mẫu đã dùng để điều chỉnh thuật toán và chú giải, không chứng minh độ chính xác trên biểu mẫu mới. OCR vẫn đọc sai `đệm` thành `dệm`, `ghi bằng chữ` thành `nghi bằng chữ`; hai checkbox mới có nhãn lựa chọn `Có`/`Không`, chưa có tên câu hỏi đầy đủ. Cán bộ vẫn phải đối soát trước khi duyệt.

## Kiểm chứng

- `npm run test:recognition`: **66/66**; `npm run test:voice`: **19/19**; `npm run typecheck`: PASS.
- Browser opt-in `RECOGNITION_RESEARCH_BLANKS=1`, `RECOGNITION_INDEPENDENT_BLANKS=1`, `RECOGNITION_BIRTH_DEVELOPMENT=1`: **16/16** trên CT01, F05, Quảng Trị và khai sinh; các ca mẫu thật chặn ghi asset/Gemini.
- `npm run build`: PASS, chỉ còn cảnh báo `<img>` đã biết tại modal upload. Sau build, dev server cũ có bundle lỗi khiến một smoke test fail; restart server `:3001` và chạy lại smoke test: **1/1 PASS**, `/admin/library` trả 200. `git diff --check` không có lỗi whitespace (chỉ cảnh báo LF/CRLF của Git).

## Tiếp theo

1. Nối nhãn checkbox với câu hỏi in cùng hàng bằng bằng chứng hình học và OCR; phải giữ trạng thái review khi chỉ suy luận được.
2. Gắn `ngày`, `tháng`, `năm` cho ba vùng ký còn trống; xử lý OCR sai ký tự ở nhãn bằng quy tắc có kiểm chứng, tránh hardcode một phôi.
3. Lấy phôi trắng **chưa dùng để chỉnh quy tắc** và chú giải độc lập; báo cáo TP/FP/FN, nhãn và IoU trên toàn trang, không loại vùng tiêu đề khỏi phép đếm.
4. Chạy staging tách biệt admin review → ACTIVE → citizen FE/Voice, kiểm quyền DB/RLS và rollback; không dùng dữ liệu công dân thật.
