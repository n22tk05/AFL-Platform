# Step 83 — Nhãn đánh số OCR lỗi và ranh giới ô inline

## Mục tiêu và nguồn kiểm thử

- Tập trung vào bước `/admin/upload`: OCR tiếng Việt, ghép nhãn với vùng nhập và tránh gộp nhầm các trường liền kề.
- Phôi trống TK1-TS trang 1 do BHXH Việt Nam công bố: [31513_TK1_TS.pdf](https://baohiemxahoi.gov.vn/content/hoidap/Lists/DanhSachTraLoi/Attachments/3860/31513_TK1_TS.pdf), SHA-256 `F99691494BEDE3A512D5FA2A4B408B232F8583183455571DD129DA3DAEDA4792`.
- Trang đã được kiểm tra trực quan, không chứa dữ liệu công dân. Ảnh PNG và kết quả chạy được lưu trong `private-documents/recognition-evaluation/` (được ignore); fixture ground truth nằm tại `tests/fixtures/recognition-bhxh-tk1-ts-page1-ground-truth.json`.
- Chú giải thủ công bao phủ 8 vùng nhập đầu tiên của phần I. Mẫu đã được dùng để phân tích và tinh chỉnh nên được giữ làm **regression/development sample**, không tuyên bố là blind holdout độc lập sau sửa đổi.

## Sửa đổi

- `src/modules/forms/services/form-region-recognition.ts` nhận nhãn đánh số mà OCR làm hỏng dấu ngoặc, ví dụ `05]. Dân tộc`, để tránh gán nhãn của dòng trước cho ô trống.
- Phát hiện dòng OCR dài chứa nhãn đánh số ngay trước vùng nhập và chặn nhánh gộp continuation khi có bằng chứng ranh giới. Các continuation hợp lệ vẫn được giữ bằng kiểm thử riêng.
- Khi cùng một nhãn bị gắn vào hai vùng hình học khác nhau, giữ nhãn trên vùng đầu để admin có ngữ cảnh, đánh dấu `DUPLICATE_LABEL_NOT_A_CONTINUATION` và bắt buộc `needs_review`. Hai candidate trùng tọa độ vẫn bị bỏ nhãn để không sinh hai hướng dẫn từ một ô.
- Không tự duyệt hoặc tự xuất bản trường nào; kết quả vẫn là đề xuất để admin xác nhận.
- Thêm kiểm thử mô phỏng nhãn OCR lỗi và nhãn dài giữa hai vùng nhập trong `src/modules/forms/tests/form-region-recognition.test.ts`.

## Kết quả đo trên TK1-TS

| Chỉ số | Kết quả |
| --- | ---: |
| Trường ground truth trong phạm vi | 8 |
| Trường khớp hình học (IoU ≥ 0.5) | 8/8 |
| Ứng viên dư trong phạm vi | 1 |
| Nhãn không rỗng trên trường khớp | 6/8 |
| Nhãn trùng nguyên văn | 2/8 |
| Sai số tuyệt đối trung bình mỗi cạnh | 11.96 px |
| P90 sai số tuyệt đối mỗi cạnh | 38.02 px |
| Cạnh sai số không quá 2 px | 16/32 |
| Tóm tắt toàn trang | 27 phát hiện, 19 có nhãn, 15 `needs_review`, 58 vùng loại trừ |

So với lần chạy trước khi chặn continuation, các ô trong phạm vi tăng từ 7/8 lên 8/8. Giữ nhãn ở candidate đầu trong collision làm số trường có nhãn toàn trang tăng từ 14 lên 19 mà không hạ mức kiểm duyệt. Tuy vậy, số phát hiện tăng từ 25 lên 27 và `needs_review` tăng từ 11 lên 15; đây là đánh đổi để không gộp nhầm trường, **chưa phải mức giảm tải admin**. Sai số P90 cũng cho thấy tọa độ một số vùng ngắn chưa đủ chính xác để nghiệm thu.

## Kiểm tra độc lập thêm: BHXH 01-TK trang 58

- Nguồn là phôi trống Mẫu 01-TK, trang 58 trong công báo BHXH TP.HCM; ảnh 1075×1521, SHA-256 `C3DA948B00917301A1602B3FDF828121D55D6BA9FF613AF72E1B94E251CDF912`. Ảnh được kiểm tra trực quan, không có dữ liệu công dân.
- Ground truth thủ công bao phủ bốn trường inline đầu tiên và ba ô chọn dưới câu hỏi `[02]`. Ban đầu OpenCV tìm thấy ba ô vuông nhưng bộ lọc loại chúng do OCR gộp ký hiệu vuông vào bbox chữ. Sửa lọc theo bằng chứng nhóm lựa chọn: câu hỏi đánh số ở trên, các ứng viên vuông cùng cột và mỗi ứng viên có dòng lựa chọn kế bên. Bbox OCR được phép phủ nhẹ lên ký hiệu; bộ lọc vẫn yêu cầu ít nhất ba lựa chọn cùng nhóm để tránh giữ contour rời trong văn xuôi.
- Nhãn lựa chọn bỏ ký tự OCR nhầm `O`/`Ở` ở đầu dòng, giữ nguyên nội dung lựa chọn; tọa độ chính vẫn lấy từ candidate OpenCV, không lấy từ bbox chữ OCR.
- Parser nhãn đánh số bỏ dấu chấm OCR thừa ngay trước `[01.2]`, nhờ đó candidate cạnh dòng `Họ và tên` không mượn nhãn `[01]` của phần mô tả phía trên.
- Nhãn viết tiếp sang dòng kế được ghép chỉ khi candidate thuộc nhóm checkbox đã xác thực, dòng dài, đầu dòng căn trái và khoảng cách dọc nhỏ. Ký hiệu OCR `DDCN` trong mã trường chuẩn hóa thành `ĐDCN`.
- Khi rà ảnh crop độ phân giải gốc, bốn bbox ground truth đầu tiên được sửa để ôm sát đoạn chấm thực tế; các giá trị cũ đã tính nhầm phần nhãn/ khoảng trắng là vùng nhập. Vì vậy các số dưới đây dùng ground truth đã hiệu chỉnh thủ công theo ảnh, không so trực tiếp với số tọa độ báo cáo trước đó.

| Chỉ số | Kết quả |
| --- | ---: |
| Trường ground truth trong phạm vi | 7 |
| Trường khớp hình học (IoU ≥ 0.5) | 7/7 |
| Ứng viên dư trong phạm vi | 0 |
| Nhãn không rỗng | 7/7 |
| Nhãn trùng nguyên văn | 7/7 |
| Sai số tuyệt đối trung bình mỗi cạnh | 2.69 px |
| P90 sai số tuyệt đối mỗi cạnh | 8.00 px |
| Cạnh sai số không quá 2 px | 21/28 |
| Tóm tắt toàn trang | 30 phát hiện, 26 có nhãn, 21 `needs_review`, 93 vùng loại trừ |

Đây là **development/regression sample**, không phải blind holdout sau khi dùng nó để sửa bộ lọc. Sau khi cập nhật nhãn và chú giải tọa độ theo pixel ảnh: recall và exact label trong phạm vi đều đạt 7/7; không có false positive trong bảy vùng được chú giải. Coordinate MAE 2.69 px, P90 8.00 px; toàn trang vẫn có 21/30 `needs_review`. Vì mẫu đã dùng để phát triển và chỉ bao phủ phần đầu trang, các kết quả này chưa chứng minh tổng thể giảm tải admin hay hiệu quả trên phôi độc lập.

## Holdout 09-MST và lần hiệu chỉnh mới

- Dùng phôi trắng Mẫu 09-MST từ văn bản hợp nhất 06/VBHN-BTC, PDF trang 108; nguồn chính thức và mã băm được ghi trong `tests/fixtures/recognition-tax-09-mst-page108-ground-truth.json`. Trang không chứa dữ liệu công dân. Fixture bao phủ bốn trường: cơ quan thuế, người nộp thuế, MST/MSDN và điện thoại mới.
- Lần chạy đầu nhận dạng đúng cả 4 trường nhưng nhãn `Người nộp thuế` bị loại vì classifier xếp nhầm vào `signature_title`; trường được gán nhãn ở dòng thông báo kế bên. Thay đổi parser để nhãn khớp rõ quy tắc trường vẫn có thể tạo anchor dù nhãn phân loại tĩnh sai; unit test kiểm tra xung đột này.
- Kiểm tra crop ảnh gốc và hiệu chỉnh các đoạn chấm trong ground truth, đặc biệt cạnh phải ô Cục Thuế/Chi cục Thuế vốn bao gồm chữ `thông báo`. Do fixture đã được hiệu chỉnh sau khi xem dự đoán, kết quả lần này được coi là regression/development, không còn là blind acceptance.
- Thêm guard hẹp cho gạch chân tiêu đề bắt đầu bằng `Về việc` và cho ứng viên `field_row` chỉ phủ chữ pháp lý tĩnh khi không có writing guide thật. Hai kiểm thử đơn vị xác nhận không loại nhầm field candidate có dotted guide.

| Chỉ số 09-MST | Kết quả |
| --- | ---: |
| Trường khớp hình học (IoU ≥ 0.5) | 4/4 |
| Nhãn trùng nguyên văn | 4/4 |
| Ứng viên dư trong 4 hàng được chú giải | 0 |
| Coordinate MAE / P90 mỗi cạnh | 6.33 px / 17.00 px |
| Cạnh sai số không quá 2 px | 10/16 |
| Tóm tắt toàn trang | 18 phát hiện, 11 có nhãn, 13 `needs_review`, 68 vùng loại trừ |

Mẫu này cho thấy sửa nhãn có ích, nhưng **chưa chứng minh giảm tải admin**: 13/18 phát hiện toàn trang còn cần đối soát và phần lớn trang chưa được chú giải. Hai ứng viên tĩnh bị loại sau khi đối chiếu overlay với ảnh gốc. Giữ trạng thái kiểm duyệt bảo thủ; không hạ `needs_review` theo mục tiêu số lượng.

## Kiểm chứng

- `npm run test:recognition`: 137/137 qua sau khi bổ sung kiểm thử gạch phân cách chân trang và hai trường cùng dòng “Ngày cấp/Nơi cấp”.
- `npx tsc --noEmit`: qua.
- Build production cô lập với `AFL_BUILD_DIR=.next-step83-build`: qua; không ghi đè `.next` của ứng dụng đang chạy. Build có cảnh báo `<img>` ở trang upload/modal và warning hook hiện có ở trang citizen guide.
- Browser upload trên `http://127.0.0.1:3105` với VietOCR local: 09-MST qua tiêu chí 4/4 sau khi hiệu chỉnh fixture; 6/6 hồi quy browser (hợp đồng lao động, khai sinh, khai tử, khai tử P43 baseline, khai tử P43 scope, giám hộ) qua. Các mẫu BHXH TK1-TS và 01-TK vẫn có kết quả đo ở trên.
- Browser test chặn `/api/admin/forms/assets` và `/api/llm/prompt`; không ghi DB, không gửi dữ liệu công dân. Không dùng dịch vụ AI cloud.
- Hồi quy Playwright trên UI hiện tại: benchmark Mẫu 1 1/1, upload/generation synthetic 1/1 và kéo-sửa-vùng review 1/1. Test review cần cuộn vùng đích vào viewport trước khi kéo; lần đầu không thao tác được vì điểm chuột nằm ngoài viewport.
- Test upload/generation synthetic chặn VietOCR bằng tài liệu synthetic và giả lập phản hồi asset/Gemini ở browser; xác nhận đủ ba vùng nhập được gửi cùng `FormOcrContext`. Không gọi DB hoặc cloud API.

## Mẫu đơn đăng ký doanh nghiệp tư nhân — Mẫu 1 (phát triển)

- Thử thêm trang phôi trắng Mẫu 1 ban hành kèm Thông tư 68/2025/TT-BTC, trang in số 57. Bản PDF Công báo Chính phủ và ảnh raster được lưu trong thư mục đánh giá cục bộ bị ignore; test chỉ gọi VietOCR local, chặn các endpoint ghi asset và sinh kịch bản.
- Trường `Kính gửi: (Cơ quan đăng ký kinh doanh cấp tỉnh)........` trước đây bị loại như nội dung tĩnh. Bằng chứng OCR + writing-guide cho thấy dòng chấm kéo dài sau phần giữ chỗ là vùng điền; parser nay giữ lại như một trường cần review, không tự duyệt. Unit test kiểm tra trường hợp này.
- Gạch ngang ngắn ngay trước chú thích “Trường hợp Tòa án hoặc Trọng tài…” được nhận diện là phân cách chân trang thay vì ô nhập. Guard yêu cầu candidate `underline`, khoảng cách nhỏ tới dòng chú thích và chồng lấn ngang đáng kể; test xác nhận không tạo ô nhập. Trên mẫu này guard loại một ứng viên giả.
- Khi OCR gộp “Ngày cấp” và “Nơi cấp” cùng một dòng nhưng candidate dotted vượt ra ngoài bbox OCR, bộ ghép ngữ cảnh nay tách hai vùng và không ghép nhầm “Nơi cấp” vào “Số Hộ chiếu”. Cả hai vẫn ở trạng thái review.
- Playwright kiểm thử upload trên `127.0.0.1:3105` chạy thành công với VietOCR local sau ba thay đổi; test chặn API lưu asset và Gemini.
- Kết quả lần chạy phát triển hiện tại: 19 phát hiện, 18 có nhãn, 9 cần review; fixture hiện cho 12/19 khớp, 7 bỏ sót, 7 ứng viên dư; exact label 8/12; MAE cạnh 18.13 px, P90 77.94 px, 9/48 cạnh trong 2 px. Tách inline phục hồi `Nơi cấp`; sai số cạnh phải khoảng 102 px theo fixture v1 **chưa được xác minh** và có thể đến từ ground truth đặt cạnh phải quá rộng. Guard chân trang loại một ứng viên giả; chưa có bằng chứng giảm thời gian admin.
- **Không coi đây là blind holdout hoặc nghiệm thu**: quy tắc người nhận đã được điều chỉnh sau khi xem đầu ra trên mẫu này, và rà soát ban đầu phát hiện một số cạnh phải trong ground truth chưa được xác nhận đủ sát ảnh gốc. Giữ nguyên fixture v1 để truy vết; cần rà nhãn/tọa độ thủ công dựa trên ảnh gốc, rồi khóa một mẫu khác chưa dùng để tinh chỉnh làm holdout độc lập.
- Kết quả cho thấy recall và tọa độ toàn trang còn yếu; đặc biệt chưa nhận ra đủ các dòng địa chỉ, email và ngày/nơi cấp hộ chiếu. Không giảm mức `needs_review` hoặc tuyên bố giảm công việc admin dựa trên số phát hiện ít hơn.

## Mẫu đơn đăng ký công ty TNHH một thành viên — Mẫu 2 (development)

- Dùng trang đầu Mẫu số 2 kèm Thông tư 68/2025/TT-BTC, ảnh 903×1289, SHA-256 `EB2B5DB17D8D8FB06C1872583D840A3CC20EFC5AED4D4D1CD692451609B34C83`. Fixture `recognition-business-form-02-page1-ground-truth.json` được lập trước lần OCR đầu và chỉ chứa vùng nhập, nhưng một số cạnh vẫn cần rà lại trên ảnh gốc; v1 được giữ nguyên, không chỉnh để khớp dự đoán.
- Lần chạy đầu cho 17 phát hiện, 15 nhãn, 7 `needs_review`, 6/18 khớp hình học, 12 bỏ sót và 11 ứng viên dư. Phân tích OCR chỉ ra các hàng tên/ngày sinh bị VietOCR tạo nhiễu vào bbox, trong khi OpenCV chia dòng chấm thành nhiều đoạn ngắn.
- Bổ sung điều kiện hẹp: chỉ nhóm các nét ngắn cùng hàng khi có nhãn văn bản gần đó, không có nhãn khác xen giữa và các nét tạo thành chuỗi; ghép thành một vùng nhập logic. Nhãn `Tôi là (ghi họ tên bằng chữ in hoa)` và hàng ngày sinh được giữ dù OCR có nhiễu. Các trường này vẫn `needs_review`; nét ngắn đơn lẻ không có nhãn vẫn bị loại như trước.
- Benchmark hiện dùng hull của các input region cùng một trường, cùng hàng và cách nhau tối đa 0.15 chuẩn hóa; nếu không, các mảnh của một dòng sẽ bị so như chỉ có mảnh đầu. Mẫu phát triển mới cho 21 phát hiện, 19 nhãn, 11 cần review và 8/18 khớp hình học (6 nhãn chính xác). Còn 10 bỏ sót và 13 ứng viên dư toàn trang. Mức 6/18 baseline cũ dùng ngưỡng hull 0.03 nên không so trực tiếp tuyệt đối; fixture v1 và tọa độ còn cần audit thủ công.
- Ba unit test kiểm tra nhóm đoạn cùng nhãn, nhãn tên/ngày sinh có nhiễu và âm tính với nét chấm rời. Browser test `/admin/upload` chạy qua với VietOCR local; endpoint lưu asset và sinh kịch bản bị chặn, không ghi DB hay gọi Gemini. Không có trường nào tự duyệt.
- Kết quả chứng minh phục hồi được hai trường bị bỏ sót ở benchmark nhưng **chưa đạt mục tiêu giảm tải admin**: tổng `needs_review` tăng từ 7 lên 11 cùng số phát hiện tăng; recall toàn trang còn thấp, và 13/21 phát hiện chưa khớp ground truth. Cần sửa annotation theo ảnh gốc và mở rộng holdout độc lập trước khi chấp nhận thay đổi.

## Còn tồn tại / tiêu chí chưa đạt

- Trường `Quốc tịch` và một số trường con dạng `[06.1]`, `[07.1]` vẫn có thể không nhận nhãn hoặc bị gộp/tách thiếu ngữ cảnh khi một dòng OCR chứa nhiều nhãn. Cần giữ offset/tọa độ token hoặc tách line OCR thành các nhãn con có căn cứ, thay vì suy diễn từ toàn bbox của dòng.
- Sai số tọa độ cạnh trái/phải ở một số dòng vẫn cao; trên mẫu doanh nghiệp (chưa phải holdout hợp lệ), P90 là 77.94 px. Cần đo trên ảnh scan và ảnh chụp độc lập ở nhiều độ phân giải.
- 15 trường cần ưu tiên duyệt trên toàn trang TK1-TS cho thấy chưa đạt mục tiêu giảm tải. Không hạ `needs_review` chỉ để giảm con số nếu chưa có bằng chứng nhãn, ranh giới và tọa độ đúng.
- TK1-TS, 01-TK và 09-MST đều đã được dùng để phát triển/chỉnh ground truth; cần khóa annotation mới độc lập trước đợt tinh chỉnh tiếp theo. Đo precision/recall, false candidates, exact labels, sai số cạnh/IoU và tỷ lệ review trên toàn trang.
- Thời gian admin và số thao tác sửa chưa được đo; các chỉ số hiện tại chỉ là proxy kỹ thuật, không chứng minh tiết kiệm thời gian thực tế.
