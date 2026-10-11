# Checkpoint nhận diện biểu mẫu — 10/10/2026, chặng 37

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`. Toàn bộ thay đổi chặng 14–37 còn local/chưa commit; không reset/clean/stash/push. Không dùng Dely theo yêu cầu người dùng.
- Đọc `CHOICE-QUESTION-AND-SIGNING-DATE.md` và checkpoint chặng 36. Tập khai sinh là development; `.development.*.json` và `.blind-baseline.*.json` ở `private-documents/recognition-evaluation/` đều ignored, baseline cũ giữ nguyên.
- `src/modules/forms/services/form-region-recognition.ts`: `checkboxQuestion` gắn câu hỏi vào Có/Không/Nam/Nữ theo OCR và vị trí; `inferSigningDateParts` gắn ba ô ngày ký chỉ khi có đủ bộ ba và `Làm tại:`. Hai loại suy luận giữ provenance và `needs_review`. Unit ở `src/modules/forms/tests/form-region-recognition.test.ts`, browser hồi quy ở `tests/browser/form-recognition.spec.ts`.
- Phôi khai sinh: 29 field, 29 nhãn, 29 review; 29/29 vùng khớp IoU≥0,5, 0 FP toàn trang, 23 nhãn exact. Đây **không** là nghiệm thu độc lập. F19 checkbox nay `Giới tính — Nam/Nữ`; các nhãn khác vẫn có lỗi OCR.
- Recognition **68/68**, Voice **19/19**, browser opt-in đầy đủ **16/16**, typecheck/build PASS, diff-check sạch. Sau build đã restart Next `:3001`, admin 200, citizen smoke **1/1**, VietOCR `:8000` ready. Không dùng DB thật/Gemini/cloud/audio cache trong test.
- Tiếp theo: phôi trắng mới chú giải độc lập toàn trang, cải thiện OCR chữ sai có bằng chứng nhiều mẫu, rồi staging admin→ACTIVE→citizen/Voice và DB/RLS. Mục tiêu tổng thể còn đang thực hiện.
