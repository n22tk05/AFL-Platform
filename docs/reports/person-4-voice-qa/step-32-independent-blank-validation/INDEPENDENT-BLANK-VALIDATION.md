# Chặng 32 — Phôi công khai ngoài họ F05 và lọc ô giả từ chữ in

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Hai PDF phôi trắng một trang được tải từ nguồn công khai vào `private-documents/recognition-evaluation/` (ignored), render PNG 1450 px và chạy qua đúng luồng admin local. Test chặn ghi asset và Gemini; không dùng thông tin công dân hoặc database thật:

- [Mẫu số 01, Đơn đề nghị tham gia lực lượng bảo vệ ANTT ở cơ sở](https://congan.quangtri.gov.vn/dichvucong/wp-content/uploads/2024/08/Mau-so-01-Don-tham-gia-luc-luong-ANTT-co-so-TT14.2024.BCA_.pdf): bố cục dòng chấm nội tuyến và phần hồ sơ nhiều dòng, không có ô tích.
- [Mẫu 09-HSB, Tờ khai của thân nhân](https://congbao1.quangtri.gov.vn/tmp/docga_7324_page119.pdf): bảng ba hàng trống, tám cột nhập liệu, header cao/nhiều tầng và chữ đóng dấu dọc. Các URL chỉ ghi nguồn ảnh thử, không xác nhận hiệu lực pháp lý hiện tại.

Đây là **đo mù ban đầu trên hai họ biểu mẫu mới**. Sau khi quan sát lỗi và chỉnh quy tắc bằng hai mẫu này, chúng đã thành tập phát triển/hồi quy; phải dùng phôi mới khác để nghiệm thu độc lập tiếp theo.

## Kết quả trước/sau

| Mẫu | Ban đầu | Hiện tại | Điều đã chứng minh |
| --- | --- | --- | --- |
| ANTT-01 | 16 field, 4 có nhãn; 8 checkbox giả | **5 field, 5 có nhãn, 0 checkbox giả**; một trường `multiline_text` gồm hai vùng | Contour chữ in, gạch dưới khẩu hiệu và cả câu văn in không còn thành ô. Nhãn của dòng hồ sơ được suy từ câu bên trái và luôn `needs_review`. |
| 09-HSB | 45 field, 25 có nhãn; 10 checkbox giả | **33 field, 24 có nhãn, 0 checkbox giả; 33/33 `needs_review`** | 24/24 ô của bảng có vị trí khớp chú giải với IoU ≥0,5, mean IoU 0,927, min IoU 0,901; không còn ô bảng dư trong phạm vi chú giải. |

Chú giải hình học bảng 09-HSB được lưu tại `tests/fixtures/recognition-qt09-table-ground-truth.json`: ba hàng × tám cột, loại STT/header/watermark và phần văn xuôi phía trên. **0/24 nhãn bảng khớp nguyên văn** theo so sánh chuỗi nghiêm ngặt; một số nhãn vẫn chứa phần đúng nhưng OCR header dài bị trộn và ba ô bảng chưa có nhãn. Vì vậy 24/24 hình học **không** phải nghiệm thu trải nghiệm hướng dẫn. Luồng luôn yêu cầu admin đối soát trước khi dùng nhãn để sinh kịch bản.

## Quy tắc đã sửa

- Contour nhỏ nằm trọn trong bbox chữ OCR (không có ký hiệu ô tích) là nét chữ in, không phải checkbox. Test bảo vệ ô tích thật nằm cạnh chữ.
- Gạch dưới chồng lên khẩu hiệu/heading tĩnh và `field_row` trùng nguyên câu văn in bị loại khỏi trường kê khai; không loại dòng chấm thật.
- Dòng chữ mô tả sát bên phải một vùng chấm có thể đặt nhãn suy theo vị trí; vùng chấm ở dòng kế tiếp được ghép cùng trường nhiều dòng. Nhãn suy luôn `needs_review`.
- Tất cả ô bảng dựa trên ghép OCR hàng/cột đều `needs_review`, kể cả khi confidence OCR cao, vì mẫu 09-HSB có nhãn sai nhưng trước đó hai ô vẫn hiện `suggested`.

## Hồi quy và giới hạn

- CT01 F20-p1 thay từ 70 xuống 65 field do năm checkbox giả từ chữ in ở phần chân trang bị loại. Bảng vẫn 45/45 ô và nhãn cột chính xác; trang chú thích vẫn 0 field. VietOCR hiện xuất 35 thay vì 36 dòng vì thiếu `TT` riêng lẻ, không làm mất 45 ô bảng. Test cập nhật để đo các bất biến thực thay vì khóa đúng số dòng OCR không quan trọng.
- F05 hai trang và F05-p4 vẫn qua các kiểm tra hình học/nhãn trước đó; browser mặc định FE/admin 4/4 qua. `npm run test:recognition`: 61/61; Python: 34/34; typecheck và build qua. Test browser hai mẫu mới 2/2, CT01 một/hai trang 2/2, các ca F05 trước đó qua. `git diff --check` không báo whitespace. Build chỉ còn cảnh báo `<img>` đã biết ở modal admin.
- ANTT-01 chưa nhận riêng cụm ngày/tháng/năm gần chữ ký; năm field hiện tại không chứng minh recall toàn mẫu. 09-HSB header nhiều tầng cao khoảng 193 px vượt cửa sổ header OCR hiện tại khoảng 130 px, chữ in dọc làm OCR trộn; chưa có căn cứ để giảm đối soát thủ công. Cần bổ sung phôi chưa từng dùng để phát triển để đo precision/recall, CER và tọa độ ngoài tập này.
