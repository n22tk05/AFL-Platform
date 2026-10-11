# Chặng 34 — Baseline mù trên phôi khai sinh khác họ

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Dùng trang 70 của [Công báo TP.HCM số 246+247 ngày 01/10/2023](https://congbao.hochiminhcity.gov.vn/DKC.MFiles.CB/Gazette/DownLoadFileResult/45874): **Tờ khai đăng ký khai sinh trống**, có nhiều dòng chấm, ba nhóm người yêu cầu/trẻ/mẹ/cha, ngày ký và hai ô chọn cấp bản sao. Đây là nguồn thử OCR, không kết luận mẫu còn hiệu lực pháp lý.

PDF và PNG ở `private-documents/recognition-evaluation/` (ignored). Chú giải thủ công 29 vùng tại `tests/fixtures/recognition-hcmc-birth-p70-ground-truth.json` được ghi **trước lần chạy đầu**. Browser test chỉ phân tích và tải JSON đối soát, chặn ghi asset/Gemini; không dùng dữ liệu công dân hoặc DB thật. Lần chạy đầu bị kẹt ở thao tác mở modal vì Next dev dùng bundle cũ sau build; restart Next và chạy lại thành công. Không phải lỗi OCR.

## Kết quả chưa chỉnh thuật toán

- Pipeline tạo 33 field, 20 có nhãn, 31 cần review. Theo matching một-một với IoU ≥0,5 trên chú giải, **26/29 vùng khớp**, 7 nhãn khớp nguyên văn, 20 vùng khớp có nhãn không rỗng.
- Ba FN và ba trong năm FP được tính tại cụm ngày/tháng/năm ký. Ảnh cho thấy có ba guide thật tại đây; chú giải tay đặt lệch ngang so với guide dự đoán, nên **không được suy diễn ba FN là thiếu phát hiện thật**. Cần rà lại chú giải bằng ảnh phóng to trước khi dùng các số này để tính precision/recall.
- Hai FP còn lại là cặp gạch ngang liền, sát nhau ở cuối tờ khai, phía trên dòng chọn cấp bản sao. Chúng không phải chỗ viết nhưng bị nhận là hai `writing_guide` không nhãn.
- Cả hai ô chọn Có/Không đúng hình học; chữ đọc cho chúng là `có L` và `Không`, cần admin sửa. Các trường cùng hàng của mẹ/cha bị mượn nhãn hàng xóm hoặc trùng nhãn: `Năm sinh` của mẹ trống, `Năm sinh` của cha bị gắn `Dân tộc`; `Dân tộc` lại thiếu nhãn. OCR có đọc được chữ `Dân tộc`, nhưng gán anchor sai. Nhãn `Nơi cư trú` lặp lại không ghi rõ chủ thể trong raw OCR; không tự suy người mẹ/cha để phát Voice.

## Bằng chứng và giới hạn

`HCMC-BIRTH-P70.holdout.ocr.json`, `.draft.json`, `.benchmark.json` nằm trong thư mục ignored để đối soát. Kết quả này là baseline trước sửa; từ khi dùng mẫu để phân tích quy tắc, nó sẽ thành tập phát triển/hồi quy, không được coi là holdout độc lập cho phiên bản đã chỉnh. `7/26` exact label là so với nhãn ngữ nghĩa có chủ thể trong chú giải; không phải CER OCR vì văn bản in trên phôi không luôn ghi chủ thể ngay tại field.

Chặng tiếp theo: sửa quy tắc chung cho anchor cùng hàng, gạch phân cách đôi; thêm test tổng hợp và chạy lại các mẫu phát triển. Sau đó cần **phôi trắng mới chưa dùng chỉnh quy tắc** để kiểm chứng độc lập.
