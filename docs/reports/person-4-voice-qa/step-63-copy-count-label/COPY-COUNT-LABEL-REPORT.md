# Khôi phục nhãn “Số lượng bản sao” từ hai block OCR

**Phạm vi:** dòng số lượng bản sao trên holdout trắng P20. Không lưu phôi, không gọi Gemini, không ghi database.

## Thay đổi

- VietOCR thật tách `Số lượng.` và `bản` thành hai block riêng trên cùng một hàng; dấu chấm viết bị rơi nên bộ tách dotted-slot cũ không gán nhãn.
- Ghép hai block khi chúng cùng hàng và gần nhau; chỉ gán guide viết nằm giữa hai block thành `Số lượng bản sao`.
- Giữ `LABEL_POSITION_ESTIMATED` để admin đối soát; guide không tương quan phía dưới không bị gán nhãn.

## Kiểm chứng

- Test tổng hợp mô phỏng hai block OCR và guide ở giữa: PASS; guide khác hàng không bị gán nhãn.
- `/admin/upload` sau build production hiển thị ô #29 `Số lượng bản sao`; tổng 30 trường, 23 trường ưu tiên đối soát.
- So khớp one-to-one IoU ≥ 0,5 với 29 GT P20: 26 TP / 4 FP / 3 FN; 23/26 cặp khớp có nhãn chính xác. Nhãn `copy_count` nay khớp GT.
- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 68/68.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS; còn cảnh báo lint không liên quan ở các trang khác.

## Giới hạn

- Chưa giảm số trường/cảnh báo ở chặng này, chỉ giảm thao tác đặt nhãn thủ công cho một trường.
- P20 vẫn còn 4 FP / 3 FN theo ngưỡng IoU cứng; hai vùng gần ngưỡng là marital history (0,495) và ngày ký (0,484), checkbox “Không” còn lệch bbox đáng kể, và một guide dưới vùng ký cần phân loại theo chính sách chữ ký.
- Chưa đo thời gian admin hoặc nghiệm thu đa cán bộ. Đây là bằng chứng cục bộ theo một holdout, không phải hoàn tất tối ưu tổng thể.
