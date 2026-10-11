# Sửa dấu tiếng Việt bị tách riêng

VietOCR **1.7.1**, cập nhật 11/10/2026. Sửa trực tiếp luồng chi tiết, bộ tách trang API cũ và bước nhận đường chấm. Khởi động toàn hệ thống bằng `npm run dev:all`.

## Nguyên nhân và cách sửa

Ở font/cỡ chữ lớn, một dấu có thể cao hơn ngưỡng nhận thân chữ của phiên bản 1.7.0. Dải dấu bị coi thành một dòng riêng; một số dấu còn nằm ngoài contour đã giãn nên bước tinh chỉnh từng contour không thể ghép lại. Một contour lớn có thể bao cả mực của contour nhỏ khác, tạo crop trùng. Bộ nhận đường chấm cũng có thể nhầm hàng số nhỏ thành các chấm nhập liệu.

Thay đổi trong [line_layout.py](../services/vietocr-service/line_layout.py), [detailed.py](../services/vietocr-service/detailed.py) và [segmentation.py](../services/vietocr-service/segmentation.py):

- Liên kết thành phần dấu với thân chữ lớn hơn dựa trên vị trí ngang, khoảng cách dọc, kích thước và diện tích mực. Đo biên thân chữ tại các cột của dấu khi chữ có móc hoặc còn lệch nhẹ. Hỗ trợ cả thân chữ đã nối thành một từ.
- Dấu chồng hai tầng như `ễ` được nối qua dấu đã có liên kết với thân chữ. Chỉ xét liên kết này ở phía trên thân chữ.
- Loại dấu có liên kết khỏi danh sách thân chữ dùng phân nhóm dòng. Sau khi tách, đưa cả dấu nằm ngoài vùng coarse về đúng dòng. Chỉ bỏ vùng riêng khi mọi thành phần của nó đã có dòng sở hữu; mực không có bằng chứng vẫn được giữ để đối chiếu.
- Khi nhận diện đường kẻ làm đứt một thân chữ, dùng mask mực trước khi bỏ đường kẻ để xác định liên kết dấu. Xét riêng từng ô; vùng ngoài bảng loại các ô và checkbox khỏi mask tham chiếu, tránh ghép xuyên ô.
- Loại crop chứa lại cùng nét chữ trên cùng baseline. Bounds sau ghép bao cả thân chữ và dấu; padding vẫn bị giới hạn bởi các dòng lân cận.
- Giữ chữ nhỏ có khoảng rỗng bên trong, ví dụ `0`, như một thân chữ độc lập. Bộ nhận đường chấm chỉ xét thành phần đủ đặc và có hình dạng phù hợp, bỏ qua dấu đã liên kết với thân chữ.

Không dùng transcript OCR để quyết định ghép dấu, không sửa chữ OCR theo đáp án. Bộ tìm liên kết dùng lưới không gian 64 px, tối đa 256 ứng viên lân cận; khi một mask vượt 50.000 thành phần thì bỏ bước liên kết này và giữ cách xử lý/đối chiếu hiện có.

## Kết quả thực đo

[Baseline 1.7.0](ocr-diacritics/before.json) và [bản sửa 1.7.1](ocr-diacritics/after.json) đều gọi HTTP service đang chạy với **model local thật và OCR riêng từng từ**. Baseline được đo trước khi khởi động lại service, không giả lập bộ nhận diện. Mẫu có 14 dòng tham chiếu trên 11 ảnh tổng hợp; phiên bản cũ sinh 41 dòng, bản sửa giữ đúng **14 dòng**, không dòng thừa, không pixel chữ bị lặp giữa các dòng, không pixel chữ tham chiếu nằm ngoài mọi dòng và không crop nào lấy chữ dòng khác.

| Mẫu | Dòng trước → sau | Kết quả OCR dòng sau |
| --- | --- | --- |
| Tiêu đề Arial 60 px | 5 → 1 | `CỘNG HÒA XÃ HỘI` |
| Dấu chồng trong `Nguyễn Đặng`, Arial 60 px | 4 → 1 | Đúng mẫu |
| `Nguyễn Đặng`, Times 40 px | 2 → 1 | Đúng mẫu |
| `Nguyễn Đặng`, Tahoma 40 px | 4 → 1 | Đúng mẫu |
| Ký tự `ệ` riêng lẻ, Tahoma 60 px | 3 → 1 | Model vẫn đọc thành `2` |
| Chữ `Ứ`, Tahoma 60 px | 1 → 1 | Đúng mẫu |
| `ẠẠẠ`, Tahoma 40 px | 4 → 1 | Model vẫn đọc thành `AAA` |
| Hai dòng tiếng Việt sát nhau | 7 → 2 | Sai `Hạnh` thành `hạnh` |
| Hai dòng sát nhau trong một ô | 8 → 2 | Sai `Hạnh` thành `hạnh` |
| Số `0` nhỏ dưới chữ `O` lớn | 1 → 2 | Đúng mẫu, hai dòng độc lập |
| `Nguyễn Đặng` qua nắn phối cảnh thủ công | 2 → 1 | Đúng mẫu |

Mask chữ tham chiếu được vẽ độc lập, không gửi vào inference. Dùng IoU một-một ≥ 0,65, kiểm tra crop với mask dòng khác và đo số pixel chữ được 0/1/nhiều dòng sở hữu. Nếu có biến đổi, đưa mask qua ma trận thực bằng nearest-neighbor. Đây là **bộ ảnh tổng hợp**, chưa phải holdout ảnh lỗi thực tế từ người dùng. Tách đúng hình học không bảo đảm model đọc đúng dấu.

Mỗi mẫu có layout JSON, TXT tọa độ, TXT toàn văn và báo cáo đối chiếu. TXT đi qua validator/serializer của frontend, kiểm tra giữ đủ số bản ghi. Ví dụ [TXT `Nguyễn Đặng`](ocr-diacritics/stacked-tahoma.coordinates.txt), [toàn văn](ocr-diacritics/stacked-tahoma.fulltext.txt), [TXT ô có hai dòng](ocr-diacritics/tight-accented-cell.coordinates.txt). `word_group` là bản ghi cha giữ bằng chứng trước tinh chỉnh từ, không phải một dòng OCR thừa.

## Kiểm chứng hồi quy

- **82/82 test Python** đạt, thêm 10 test về dấu với Arial, Times, Tahoma và Arial Italic ở 40/60/80 px; chữ nhỏ 10/12/14 px, hai ô riêng biệt, dấu nặng lặp lại, nhiễu không liên quan và crop API cũ. Mask tham chiếu được chiếu theo deskew thực trước kiểm tra.
- **176/176 test documents** đạt; typecheck đạt.
- **9 tình huống browser với model thật** đạt, không page error. Mẫu dấu chồng Tahoma giữ một dòng và hai từ; TXT tải từ giao diện có đủ 5 phần tử và không có dòng/từ thừa do dấu. Ảnh đối chiếu: `test-results/detailed/diacritics.png`.
- Bộ 11 mẫu tách dòng của lượt trước vẫn khớp **21/21 dòng**, không crop lẫn chữ; số liệu OCR không đổi.
- Sáu mẫu camera giữ số dòng/ô; 5 mẫu giữ CER. Mẫu phối cảnh mạnh có CER **10,719% → 10,855%** (tăng một lỗi ký tự), WER **12,883% → 13,497%**. Các vùng mực chưa xác định thay đổi theo bộ lọc đường chấm; không dùng số vùng giảm để tuyên bố OCR chính xác hơn. Xem [báo cáo camera](OPENCV-PHONE-PHOTO-OPTIMIZATION.md).

```powershell
# Terminal 1
npm run dev:all

# Terminal 2
npm run benchmark:documents:diacritics
npm run benchmark:documents:lines
npm run benchmark:documents:camera
npm run verify:documents:detailed:browser
npm run test:vietocr
npm run test:documents:inprocess
npm run typecheck
```

Script browser cần fixture từ cả ba benchmark. Baseline `-- before` chỉ chấp nhận service 1.7.0 để tránh ghi đè số liệu trước sửa bằng bản đang chạy; sau nâng cấp, dùng JSON baseline đã lưu. Không tự hạ service để tái lập baseline.
