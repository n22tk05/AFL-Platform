# Chặng 6 — Lọc chữ OCR ảo và ghép trường cùng hàng

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Tiếp nối step-16; không dùng Dely, không commit/push, không ghi DB thật hoặc gọi Gemini/TTS cloud.

## Phạm vi và kết quả

Đã dùng hai phôi trắng nghiên cứu cục bộ TK01 (`F19-p5.png`) và CT01 (`F20-p1.png`) để so sánh **cùng local weights** trước/sau. Browser dùng OpenCV WASM thật, gửi ảnh đã xử lý đến `/api/documents/json`, rồi nối kết quả với FE review. Hai phôi không được xác nhận là mẫu pháp lý còn hiệu lực. Những số dưới đây là đầu ra thuật toán trên đúng hai ảnh, **không phải precision/recall hay nghiệm thu diện rộng**.

| Phôi | OCR trước → sau | Manifest cuối step-16 → cuối chặng này | Quan sát |
| --- | --- | --- | --- |
| TK01 | 62 → 62 dòng | 32 vùng/5 nhãn → 29 vùng/5 nhãn | Nhãn định danh và 12 ô ký tự còn nguyên; nhãn `Nơi sinh` trước đó gắn vào vùng nằm **bên trái** chữ in, nay để trống cho review thay vì gắn sai |
| CT01 | 51 → 36 dòng | 75 vùng/48 nhãn → 71 vùng/51 nhãn | Loại 15 chuỗi ảo ở các ô số/bảng trắng; 45 ô bảng và hai dãy định danh giữ nguyên; ngày sinh một field 4 vùng cùng hàng, giới tính là field riêng |

Mười lăm chuỗi CT01 bị loại gồm `HEARTH`, `TELLIES`, `TETTER`, `Therm`, `Tones`, `TIT`, `Trans`, `Horses`, `Contractions`, `Contraction`, `Constructional`, `030000000009`, `Tone` (có chuỗi xuất hiện lặp). Đối chiếu multiset dòng OCR trước/sau trên ảnh nguồn cho thấy **không có dòng nào khác bị loại** trong ca này. Đây không phải bảo đảm rằng bộ lọc không làm mất chữ thật ở biểu mẫu khác.

## Thay đổi kỹ thuật

1. Sau khi VietOCR suy luận một crop, `text_layout.py` đánh dấu dự đoán điểm thấp dưới 0.65 là không có bằng chứng chữ nếu mask đã bỏ đường bảng chỉ còn 0–1 component dạng ký tự và rất thưa. Không dùng điểm model đơn độc để xóa chữ: nhãn thật điểm thấp nhưng có nhiều nét ký tự vẫn được giữ. Crop trống không trả câu chữ model tự đoán. Đây là ngưỡng thử nghiệm, chưa được hiệu chuẩn trên ground truth.
2. `form-region-recognition.ts` không gán một guide nằm hoàn toàn **trước** nhãn in cùng hàng cho nhãn đó. Các guide chấm cùng hàng, cùng nhãn và khoảng cách gần được giữ thành nhiều `inputRegions` của **một** `single_line_text` field; dòng ở hàng khác vẫn là `multiline_text`. Thứ tự trường và ô bảng theo hàng rồi trái sang phải, tránh lệch một pixel khiến bước hướng dẫn đọc sai thứ tự.
3. Test browser opt-in chụp phản hồi OCR thật và kiểm tra CT01 có 36 dòng, không còn nhóm chuỗi ảo đã thấy; vẫn có nhãn định danh của chủ hộ. Đồng thời kiểm tra 45 cell bảng theo đúng thứ tự, hai dãy 12 ô, ngày sinh 4 vùng cùng một bước, không request ghi asset hay gọi prompt.

## Kiểm chứng

| Bộ | Kết quả |
| --- | --- |
| Python unit | 22/22; bao gồm crop ô trống bị model đoán chữ và chữ thật tương phản thấp |
| Recognition | 40/40 |
| OpenCV | 54/54 |
| Documents | 153/153 |
| Browser phôi thật opt-in | 2/2, OCR local + OpenCV thật |
| Browser mặc định | 11/11, ghi DB/AI mock |
| TypeScript và Next production build | PASS; build riêng `.next-recognition-build` |

Evidence bị Git ignore tại `private-documents/recognition-evaluation/`: `F19-p5.png.ocr-filtered.json`, `F20-p1.png.ocr-filtered.json` là gọi endpoint trên ảnh nguồn; `*.ocr-browser.json` và `*.draft.json` là phản hồi/manifest trong browser sau xử lý OpenCV. Không đưa ảnh nghiên cứu đã điền ở cùng cây thư mục lên cloud.

## Chưa đạt

- TK01 còn 24 vùng chưa nhãn, CT01 còn 20 vùng chưa nhãn; **cả hai vẫn cần cán bộ đối soát toàn bộ**. OCR vẫn có thể đọc sai dấu, bỏ header bảng (`Ngày, tháng`), hoặc nhận chữ từ dấu/QR/ảnh in sẵn. Bộ lọc thưa chưa phải detector đồ họa.
- Chưa có ground truth đầy đủ về field/loại/tọa độ nên chưa đo precision, recall, IoU, CER toàn trang hay số thao tác sửa tay. Không suy diễn rằng giảm số vùng tự động là cải thiện chất lượng chung.
- Pipeline upload/persist/Voice hiện vẫn một trang. PDF/đa trang, hiệu chuẩn confidence và transaction trên DB staging riêng là các chặng chưa thực hiện. Không dùng production để thử rollback/lỗi đồng thời.

## Ưu tiên tiếp

1. Gán ground truth từng field và từng vùng trên hai phôi này, rồi mở rộng 10–20 phôi trắng đa chủ đề; tách tập hiệu chỉnh và tập holdout. Chốt nhãn/IoU với thành viên OCR và QA trước khi chỉnh thêm ngưỡng.
2. Tách QR, ảnh chân dung, dấu và chữ ký khỏi OCR bằng layout/graphic detector có evidence pixel; kiểm thử cả trường hợp không có mã QR để tránh xóa vùng chữ thật.
3. Cải thiện word-level OCR/anchor ở nhãn ngắn, header bảng và date fields; chỉ tự gắn nhãn khi nguồn chữ và hình học cùng chứng minh, còn lại bắt buộc review.
4. Chốt contract đa trang với Tech Lead và FE; chạy OCR/OpenCV từng trang, lưu page frame/hash bất biến, giữ pageNumber xuyên manifest, workflow, citizen UI và Voice. Kiểm thử rollback trên DB staging trước publish.
