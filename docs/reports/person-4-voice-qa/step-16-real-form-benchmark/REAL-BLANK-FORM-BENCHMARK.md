# Chặng 5 — Đo pipeline nhận diện trên hai phôi trắng thật

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Tiếp tục từ checkpoint step-15; không dùng Dely, không commit/push, không ghi DB hoặc gọi Gemini/TTS cloud.

## Phạm vi phép đo

- Hai ảnh nghiên cứu lưu cục bộ, không đưa vào Git: `private-documents/form-research-20/F19-p5.png` (TK01, trang 5) và `F20-p1.png` (CT01, trang 1). Đây là bản nguồn phục vụ thử thuật toán, **không xác nhận hiệu lực pháp lý hiện tại**.
- Browser thật chạy OpenCV WASM, gọi `POST /api/documents/json` trên Next local và VietOCR weights local, sau đó ghép manifest trên FE. Chỉ mở màn hình review và tải JSON nhận diện; test chặn/khẳng định không gửi request lưu asset hay sinh kịch bản.
- Số `detectedFields` là số vùng **đề xuất**, không phải số field đúng. Chưa có ground truth đủ để tính precision, recall, IoU, CER toàn trang hoặc số lần sửa tay thực tế. Không gọi kết quả này là nghiệm thu sản phẩm hay benchmark 20 biểu mẫu.

| Ảnh | Trước chặng này | Sau sửa | Bằng chứng hữu ích |
| --- | --- | --- | --- |
| TK01 | 54 vùng, 1 nhãn | 32 vùng, 5 nhãn; 32 vùng vẫn cần review | 8 candidate nằm trong QR bị loại; dãy 12 ô định danh có một nhãn; một trường tạm trú 2 vùng |
| CT01 | 90 vùng, 5 nhãn | 75 vùng, 48 nhãn; 75 vùng vẫn cần review | 9 hàng × 5 ô bảng = 45 `table_cell` có nhãn cột/hàng; hai dãy 12 ô định danh giữ nhãn; footer không bị tính là hàng bảng |

Mức giảm vùng đề xuất không đồng nghĩa với giảm false negative. Cần gán nhãn thủ công trên ảnh nguồn trước khi tính chất lượng thật.

## Lỗi tái hiện và cách xử lý

1. Một ô header bảng chứa nét chữ vuông nhỏ bị xem là khung nhóm, làm mất header và toàn bộ ngữ nghĩa bảng. Sorter giờ chỉ suy ra container khi có ít nhất hai con nhỏ độc lập; test hồi quy giữ header là cell.
2. Ô STT và ô cột `Giới tính` trong bảng CT01 có hình gần vuông nên detector trả `checkbox`. Table recognizer giờ xét cả contour lẫn checkbox trong hàng bảng, nhưng loại hình giả nằm trong một cell lớn; vẫn phải có header OCR và lưới hình học. Footer ngoài khung không còn được gắn thành hàng thứ 10.
3. OCR tách header nhiều dòng (`Họ, chữ đệm` / `và tên`, `Giới` / `tính`). Thứ tự text được sắp theo Y/X trong cell; tên cột dùng để gán từng hàng, không sinh bước từ STT/header.
4. Nhãn không có dấu `:` trong TK01 (`Số ĐDCN/CMND(3)`, `Địa chỉ...`) được nhận bằng từ vựng giới hạn và tọa độ OCR thực. Các ô vuông chồng lên chữ nhãn bị loại; một writing guide sau dãy ký tự không được xóa nhãn đã gắn cho 12 ô.
5. Vùng QR TK01 sinh nhiều checkbox/đường viết giả. Một khung nhỏ gần vuông, chứa nhiều con và OCR mã số độ tin cậy thấp được coi là đồ họa; 8 candidate bên trong được đánh dấu loại. Heuristic này chưa thay thế QR detector chuyên dụng.
6. Caption OCR `NGÀY THÁNG NĂM` ở phần ký được phân loại là ngày tĩnh, không dùng làm nhãn checkbox. `Tải JSON nhận diện để đối soát` xuất manifest, nguồn candidate và lý do loại tại máy admin, không gọi API ghi.
7. Khi dưới một nửa vùng đề xuất có nhãn, màn hình admin hiện cảnh báo chất lượng thay vì để cán bộ hiểu nhầm rằng kết quả đã đủ để sinh kịch bản.

## Kiểm chứng đã chạy

| Nhóm | Kết quả |
| --- | --- |
| Browser phôi thật opt-in | 2/2, dùng local OCR + OpenCV thật; assert dãy 12 ô, 45 ô bảng, QR, không tạo footer table/checkbox ngày, không request ghi |
| Browser mặc định | 11/11; API ghi và Gemini mock, không đưa hai phôi nghiên cứu vào CI mặc định |
| Recognition | 39/39 |
| OpenCV | 54/54 |
| Documents | 153/153 |
| Forms API | 12/12; client checks đạt |
| Voice client | 19/19 |
| QA fixture/API integrity | 6/6 và PASS |
| Python service unit | 19/19 |
| TypeScript, Next production build | PASS; build ở `.next-recognition-build` |

Chạy lại trên máy có hai ảnh và weights OCR local: khởi động VietOCR cổng 8000 và Next cổng 3001, rồi từ root chạy:

```powershell
$env:RECOGNITION_RESEARCH_BLANKS = '1'
$env:IMAGE_VOICE_TEST_URL = 'http://127.0.0.1:3001'
npx playwright test --config playwright.image-voice.config.ts --grep 'local blank form'
```

Evidence cục bộ bị ignore: `private-documents/recognition-evaluation/F19-p5.png.{ocr,browser,draft}.json` và cặp tương ứng của F20. File `.ocr.json` là phản hồi endpoint trên ảnh gốc; `.draft.json` là manifest sau OpenCV ảnh đã xử lý và OCR thật trong browser. Không đưa các file nghiên cứu chứa dữ liệu từ mẫu đã điền lên cloud.

## Chưa đạt và hướng tiếp theo

1. **Chưa thể tự động công bố hai form này.** TK01 còn 27 vùng không nhãn, CT01 còn 27 vùng không nhãn; toàn bộ vùng bị đánh dấu review vì nhãn thiếu, nhãn suy đoán hoặc confidence OCR thấp. Model còn sinh chữ trong QR/ô số/bảng trắng, ví dụ chuỗi số và từ tiếng Anh không có trên phôi. Heuristic QR chỉ ngăn chúng biến thành field, chưa sửa OCR gốc.
2. Tạo ground truth do hai người đối chiếu độc lập cho **từng trang**: polygon/box YXYX của nhãn, vùng nhập, checkbox, ô ký tự, bảng, QR/ảnh/dấu và nhóm multiline; ghi một ID logic cho các dòng cùng trường. Mở rộng tối thiểu 10–20 phôi trắng khác chủ đề/độ phân giải. Đo precision/recall theo loại, IoU, CER nhãn và số thao tác sửa tay/form; lưu tập kiểm thử tách khỏi tập chỉnh ngưỡng.
3. Xử lý QR/ảnh/dấu trước line OCR bằng detector đồ họa và mask riêng; không dựa vào low confidence của chuỗi số. Cải thiện OCR tiếng Việt ở nhãn ngắn, nhãn trên dòng chấm, header bảng; cần word/token boxes hoặc căn chỉnh ký tự thay vì chia bbox theo độ dài chuỗi. Hiệu chuẩn threshold review từ benchmark, không tự coi model score là xác suất đúng.
4. **Đa trang/PDF vẫn chưa chạy xuyên suốt.** Đề xuất chặng kế: FE upload PDF/nhiều ảnh theo thứ tự và xem lại từng trang; server chuẩn hóa mỗi trang thành ảnh bất biến có hash/kích thước/pageNumber; OCR/OpenCV chạy riêng từng frame; manifest buộc mỗi `inputRegion` thuộc đúng trang, ID không trùng xuyên tài liệu; editor và citizen chuyển trang theo step, Voice/Q&A giữ `(formCode, pageNumber, stepIndex, boxId)`. Chặn publish nếu thiếu trang/ảnh hoặc số trang lệch OCR; test trang 1/2 có cùng nhãn nhưng không lẫn tọa độ, rollback toàn bộ khi một trang lỗi. Cần chốt contract/schema với Tech Lead trước khi thay persistence; không dùng localStorage thay nguồn sự thật server.
5. Dùng DB staging riêng để test transaction lưu asset/manifest/workflow, rollback và approval đồng thời; không dùng production để thử hỏng dữ liệu. Chưa chạy kiểm thử này ở chặng 5.

## Quyết định demo hiện tại

Có thể demo pipeline và thao tác review trên **phôi tổng hợp** với vùng/loại đúng, hoặc cho thấy CT01 nhận 45 cell và 2 dãy ô định danh để trình bày tiến độ. **Không bấm xác nhận/phê duyệt TK01 hoặc CT01 như đã hoàn chỉnh** trước khi cán bộ đối chiếu nhãn, loại và toàn bộ vùng trên ảnh nguồn. Không dùng hai form nghiên cứu để hướng dẫn pháp lý cho công dân.
