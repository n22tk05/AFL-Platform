# Step 72 — Crop upscale for ruled table headers

## Mục tiêu

Tăng độ đọc OCR tiêu đề cột trong bước tạo phôi tại `/admin/upload`, giữ nguyên tọa độ và không làm giảm yêu cầu admin duyệt.

## Thay đổi

- Khi OCR service tìm các dòng trong ô tiêu đề bảng có đường kẻ, phóng crop lên 1.5× bằng LANCZOS cho bước phân đoạn dòng. Tọa độ tìm được vẫn chuẩn hóa theo crop gốc; OCR cuối cùng vẫn chạy trên vùng ảnh gốc.
- Cập nhật test dịch vụ để xác minh vùng dòng sau phóng vẫn nằm trong đúng cột, không vượt ranh giới cột lân cận.
- Cập nhật browser holdout QT-09 để khóa ngưỡng nhãn theo kết quả thực đo mới.

## Kiểm chứng

- VietOCR unit tests: **38/38 passed**.
- Nhận diện vùng/nhãn TypeScript: **75/75 passed**.
- Browser test qua trang upload trên bản build local, với QT-09-HSB: **1/1 passed**. Test chặn endpoint lưu asset và endpoint sinh kịch bản; không ghi DB, không gọi Gemini, không phê duyệt.
- Hình học bảng không đổi: **24/24** ô khớp, **0** ô thừa; mean IoU **0.927**, minimum IoU **0.901**.
- Nhãn chính xác nguyên văn tăng từ **18/24 lên 21/24** (**+3 ô**, +12.5 điểm phần trăm). Phần cải thiện chính là tiêu đề “Loại trợ cấp tuất được hưởng” được OCR đầy đủ sau khi phân đoạn trên crop phóng lớn.
- Còn **3/24** ô sai nhãn do cùng tiêu đề nhận dạng thiếu phần “/hộ chiếu” ở cả ba hàng. Không tự bù từ ground truth trong code sản phẩm.
- Trang upload vẫn ghi nhận **33** trường, **28** cần chú ý; toàn bộ 24 ô bảng vẫn `needs_review`. Vì vậy bước này cải thiện độ chính xác đầu vào, nhưng **chưa chứng minh giảm tổng khối lượng review admin**.

## Đánh giá và tiếp theo

- Tiếp tục điều tra vì sao crop identity-column vẫn bỏ sót “hộ chiếu”; so sánh ảnh crop, OCR theo từng biến thể ảnh và confidence, không thêm quy tắc tự điền chữ chưa có chứng cứ.
- Đo số trường cần sửa, số thao tác và thời gian review trên nhiều holdout độc lập trước/sau. Chỉ cân nhắc giảm `needs_review` sau hiệu chỉnh confidence trên tập validation tách biệt và không làm tăng lỗi nhãn/tọa độ.
- Mở rộng cùng phép đo cho biểu mẫu nhiều trang và các loại bảng khác; QT-09 một trang không đại diện cho toàn bộ tập biểu mẫu.

## An toàn dữ liệu

- Chỉ dùng phôi trống dùng cho kiểm thử. Không lưu biểu mẫu thử vào DB, không dùng dữ liệu công dân và không gọi dịch vụ sinh kịch bản.
