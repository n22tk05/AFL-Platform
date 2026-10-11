# Chặng 15 — Holdout F05: OCR lưới dày và bảng Có/Không

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Đây là thử nghiệm phôi trắng F05 hai trang ảnh `F05-p2.png` và `F05-p3.png` trong `private-documents/form-research-20`, không dùng dữ liệu công dân. Trang thứ hai là phần nối tiếp của bảng ở trang đầu. Dùng OpenCV trình duyệt, API OCR/VietOCR local và màn hình đối soát admin thật; chặn mọi lời gọi lưu asset và sinh kịch bản. Bằng chứng chi tiết ở `private-documents/recognition-evaluation/F05-p2-p3.holdout.live.*` (được ignore, không commit ảnh/phôi).

## Phát hiện và sửa

Trước sửa, bộ lọc nét lưới OCR chỉ bỏ đường có độ dày tối đa khoảng 4 px. Lưới scan F05 có thành phần dày 9–17 px, khiến chữ trong bảng nối thành một vùng lớn. API chỉ nhận ra 22 dòng OCR trên trang đầu và **1 dòng** (số trang) ở trang tiếp nối. Bản đối soát tạo 88 + 67 ô, **0 nhãn** ở cả hai trang.

`text_ink_mask` nay bỏ thêm nét dài, mảnh theo tỷ lệ trang dù biên quét bị gợn/dày, nhưng giữ vùng mực đặc (để không xóa văn bản hoặc thanh đen). Test tổng hợp có lưới gợn bảo vệ cả chữ và việc tách vùng. Sau khi khởi động lại OCR local, API thật trả **35 + 29 dòng OCR**. Đây là số dòng quan sát trên bản scan này, không phải cam kết độ chính xác OCR.

Bộ ghép bảng `STT | mô tả | Có | Không` nay coi cột mô tả có chữ là **nhãn của hàng**, không phải ô nhập; hai cột lựa chọn lấy nhãn dạng `mô tả — Có/Không`. Test tổng hợp bảo vệ quy tắc này và mẫu CT01 vẫn đạt benchmark 45/45 ô bảng có nhãn chuẩn. Trên F05, bản đối soát sau sửa có **66 + 67 ô**, trong đó **15 + 1 ô có nhãn**. Mọi ô đều `needsReview`; chưa có gì được lưu/duyệt tự động.

## Giới hạn quan trọng

- F05 vẫn chưa đạt mục tiêu giảm chỉnh sửa thủ công: 133 ô đề xuất, chỉ 16 ô có nhãn, còn ô số thứ tự và cột mô tả bị phát hiện dư ở các hàng chưa ghép bảng. Không được gọi đây là nghiệm thu nhận diện tổng quát.
- Trang nối tiếp không in lại tiêu đề cột. Thuật toán hiện xử lý từng trang độc lập nên chưa kế thừa cấu trúc bảng `Có/Không`; 67 ô trang hai hầu như không có ngữ cảnh. Chỉ chuyển tiêu đề khi chứng minh được cùng lưới cột, có ranh giới trang và không xuất hiện bảng mới; nếu không phải để `needsReview`, không đoán nhãn.
- OCR còn lỗi ký tự/dấu, ví dụ `1.4` thành `14` và `tỉnh` thành `tinh`. Cần benchmark nhãn theo ground truth được chú giải, không dùng số dòng OCR làm độ chính xác. Không đưa câu sai vào Voice AI khi chưa được admin duyệt.
- Bài thử F05 hiện là holdout khám phá, chưa có annotation độc lập cho mọi ô để tính precision/recall. Cần chú giải trang 2–3 và thêm mẫu scan dày khác trước khi điều chỉnh ngưỡng rộng hơn.

## Kiểm chứng

- `python -m unittest discover -s services/vietocr-service/tests -p 'test_*.py'`: 26/26 PASS.
- `npm run test:recognition`: PASS; `npm run typecheck`: PASS; `npm run build`: PASS (cảnh báo `<img>` đã tồn tại ở màn admin).
- Browser local F05 qua OCR/API thật: 1/1 PASS; browser CT01 `F20-p1.png`: 1/1 PASS; `git diff --check`: PASS.
- Không gọi cloud, không ghi DB, không lưu asset. Dịch vụ OCR port 8000 và Next port 3001 đã được khởi động lại sau build; port thử 8001 đã dừng.

## Chặng kế tiếp

1. Chú giải độc lập các hàng/cột F05 p2–p3, đo TP/FP/FN theo IoU và nhãn, đặc biệt ô số thứ tự và cột mô tả bị dư.
2. Mang `table-header context` qua ranh giới trang với điều kiện hình học chặt; test bảng nối tiếp, bảng đổi cấu trúc và trang ghi chú. Không tự xác nhận nhãn khi OCR yếu.
3. Kiểm thử các scan lưới dày khác cùng CT01/TK01, rồi mới cân nhắc giảm số ô phải sửa trong FE. Test mặc định không phụ thuộc ảnh nghiên cứu private hoặc gọi cloud.
