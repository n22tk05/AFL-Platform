# Chặng 31 — Hai lưới trên một trang và hàng bảng mở đáy

Ngày 10/10/2026. Nhánh `codex/form-recognition-and-multiline`. Kiểm thử local bằng phôi trắng F05-p2/p3/p4; browser chặn ghi asset và Gemini. Không dùng dữ liệu công dân hay database thật. **F05-p4 là bố cục mới trong cùng họ F05, nhưng đã được dùng để chỉnh thuật toán ở chặng này; toàn bộ F05 là benchmark phát triển, không phải tập nghiệm thu độc lập.**

## Vấn đề quan sát trước khi sửa

F05-p4 nối lưới Có/Không từ trang trước ở nửa trên, rồi chuyển sang lưới bốn lựa chọn ở nửa dưới. Hàng 8 của lưới mới không có đường kẻ đáy. Kết quả ban đầu trang p4: 62 field, chỉ 1 field có nhãn; OCR chọn nhầm hàng dữ liệu làm header, không giữ lưới nối trang, ô in chữ bị coi là checkbox, hàng 8 bị bỏ sót. Đây là số nền đo trước bản vá chặng 31, không phải tỷ lệ chính xác trên tập độc lập.

## Thay đổi

- VietOCR chỉ chọn hàng header khi ít nhất ba ô có nét chữ nội vùng sau khi bỏ kẻ bảng. Phân biệt hai kiểu lưới: cột STT + mô tả + lựa chọn, hoặc cột mô tả rộng + bốn lựa chọn; các vách của cùng lưới phải cùng dải dọc, tránh trộn vách của hai bảng.
- Với lưới bốn lựa chọn, chỉ crop vùng nhãn của hàng cuối mở đáy khi còn vách dọc và có chữ thật. Vùng nhiều dòng được tách đệ quy theo thung lũng mực để OCR từng dòng; các hàng đóng trước đó vẫn dùng OCR toàn trang, tránh hồi quy nhãn.
- Bộ nhận diện giữ ngữ nghĩa bảng từ trang trước tới trước header mới trên cùng trang, kể cả khi contour mô tả bị phân loại container. Nó loại các glyph nhỏ nằm trong ô nhãn của ma trận và một mảnh giả ở mép cuối trang.
- Nếu sau ít nhất ba hàng cùng lưới có OCR cho hàng kế tiếp theo thứ tự, hệ thống đề xuất bốn ô mở đáy. Trường hợp OCR đọc `B.` sau hàng `7.` được suy ra thành `8.` nhưng luôn gắn `OPEN_BOTTOM_ROW_INFERRED` và `OCR_ORDINAL_INFERRED`, bắt buộc admin kiểm tra. Không tự công bố.

## Kết quả benchmark phát triển

| Giai đoạn trên p4 | Tổng field | Có nhãn | Ô chọn đúng cấu trúc quan sát trực quan |
| --- | ---: | ---: | ---: |
| Trước chặng 31 | 62 | 1 | Chưa đúng |
| Chỉ sửa chọn header OCR | 48 | 29 | 28 ô của 7 hàng dưới; thiếu phần nối trên và hàng 8 |
| Sau chặng 31 | **40** | **40** | **8 ô lưới trên + 32 ô của 8 hàng dưới** |

Trang p2/p3 giữ số lượng 36/30 field có nhãn. Trên p4, cả 40 ô đều là `checkbox` và `needs_review`; bốn ô hàng 8 là hình học suy luận, không phải contour đóng thật. OCR vẫn sai một số chữ/dấu trong nhãn dài: `6.3` có thể thành `63`, `cơm` thành `com`; admin phải đối soát phôi trước khi duyệt. Số 40/40 đánh giá cấu trúc và sự hiện diện nhãn, **không** đồng nghĩa 40/40 nhãn đúng nguyên văn hoặc tọa độ đạt sai số nghiệm thu.

## Kiểm chứng

- `npm run test:recognition`: 58/58 PASS, gồm ca âm tính header mới không xóa lưới nối, hàng mở đáy cần duyệt, glyph in không tạo field, số hàng sai không được suy luận.
- VietOCR Python `unittest discover`: 34/34 PASS, gồm hai kiểu vách, hàng mở đáy có/không chữ và tách bốn dòng.
- Browser phôi trắng F05 ba trang: 1/1 PASS với assert 40/40 p4, tám ô bảng nối, bốn ô hàng mở đáy, toàn bộ chờ duyệt; browser mặc định: 4/4 PASS. `npm run typecheck`, `npm run build`, `git diff --check`: PASS. Build còn cảnh báo `<img>` đã biết ở màn upload.
- JSON OCR/draft/candidate chi tiết nằm trong `private-documents/recognition-evaluation/` (ignored). Chỉ báo cáo và test source được theo dõi bằng Git; không đưa ảnh/JSON local vào commit.

## Việc còn lại

1. Lập tập phôi trắng **khác họ F05 và chưa dùng để chỉnh thuật toán**, có chú giải ô đúng/ô dư/ô thiếu, nhãn chuẩn và tọa độ. Đo precision, recall, CER, sai số hình học; không gọi benchmark F05 là nghiệm thu.
2. Kiểm tra hình học hàng mở đáy trên ảnh khác: quy tắc hiện suy luận đáy từ chữ OCR và chiều cao hàng trước, không đo trực tiếp đầu mút vách dọc. Nếu lệch, bổ sung bằng chứng OpenCV về vách/kết thúc cột rồi mới giảm yêu cầu review.
3. Kiểm thử staging xuyên admin review → manifest/workflow `ACTIVE` → citizen FE/Voice cùng asset nhiều trang, quyền DB/RLS và rollback. Chưa xác nhận quy trình này bằng môi trường triển khai thật trong chặng 31.
