# Trích xuất OpenCV chi tiết và TXT tọa độ

Ngày triển khai: 11/10/2026. Phạm vi: vùng, dòng, từ, ô biểu mẫu, checkbox và dấu mực chưa đọc được. Người dùng đã cho phép triển khai trực tiếp khi skill `dely:delivery` không có trong môi trường; không thực hiện một delivery run giả định.

## Sử dụng

Từ thư mục gốc chạy **`npm run dev:all`** để khởi động cả Next.js ở 3001 và VietOCR ở 8000. Mở `http://localhost:3001/document-detail`, hoặc phần **Đọc chi tiết & TXT** trên `/opencv-test`. Chọn ảnh, giữ **Kiểm tra từng từ bằng OCR** để OCR riêng từng crop từ, rồi nhấn **Đọc chi tiết**. Với ảnh chụp tờ giấy, bật nắn phối cảnh. Giao diện dùng OpenCV WASM tìm bốn góc giấy; service xử lý ảnh gốc và lưu phép biến đổi ngược về ảnh nguồn.

Chọn một bản ghi để xem polygon trên ảnh, tọa độ pixel, tọa độ chuẩn hóa, crop OCR, quan hệ cha–con, confidence và lý do cần đối chiếu. Có bộ lọc loại vùng, tìm kiếm, phân trang, phóng to và chỉnh nội dung đối chiếu. Nội dung gốc luôn được giữ. Thay ảnh/hủy yêu cầu sẽ vô hiệu hóa kết quả đang chờ; sửa nội dung sẽ hủy xác nhận đối chiếu trước đó.

Các nút xuất:

- **TXT tọa độ**: UTF-8 JSON Lines; dòng đầu là metadata, sau đó một dòng cho từng bản ghi. Không cắt danh sách theo trang đang hiển thị.
- **TXT toàn văn**: các dòng theo thứ tự đọc, không lặp lại toàn bộ text của vùng và từ. Checkbox có nhãn liên kết được thêm `[x]`, `[ ]` hoặc `[?]`.
- **TXT đối chiếu**: những bản ghi cần xem lại, kèm ID, trạng thái, tọa độ và nguyên nhân.
- **JSON**: cây dữ liệu đầy đủ; có thể xuất riêng bản ghi đang chọn bằng TXT.

## Thay đổi thuật toán

Đường xử lý mới dùng độ phân giải gốc, không dùng giới hạn 70 candidate của màn hình debug. Mỗi dòng trong ô bảng được giữ riêng; mỗi từ lấy bounds từ pixel mực thực. Khi crop chứa nhiều token, chỉ tinh chỉnh ở khoảng cột thực sự không có mực, giữ bản ghi ban đầu dưới dạng `word_group`, rồi OCR lại các từ con. Những ranh giới này vẫn cần đối chiếu.

Lưới có đường kẻ được phân tích theo mức hỗ trợ của từng cạnh. Ô gộp hình chữ nhật giữ `rowSpan`/`columnSpan`; ô trống vẫn có bản ghi. Lưới hỏng hoặc nhóm ô không hình chữ nhật được đánh dấu, và chữ bên trong vẫn đi qua bộ tách dòng độc lập. Checkbox vuông và ký hiệu `[x]`/`[ ]` giữ tọa độ riêng, trạng thái suy từ pixel và liên kết dòng nhãn.

Đường kẻ, đường chấm và mực chưa gán được giữ thành bản ghi. Lỗi OCR, timeout hoặc số prediction không khớp không xóa hình học đã tìm được. OCR dòng được ưu tiên trước OCR từ; lời gọi model được chia batch. Chế độ nhanh chỉ căn token với từ khi số lượng khớp và gắn cờ chưa xác minh.

API mới:

```text
POST /api/documents/detailed     multipart: file, recognizeWords=true|false, quad? (JSON)
POST /predict/detailed          JSON: image, recognizeWords, quad?
```

Provider là VietOCR local; API `/predict` và luồng JSON biểu mẫu cũ vẫn tương thích. Bộ kiểm tra đầu ra từ chối dữ liệu có ID trùng, parent sai, thiếu bản ghi, counts sai, hình học sai, ma trận nghịch đảo không khớp hoặc transcript không khớp.

Để hoàn tất typecheck/build, đã bỏ hai import type bị khai báo trùng có sẵn trong `form.controller.ts`; không đổi logic controller. Build kiểm chứng dùng `AFL_BUILD_DIR=.next-detailed-build` để tách khỏi dev server.

## Quy ước tọa độ TXT

`bbox`, `normalizedBox`, `processedBox` và `cropBox` dùng `[x1,y1,x2,y2]`; điểm cuối là **half-open**. `bbox` và `polygon` ở hệ pixel ảnh nguồn sau khi áp dụng EXIF orientation; `processedBox` và `cropBox` ở ảnh đã nắn/deskew. `polygon` giữ bốn góc được chiếu ngược, còn `bbox` là hộp bao được giới hạn trong ảnh nguồn. Metadata chứa kích thước cả hai ảnh, ma trận thuận/ngược và góc deskew.

`textRaw` là OCR gốc; `textReviewed` là bản sửa riêng. `geometryOrigin`, `textOrigin`, `recognitionStatus`, `ocrConfidence` và `reviewReasons` cho biết mỗi giá trị đến từ đâu. Confidence không có là `null`, không tự điền điểm cao. `exportStatus=draft` cho đến khi người dùng xác nhận đối chiếu; các cảnh báo vẫn được giữ sau xác nhận.

## Kiểm chứng và đầu ra mẫu

Các ảnh kiểm chứng là fixture tổng hợp công khai trong repo, không phải giấy tờ cá nhân. Bộ TXT được tạo bằng **mô hình VietOCR local thật**, đi qua API Next.js, kiểm tra hình học/schema rồi đọc lại toàn bộ từng dòng TXT để so số bản ghi.

Xem [bộ đầu ra mẫu](examples/detailed-txt/README.md) và [số liệu chạy thật](examples/detailed-txt/verification.json). TC04 phải giữ đủ 25 ô và 4 ô trống; TC05 kiểm tra checkbox đóng/mở; TC07 kiểm tra deskew; TC10 không được sinh chữ trên trang trắng. Kiểm thử hình học bổ sung có 130 dòng, hơn 1.000 từ, ô nhiều dòng, ô gộp, lưới hỏng, dấu tiếng Việt và chữ nhỏ ở chân trang.

Kết quả chạy thật trên máy hiện tại, bật OCR từng từ:

| Fixture | Dòng | Từ | Ô / checkbox | Bản ghi xuất | Thời gian service | Bản ghi chưa đọc |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| TC01 dấu tiếng Việt | 19 | 163 | — | 206 | 12,63 s | 1 |
| TC04 bảng | 22 | 62 | 25 ô, 4 trống | 124 | 5,06 s | 0 |
| TC05 checkbox | 13 | 90 | 7 checkbox, 3 chọn / 4 chưa chọn | 128 | 5,81 s | 1 |
| TC07 ảnh nghiêng | 13 | 85 | — | 131 | 6,77 s | 10 |
| TC10 trang trắng | 0 | 0 | — | 1 | 0,06 s | 0 |

Kiểm thử: **55/55 OpenCV, 172/172 documents, 49/49 Python, 18/18 browser suite hiện có** đều PASS. Script trình duyệt chi tiết mới chạy trên Chrome với service thật: 124 bản ghi TC04 được tải lại nguyên vẹn, 4 ô trống, overlay từ, xác nhận bị hủy khi chỉnh sửa, mobile 390 px không tràn ngang, trang trắng không sinh chữ; camera tổng hợp nhận 3 dòng sau nhận diện giấy WASM và nắn phối cảnh thật. Không có page error. Typecheck và build production PASS. Thời gian ở bảng là một lượt chạy (có tác vụ kiểm thử khác), không phải benchmark độc lập, phân vị hoặc cam kết hiệu năng.

Chạy lại:

```powershell
npm run test:opencv
npm run test:documents
& .\services\vietocr-service\.venv\Scripts\python.exe -m unittest discover -s services/vietocr-service/tests
npm run typecheck
npm run build
```

Giữ terminal `npm run dev:all` đang chạy, mở terminal khác để kiểm chứng Web ở 3001 và VietOCR local ở 8000:

```powershell
npm run verify:documents:detailed
npm run verify:documents:detailed:browser
```

Có thể đổi Web bằng `DOCUMENT_TEST_URL`; script chỉ cho phép loopback. Browser script kiểm tra tải ảnh, overlay từ, tải TXT và đếm đủ ô trống, chỉnh sửa hủy xác nhận, thay ảnh xóa kết quả cũ, trang trắng, desktop/mobile và nắn phối cảnh bằng OpenCV WASM thật. Evidence trình duyệt được lưu tại `test-results/detailed`.

## Giới hạn cần hiểu

Không thể cam kết OCR đúng hoặc tìm đủ 100% chi tiết trên mọi ảnh. `complete` chỉ nghĩa là pipeline đã xử lý các bản ghi được phát hiện; `requiresReview` luôn là `true`. Tỷ lệ mực đã gán không phải phép đo độ đầy đủ nội dung OCR. Các ví dụ có sai chữ, từ chưa đọc được và bất đồng giữa OCR dòng/từ; hệ thống xuất các cờ này thay vì che giấu chúng.

Giới hạn: ảnh 8 MB, 12 triệu pixel, cạnh tối đa 8.192 pixel; tối đa 16.000 bản ghi/8.000 từ. Vượt giới hạn hình học bị từ chối rõ ràng. Budget OCR 120 giây được kiểm tra giữa các batch; kết quả chưa hoàn tất giữ tọa độ và trạng thái chưa đọc được. API có timeout 150 giây, UI 160 giây. Thời gian phụ thuộc số crop và máy chạy.

Đây là triển khai mức vùng/dòng/từ/ô theo yêu cầu đã chốt, chưa phải tọa độ ký tự. Chữ viết tay, bảng không đường kẻ, bố cục nhiều cột phức tạp và ảnh thật chất lượng kém cần tập dữ liệu đánh giá riêng trước khi tuyên bố mức recall/accuracy. Chưa có benchmark holdout 100 tài liệu thật hoặc confidence đã hiệu chuẩn.
