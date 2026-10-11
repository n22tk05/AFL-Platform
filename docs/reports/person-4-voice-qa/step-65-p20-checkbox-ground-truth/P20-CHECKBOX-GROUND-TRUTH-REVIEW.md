# Hiệu chỉnh ground truth checkbox P20 theo ảnh gốc

**Phạm vi:** kiểm tra độ tin cậy của benchmark tọa độ, không thay đổi detector, OCR, workflow lưu hay chính sách duyệt. Chỉ dùng ảnh biểu mẫu trắng công khai P20.

## Phát hiện và xử lý

- Fixture cũ đặt `copy_no` tại x=[0,155; 0,177], tương ứng khoảng 224–256 px trên ảnh 1447 px; vị trí này chồng lên chữ “Không” và không bao trùm ô vuông in bên phải.
- Quan sát lại ảnh raster gốc và highlight trên `/admin/upload`; kiểm tra pixel viền trong vùng dòng này cho thấy viền ô nằm x≈244–275 px, y≈1623–1655 px.
- Sửa duy nhất rect GT `copy_no` thành `[0.793, 0.169, 0.809, 0.190]`; không sửa bbox dự đoán. Độ khớp IoU của ô vuông với dự đoán hiện tại là 0,862.

## Kết quả đánh giá lại

- Với draft P20 xuất từ lượt chạy trình duyệt mới nhất, ghép một-một theo IoU ≥ 0,5 cho kết quả **27 TP / 3 FP / 2 FN** trên 29 trường GT và 30 dự đoán.
- Nhãn chính xác là **25/27** cặp khớp. `copy_no` nay được khớp tọa độ, nhưng nhãn dự đoán chỉ là “Không”, chưa có ngữ cảnh “Đề nghị cấp bản sao”; đó là vấn đề OCR/scope thật còn lại, không phải lỗi tọa độ.
- FN còn lại: `marital_history` và `signing_day` sát ngưỡng IoU; FP còn hai vùng tương ứng gần ngưỡng này và một guide không gán nhãn.
- Đây là sửa lỗi dữ liệu benchmark, không phải cải thiện thuật toán. Số cảnh báo UI vẫn 23/30; chưa có phép đo thời gian admin.

## Kiểm chứng và giới hạn

- Test nhận diện vùng và đánh giá text: **69/69 pass** sau cập nhật fixture.
- Ảnh trắng được nạp và OCR trực tiếp trên `/admin/upload`; không lưu phôi vào DB, không gọi Gemini. Draft tải xuống chỉ dùng tính metric tại máy.
- Các báo cáo cũ được giữ nguyên làm lịch sử và dựa trên phiên bản fixture trước khi hiệu chỉnh; khi so sánh số liệu giữa chặng, cần dùng phiên bản ground truth cùng thời điểm.
- Bước tiếp theo: xử lý ngữ cảnh checkbox “Có/Không” từ câu hỏi bị OCR tách/sai, đồng thời tiếp tục giữ hai cảnh báo vị trí còn sát ngưỡng cho admin xem lại.
