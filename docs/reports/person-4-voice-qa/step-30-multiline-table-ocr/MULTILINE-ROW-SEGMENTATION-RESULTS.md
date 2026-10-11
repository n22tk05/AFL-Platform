# Chặng 30 — Tách hai dòng OCR bị dính trong ô bảng

Ngày 10/10/2026. Nhánh `codex/form-recognition-and-multiline`. Test trên phôi trắng F05 local, không dữ liệu công dân, không gọi Gemini/DB hoặc lưu asset. **F05 đã được dùng để phát triển và điều chỉnh thuật toán ở chặng 26–30, nên không còn là holdout độc lập**; số đo dưới đây chỉ là benchmark phát triển.

## Thay đổi

- Trong ô STT/mô tả của lưới bảng đã được xác nhận bằng hình học, contour chữ cao 44–90 px được xét theo mật độ mực ngang. Chỉ tách thành hai crop khi có khe giữa hai cụm mực đủ sâu và mỗi nửa đều có chữ; chừa 2 px quanh vết cắt để giữ dấu. Dòng đơn và những vùng ngoài lưới giữ đường xử lý cũ.
- Test Python kiểm tra tách hai dòng và không cắt giữa một dòng; browser F05 đo toàn văn nhãn so với bản chép chuẩn bằng CER. Ngưỡng hồi quy nâng lên ít nhất 30/33 nhãn đúng hoàn toàn và CER mỗi trang <2%.

## Kết quả benchmark phát triển F05

| Phép đo | Chặng 29 | Chặng 30 |
| --- | ---: | ---: |
| Ô lựa chọn khớp hình học | 66/66 | 66/66 |
| Số thứ tự hàng đúng | 33/33 | 33/33 |
| Nhãn đúng toàn văn | 24/33 | **31/33** |
| CER trang p2 | 4,55% | **0,23%** |
| CER trang p3 | 16,24% | **0%** |

Hai sai khác còn lại trên p2: hàng `1.5` OCR dùng dấu phẩy thay dấu chấm phẩy; hàng `2.4` đọc `ảnh phưởng` thay `ảnh hưởng`. Đây là bản chép chuẩn thủ công của một form; số CER không chứng minh độ chính xác trên mẫu khác, ảnh mờ, chụp lệch hoặc chữ viết tay. Cả 66 ô vẫn `needs_review`; không tự công bố từ kết quả OCR.

## Kiểm chứng

- `npm run test:recognition`: 56/56 PASS; VietOCR Python: 30/30 PASS; `npm run typecheck`, `npm run build`: PASS. Build còn cảnh báo `<img>` đã biết ở màn admin.
- Browser phôi thật F19-p5, F20-p1, F20-p2, F14-p5, CT01 hai trang và F05 hai trang: 6/6 PASS. Browser mặc định sau restart Next dev: 4/4 PASS. Chạy lại F05 cho cùng kết quả 31/33 nhãn; `git diff --check` không báo lỗi whitespace.
- Test browser chặn ghi asset và gọi Gemini. Ảnh và JSON chi tiết chỉ ở `private-documents/recognition-evaluation/` (ignored).

## Cần làm tiếp

1. Chọn một tập ảnh **chưa dùng để chỉnh thuật toán**, có nhiều loại bảng và scan chất lượng khác nhau; chú giải nhãn/vùng để đo CER, precision/recall, ô dư/thiếu. Nếu suy giảm, sửa quy tắc mà không hardcode mẫu.
2. Kiểm tra workflow `ACTIVE` xuyên admin review → API → FE citizen/Voice trên môi trường thử nghiệm và xác thực quyền DB/asset; chỉ giảm thao tác thủ công khi bằng chứng trên nhiều mẫu đủ mạnh.
