# Chặng 37 — Ngữ cảnh câu hỏi checkbox và ngày ký

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Tiếp tục từ checkpoint chặng 36; phôi khai sinh trang 70 TP.HCM vẫn là **tập phát triển**, không dùng để tuyên bố nghiệm thu độc lập. Không gọi Gemini, ghi DB thật hay xuất bản biểu mẫu.

## Thay đổi

- Checkbox `Có/Không/Nam/Nữ` có thể nhận phần câu hỏi in cùng khối OCR hoặc ở khối liền trước cùng hàng. Nhãn được ghép như `Đề nghị cấp bản sao — Có/Không` hoặc `Giới tính — Nam/Nữ`; bỏ chú dẫn `(6)` và số mục đầu dòng (kể cả `-2.`). Chỉ mượn câu hỏi khi có dấu `:`, lựa chọn sau dấu này hợp lệ, vị trí đủ gần; lưu cả hai `sourceBlockIds` và `CHECKBOX_QUESTION_SCOPE_INFERRED`, buộc `needs_review`.
- Ba guide ngày/tháng/năm cùng hàng với `Làm tại:` được gắn `Ngày ký`, `Tháng ký`, `Năm ký` khi cả ba mảnh OCR, ba guide và vị trí cùng khớp. Thiếu `Làm tại:` hoặc thiếu bộ ba thì để trống thay vì tự đoán. Các nhãn suy ra mang `DATE_PART_SCOPE_INFERRED`, provenance và `needs_review`.
- Bổ sung unit test dương/âm cho bộ ba ngày ký, test hai checkbox dùng chung câu hỏi, cập nhật hồi quy F19 từ nhãn lựa chọn đơn lẻ sang nhãn có ngữ cảnh, và khóa cả năm nhãn mới trong ca browser khai sinh.

## Đo trên tập phát triển

| Chỉ số phôi khai sinh | Chặng 36 | Chặng 37 |
| --- | ---: | ---: |
| Ô sinh ra | 29 | **29** |
| Ô có nhãn | 26 | **29** |
| Ô cần review | 29 | **29** |
| Vùng khớp IoU ≥0,5 theo fixture đã sửa | 29/29 | **29/29** |
| Dự đoán chưa khớp toàn trang | 0 | **0** |
| Nhãn khớp nguyên văn | 18/29 | **23/29** |

Tăng năm nhãn khớp nguyên văn đến từ ba ngày ký và hai checkbox; detector hình học không đổi trong chặng này. Kết quả là hồi quy trên mẫu đã tune, không phải precision/recall độc lập. OCR vẫn sai `đệm`→`dệm`, `ghi`→`nghi` ở một số vùng; còn sáu nhãn không khớp nguyên văn và toàn bộ 29 ô vẫn cần cán bộ xác minh trước khi duyệt.

## Kiểm chứng

- `npm run test:recognition`: **68/68**; `npm run test:voice`: **19/19**; `npm run typecheck` và `npm run build`: PASS.
- Browser opt-in đầy đủ trên F19, CT01, F05, Quảng Trị và khai sinh: **16/16**. Một lượt đầu gặp kỳ vọng F19 cũ (`Nam/Nữ`); sau cập nhật quy tắc bỏ `-2.` và kỳ vọng nhãn có câu hỏi, chạy riêng F19 rồi chạy lại toàn bộ đều PASS. Các ca phôi thật chặn ghi asset/Gemini.
- Sau build, restart Next dev `:3001`; `/admin/library` trả 200, VietOCR `:8000/health` ready, smoke test citizen **1/1 PASS**. `git diff --check` không phát hiện lỗi whitespace.

## Tiếp theo

1. Đo một phôi trắng mới chưa dùng để chỉnh quy tắc, chú giải độc lập và đếm TP/FP/FN trên **toàn trang**; đối chiếu nhãn và kiểu trường, không chỉ hình học.
2. Cải thiện OCR ký tự sai trên nhiều mẫu bằng bằng chứng và ngưỡng tin cậy, không thay chữ mù theo một phôi.
3. Chạy staging tách biệt admin review → ACTIVE → citizen FE/Voice với DB/RLS và rollback; xác nhận nhãn checkbox có ngữ cảnh được đọc đúng, không đọc dữ liệu cá nhân thật.
