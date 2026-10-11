# Chặng 9 — Ô tích chữ in bên trái trên phôi TK01

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Chỉ dùng hai ảnh phôi trắng tại máy; không gửi cloud, không lưu DB.

## Lỗi được xác nhận

Hai ô chọn loại hộ chiếu của TK01 có viền khoảng 38 × 26 px (tỉ lệ rộng/cao ≈ 1.46), vượt ngưỡng 1.33 nên OpenCV bỏ sót. OCR đặt chữ lựa chọn **bên trái** ô, đôi lúc bbox chữ chồng nhẹ lên ô. Logic cũ chỉ tìm chữ bên phải; ô giới tính đầu còn bị ghép nhầm `1 Nữ` thay cho `Nam`.

`checkbox-detector.ts` nay chấp nhận tỉ lệ tới 1.6, nhưng với ô rộng hơn 1.33 còn yêu cầu vùng giữa đủ rỗng trên binary mask. Điều này giữ hai ô chip thật và loại một nét chữ hình chữ nhật bị nhầm thành ô ở CT01. `form-region-recognition.ts` ưu tiên khối OCR sát bên trái ô; chỉ dùng chữ bên phải nếu chưa có nhãn khác. Phần sau dấu hai chấm và ký hiệu ô OCR đơn lẻ được tách để có `Nam`, `Nữ`, không dùng nguyên prompt `Giới tính: Nam` hoặc `1 Nữ`.

## Kết quả quan sát

| Phôi / chỉ số | Trước chặng | Sau chặng |
| --- | ---: | ---: |
| TK01, field được đề xuất | 29 | 31 |
| TK01, field có nhãn | 5 | 8 |
| TK01, bốn ô giới tính/chip có nhãn đúng | 0/4 (một ô bị gắn sai `1 Nữ`) | 4/4 |
| CT01, field / field có nhãn | 71 / 51 | 71 / 51 |
| CT01, ô bảng đúng nguyên văn | 45/45 | 45/45 |

TK01 vẫn còn 23 field chưa nhãn và **3 checkbox chưa nhãn**, nhiều khả năng gồm nét chữ/đồ họa; không được coi kết quả trên bốn ô mục tiêu là precision toàn biểu mẫu. Trạng thái review TK01 là 30/31 field. Bài browser phôi thật kiểm tra nhãn bốn ô, vị trí hai ô chip và không có request lưu/sinh prompt; CT01 phải giữ 71 field.

## Kiểm chứng

- Python OCR unit của chặng trước 25/25 (không đổi Python ở chặng này).
- Recognition unit/integration 41/41; OpenCV 54/54.
- Browser phôi thật 2/2; browser mặc định 11/11 với `IMAGE_VOICE_TEST_URL=http://127.0.0.1:3001`.
- TypeScript, production build riêng (`AFL_BUILD_DIR=.next-recognition-build`) và `git diff --check` PASS.

## Giới hạn và bước kế

Ngưỡng vùng giữa rỗng 0.15 dành cho **phôi chưa tích** và chưa được hiệu chuẩn trên ô đã đánh dấu, ảnh mờ hoặc méo; chỉ nới tỉ lệ cho ứng viên có pixel mask. Không được tự phê duyệt từ heuristic này. Cần annotation độc lập các ô thật/giả trên nhiều mẫu trắng, kiểm tra cả ô tích không vuông và ô có dấu; đo precision/recall theo loại. Song song, xử lý nhãn trường nhập bị phân mảnh ở TK01, vùng đồ họa/ảnh/QR và contract đa trang/PDF trên bộ holdout riêng.
