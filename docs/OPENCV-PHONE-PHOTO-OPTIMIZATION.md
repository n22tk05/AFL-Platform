# OpenCV và OCR cho ảnh chụp điện thoại

Ngày cập nhật: 11/10/2026. Đã triển khai trên AFL-Platform, service VietOCR 1.7.1. Mục tiêu là nắn ảnh chéo, cải thiện ảnh thiếu sáng/bóng đổ và giữ cây vùng → dòng → từ cùng mọi ô biểu mẫu, đường kẻ, checkbox, dấu mực nghi vấn trong TXT. Đây là danh mục các nhóm lỗi sử dụng thực tế; không có thuật toán bảo đảm khôi phục mọi ảnh hoặc đọc đúng 100%.

Bản 1.7.0 bổ sung tách dòng cách nhau 1–2 pixel, crop không lấy chữ dòng bên cạnh và thử OCR số nhỏ có đủ nét. Xem [báo cáo tách dòng, ô nhiều dòng và chữ nhỏ](OPENCV-LINE-SEPARATION-OPTIMIZATION.md). Bản đang chạy **1.7.1** sửa thêm [dấu tiếng Việt bị tách riêng](OPENCV-DIACRITICS-FIX.md). Sáu mẫu camera dưới đây đã chạy lại: số dòng/ô giữ nguyên, CER của 5/6 mẫu giữ nguyên; mẫu phối cảnh mạnh tăng một lỗi ký tự so với 1.7.0.

## Dùng ngay

```powershell
npm run dev:all
```

Mở `http://localhost:3001/document-detail`, hoặc phần đọc chi tiết trong `/opencv-test`. Chọn **Tự động · ảnh chụp hoặc scan**; hệ thống tìm giấy và cân bằng sáng trên ảnh nguồn ở service. **Ảnh điện thoại** ưu tiên xử lý chiếu sáng và báo cần chọn góc khi không tìm được giấy. Nếu tìm góc thất bại, luồng đọc chi tiết vẫn xử lý tiếp và báo phần cần kiểm tra. **Ảnh scan đã thẳng** giữ cách xử lý scan, bỏ tìm giấy và cân bằng sáng tự động. Luồng chi tiết không phụ thuộc WASM trình duyệt; chỉ góc người dùng chọn mới được gửi như quad thủ công, tránh coi khung bảng bên trong trang là biên giấy.

Nếu khung giấy sai, dùng **Chỉnh 4 góc giấy**, chọn bốn góc đang nhìn thấy theo bất kỳ thứ tự nào rồi đọc lại. Không thể bắt đầu đọc khi mới chọn một phần số góc. Nút **Bỏ chọn góc** trở lại tự động. Thay ảnh xóa lựa chọn góc và kết quả cũ. Chọn thủ công một vùng nhìn thấy không khôi phục nội dung đã bị cắt khỏi ảnh.

Giữ **Kiểm tra từng từ bằng OCR** để đọc crop từ riêng. Chế độ nhanh vẫn có tọa độ từ lấy từ pixel, nhưng căn chữ dòng với từ được đánh dấu chưa xác minh. Xuất **TXT tọa độ** để lấy một bản ghi cho mỗi phần tử, **TXT toàn văn** để lấy văn bản và **Báo cáo đối chiếu** để xem phần cần kiểm tra. Nội dung OCR và cảnh báo được giữ sau khi người dùng sửa chữ.

Hai màn hình cũ `/document-test` và `/scan-document` dùng chung detector camera WASM được cải tiến; đường `/predict` cũng dùng bước chuẩn bị camera mới. Quy trình yêu cầu hành động đọc toàn ảnh khi không tìm được giấy ở hai màn hình này vẫn được giữ. Giao diện chọn bốn góc thủ công được triển khai ở luồng đọc chi tiết.

## Nguyên nhân và thay đổi đã triển khai

Trước đây đường chi tiết mặc định không tìm giấy, detector trình duyệt chỉ dùng một cặp ngưỡng cạnh và lỗi tìm góc có thể dừng yêu cầu. Nền bàn, bóng và mép JPEG nối nhiều dòng thành một vùng lớn; VietOCR vốn đọc crop dòng bị đưa cả trang và sinh chữ không phù hợp. Otsu còn có thể coi vệt xám gần trắng là mực. Nét gạch dưới bị biến dạng sau nắn cũng có thể bị OCR thành chữ.

Luồng mới xử lý theo thứ tự:

1. Giải mã JPEG/PNG, áp dụng EXIF orientation, kiểm tra kích thước trước xử lý; giữ ảnh nguồn làm hệ tọa độ.
2. Detector native chạy ở cạnh tối đa 1200 px, kết hợp ba đường tìm cạnh, CLAHE và mask độ sáng. Thử nhiều mức xấp xỉ polygon trên các contour lớn; kiểm tra độ lồi, diện tích, chiều dài cạnh, mức hỗ trợ từng cạnh và chênh độ sáng trong/ngoài giấy. Không lấy nguyên biên ảnh làm giấy khi không có bằng chứng. Hai trang tách biệt có điểm tương đương được báo để người dùng chọn một trang.
3. Nắn phối cảnh bằng homography trên ảnh gốc. Dò nhỏ không đồng nghĩa OCR nhỏ: tọa độ detector được đưa về nguồn bằng tỷ lệ X/Y riêng; OCR giữ độ phân giải sau warp trong giới hạn tài nguyên.
4. Chỉ cân bằng nền khi ảnh có nền tối hoặc gradient sáng đủ rõ. Ước lượng nền bằng morphology và Gaussian, chia độ sáng cho nền, làm nét nhẹ. Phân biệt hai mặt phẳng giấy trắng/nền xám với bóng đổ để tránh sửa sai ảnh scan đã tốt. Dùng ảnh grayscale liên tục cho OCR; mask nhị phân phục vụ tách hình học.
5. Deskew từ hướng đường thực đo. Giữ bộ dò ±12° cũ; với ảnh chụp có đủ phiếu hướng nhất quán, hỗ trợ tới ±35°. Nếu ảnh sau xoay vượt ngân sách thì báo giới hạn, không cấp phát vượt mức.
6. Threshold thích nghi; chỉ hợp nhất Otsu khi có độ tương phản thực. Tách bảng, ô, dòng, từ và checkbox. Nhận nét mảnh liên tục là đường kẻ; chữ nhỏ có đủ tương phản và hình dạng được thử OCR kèm cờ đối chiếu, crop không đủ bằng chứng giữ thành dấu chưa xác định. Mực dọc mép giấy sau warp được giữ trong các bản ghi chi tiết để tránh OCR nhiễu mép.
7. Chiếu ngược polygon về nguồn qua toàn bộ homography/deskew; kiểm tra dữ liệu trước xuất TXT. Lỗi OCR và dấu chưa xác định giữ hình học cùng lý do cần đối chiếu.

WASM có tối đa ba lượt ngưỡng cạnh. Các yêu cầu diện tích, khoảng nền, độ lồi và mức hỗ trợ cạnh vẫn áp dụng. Lỗi runtime được trả lên; chỉ lỗi không tìm được giấy được thử lại. Mat và MatVector được giải phóng giữa các lượt, không xóa ảnh nguồn của bên gọi.

Threshold thích nghi phù hợp khi các vùng ảnh có độ sáng khác nhau; CLAHE tăng tương phản cục bộ; homography xử lý hình học của trang phẳng. Tham khảo tài liệu gốc: [OpenCV thresholding](https://docs.opencv.org/4.12.0/d7/d4d/tutorial_py_thresholding.html), [OpenCV CLAHE](https://docs.opencv.org/4.13.0/d2/d74/tutorial_js_histogram_equalization.html), [OpenCV homography](https://github.com/opencv/opencv/blob/4.x/doc/tutorials/features2D/Homography/homography.markdown?plain=1). Các ngưỡng cụ thể trong dự án là heuristic cần tiếp tục đánh giá trên ảnh điện thoại thật.

## Danh mục lỗi người dùng và cách xử lý

“Đã triển khai” mô tả khả năng hiện có, không có nghĩa mọi ảnh thuộc nhóm đó đều đã được kiểm chứng. Cột cuối cho biết thao tác khắc phục hoặc phần còn cần nâng cấp.

| Trường hợp | Hệ thống hiện xử lý | Khắc phục hoặc giới hạn còn lại |
| --- | --- | --- |
| 1. Chụp chéo, giấy thành hình thang | Tìm quad và nắn phối cảnh tự động; lưu ma trận và tọa độ nguồn | Chỉnh 4 góc nếu tìm sai; góc quá xiên làm mất chi tiết ở phía xa |
| 2. Nghiêng toàn trang 5–35° | Deskew khi có hướng đường nhất quán; giới hạn kích thước sau xoay | Có ít chữ hoặc không đủ bằng chứng: giữ ảnh, cần xoay/chụp lại |
| 3. Giấy sát mép ảnh | Detector native cho phép một số góc sát mép khi các cạnh còn bằng chứng | Nếu mép đã mất: chọn phần nhìn thấy hoặc chụp lại đủ giấy |
| 4. Cắt mất góc, mất đầu/chân trang | Không dựng quad toàn ảnh thay cho góc mất; chế độ camera báo cần kiểm tra | Chụp lại đủ nội dung; không suy đoán chữ ngoài ảnh |
| 5. Điện thoại ghi EXIF xoay ảnh | EXIF được áp dụng trước tách và tính tọa độ | TXT theo ảnh nguồn đã định hướng, không theo bytes chưa xoay |
| 6. Ảnh thực sự xoay 90/180°, EXIF sai hoặc không có | Chưa có bộ phân loại hướng chữ 0/90/180/270° | Xoay ảnh trong thư viện trước khi tải; bổ sung kiểm soát hướng chữ là ưu tiên tiếp theo |
| 7. Thiếu sáng nhưng vẫn thấy nét | Chuẩn hóa nền, tăng tương phản nhẹ; báo `CAMERA_LOW_LIGHT` | Bật thêm đèn tán xạ, giữ máy chắc; cân bằng sáng không phục hồi nét mất |
| 8. Tối gần hoàn toàn, ảnh đen | Không có dòng thì không đưa cả trang vào model dòng; trả cảnh báo | Cần thêm ánh sáng/chụp lại. Không tự suy diễn nội dung |
| 9. Bóng tay, bóng điện thoại trên một phần giấy | Ước lượng nền và threshold cục bộ, tách phần còn có mực | Bóng làm mất hoàn toàn nét vẫn cần chụp lại |
| 10. Gradient sáng, góc trái tối/góc phải sáng | Chuẩn hóa chiếu sáng khi gradient đủ rõ | Dịch nguồn đèn, chiếu đều hơn để tránh nhiễu sau khuếch đại |
| 11. Flash hoặc đèn tạo lóa | Cảnh báo vùng sáng mạnh trên nền tối trong điều kiện heuristic | Đổi góc đèn, tắt flash; pixel cháy trắng không có chữ để khôi phục |
| 12. Chụp qua túi nhựa, kính, màng bóng | Cảnh báo tương phản/lóa khi đủ tín hiệu; giữ phần đọc được | Lấy giấy khỏi lớp bóng nếu có thể; chưa có tách phản xạ chuyên dụng |
| 13. Rung tay, motion blur | Đo độ sắc nét và báo có thể nhòe; tiếp tục đọc phần còn rõ | Giữ máy đứng yên, tăng sáng. Chưa triển khai deblur chuyển động |
| 14. Lấy nét vào nền, giấy mất nét | Cảnh báo nhòe và giữ vùng cần đối chiếu | Chạm lấy nét lên chữ; sharpening nhẹ không thay thế lấy nét |
| 15. Chụp quá xa, chữ nhỏ | OCR giữ native; chữ quá nhỏ giữ hình học cần kiểm tra; có chỉ báo kích thước chữ | Chụp gần hơn/chia ảnh với vùng chồng lấn; upscale không tạo thông tin mới |
| 16. Zoom số, ảnh từ ứng dụng chat bị nén | Cải thiện tách halo JPEG, giữ dấu nghi vấn riêng | Dùng ảnh gốc, tránh zoom số và gửi lại qua nhiều ứng dụng |
| 17. Ảnh vượt 8 MB/12 triệu pixel/cạnh 8192 px | Từ chối rõ trước xử lý; warp/deskew cũng có ngân sách | Giảm kích thước có kiểm soát hoặc chia trang; chưa tự giảm ảnh quá giới hạn |
| 18. HEIC, WebP, PDF, GIF hoặc file đổi đuôi | Chỉ nhận JPEG/PNG và kiểm tra decode thực | Chuyển đúng định dạng trước tải; chưa thêm converter HEIC/PDF |
| 19. Nền bàn có vân hoặc nhiều cạnh | Kiểm tra hỗ trợ cạnh và tương phản trong/ngoài giấy; có chỉnh góc thủ công | Nền rối vẫn có thể tạo quad giả: kiểm tra overlay, chọn lại giấy |
| 20. Giấy và bàn cùng màu, mép mờ | WASM thử ngưỡng cạnh thấp; native nhiều mask; thủ công khi không chắc | Đặt giấy trên nền tương phản hoặc chọn 4 góc |
| 21. Nhiều tờ giấy trong một ảnh | Native báo nhiều trang tách biệt có ứng viên tương đương; không tự chọn một tờ | Chọn góc một trang và đọc từng trang; chưa OCR đa trang tự động |
| 22. Giấy chồng lên nhau | Có thể chỉ tìm được trang ngoài; mực bị che không thể phục hồi | Tách giấy và chụp từng tờ; chưa có instance segmentation cho giấy chồng |
| 23. Tay/ngón tay/kẹp che chữ hoặc góc | Giữ phần đọc được và các vùng chưa gán; góc không chắc có chế độ thủ công | Bỏ vật che; chưa nhận diện ngón tay và độ che khuất chuyên dụng |
| 24. Giấy gập, nhăn, cuộn, trang sách cong | Homography chỉ nắn mặt phẳng; không dewarp đường chữ cong | Làm phẳng trang hoặc chụp lại; cần model dewarp cho trường hợp sách |
| 25. Giấy màu, giấy cũ, watermark, hoa văn | Chuẩn hóa mức xám và tách cục bộ; giữ mực chưa xác định | Giấy tối hơn nền có thể không qua detector trang sáng; chọn thủ công. Màu có cùng luminance có thể mất tương phản |
| 26. Chữ in quá nhạt, dấu tiếng Việt nhỏ | Otsu có kiểm soát + adaptive, giữ dấu chưa gán | Ngưỡng lọc texture có thể bỏ nét cực nhạt; cần đối chiếu ảnh nguồn và tập đánh giá riêng |
| 27. Dấu đỏ, chữ chồng dấu, watermark đậm | Giữ hình học phần có mực và bản đọc để đối chiếu | Chưa tách lớp dấu/chữ; nhận diện riêng chữ chồng còn hạn chế |
| 28. Chữ viết tay, chữ ký, font lạ | Không tự điền vùng không đọc; có bản ghi chưa đọc và confidence không có là null | VietOCR hiện tại không bảo đảm chữ viết tay/chữ ký; cần model và dữ liệu riêng |
| 29. Bảng có ô trống, nhiều dòng, ô gộp | Giữ ô trống, dòng trong ô; span theo đường kẻ thực và cảnh báo biên hỏng | Grid mất cạnh hoặc biến dạng nặng phải đối chiếu, không tự giả lập mọi ô |
| 30. Checkbox nhạt, gạch xóa, trạng thái mơ hồ | Trạng thái checked/unchecked/unknown, giữ crop và tọa độ | Heuristic pixel có thể nhầm ký tự/khung; cần xác nhận trạng thái quan trọng |
| 31. Gạch dưới, đường chấm, nhiễu mép giấy | Giữ đường kẻ/unknown; hạn chế đưa nét mảnh và crop quá nhỏ vào OCR dòng | Dấu nhỏ vẫn có thể là dấu thật: xem bản ghi thay vì bỏ khỏi TXT |
| 32. Chụp màn hình, moiré, viền màn hình | Detector và tách cơ bản vẫn chạy; không có lọc moiré chuyên biệt | Dùng screenshot hoặc bản scan gốc; kiểm tra khung giấy thủ công |
| 33. Chọn nhầm mode scan cho ảnh chụp | Mode thể hiện rõ và được lưu trong metadata | Chọn Tự động/Ảnh điện thoại rồi đọc lại; mode scan chủ ý bỏ sửa ánh sáng/phối cảnh tự động |
| 34. Bốn điểm chọn sai, trùng, lõm hoặc ngoài ảnh | Kiểm tra số điểm, độ lồi, thứ tự, bounds, ma trận; từ chối hình học sai | Chọn lại bốn góc giấy; màn hình sắp thứ tự điểm theo hình học |
| 35. Thay ảnh/hủy khi yêu cầu còn chạy | Generation guard + abort; xóa kết quả, xác nhận và góc cũ | Phản hồi cũ không được ghi đè ảnh mới; có kiểm tra browser |
| 36. Ảnh quá dày chữ, nhiều mực/nhiễu, OCR quá lâu | 16.000 phần tử/8.000 từ; ngân sách OCR; giữ bản ghi khi OCR hết thời gian | Chia trang, đọc nhanh rồi kiểm tra từ; vượt ngân sách hình học trả lỗi rõ |
| 37. Dùng điểm confidence hoặc tỷ lệ mực như “đã đúng” | Giao diện yêu cầu đối chiếu; bản TXT mặc định draft; metadata phủ mực ghi không phải bảo đảm đầy đủ | Confidence và coverage không đo độ chính xác nội dung; kiểm tra tên, số, ngày, tiền |

Các cảnh báo nhòe/lóa/tương phản là heuristic. Giấy trắng tự nhiên cũng có pixel bão hòa nên không thể chỉ dùng tỷ lệ trắng để kết luận lóa; cảnh báo có thể bỏ sót hoặc báo nhầm. Chưa có bản đồ chất lượng cho từng vùng hoặc live camera hướng dẫn lấy nét theo thời gian thực.

## Kết quả đo trước/sau

Sáu ảnh **tổng hợp tất định**, tạo từ TC01 và TC04 với homography, nền có vân, gradient/bóng, nhòe nhẹ và nén JPEG. VietOCR local thật đọc trực tiếp ảnh; ground truth độc lập chỉ dùng tính metric, không gửi cho OCR. Đây không phải tập ảnh chụp điện thoại thật. Cả trước và sau dùng chế độ nhanh `recognizeWords=false` và cùng cách tính CER/WER: Unicode NFC, gộp khoảng trắng.

CER là tỷ lệ lỗi ký tự theo edit distance, càng thấp càng tốt. CER tính cả nội dung và thứ tự đọc; không chuyển `1-CER` thành lời hứa độ chính xác ngoài tập này.

| Ảnh | CER trước | CER sau | Dòng trước → sau | Ghi nhận |
| --- | ---: | ---: | ---: | --- |
| Scan đối chứng | 9,09% | 9,09% | 19 → 19 | Không suy giảm ở ảnh đối chứng |
| Chéo + bóng đổ | 99,86% | 11,26% | 1 → 19 | Tìm được giấy và các dòng |
| Phối cảnh mạnh | 99,86% | 10,85% | 1 → 19 | Bản 1.7.0 là 10,72%; bản 1.7.1 tăng một lỗi ký tự |
| Thiếu sáng | 99,32% | 15,88% | 1 → 19 | Có cân bằng nền và cảnh báo thiếu sáng |
| Bảng chụp chéo | 97,13% | 12,74% | 1 → 22 | 25 ô, gồm 4 ô trống |
| Giấy sát biên | 9,50% | 9,50% | 19 → 19 | Giữ kết quả, có nắn tự động |

WER sau tương ứng: 10,43%; 13,50%; 13,50%; 18,40%; 24,39%; 12,27%. Dòng chân trang hai cột vẫn có thể được đọc theo hàng thay vì theo từng khối; điều đó góp vào lỗi ngay cả ở scan đối chứng. OCR vẫn sai một số dấu, chữ và số; chưa thay model hoặc bổ sung corpus huấn luyện trong lần này.

Dữ liệu gốc: [trước](ocr-camera/before.json), [sau](ocr-camera/after.json). Mỗi case có `.layout.json`, `.coordinates.txt`, `.fulltext.txt`, `.review.txt` trong `docs/ocr-camera`. Ví dụ [TXT tọa độ ảnh tối](ocr-camera/low-light.coordinates.txt), [TXT tọa độ bảng với OCR từ riêng](ocr-camera/table-phone.words.coordinates.txt). Nhiều bản ghi unknown phản ánh mực/nhiễu giữ lại để kiểm tra, không phải số chữ đã đọc được.

Bảng chụp chéo còn được kiểm tra qua Next API với **OCR từng từ thật**: 25 ô, 4 ô trống; các cụm từ được tinh chỉnh có giữ parent; hai dòng báo khác biệt giữa OCR dòng và OCR từ, được giữ để đối chiếu. Xem [kết quả kiểm chứng](ocr-camera/table-phone.words.verification.json). Transcript không bị thay bằng đáp án mẫu.

## Kiểm chứng và tái lập

- Python service: **82/82** test đạt, gồm 12 test camera, test EXIF và 20 test dòng/chữ nhỏ/dấu; các test model giả kiểm tra hợp đồng/lỗi, không được dùng làm bằng chứng chính xác OCR.
- Documents: **176/176** test đạt; OpenCV: **57/57** test đạt, gồm WASM thật với giấy tương phản thấp và từ chối ảnh không có giấy.
- Launcher: **17/17** test đạt; `npm run dev:all` đã khởi động model thật ở 8000 và Next ở 3001.
- Browser regression: **18/18** test đạt ở lượt camera. Browser chi tiết: 9 tình huống với model thật, gồm TXT download, mobile, ảnh tối tự động, chọn góc thủ công, camera không tìm được giấy, scan có bảng được chọn nhầm mode camera, ô hai dòng sát nhau và dấu chồng với OCR từng từ; không có page error.
- Typecheck và build production đạt. Build dùng thư mục riêng để không đụng cache của dev server.

```powershell
# Terminal 1
npm run dev:all

# Terminal 2: cần model ở 8000 và web ở 3001
npm run benchmark:documents:camera
npm run benchmark:documents:lines
npm run benchmark:documents:diacritics
npm run verify:documents:camera
npm run verify:documents:detailed:browser
npm run test:vietocr
npm run test:opencv
npm run test:documents:inprocess
$env:DOCUMENT_TEST_URL='http://127.0.0.1:3001'
npm run test:documents:browser
```

Benchmark tạo ảnh trong `test-results/camera/fixtures`, lưu metric và xuất TXT đã qua kiểm tra dữ liệu. Chạy lại ghi đè `after` và artifact của lần sau. `before.json` là mốc đã ghi nhận trước bản sửa camera; đổi label sang `before` không tự hoàn nguyên mã nguồn. Thời gian đo vài giây/trang chỉ là quan sát local, có tác vụ khác trên máy, không phải cam kết latency production.

## Các nâng cấp tiếp theo để tăng độ tin cậy ngoài tập tổng hợp

1. **P0 — Tập ảnh điện thoại thật độc lập.** Thu thập ảnh theo model điện thoại, mức sáng, góc, độ nhòe, lóa và độ cao chữ; chia train/tuning/test theo tài liệu và thiết bị. Đánh giá CER/WER, tỷ lệ tìm đúng giấy, IoU polygon dòng/từ/ô, recall từng loại vùng và lỗi số liệu. Không chỉ dùng accuracy toàn văn hoặc số candidate.
2. **P1 — Hướng chữ và hướng dẫn chụp.** Thêm xoay 0/90/180/270° có ma trận nguồn, kiểm tra hướng chữ; chất lượng theo vùng, live camera lấy nét/rung/góc, nhắc thiếu mép và chụp lại vùng lóa.
3. **P1 — Nhận diện có nhiều bằng chứng.** Giữ các crop gốc/đã cân bằng, đọc lại có ngân sách ở vùng khó; lưu cả hai kết quả và báo bất đồng. Bổ sung mô hình phát hiện chữ/giấy được huấn luyện trên camera để xử lý nền rối, trang tối màu; cải thiện thứ tự đọc nhiều cột. Không dùng kết quả dài hơn/confidence cao hơn để tự thay số, tên hoặc ngày.
4. **P2 — Trang cong, che khuất, nhiều trang và định dạng.** Model dewarp có phép chiếu ngược, phát hiện tay/vật che, instance segmentation đa trang, converter HEIC/PDF có giới hạn; benchmark từng khả năng trước bật mặc định.
5. **P2 — Model OCR chuyên biệt.** Đánh giá detector/recognizer mới hoặc fine-tune VietOCR với tiếng Việt camera, chữ nhỏ, dấu đỏ, chữ viết tay và số/mã; chọn theo chất lượng, tài nguyên và dữ liệu thật. Chỉ đưa vào sau khi có regression và kiểm tra tính toàn vẹn tọa độ TXT.

Hiện đã hoàn tất phần sửa luồng ảnh chụp, giữ chi tiết và kiểm chứng có thể thực hiện với dữ liệu trong dự án. Các hạng mục trên là việc tiếp theo, chưa được mô tả như đã triển khai.
