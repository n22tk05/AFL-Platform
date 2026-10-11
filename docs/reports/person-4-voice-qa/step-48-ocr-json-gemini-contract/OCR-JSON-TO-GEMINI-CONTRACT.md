# Chặng 48 — JSON OCR tới Gemini, không phụ thuộc nhận diện đủ nhãn

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Chặng này thực hiện ưu tiên được chốt ở checkpoint 47: text OCR phải đi tới model, không chỉ nhãn ô. Không dùng Dely.

## Đã nối luồng

- FE tạo `FormOcrContext` từ `DocumentJsonExport` mỗi trang: `rawText`, block text theo `order`, `id`, độ tin cậy và `bbox` nếu có. `coordinateSystem: normalized-xyxy` được khai báo rõ, khác `normalized-yxyx` của vùng điền. Context không chứa ảnh, OCR attempts hoặc dữ liệu công dân; luồng upload chỉ cho phôi trống đã xác nhận.
- FE kiểm tra gói OCR và tổng request **trước khi lưu ảnh phôi**; vượt hạn mức hoặc JSON lỗi thì hiển thị thông báo tiếng Việt thay vì để lại một phần asset mới. `POST /api/llm/prompt` nhận `ocrContext` bên cạnh manifest đã xác nhận.
- Controller xác thực schema, đúng số/trình tự trang và hình học OCR trước lời gọi AI hoặc ghi DB; loại thuộc tính lạ khỏi context gửi model. Gemini nhận cả manifest ô đã đối soát và JSON OCR chưa xác nhận, với chỉ dẫn xem OCR là dữ liệu không đáng tin. Model không được đổi/gộp ô hoặc tự tạo tọa độ; đầu ra vẫn buộc khớp một bước cho mỗi box.
- Cache của kịch bản bao gồm cả context OCR nên cùng manifest nhưng văn bản OCR khác không dùng nhầm kịch bản. API cũ không có `ocrContext` vẫn chạy để tương thích, nhưng luồng upload FE mới luôn gửi context.

Giới hạn hiện tại: context ≤192 KiB; tối đa 20 trang, 12.000 ký tự `rawText`/trang, 100.000 ký tự tính cả block text và 1.500 block. API ≤384 KiB; FE chặn sớm ở 376 KiB để chừa chỗ cho URL ảnh phôi đã lưu. Không cắt text âm thầm: gói vượt hạn mức yêu cầu admin chia nhỏ biểu mẫu/đối soát lại. Đây là giới hạn phòng ngừa, chưa phải kích cỡ tối ưu đã benchmark trên tất cả phôi.

## Bằng chứng

- Test tích hợp fake Gemini chứng minh prompt chứa text tĩnh không phải nhãn ô, page number, thứ tự và tọa độ block; thay `rawText` làm đổi khóa cache. Test âm tính từ chối sai trang/hệ tọa độ/hình học/text quá lớn trước khi gọi AI/DB.
- Browser synthetic một trang và hai trang **2/2 PASS** sau khi Next dev được khởi động lại: request từ `FormUploadModal` chứa manifest và `ocrContext`, đúng thứ tự trang. Lượt đầu timeout do Next dev và `next build` cùng dùng `.next`, khiến JS chunk 404; không liên quan tới OCR và không được tính là pass.
- Bốn kết quả OCR ảnh thật đang lưu local được gói hợp lệ: phôi ủy quyền 623 ký tự/24 block/5.474 byte; phôi xây dựng 1.407/43/10.468 byte; khai sinh 889/40/8.563 byte; kết hôn 961/38/8.444 byte. Các số này chỉ chứng minh serialization/giới hạn trên bốn ảnh, không chứng minh text OCR đúng.
- Sau bổ sung `coordinateSystem`, recognition **92/92**, Voice **19/19**, forms API **12/12**, TypeScript và build PASS khi dev đã dừng. Hai ca browser FE cũng **2/2 PASS** trên bản production build. Build chỉ còn cảnh báo `<img>` ở FE; `git diff --check` qua, chỉ có cảnh báo chuyển dòng LF/CRLF của Git.

## Chưa chứng minh

1. Chưa đo CER/word accuracy bằng ground truth văn bản từ nguồn độc lập, chưa đánh giá thứ tự đọc đủ tốt cho Gemini; không thể gọi toàn văn OCR “chính xác” chỉ vì JSON hợp lệ.
2. Chưa gọi Gemini thật cho một phôi mới với context này và chấm chất lượng hướng dẫn bởi admin. Test dùng fake model, không dùng cloud/DB/audio cache thật.
3. Context OCR chỉ được truyền ở lần sinh kịch bản, chưa lưu cùng manifest trong DB. Muốn tái sinh sau này phải thiết kế cách lưu/phiên bản hóa và xác minh quyền truy cập; không lặng lẽ xem manifest là toàn bộ nguồn OCR.
4. Chưa có nghiệm thu staging admin → `ACTIVE` → FE citizen/Voice, DB/RLS và holdout tọa độ nguồn độc lập. Nhãn chính xác không phải tiêu chí chính; cần đo text OCR, precision/recall/sai số vùng và khả năng admin sửa ít thao tác.
