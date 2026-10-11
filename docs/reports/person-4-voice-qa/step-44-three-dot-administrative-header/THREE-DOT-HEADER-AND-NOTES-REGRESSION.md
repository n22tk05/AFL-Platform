# Chặng 44 — Ô ba chấm ở đầu văn bản và trang chú thích

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Tiếp tục trên **tập phát triển** trang 59 phôi xây dựng Chính phủ, giữ nguyên chú giải 29 vùng và baseline mù. PDF được dùng để kiểm bố cục lịch sử, không xác nhận hiệu lực pháp lý hiện tại.

## Bằng chứng và sửa thuật toán

- Kiểm binary OpenCV của ảnh thật cho thấy ô `Văn bản số` có ba chấm x≈704, 714, 723; dòng ngày có bốn cụm ba chấm x≈490–510, 595–615, 694–713, 776–796. Bộ dò cũ bỏ mọi cụm dưới năm chấm, nên không thể tạo candidate cho cả năm ô.
- Bộ dò nay giữ ba/bốn dấu tròn có khoảng cách đều, đủ chiều dài; nếu một dấu câu chen vào cụm bốn thì xét ba dấu liên tiếp đều nhau. Tất cả được gắn `shortGuide`, không tự coi là input.
- Lớp ngữ nghĩa chỉ đưa guide ngắn vào manifest khi OCR cho thấy dòng `Văn bản số:` sát ngay trên dòng `ngày... tháng... năm..` và hình học cùng hàng. Bốn vùng ở dòng ngày nhận nhãn suy luận `Nơi lập văn bản`, `Ngày lập`, `Tháng lập`, `Năm lập`; ô số lấy nhãn in. Mỗi vùng mang `SHORT_GUIDE_GEOMETRY_REVIEW`, trạng thái `needs_review` và provenance OCR. Guide ngắn thiếu ngữ cảnh vẫn lưu evidence `SHORT_GUIDE_WITHOUT_DATE_CONTEXT` nhưng không tạo ô.
- Lượt hồi quy đầu làm trang F20-p2 chỉ chứa chú thích phát sinh bốn ô và làm CT01 hai trang có ô thừa ở trang 2. Nguyên nhân: guard trang chú thích coi **mọi** `writing_guide`, kể cả dấu ba chấm không có OCR neo, là bằng chứng nhập liệu. Guard nay chỉ coi guide dài hoặc guide ngắn có ngữ cảnh OCR là bằng chứng; test âm trang chú thích có dấu ba chấm được bổ sung. Không hạ ngưỡng test để che hồi quy.

## Kết quả ảnh xây dựng

| Chỉ số, IoU ≥0,5 | Baseline mù chặng 41 | Chặng 43 | Chặng 44 |
| --- | ---: | ---: | ---: |
| Trường pipeline sinh | 26 | 21 | **26** |
| TP / FN / FP | 20 / 9 / 6 | 20 / 9 / 1 | **25 / 4 / 1** |
| Nhãn ngữ cảnh khớp trên TP | 1/20 | 2/20 | **7/25** |
| Trường cần review | 25 | 20 | **25** |

Năm ô đầu trang đều đạt IoU ≥0,5, nhãn đúng và vẫn cần review. `Năm lập` chỉ đạt IoU ≈0,502: không tính là bằng chứng độ chính xác cao ngoài ngưỡng này. Bốn FN còn lại là `work_description`, `term_from`, `term_to`, `request_department_suffix`; đoạn OCR liên quan bị nhập thành một dòng ký tự/số lỗi với confidence thấp hoặc mất chữ, nên chưa có ngữ cảnh đủ tin cậy để tự suy nhãn. FP còn lại là contour vuông giả trong câu, không có nhãn và vẫn `needs_review`.

## Kiểm chứng

- Unit bổ sung ba chấm đều/dấu câu chen, năm ô có OCR neo và ca không có header, trang chú thích có dấu ba chấm. Recognition **84/84**, Voice **19/19**, TypeScript và Next build PASS.
- Browser opt-in toàn bộ **18/18 PASS** sau khi sửa hai hồi quy trang chú thích: F19/F20/F14, CT01, F05, Quảng Trị, khai sinh, kết hôn, xây dựng, admin/citizen. Test xây dựng khóa ≥25 TP, ≤1 FP, ≥7 nhãn đúng, cả năm nhãn đầu trang và `needs_review`.
- `/admin/library` tại `:3001` HTTP 200; VietOCR `:8000/health` ready. Browser suite chặn asset/model writes, không dùng DB thật, Gemini thật, thông tin công dân hay audio cache. Fixture SHA-256 `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`, baseline benchmark SHA-256 `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`, đều không đổi.

## Tiếp theo

1. Cần OCR bố cục từ dòng văn bản bị nhập sai để định vị bốn ô trong câu mà không lấy dấu câu làm trường nhập; đo độc lập trên phôi khác trước khi áp dụng.
2. Kiểm contour vuông giả so với checkbox thật; không loại theo kích thước chung vì có thể mất checkbox hợp lệ.
3. Bổ sung holdout độc lập có checkbox/multiline, sau đó chạy staging admin review → ACTIVE → citizen/Voice và DB/RLS ở môi trường tách biệt.
