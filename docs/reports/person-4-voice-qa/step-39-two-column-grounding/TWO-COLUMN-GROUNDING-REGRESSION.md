# Chặng 39 — Ghép chủ thể hai cột và giữ trường nhiều dòng

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Trang 20 **Tờ khai ghi chú kết hôn** chuyển từ holdout mù chặng 38 sang tập phát triển. Các file `.blind-baseline.*.json` không bị ghi đè; các lượt sau ghi `.development.*.json`.

## Quy tắc chung đã sửa

- Câu `Đề nghị cơ quan ... sau đây/dưới đây:` được nhận là heading/hướng dẫn tĩnh, không làm anchor cho ô nhập kế tiếp. Ngăn tên bên nữ bị đọc thành lời đề nghị của cơ quan.
- `Họ, chữ đệm, tên bên nữ/nam` không có dấu `:` vẫn là anchor khi có vùng viết bên cạnh. Khi cả hai tiêu đề OCR nằm cùng hàng, trường chữ lặp ở hai cột được gắn `bên nữ` hoặc `bên nam` theo vị trí cột; bổ sung `sourceBlockIds`, `COLUMN_ACTOR_SCOPE_INFERRED` và bắt buộc `needs_review`. Một tiêu đề đơn lẻ không đủ để suy diễn cột.
- OCR chú dẫn `C3)` sau dấu `:` được chuẩn hóa như chú dẫn khả nghi, giữ nhãn sạch nhưng đánh dấu `LABEL_POSITION_ESTIMATED`. Không sửa văn bản nguồn OCR. Dòng viết thứ hai lệch ngang vừa phải có thể ghép vào cùng field với `SHIFTED_MULTILINE_CONTINUATION` và review.
- Chữ in như `cấp ngày...` nằm bên trái guide mới chặn việc tiếp tục field phía trên. Nếu OCR chưa đủ để phân tích nhãn mới, field để trống với `INLINE_LABEL_UNPARSED`, không xóa nhãn field trước. Unit test bắt được trường hợp ghép nhầm ngày cấp vào địa điểm đăng ký.
- Khi mở rộng danh sách lý do review, test đã phát hiện `OPEN_BOTTOM_ROW_INFERRED` bị bỏ sót; điều kiện này được khôi phục. Không cho ô cuối bảng suy luận tự chuyển sang `suggested`.

## Đo trước/sau trên tập phát triển

| Chỉ số trang kết hôn | Baseline mù chặng 38 | Sau sửa chặng 39 |
| --- | ---: | ---: |
| Ô sinh | 28 | **27** |
| TP / FN / FP, IoU ≥0,5 toàn trang | 23 / 6 / 5 | **23 / 6 / 4** |
| Ô có nhãn | 20 | **21** |
| Nhãn khớp nguyên văn trên 23 TP | 4 | **16** |
| Dòng tiếp nối khớp | 13/15 | **15/15** |
| Trường nhiều dòng đủ số và vị trí | 6/9 | **9/9** |

Đây là **so sánh phát triển với baseline đã khóa**, không phải kết quả holdout mới. Hình học chính vẫn chỉ 23/29 theo chú giải; sáu FN gồm tháng cấp, một vùng tình trạng hôn nhân, ba ô ngày ký và checkbox `Không`. Một phần có thể do chú giải thủ công lệch/tách khác cách detector tách; không sửa fixture theo output. Còn OCR gộp `tháng - năm`, gộp dòng ngày ký và đọc sai câu hỏi bản sao; phải đối soát trước khi phát hành.

## Kiểm chứng

- `npm run test:recognition`: **71/71**; `npm run test:voice`: **19/19**; TypeScript và build PASS.
- Browser opt-in đầy đủ với F19, CT01, F05, Quảng Trị, khai sinh và kết hôn: **17/17**. Trang kết hôn khóa tối thiểu 23 TP, ≤4 FP, ≥16 nhãn exact, 15 dòng tiếp nối và 9 nhóm nhiều dòng; mọi nhãn suy luận cột cần review.
- Sau build, restart Next dev `:3001`; `/admin/library` trả 200, VietOCR `:8000` ready và citizen smoke **1/1 PASS**. Build còn cảnh báo `<img>` đã biết tại modal upload. Test chặn ghi asset/Gemini; chưa dùng DB thật hoặc audio cache.

## Tiếp theo

1. Rà ảnh và candidate OpenCV ở sáu FN/bốn FP, nhất là tháng cấp, ba ngày ký, `Không` và guide gần chữ ký; phân biệt sai số chú giải với lỗi nhận diện trước khi đổi hình học.
2. Lấy phôi trắng thứ hai **chưa từng dùng để chỉnh thuật toán** để đánh giá độc lập nhãn, loại trường, IoU và nhóm nhiều dòng; không dùng thành tích chặng 39 làm nghiệm thu.
3. Kiểm thử staging admin review → ACTIVE → citizen FE/Voice và quyền DB/RLS trong môi trường tách biệt, không đưa dữ liệu công dân thật vào thử nghiệm.
