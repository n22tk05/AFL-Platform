# TXT chi tiết từ OCR local thật

Các file được tạo từ fixture trong `tests/fixtures/ocr-json` bằng `npm run verify:documents:detailed`. Đây là bản nháp cần đối chiếu, giữ nguyên chữ sai/không đọc được và cảnh báo.

| Mẫu | Tọa độ từng bản ghi | Toàn văn | Cần đối chiếu |
| --- | --- | --- | --- |
| Tiếng Việt có dấu | [TXT](tc01_clean_accents.coordinates.txt) | [TXT](tc01_clean_accents.fulltext.txt) | [TXT](tc01_clean_accents.review.txt) |
| Bảng, 25 ô và 4 ô trống | [TXT](tc04_table_empty_cells.coordinates.txt) | [TXT](tc04_table_empty_cells.fulltext.txt) | [TXT](tc04_table_empty_cells.review.txt) |
| Checkbox | [TXT](tc05_checkboxes.coordinates.txt) | [TXT](tc05_checkboxes.fulltext.txt) | [TXT](tc05_checkboxes.review.txt) |
| Ảnh nghiêng | [TXT](tc07_skewed_perspective.coordinates.txt) | [TXT](tc07_skewed_perspective.fulltext.txt) | [TXT](tc07_skewed_perspective.review.txt) |
| Trang trắng | [TXT](tc10_blank_page.coordinates.txt) | [TXT](tc10_blank_page.fulltext.txt) | [TXT](tc10_blank_page.review.txt) |

Mỗi mẫu có thêm `.layout.json`. [verification.json](verification.json) chứa counts, provider, thời gian, cảnh báo, số bản ghi chưa đọc được và số dòng bất đồng với OCR từng từ. Counts chỉ phản ánh bản ghi detector tìm được, không phải chứng nhận tìm đủ chi tiết trên mọi ảnh.

TXT tọa độ dùng JSON Lines UTF-8: metadata ở dòng đầu, mỗi bản ghi ở một dòng tiếp theo. Tọa độ XYXY half-open, polygon ảnh nguồn, bounds crop, parent ID, raw text, confidence và provenance đều được giữ. [Quy ước và hướng dẫn đầy đủ](../../OPENCV-DETAILED-TXT-IMPLEMENTATION.md).
