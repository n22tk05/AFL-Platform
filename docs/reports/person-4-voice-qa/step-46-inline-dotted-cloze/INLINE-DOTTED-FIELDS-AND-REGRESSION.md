# Chặng 46 — Ghép dấu chấm ngắn trong câu với OCR

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Trang 59 phôi xây dựng Chính phủ là **tập phát triển sau baseline mù**, không phải holdout mới. Không đổi fixture 29 vùng hoặc benchmark mù đã khóa.

## Sửa nhận diện

- OpenCV trước đây bỏ dãy sáu chấm của trường `term_from` vì một khoảng in rộng 17 px làm độ lệch khoảng cách vượt ngưỡng. Bộ dò nay cho phép **đúng một** khoảng rộng 1,45–1,9 lần trung vị trong dãy 6–7 chấm; các khoảng còn lại phải gần trung vị. Ngưỡng của dãy khác không đổi.
- Bộ ghép OCR chỉ xét dòng có confidence ≥0,6, tối đa 10 đoạn chấm, loại dòng ngày hành chính và loại cấu trúc tĩnh. Số đoạn chấm OCR phải bằng số guide chấm cùng dòng theo hình học; guide ngắn lấy nhãn từ cụm chữ ngay trước nó. Trường hợp `Thời gian từ/đến` và `Công việc` dùng quy tắc cụ thể, các cụm khác chỉ giữ tối đa ba từ. Chuỗi dấu câu như `v.v...` không đủ làm nhãn.
- Bốn trường mới được gắn `INLINE_DOTTED_SLOT_INFERRED` và `SHORT_GUIDE_GEOMETRY_REVIEW`, luôn `needs_review`; không tự công bố `ACTIVE`. Thiếu cặp OCR/guide một-một thì guide vẫn `unresolved`.

## Kết quả phôi xây dựng

| Chỉ số, IoU ≥0,5 | Chặng 45 | Chặng 46 |
| --- | ---: | ---: |
| TP / FN / FP | 25 / 4 / 0 | **29 / 0 / 0** |
| Nhãn khớp chính xác trên TP | 7/25 | **9/29** |
| Trường có nhãn | Chưa chốt số liệu | **23/29** |
| Trường cần đối soát | 24 | **28** |

`work_description`, `term_from`, `term_to`, `request_department_suffix` nay có vùng đúng theo benchmark. Nhãn dự đoán lần lượt là `Công việc`, `Thời gian từ`, `Thời gian đến`, `Sở Xây dựng`; chỉ hai nhãn thời gian khớp chính xác. Độ khớp vùng không đồng nghĩa đủ ngữ cảnh hướng dẫn: 20/29 nhãn vẫn chưa khớp chính xác, 28/29 trường còn cần người duyệt. Không dùng kết quả phát triển này để tuyên bố độ chính xác trên mẫu mới.

## Kiểm chứng

- Unit nhận diện **86/86**, Voice **19/19**, Python OCR **36/36** bằng `.venv` của dịch vụ; `npm run typecheck`, `npm run build` và `git diff --check` đều qua. Build còn cảnh báo `<img>` đã có ở `FormUploadModal.tsx`, không chặn build.
- Browser opt-in trên ảnh thật: lượt toàn bộ **17/18 PASS**; F19-p5 chờ `/api/documents/json` quá 180 giây và bị timeout khi UI vẫn ở trạng thái `Đang xử lý`. Chạy lại riêng F19-p5 **1/1 PASS trong 34 giây**. Chưa xác định nguyên nhân lượt chậm, vì vậy không báo toàn bộ 18/18 là một lượt sạch. Trang xây dựng qua và khóa 29 TP/0 FP, 9 nhãn chính xác cùng bốn trường mới ở `needs_review`.
- Test âm tính: thiếu guide tương ứng không suy diễn trường; dấu câu không thành nhãn. Các ca F20 notes-only, CT01, F05, Quảng Trị, khai sinh, kết hôn và admin/citizen không báo hồi quy ở lượt toàn bộ.
- Browser chặn các thao tác ghi asset/model, không dùng DB thật, Gemini thật hoặc audio cache. Fixture SHA-256 `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`; benchmark mù SHA-256 `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`, không đổi.

## Chưa xong

1. Thêm holdout độc lập có guide chấm ngắn trong câu, checkbox và multiline, gồm bản scan khác độ phân giải; đánh giá precision/recall và chất lượng nhãn trước khi thay đổi ngưỡng tiếp.
2. Điều tra vì sao F19-p5 đôi lúc vượt 180 giây: đo thời gian phân đoạn, số crop, thời gian infer và request; đặt ngân sách/thông báo lỗi rõ ràng thay vì tăng timeout mù.
3. Kiểm thử staging admin review → `ACTIVE` → citizen/Voice trên DB riêng, xác nhận RLS/quyền truy cập; bộ browser hiện tại chưa chứng minh quy trình dữ liệu thật.
