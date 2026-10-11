# Khôi phục phạm vi người yêu cầu khi OCR mất dấu hai chấm

**Phạm vi:** các trường Nơi cư trú và Giấy tờ tùy thân ngay dưới tiêu đề người yêu cầu trên phôi trắng P20. Không lưu biểu mẫu thử, không gọi Gemini, không ghi database.

## Thay đổi

- Cho phép tiêu đề `Họ, chữ đệm, tên người yêu cầu` làm neo phạm vi khi OCR bỏ dấu `:` ở cuối.
- Giữ điều kiện lân cận và chặn qua tiêu đề section như trước; các nhãn con được mở rộng thành `Nơi cư trú người yêu cầu` và `Giấy tờ tùy thân người yêu cầu`.
- Gắn `ACTOR_SCOPE_INFERRED` nên cả hai vẫn là trường ưu tiên đối soát; không tự xác nhận scope.

## Kiểm chứng

- Test tổng hợp có OCR mất dấu `:` xác nhận cả hai nhãn người yêu cầu; test scope hai cột trước đó vẫn giữ.
- P20 sau build mới: 30 trường; giao diện hiển thị hai nhãn được mở rộng.
- So khớp one-to-one IoU ≥ 0,5 trên 29 GT: 26 TP / 4 FP / 3 FN; số nhãn khớp chính xác trong các cặp khớp tăng 20 → 22 sau khi bổ sung hai scope. Tổng cảnh báo UI là 23 vì hai scope suy luận cần đối soát.
- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 67/67.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS; các cảnh báo `<img>` / `useMemo` vẫn còn ở phần không liên quan.

## Giới hạn

- P20 vẫn còn 3 FN theo ngưỡng IoU ≥ 0,5: một trường tình trạng hôn nhân và một trường ngày ký ở sát ngưỡng, cùng checkbox “Không” có bbox lệch rõ hơn. Còn 4 FP; cần đối chiếu hình học từng vùng trước khi quyết định loại hay điều chỉnh.
- Chưa đo thời gian admin thực tế. Kết quả cho thấy khớp nhãn tốt hơn nhưng cảnh báo vẫn tăng do bắt buộc kiểm tra scope suy luận.
