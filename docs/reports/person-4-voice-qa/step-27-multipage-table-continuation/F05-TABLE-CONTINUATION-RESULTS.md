# Chặng 16 — Kế thừa lưới bảng qua trang và đo F05

Ngày 10/10/2026. Nhánh `codex/form-recognition-and-multiline`. Đây là benchmark phôi trắng F05 (`F05-p2.png`, `F05-p3.png`) từ kho nghiên cứu local, không có dữ liệu công dân và không gọi cloud/ghi DB. Ảnh không được commit. Toàn bộ thao tác admin browser chặn lưu asset và sinh kịch bản.

## Thay đổi

- Khi một bảng `STT | mô tả | Có | Không` kéo tới cuối trang, bộ nhận diện giữ tiêu đề cột cho trang sau **chỉ nếu** lưới cột phù hợp. Bảng có tiêu đề riêng, lưới đổi hoặc trang ghi chú trung gian không kế thừa ngữ cảnh.
- Hàng trang sau vẫn được ghép khi viền ô mô tả bị đứt nhưng cả hai cột Có/Không còn khớp; nhãn lấy từ OCR cùng hàng. Hai ô của hàng đầu F05 chưa khép viền trên được đề xuất từ chữ OCR, lưới và khung bảng; gắn `OPEN_TOP_ROW_INFERRED` để bắt buộc đối soát.
- Cùng quy tắc lưới liên tục áp dụng cho phần dưới trang đầu. Nét rất nhỏ nằm trong chữ tiêu đề/hướng dẫn được phân loại là cấu trúc in sẵn, không thành ô checkbox. FE admin hiển thị cảnh báo riêng cho tiêu đề kế thừa và hàng suy ra.
- `TABLE_HEADER_CARRIED`, `TABLE_LONG_GRID_CONTINUATION` và `OPEN_TOP_ROW_INFERRED` luôn giữ trạng thái `needs_review`, không tự xác nhận hoặc công bố.

## Đo trên ảnh thật

Hai fixture pixel trong `tests/fixtures/recognition-f05-p2-choice-ground-truth.json` và `tests/fixtures/recognition-f05-p3-choice-ground-truth.json` ghi ranh giới hàng/cột lựa chọn được đối chiếu trên ảnh scan. Ghép một-một bằng IoU tối thiểu 0,5. Đây là **đo hình học trên một biểu mẫu**, không phải độ đúng OCR/ngữ nghĩa hay kiểm chứng tổng quát 20 biểu mẫu.

| Trang ảnh | Ô lựa chọn chú giải | Khớp | Dư | IoU trung bình / thấp nhất | Có nhãn OCR |
| --- | ---: | ---: | ---: | ---: | ---: |
| F05-p2 | 36 | 36 | 0 | 0,950 / 0,913 | 34/36 |
| F05-p3 | 30 | 30 | 0 | 0,847 / 0,719 | 30/30, gồm 2 ô suy ra |

So với chặng 26: trang đầu từ 66 ô/15 nhãn thành **36 ô/34 nhãn**, trang nối từ 67 ô/1 nhãn thành **30 ô/30 nhãn**. Tuy vậy chữ OCR ở một số nhãn sai hoặc thiếu, ví dụ `3.4` thành `34`, `4.5` thành `45`, và nhãn `1.5` chưa đọc được. Không được dùng số nhãn có giá trị để suy ra số nhãn **đúng**. Mọi ô F05 vẫn cần admin xác nhận, nhất là hai ô suy ra và nhãn OCR kém.

CT01 F20-p1 vẫn khớp **45/45 ô bảng** theo fixture riêng. Tổng đề xuất hợp lý giảm 71→70 vì một contour trong tiêu đề văn bản trước đây bị đếm nhầm là checkbox; ảnh CT01 xác nhận đây không phải ô nhập. Trang ghi chú CT01 vẫn có 0 ô.

## Kiểm chứng và giới hạn

- `npm run test:recognition`: 54/54 PASS, gồm test kế thừa dương và âm cho lưới đổi/trang ghi chú/hàng đầu OCR không đủ bằng chứng.
- VietOCR Python: 26/26 PASS; `npm run typecheck` và `npm run build` PASS. Build chỉ còn cảnh báo `<img>` đã biết ở màn admin.
- Browser local: F05 1/1; CT01 trang đầu và hai trang 2/2; TK01 + hai trang ghi chú 3/3; browser mặc định 4/4. `git diff --check` PASS sau thay đổi UI.
- Test dùng Next local `:3001` và VietOCR local `:8000`, không ghi DB, không lưu asset, không gọi Gemini. JSON chi tiết ở `private-documents/recognition-evaluation/F05-p2-p3.holdout.live.*` (ignored).

**Chưa nghiệm thu công bố tự động:** cần benchmark độ đúng nhãn chữ theo bản chép chuẩn, thêm nhiều biểu mẫu scan chất lượng khác, kiểm tra các bảng không đánh số và hàng đầu không khép viền, cùng kiểm thử staging/API/Voice trên workflow ACTIVE như checkpoint chặng 25. FE hiện hỗ trợ admin sửa nhãn/vùng; các nhãn OCR sai phải được sửa trước khi tạo kịch bản và phê duyệt.
