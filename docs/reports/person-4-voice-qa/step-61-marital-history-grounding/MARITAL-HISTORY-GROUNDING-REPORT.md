# Neo nhãn trường tình trạng hôn nhân theo văn bản kê khai

**Phạm vi:** câu “Trước khi kết hôn lần này...” trên holdout trắng P20. Không lưu biểu mẫu thử, không gọi Gemini, không ghi database và không sử dụng dữ liệu công dân.

## Thay đổi và bằng chứng

- Ghép nhãn `Tình trạng hôn nhân trước lần kết hôn này` với guide viết rộng ngay dưới đoạn OCR tương ứng.
- Chỉ áp dụng khi có câu mở đầu đặc trưng, guide có bề rộng ít nhất 0,5 trang, nằm sát dưới đoạn in và phủ ngang cùng vùng văn bản. Guide ngắn ở ngay dưới không bị gán chung.
- Giữ `LABEL_POSITION_ESTIMATED` để admin vẫn phải đối soát; không tự xác nhận trường.
- Giao diện production local sau build mới gán nhãn đúng cho ô #22; ô #23 ngắn hơn phía dưới vẫn chưa gán nhãn và tiếp tục được cảnh báo.
- Chạy hồi quy trực tiếp với holdout độc lập P59: pipeline vẫn trả 29 trường, không bị quy tắc đặc thù hôn nhân tác động. Đây mới là kiểm tra số lượng trên UI, không thay cho so khớp chi tiết toàn trang.
- P20 ban đầu có một vùng ngắn chưa gán nhãn kết thúc đúng tại đầu OCR “Tôi cam đoan những nội dung khai trên”. Quy tắc chỉ loại vùng này khi có cả câu khai tình trạng hôn nhân và câu cam đoan, vùng ngắn, phủ ngang OCR cam đoan và kết thúc trùng mép trên block đó. Nó được lưu trong diagnostics với vai trò `static_text` và lý do `DECLARATION_ADJACENT_GUIDE`.
- So khớp one-to-one IoU ≥ 0,5 với 29 GT trước/sau bộ lọc: 26 TP / 5 FP / 3 FN → 26 TP / 4 FP / 3 FN. Số trường giảm 31 → 30, cảnh báo UI giảm 22 → 21; đây là một false candidate ít hơn mà không làm giảm TP.
- Hai vùng được gán nhãn đúng vẫn hơi dưới ngưỡng IoU: `marital_history` 0,495 và `signing_day` 0,484; chúng là near-miss hình học, không nên tính là ô sai thực tế chỉ theo ngưỡng nhị phân.

## Kiểm thử

- Test tổng hợp: dòng rộng sát dưới câu khai nhận nhãn; guide ngắn bên dưới vẫn để trống.
- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 66/66.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS; giữ nguyên cảnh báo `<img>` / `useMemo` ngoài phạm vi.
- P20 sau bộ lọc: 30 trường, 21 trường cần chú ý; không lưu. P59 trên bản build trước thay đổi bộ lọc đặc thù: 29 trường, 23 trường cần chú ý; không lưu.

## Còn lại

- P20 còn 4 FP và 3 FN theo ghép ngưỡng nghiêm; trong đó một số là near-miss hình học hoặc checkbox có nhãn đúng nhưng bbox sai, cần phân loại riêng.
- Chưa có số liệu tiết kiệm thời gian thao tác admin; giảm tải hiện có bằng chứng là một false candidate ít hơn và các nhãn cục bộ được khôi phục, không phải phép đo thời gian tổng thể.
