# Step 75 — Cross-form upload regression and paired-column review reduction

## Mục tiêu

Kiểm tra rule phân biệt cặp trường được neo bởi tiêu đề hai cột với trường chỉ suy luận, đồng thời chạy lại luồng `/admin/upload` trên nhiều biểu mẫu để tìm hồi quy. Mục tiêu đo là số mục ưu tiên review và chất lượng nhãn/tọa độ; chưa dùng thời gian thao tác làm chỉ số vì chưa có dữ liệu thao tác admin thực.

## Thay đổi và kết quả mới

- Dùng cặp tiêu đề bên nam/bên nữ và trường đối ứng cùng nhãn gốc, loại dữ liệu, hàng và cột làm bằng chứng `COLUMN_ACTOR_SCOPE_GROUNDED`. Trường không có đối ứng vẫn giữ `COLUMN_ACTOR_SCOPE_INFERRED` và `needs_review`.
- Trường hợp có chứng cứ cặp chỉ chuyển thành `suggested`, không thành đã duyệt. Phê duyệt vẫn cần admin xác nhận riêng.
- Bổ sung regression trình duyệt cho form kết hôn: 10 trường có scope được ghép cặp; 9 trường thành `suggested`; 1 trường vẫn `needs_review` vì `LABEL_POSITION_ESTIMATED`. Tổng `needsReview` giảm từ 24 xuống 15 (giảm 37.5% trong holdout này), không thay đổi nhãn hay hình học chuẩn.
- Sửa mock của test lưu review để cung cấp `stepFaq.deleteMany`, đúng với lời gọi trong transaction hiện hành; đây là thiếu sót của test double, không phải thay đổi nghiệp vụ.

## Ma trận kết quả upload

Các holdout dưới đây chạy qua giao diện upload thật trên build production cục bộ, với VietOCR cục bộ. Request ghi asset và sinh kịch bản bị chặn; không ghi DB, không gọi Gemini. Các holdout `development` là mẫu đã dùng trong quá trình phát triển, không được coi là blind test mới.

| Biểu mẫu | Phát hiện TP/expected | FP/FN | Nhãn chính xác | IoU trung bình / thấp nhất | Cần review |
| --- | ---: | ---: | ---: | ---: | ---: |
| HCMC-MARRIAGE-P20 | 29/29 | 0/0 | 29/29 | 0.747 / 0.506 | 15/29; giảm từ 24 sau rule ghép cặp |
| CENTRAL-CONSTRUCTION-P59 | 29/29 | 0/0 | 10/29 | 0.731 / 0.502 | 24/29 |
| CENTRAL-AUTHORIZATION-P61 | 20/20 | 0/0 | 9/20 | 0.720 / 0.529 | 17/20 |
| HCMC-BIRTH-P70 | 29/29 | 0/0 | 24/29 | 0.736 / 0.634 | 23/29 |
| QT-09-HSB | 24/24 bảng | 0/0 | 24/24 | 0.927 / 0.901 | 4/33 tổng trường; 0/24 ô bảng |
| CT01 F20-p1 | 45/45 ô bảng | 0/0 | 45/45 | 0.967 / 0.930 | 6/60 tổng trường; 0/45 ô bảng |

Kết quả cho thấy độ bao phủ phát hiện tốt trên các mẫu đã kiểm tra, nhưng exact-label và hình học còn yếu trên ba form hành chính P59/P61/P70. Tỷ lệ `needs_review` tổng thể cũng còn cao; không thể kết luận áp lực admin đã giảm tương ứng theo thời gian.

## Kiểm thử

- Browser `/admin/upload`: P20, P59, P61, P70, QT-09-HSB, CT01 — **6/6 passed**.
- Bộ kiểm tra nhận diện gồm VietOCR/OpenCV, nhận diện form, đa trang, metadata và kiểm tra manifest/assets: **117/117 passed**.
- TypeScript `tsc --noEmit --incremental false`: passed.
- Production build: passed; còn cảnh báo lint hiện hữu về `<img>` và dependencies `useMemo`.
- Approval contract vẫn giữ human confirmation; test upload không thực hiện lưu hoặc xuất bản.

## Việc còn lại và tiêu chí hoàn tất

- Cải thiện OCR và phân nhóm nhãn cho P59/P61: có trường thiếu nhãn hoặc nhãn quá ngắn; cần dữ liệu holdout mới và đánh giá CER/nhãn trước khi hạ review.
- P70 còn scope người được khai sinh, trường checkbox và tọa độ/nhãn ước lượng; chỉ được giảm ưu tiên khi có bằng chứng cấu trúc đủ mạnh.
- P20 còn 15 mục ưu tiên; các trường có tọa độ ước lượng, vùng tiếp dòng lệch, ngày tách phần và checkbox scope phải giữ review cho đến khi có rule/test an toàn.
- QT-09/CT01 chứng minh rule bảng lặp không làm sai nhãn trên hai layout; cần thêm mẫu bảng mở đáy, scan nghiêng và tiếp nối trang.
- Bổ sung blind holdout chưa dùng để tinh chỉnh, và đo thời gian/số lần sửa admin trước–sau với cùng tác vụ. Chỉ coi mục tiêu giảm tải đạt khi chất lượng nhãn/tọa độ không giảm, không phát sinh FP/FN có ý nghĩa và thời gian review thực giảm.

## An toàn dữ liệu

Chỉ xử lý ảnh biểu mẫu thử nghiệm/biểu mẫu trắng tại môi trường local. Không dùng dữ liệu công dân thật; không lưu asset vào DB, không gửi dữ liệu tới Gemini, không tự duyệt hay xuất bản workflow.
