# Chặng 42 — Loại viền scan sát mép trang

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Trang phôi xây dựng độc lập từ chặng 41 được dùng làm **tập phát triển sau baseline mù**. Fixture 29 vùng và các file `.blind-baseline.*.json` không đổi; benchmark baseline vẫn có SHA-256 `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`, fixture `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`.

## Sửa quy tắc

Ứng dụng trên ảnh scan trước đây xem hai dải đen ở đỉnh và một dải ở đáy thành ô nhập. `form-region-recognition.ts` giờ chỉ loại candidate rộng (≥20% chiều ngang), chạm đúng mép trái, đồng thời nằm trong 1,5% sát **đỉnh** hoặc 1,5% sát **đáy** trang. Candidate được giữ trong evidence với vai trò `static_text` và lý do `PAGE_EDGE_SCAN_ARTIFACT`, không biến mất khỏi chẩn đoán. Test âm bảo đảm vùng viết rộng gần mép nhưng không chạm mép vẫn còn và yêu cầu review.

## Đo trước/sau

| Chỉ số trên trang PDF 59 | Baseline mù chặng 41 | Phát triển chặng 42 |
| --- | ---: | ---: |
| Vùng pipeline sinh | 26 | **23** |
| TP / FN / FP, IoU ≥0,5 | 20 / 9 / 6 | **20 / 9 / 3** |
| Nhãn ngữ cảnh khớp trên TP | 1/20 | **1/20** |
| Vùng cần review | 25 | **22** |

Đây là giảm đúng ba FP viền trang, **không** phải tăng khả năng nhận biết các ô còn thiếu. Ba FP còn lại là một gạch trang trí gắn nhãn `Văn bản số`, một vùng trùng nhãn `Đại diện cho`, và một contour vuông giả giữa câu. Chín FN chủ yếu là các đoạn chấm ngắn/chèn trong câu. Nhãn ngữ cảnh 1/20 vẫn chưa đủ để phê duyệt biểu mẫu; các vùng suy đoán tiếp tục `needs_review`.

## Kiểm chứng

- Test đơn vị thêm ca viền đỉnh/đáy bị loại và ca vùng gần mép không bị loại. `npm run test:recognition` **77/77**, `npm run test:voice` **19/19**, TypeScript/build PASS.
- Browser opt-in đầy đủ **18/18 PASS**: F19, F20, F14, CT01, F05, Quảng Trị, khai sinh, kết hôn, phôi xây dựng, admin và citizen. Test xây dựng phát triển khóa tối thiểu 20 TP, tối đa 3 FP và ít nhất ba evidence `PAGE_EDGE_SCAN_ARTIFACT`; blind baseline không thể bị ghi đè qua cùng cờ môi trường.
- Build tạm làm Next dev đang chạy trả HTTP 500; sau khi khởi động lại, `/admin/library` HTTP 200, VietOCR `:8000/health` ready và citizen smoke 1/1 PASS. Cảnh báo `<img>` cũ vẫn còn. Suite browser chặn asset/model writes, không dùng DB thật, dữ liệu cá nhân hoặc audio cache.

## Tiếp theo

1. Nhận diện ô chấm ngắn trong câu bằng bằng chứng OCR nhãn sát bên mà không mở rộng thành checkbox/field giả; phải đo lại trên phôi xây dựng và toàn bộ hồi quy.
2. Xử lý riêng gạch trang trí dưới phần ngày, vùng `Đại diện cho` trùng và contour vuông giả; không dùng ngưỡng hình học bao quát làm mất checkbox thật.
3. Bổ sung holdout khác có bảng, checkbox và multiline; trang xây dựng 59 không có những loại này. Sau đó staging admin review → ACTIVE → FE/Voice và kiểm tra DB/RLS trên môi trường tách biệt.
