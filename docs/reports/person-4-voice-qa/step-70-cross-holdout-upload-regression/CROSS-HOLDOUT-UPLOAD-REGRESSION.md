# Step 70 — Cross-holdout upload regression

## Mục tiêu

Kiểm tra lại các thay đổi nhận diện phôi trắng trên bốn biểu mẫu độc lập qua đúng `/admin/upload`, đồng thời tách bạch bằng chứng hình học vùng nhập liệu với độ chính xác OCR và mức tải review của admin.

## Thay đổi trong chặng

- Loại contour rất nhỏ sát đầu dòng văn xuôi dài khỏi tập checkbox khi dòng không có ký hiệu lựa chọn hoặc ngữ cảnh câu hỏi/lựa chọn rõ ràng. Mục tiêu là ngăn nét/glyph OCR bị hiểu nhầm thành ô tích; trường hợp thực vẫn được bảo vệ bởi điều kiện ngữ cảnh.
- Giữ dòng chấm thuộc phần nơi nhận “Kính gửi: Sở Xây dựng” là trường cần điền có nhãn địa phương thay vì văn bản tĩnh.
- Bỏ qua dòng chấm chữ ký nằm ngay dưới chỉ dẫn ký rõ ràng; phần ngày ký riêng vẫn là trường nhập.
- Cập nhật regression browser theo luồng upload hiện hành và ground truth P61 để phân biệt nhãn ngữ nghĩa với chữ in nguyên văn. Gợi ý nhãn đúng nguyên văn vẫn cần admin phê duyệt cuối.

## Bằng chứng kiểm thử

- Bộ unit nhận diện vùng: 74/74 passed; TypeScript và build production đã qua sau thay đổi logic.
- Luồng browser cục bộ `/admin/upload` đã chạy cho P20, P59, P61, P70; các lần chạy gần nhất đều qua. Những test này chặn ghi tài sản/kịch bản, không bấm lưu và không ghi database.
- Tổng hợp benchmark vùng hiện hành: 107/107 trường đúng vùng (IoU ≥ 0.5), 0 false positive, 0 false negative; IoU trung bình có trọng số xấp xỉ 0.735. Đây là bốn holdout, không phải bằng chứng tổng quát cho mọi phôi/ảnh chụp.
- Tải review vẫn cao: 88/107 trường được ưu tiên review (82.2%); 19 trường được gợi ý. Chưa có đo thời gian thao tác admin trước/sau, nên chưa thể khẳng định mức giảm giờ công.
- Nhãn ngữ nghĩa khớp 72/107 (67.3%). Riêng P59 còn 7 vùng trống nhãn; tọa độ đúng không đồng nghĩa nhãn OCR đã đủ chính xác.
- CER/WER từ hai fixture OCR có ground truth tương ứng: P59 CER 2.61%, WER 2.91% (31/1188 ký tự, 8/275 từ); P61 CER 6.98%, WER 8.94% (36/516 ký tự, 11/123 từ). Chưa có ground truth OCR trong repo cho P20/P70 nên không gộp các trang đó vào điểm CER/WER.

## Giới hạn và rủi ro còn lại

- Bốn mẫu không đại diện đủ cho biến thiên độ phân giải, skew/perspective, bản scan mờ, biểu mẫu viết tay, nhiều phiên bản pháp lý hoặc bố cục mới.
- Tỷ lệ ưu tiên review 82.2% cho thấy hệ thống vẫn chuyển phần lớn quyết định cho admin; không nên hạ cờ review chỉ để làm đẹp chỉ số.
- P59 còn nhãn thiếu/sai ngữ nghĩa. Cần xác minh từng vùng dựa trên crop/ground truth trước khi thêm quy tắc tổng quát.
- Kết quả chưa đo số lần click, thời gian hoàn tất review, tỷ lệ admin sửa nhãn/tọa độ, hoặc lỗi sau phê duyệt.

## Bước tiếp theo

1. Bổ sung CER/WER ground truth cho P20/P70 và một holdout mới chưa dùng để tinh chỉnh.
2. Làm công cụ đo thời gian review và số lần chỉnh nhãn/tọa độ; so sánh baseline với đề xuất tự động, vẫn giữ duyệt thủ công.
3. Điều tra riêng 7 nhãn trống P59, thêm regression theo từng lỗi có bằng chứng, rồi chạy lại toàn bộ bốn phôi trên UI.
4. Chỉ mở rộng phạm vi tự động gợi ý khi precision trên tập holdout độc lập đạt ngưỡng được Tech Lead/admin thống nhất; không tự động công bố/phê duyệt.

## An toàn dữ liệu

- Chỉ dùng biểu mẫu trắng/fixture thử nghiệm; không dùng dữ liệu công dân.
- Không lưu phôi mới lên DB, không gọi Gemini, không tạo bản ghi công khai; draft upload chỉ tồn tại trong phiên trình duyệt thử nghiệm.
