# Tách dòng sát nhau, ô nhiều dòng và chữ nhỏ

Ngày cập nhật: 11/10/2026. Đã triển khai trong VietOCR service **1.7.0**, dùng chung cho luồng chi tiết và bộ tách trang của API cũ. Chạy toàn hệ thống bằng `npm run dev:all`, mở `http://localhost:3001/document-detail`.

Bản **1.7.1** sửa thêm dấu tiếng Việt bị tách riêng ở một số font/cỡ chữ lớn, vẫn giữ kết quả 21/21 dòng trong bộ mẫu dưới đây. Xem [báo cáo sửa dấu](OPENCV-DIACRITICS-FIX.md) để có kiểm chứng mới và giới hạn nhận diện.

## Lỗi đã tái hiện và sửa

- Hai dòng cách nhau 1–2 pixel bị phép giãn mask nối thành một vùng. Bộ tách cũ tiếp tục gộp khoảng trắng ngắn vì coi đó là khoảng cách giữa dấu và thân chữ.
- Có trường hợp đã có hai bounds dòng đúng nhưng padding ±4 pixel lấy thêm chữ của dòng bên cạnh vào crop OCR.
- Trong ảnh được nắn phối cảnh, ngưỡng chiều cao cố định loại cả số nhỏ còn đủ nét; số `0` và chuỗi `001234` không được thử OCR.

Module [line_layout.py](../services/vietocr-service/line_layout.py) thay quy tắc gộp khoảng trắng cố định bằng bằng chứng từ pixel:

1. Tìm các dải mực theo hàng, xác định thân chữ bằng connected components. Hai dải thân chữ đầy đủ được giữ riêng ngay cả khi chỉ có một hàng trắng giữa chúng.
2. Dấu rời được ghép với thân chữ gần nhất. Khi phép chiếu hàng bị một nét nhiễu nối liền hoặc hai cụm lệch vị trí ngang, dùng tâm, độ chồng lấn và cạnh dưới của thân chữ để phân nhóm dòng. Kiểm tra riêng chữ có nét xuống dưới và chữ hoa có dấu trên cùng baseline để tránh tách một dòng thành hai.
3. Siết bounds về mực thật; giữ parent ô biểu mẫu. Padding OCR chỉ mở trong khoảng trắng tới dòng/cột lân cận, rồi bị giới hạn bởi ô chứa nó.
4. Cho phép chữ nhỏ cao từ 5 pixel đi vào OCR khi có tương phản, mật độ mực và hình dạng thành phần phù hợp. Chữ nhỏ vẫn mang `SMALL_TEXT_OCR_REVIEW`; trang có bất kỳ dòng nhỏ nào đều có cảnh báo. Nhiễu không đủ bằng chứng giữ thành vùng chưa xác định.
5. Giới hạn số thân chữ được phân nhóm ở 4.096 trong một vùng. Khi vượt ngưỡng, giữ vùng đo được để xử lý theo ngân sách và đối chiếu, tránh một lượt phân nhóm không giới hạn trên nhiễu.

Không đổi quy ước tọa độ: pixel nguồn đã áp dụng EXIF, bounds XYXY half-open, polygon và ma trận chiếu ngược. TXT tọa độ giữ mọi bản ghi; không cắt theo trang giao diện đang xem.

## Kết quả trước và sau

**11 ảnh tổng hợp, 21 dòng tham chiếu:** phiên bản cũ khớp độc lập 4/21 dòng; bản mới khớp **21/21**, không crop dòng nào chứa mực của dòng lân cận. Đây là kết quả trên bộ mẫu tổng hợp, chưa phải độ chính xác trên ảnh điện thoại thật của người dùng.

| Mẫu | Số dòng trước → sau | CER trước → sau |
| --- | --- | --- |
| Hai dòng, cách 1 pixel | 1 → 2 | 66,67% → 0% |
| Hai dòng, cách 2 pixel | 1 → 2 | 70,83% → 0% |
| Hai dòng, cách 3 pixel | 2 → 2 | 0% → 0%; crop lẫn chữ: 2 → 0 |
| Ba dòng sát nhau | 1 → 3 | 83,78% → 2,70% |
| Một ô biểu mẫu chứa hai dòng sát nhau | 1 → 2 | 66,67% → 0% |
| Dòng lớn cạnh dòng nhỏ | 1 → 2 | 54,17% → 0% |
| Hai dòng tiếng Việt có dấu sát nhau | 1 → 2 | 44,83% → 3,45% |
| Tiếng Việt có dấu, khoảng cách bình thường | 2 → 2 | 3,45% → 3,45% |
| Hai cụm lệch vị trí ngang và cao độ | 1 → 2 | 0% → 0%; hình học dòng được sửa |
| Số nhỏ `001234` | 0 → 1 | 100% → 0% |
| Số nhỏ `0` | 0 → 1 | 100% → 0% |

CER là khoảng cách chỉnh sửa ký tự sau chuẩn hóa Unicode NFC và khoảng trắng; không hạ chữ hoa thành chữ thường. Model vẫn đọc `Hạnh` thành `hạnh` ở hai mẫu tiếng Việt và thiếu một khoảng trắng ở mẫu ba dòng. Tách đủ dòng không có nghĩa đọc đúng mọi ký tự. Số node từ cũng không bảo đảm ranh giới từ ngữ nghĩa: một mã số có thể được giữ trong nhiều crop từ, còn transcript dòng giữ kết quả OCR nguyên gốc.

[before.json](ocr-line-separation/before.json) chạy model local thật với snapshot ba hàm tách/crop/lọc chữ nhỏ của 1.6.0 trong cùng pipeline, không phải khởi động lại nguyên phiên bản service cũ. [after.json](ocr-line-separation/after.json) gọi HTTP service thật đang chạy. Cả hai dùng cùng ảnh và model; đáp án không được gửi cho OCR. Ảnh fixture sinh trong `test-results/line-separation/fixtures`.

Mask chữ tham chiếu được vẽ độc lập từng dòng. Kiểm tra khớp bounds một-một với IoU ≥ 0,65; nếu có warp, mask tham chiếu được chiếu qua ma trận trả về bằng nearest-neighbor. Crop OCR được kiểm tra không chứa pixel chữ tham chiếu của dòng khác. CER là phép đo riêng: mẫu lệch cột cho thấy toàn văn có thể đúng dù hình học dòng sai.

Mỗi mẫu có `.layout.json`, `.coordinates.txt`, `.fulltext.txt`, `.review.txt` trong `docs/ocr-line-separation`. File tọa độ và đối chiếu đi qua serializer/validator thực tế của frontend; số bản ghi xuất được kiểm tra bằng số phần tử đầu vào. Ví dụ:

- [TXT hai dòng sát nhau trong ô](ocr-line-separation/multiline-cell.coordinates.txt), [toàn văn](ocr-line-separation/multiline-cell.fulltext.txt).
- [TXT dòng tiếng Việt có dấu](ocr-line-separation/vietnamese-tight.coordinates.txt).
- [TXT số nhỏ](ocr-line-separation/small-number.coordinates.txt), [lý do cần đối chiếu](ocr-line-separation/small-number.review.txt).

Ở bản 1.7.0, benchmark 6 ảnh camera chạy lại giữ nguyên CER và số dòng/ô. Bản 1.7.1 giữ số dòng/ô và CER của 5/6 mẫu; CER mẫu phối cảnh mạnh tăng một lỗi ký tự, được ghi trong báo cáo sửa dấu. Xem [báo cáo camera](OPENCV-PHONE-PHOTO-OPTIMIZATION.md).

## Kiểm chứng và tái lập

- Python: **72/72** test đạt, gồm 10 test mới với nhiều cỡ chữ, khoảng cách và đối chứng. Các test hình học dùng mask độc lập để kiểm tra giữ toàn bộ nét chữ, dấu và crop không lẫn dòng khác; không dùng OCR giả để chứng minh chất lượng nhận diện.
- Documents: **176/176** test đạt; typecheck và build production đạt. Build dùng `AFL_BUILD_DIR=.next-detailed-build` để tách cache dev.
- Browser chi tiết: **8 tình huống với model thật**, không có page error. Ô hai dòng sát nhau được chạy với OCR từng từ riêng: giữ hai line cùng parent ô, hai crop độc lập; bất đồng OCR dòng/từ vẫn được hiển thị để kiểm tra. Ảnh màn hình: `test-results/detailed/tight-lines.png`.

```powershell
# Terminal 1
npm run dev:all

# Terminal 2: service 8000 và Next 3001 đang chạy
npm run benchmark:documents:lines
npm run benchmark:documents:camera
npm run benchmark:documents:diacritics
npm run verify:documents:detailed:browser
npm run test:vietocr
npm run test:documents:inprocess
npm run typecheck
```

`npm run benchmark:documents:lines -- before` tái lập baseline snapshot trong tiến trình riêng với model local. Lệnh mặc định chạy bản hiện tại, xuất TXT và trả lỗi nếu có dòng tham chiếu không khớp hoặc crop lẫn dòng. Script browser cần fixture từ cả hai lệnh benchmark trước đó.

Ảnh chụp thật bị mất nét, lóa cháy chữ, hai dòng chạm nhau hoàn toàn hoặc bố cục nhiều cột phức tạp vẫn cần đánh giá riêng. Bộ sửa hiện tại cải thiện ba nhóm lỗi đã tái hiện; chưa có tập holdout ảnh lỗi thực tế từ người dùng để tuyên bố mức recall tổng quát.
