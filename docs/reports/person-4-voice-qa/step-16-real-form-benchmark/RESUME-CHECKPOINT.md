# Checkpoint sau benchmark phôi trắng — 09/10/2026

## Trạng thái

- Branch `codex/form-recognition-and-multiline`, toàn bộ thay đổi step-15 và step-16 còn **uncommitted**. Không reset/clean/stash; không commit/push/merge nếu người dùng chưa yêu cầu. Không dùng Dely theo lựa chọn của người dùng.
- Đọc `../step-15-form-recognition-development/RESUME-CHECKPOINT.md` để có kiến trúc và lịch sử trước, rồi đọc `REAL-BLANK-FORM-BENCHMARK.md` trong thư mục này để có phép đo mới. Báo cáo step-15 giữ nguyên như mốc lịch sử.
- Next dev `http://127.0.0.1:3001` và VietOCR `http://127.0.0.1:8000` chạy trong phiên kiểm thử; lần sau kiểm tra lại `/health` và trang admin, không giả định PID/session còn sống.
- Không đổi Prisma schema/DB thật, không gọi Gemini/TTS cloud, không phê duyệt biểu mẫu nghiên cứu. Hai ảnh phôi trắng và evidence nằm trong `private-documents/`, bị Git ignore; có các mẫu **đã điền** khác trong cùng thư mục nghiên cứu, không gửi cloud.

## Mốc kỹ thuật vừa đạt

- Test browser opt-in dùng OCR local + OpenCV thật trên F19/TK01 và F20/CT01. TK01 từ 54/1 xuống 32/5 (vùng/nhãn); CT01 từ 90/5 xuống 75/48. Những con số này chỉ là số đề xuất, chưa là precision/recall.
- CT01 nhận 45 ô bảng cho 9 hàng × 5 cột và hai dãy định danh 12 ô có nhãn. TK01 loại 8 candidate QR, giữ một dãy 12 ô và một trường 2 dòng. Không có request ghi DB/AI trong benchmark.
- Hình học và ngữ nghĩa sửa ở `src/modules/opencv/geometric-sort.ts`, `src/modules/forms/services/form-region-recognition.ts`; UI xuất JSON đối soát tại `src/components/admin/FormUploadModal.tsx`; test opt-in ở `tests/browser/form-recognition.spec.ts`.
- Recognition 39/39, OpenCV 54/54, Documents 153/153, Forms API 12/12, Voice client 19/19, Python 19/19, browser mặc định 11/11, browser phôi thật 2/2, TS và build PASS ngày 09/10/2026. Không cộng các bộ test thành tỷ lệ nghiệm thu.

## Việc kế tiếp theo ưu tiên

1. Gán ground truth cho ít nhất hai ảnh đang có và thêm 10–20 phôi trắng đa dạng; đo field precision/recall, IoU, CER, số sửa tay. Hiện TK01 27 vùng chưa nhãn, CT01 27 vùng chưa nhãn; cả hai chưa đủ điều kiện tự publish.
2. Tách QR/ảnh/dấu trước OCR, giảm chữ ảo trong ô ký tự và bảng, cải thiện word-level label grounding rồi so sánh trước/sau trên tập holdout.
3. Chốt contract đa trang/PDF với Tech Lead và FE; làm từng trang bất biến, pageNumber xuyên pipeline, editor/citizen đổi trang và atomic publish. Không giải bằng localStorage.
4. Thử transaction/rollback/concurrency trên DB staging riêng; không dùng DB production để tạo lỗi cố ý.

Lệnh benchmark nằm trong `REAL-BLANK-FORM-BENCHMARK.md`. Kiểm tra `git status --short` trước bất kỳ sửa tiếp nào vì working tree cũng chứa step-14 nghiên cứu chưa tracked.
