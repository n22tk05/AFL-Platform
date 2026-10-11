# Checkpoint sau chặng lọc OCR và trường cùng hàng — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`. Working tree còn toàn bộ step-14/15/16/17 **chưa commit**; không reset/clean/stash/merge/push. Không dùng Dely theo lựa chọn trước của người dùng.
- Đọc `../step-16-real-form-benchmark/RESUME-CHECKPOINT.md`, rồi `OCR-EVIDENCE-AND-INLINE-FIELDS.md` trong thư mục này. Step-15/16 là mốc lịch sử, không sửa báo cáo cũ để che kết quả trước.
- Code vừa đổi: `services/vietocr-service/text_layout.py`, `services/vietocr-service/app.py`, `src/modules/forms/services/form-region-recognition.ts`; test Python, form recognition và browser opt-in. OCR local đã restart bằng code mới ở cổng 8000 trong phiên này; Next dev cổng 3001. Lần sau xác minh `/health` và port/PID, đừng giả định tiến trình còn sống.
- Kết quả phôi thật cuối lượt: TK01 OCR 62 dòng, 29 field/5 nhãn; CT01 OCR 36 dòng, 71 field/51 nhãn, 45 table cell, hai dãy 12 ô, ngày sinh một step 4 vùng. Không đo precision/recall vì chưa có ground truth; chưa đủ để tự phê duyệt.
- Test: Python 22/22; recognition 40/40; OpenCV 54/54; documents 153/153; browser thật opt-in 2/2; browser mặc định 11/11; TypeScript và build PASS. `git diff --check` cần kiểm tra lại nếu có sửa tiếp.
- Ưu tiên tiếp: ground truth/holdout; detector QR/ảnh/dấu trước OCR; word-level label grounding; contract đa trang/PDF; DB staging transaction test. Không gọi cloud trên các mẫu đã điền, không ghi DB production để tạo lỗi.
