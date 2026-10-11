# Báo cáo kỹ thuật: độ chính xác bước tải và nhận diện phôi

**Phạm vi:** `http://localhost:3001/admin/upload` — nhận ảnh phôi trống, nắn ảnh, trích xuất VietOCR, ghép nhãn với vùng nhập và chuẩn bị manifest cho Gemini. Không lưu form, không gọi Gemini, không ghi database.

## Kết quả đo độc lập

- Nguồn kiểm thử: trang 7 của biểu mẫu trợ cấp chi phí mai táng do Cổng thông tin thành phố Hải Phòng công bố: https://cdn.haiphong.gov.vn/gov-hpg/6795/tintuc/2025/12/quy-trinh639011496041872987.pdf. Đây là phôi trắng, không có dữ liệu công dân.
- Ground truth được khóa trước khi chạy recognition: `tests/fixtures/ocr-text-haiphong-funeral-p7-ground-truth.json`; ảnh raster kiểm thử nằm trong thư mục `private-documents/recognition-evaluation/` (bị ignore).
- Bản chạy đầu trên phôi này: CER 15.83%, WER 17.27%; một crop cao đã gộp nhiều dòng, làm rơi cả nhóm văn bản.
- Sau khi cho phép tách crop cao hơn, phép đo trên cùng ảnh/ground truth: CER 1.58% (19 lỗi ký tự/1,200), WER 2.52% (7 lỗi/278 từ). Đây là kết quả của một trang holdout, không đại diện mọi loại biểu mẫu.
- Chạy đúng luồng upload sau sửa bằng Chrome và VietOCR local: manifest giảm từ 39 xuống 38 ô. Ô đầu tiên đổi từ “Kính gửi”/phần văn bản người nhận thành vùng “Họ, chữ đệm, tên” trên dòng chấm tương ứng.
- Không lưu phôi, không dùng khóa quản trị, không gọi Gemini hoặc database. Lần thử giữa chừng phát hiện VietOCR đã tắt; khởi động lại service local rồi kiểm thử thành công.

## Các yếu tố ảnh hưởng tới độ chính xác

| Yếu tố | Tác động | Cách đo/cải thiện |
| --- | --- | --- |
| Độ phân giải, tương phản, nén, bóng, méo phối cảnh và viền trang | Nét chữ mờ hoặc đường kẻ lấn át chữ; crop và tọa độ thay đổi | Giữ kiểm tra chất lượng đầu vào; đánh giá ảnh scan và ảnh camera riêng; đo skew/perspective residual thay vì chỉ báo đã nắn |
| Nắn ảnh và hệ tọa độ | Sai kích thước/frame làm bbox lệch dù OCR đúng chữ | Ràng buộc một frame chuẩn; kiểm tra điểm mốc ở bốn góc và đo sai số chuẩn hóa, không trộn tọa độ ảnh gốc với ảnh đã nắn |
| Phân đoạn dòng/crop | Crop cao gộp nhiều dòng, crop hẹp cắt dấu hoặc tách sai; đường chấm dài có thể bị chia | Tách theo valley/projection và giữ ngữ cảnh; đánh giá tỷ lệ dòng bị mất/ghép trùng, không chỉ số crop tạo ra |
| VietOCR và confidence | CER có thể tốt trong khi confidence < ngưỡng; confidence hiện là điểm mô hình chưa calibration | Đối chiếu confidence với CER theo nhóm font/độ phân giải/loại crop trên holdout; không hạ ngưỡng chỉ dựa trên một trang |
| Hậu xử lý chữ và cấu trúc | Regex có thể nhầm tiêu đề tĩnh thành nhãn; dấu chấm có thể vừa là guide vừa là nhiễu | Phân biệt nội dung in sẵn/nhãn/vùng viết bằng bằng chứng OCR + hình học; lưu provenance và lý do suy luận |
| Liên kết nhãn – vùng nhập | Candidate OpenCV có thể nằm trên chữ in cuối dòng nhưng bị gán như guide; line bbox OCR ngắn khiến kiểm tra giao hình học bỏ sót | Đo false-positive input regions, label precision/recall và IoU bbox trên ground truth; loại vùng cùng hàng với caption tĩnh đã biết |
| Đa trang, bảng và trường nhiều dòng | Thứ tự trang, header lặp và continuation có thể ghép sai nhãn hoặc tạo bước trùng | Chấm theo page, row/column và trường; dùng fixture nhiều trang có continuation và hàng để trống |
| Bộ hiển thị review | Gắn cảnh báo cùng mức cho mọi trường làm tăng mệt mỏi kiểm duyệt | Ưu tiên lỗi thiếu nhãn, hình học không chắc, OCR thấp và scope suy luận; chỉ đổi cảnh báo sau khi calibration có bằng chứng |

## Thay đổi kỹ thuật

- `services/vietocr-service/text_layout.py`: tăng giới hạn chiều cao crop có thể được tách đệ quy từ 160 lên 240 px; test `test_tall_connected_form_lines_split_before_ocr` xác nhận crop nhiều dòng được chia thành từng dải trước khi gọi OCR.
- `src/modules/forms/services/form-region-recognition.ts`: nhận diện dòng người nhận “Kính gửi:” là caption tĩnh; bỏ liên kết nó thành nhãn input và loại guide cùng hàng gần caption, kể cả khi bbox OCR chỉ bao phủ phần đầu dòng.
- `src/modules/forms/tests/form-region-recognition.test.ts`: fixture tái hiện bbox OCR bị ngắn và candidate giả kéo dài phần cuối dòng; xác nhận không tạo input box và vẫn ghi bằng chứng `STATIC_RECIPIENT_LINE`.
- `src/modules/documents/ocr-text-evaluation.ts`, `scripts/evaluate-ocr-text.ts`, `src/modules/documents/tests/ocr-text-evaluation.test.ts`: thêm phép chấm CER/WER có normalize Unicode, dấu câu và guide chấm để đo text bằng ground truth độc lập.

## Kiểm thử

- `npx tsx --test src/modules/forms/tests/form-region-recognition.test.ts`: PASS, 58/58.
- `npx tsx --test src/modules/documents/tests/ocr-text-evaluation.test.ts`: PASS, 1/1.
- `npx tsx scripts/evaluate-ocr-text.ts tests/fixtures/ocr-text-haiphong-funeral-p7-ground-truth.json private-documents/recognition-evaluation/HAIPHONG-FUNERAL-P7.development.predict.json`: CER 1.58%, WER 2.52%.
- So với lần chạy đầu trên cùng holdout: CER 15.83%, WER 17.27%.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run build`: PASS; còn các cảnh báo lint `<img>` và dependency `useMemo` có sẵn ở trang khác.
- Kiểm thử thủ công sau build trên trang upload: PASS ở bước phân tích; 38 ô còn lại đều yêu cầu đối soát. Không bấm lưu/sinh kịch bản.

## Việc cần làm tiếp

1. Tạo bộ holdout từ tối thiểu 20 phôi trắng độc lập, đa nguồn/độ phân giải/thể loại; chốt ground truth text trước chạy model, đồng thời đánh dấu bbox của các vùng input.
2. Đo riêng CER/WER, recall dòng, false-positive input rate, label precision/recall và IoU vùng nhập; lập bảng theo loại scan/crop thay vì gộp một con số.
3. Tái tạo lỗi crop/tọa độ từ manifest trên ảnh: kiểm tra box rơi vào nét chữ in, guide thiếu/nhân đôi, vùng vượt lề và lệch frame. Đặt ngưỡng đạt cho demo trước khi nới thêm thuật toán.
4. Calibration confidence trên holdout. Hiện tại 38/38 ô vẫn báo cần chú ý; không đổi trạng thái sang tự xác nhận khi chưa chứng minh được false-negative thấp và vẫn luôn yêu cầu admin xác nhận trước khi gửi Gemini.
5. Thêm metric/telemetry cục bộ cho phiên admin (không lưu ảnh nhạy cảm ngoài policy): số lần chỉnh box, sửa nhãn, xóa false positive, thêm box thiếu và thời gian đối soát; dùng để ưu tiên cải tiến thực tế.
6. Giữ VietOCR local sẵn sàng bằng launcher quản lý vòng đời; nếu service offline phải báo lỗi có thể khôi phục, không được tiếp tục bằng OCR giả.

## Giới hạn

Phép đo text trên một phôi trắng chỉ chứng minh cải thiện cho holdout này. UI chạy cho thấy ghép tọa độ “Họ, chữ đệm, tên” hợp lý và loại được một caption tĩnh giả, nhưng chưa có bộ ground truth bbox đủ rộng để tuyên bố độ chính xác tọa độ tổng thể. 38 trường còn cảnh báo là review-required, không đồng nghĩa 38 lỗi.
