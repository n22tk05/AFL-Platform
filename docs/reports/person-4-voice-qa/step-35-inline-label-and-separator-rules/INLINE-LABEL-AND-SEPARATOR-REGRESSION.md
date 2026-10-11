# Chặng 35 — Nhãn cùng hàng và gạch phân cách giả

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Dùng baseline mù chặng 34 của trang khai sinh TP.HCM **chỉ làm tập phát triển/hồi quy** sau khi đã lưu bản trước sửa trong `private-documents/recognition-evaluation/HCMC-BIRTH-P70.blind-baseline.*.json` (ignored). Không dùng mẫu này để tuyên bố nghiệm thu độc lập sau điều chỉnh.

## Sửa quy tắc chung

- Nhãn in `Năm sinh:(5)` hoặc `Năm sinh (5)` được nhận là `Năm sinh`, không gán nhầm guide của nó cho chữ `Dân tộc` nằm ở ô kế bên. Guide cùng hàng không mượn anchor bắt đầu ở bên phải xa của chính guide.
- Các nhãn cùng chữ xuất hiện ở nhiều vị trí (ví dụ `Năm sinh`, `Dân tộc`, `Nơi cư trú`) được gắn `REPEATED_LABEL_SCOPE_REVIEW`; chưa tự đoán đó là người yêu cầu, mẹ hay cha. Admin phải đối soát ngữ cảnh trước khi công bố/đọc Voice.
- Hai underline liền dài, gần như đồng vị trí và chồng nhau ở cuối phôi được phân loại `PAIRED_DECORATIVE_RULE`, không thành ô nhập. Test giữ một underline nhập liệu có nhãn độc lập và một guide chấm thật.
- Trên CT01, hai mảnh của cùng vùng Email nay ghép thành một field với hai `inputRegions`, thay vì hai field không nhãn. Bảng 45 ô, hai trường 12 ô ký tự và trang ghi chú 0 field vẫn giữ nguyên.

## Đo trước/sau trên phôi khai sinh

| Chỉ số | Baseline chặng 34 | Sau sửa |
| --- | ---: | ---: |
| Tổng field | 33 | **31** |
| Field có nhãn | 20 | **26** |
| Field cần review | 31 | **29** |
| Khớp chú giải tay với IoU ≥0,5 | 26/29 | **26/29** |
| Nhãn khớp nguyên văn ở 26 vùng khớp | 7 | **9** |
| Dự đoán chưa khớp chú giải | 5 | **3** |

Hai dự đoán sai thực sự của cặp gạch phân cách đã biến mất. Ba dự đoán còn lại ở ngày/tháng/năm ký là guide thấy được trên ảnh nhưng chú giải tay lệch ngang; không gọi đó là FP chắc chắn, và không lấy 26/29 để tính precision/recall cuối cùng. Nhãn năm sinh/dân tộc của mẹ và cha nay đúng chữ cơ bản, nhưng raw label vẫn **chưa có chủ thể**. Hai checkbox Có/Không đúng vị trí, song OCR `có L` còn sai. Độ đúng nguyên văn này so với nhãn ngữ nghĩa, không phải CER độc lập của VietOCR.

## Kiểm chứng

- Unit/integration recognition **64/64**, trong đó có test nhãn chú dẫn và hai gạch liền; browser opt-in đầy đủ **16/16** trên CT01, F05, Quảng Trị và phôi khai sinh. Browser chặn ghi asset/Gemini cho các ca mẫu thật.
- `npm run test:voice`, `npm run typecheck`, `npm run build`, `git diff --check` đều PASS. Build còn cảnh báo `<img>` đã biết ở modal; Git nhắc LF/CRLF nhưng không có lỗi whitespace.
- Sau build đã restart Next dev `:3001`; `/admin/library` trả 200, VietOCR `:8000 /health` ready. Chưa dùng database thật hoặc xuất bản workflow mới.

## Việc tiếp theo

1. Đối soát chú giải ngày ký bằng ảnh phóng to và tách chỉ số hình học thật khỏi sai số chú giải; không dùng chính mẫu này làm holdout mới.
2. Bổ sung ngữ cảnh chủ thể mẹ/cha/trẻ một cách có bằng chứng, không tự suy từ nhãn lặp; ưu tiên trạng thái review khi không chứng minh được. Cải thiện OCR cho `Có/Không` và header dài mà không hardcode một mẫu.
3. Chọn phôi trắng **chưa từng dùng chỉnh quy tắc** để đánh giá độc lập TP/FP/FN, CER/nhãn và IoU. Sau đó chạy staging admin duyệt → ACTIVE → citizen FE/Voice và quyền DB/RLS trên môi trường thử nghiệm tách biệt.
