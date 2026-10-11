# Chặng 7 — Ground truth hình học giới hạn cho bảng CT01

Ngày 09/10/2026. Nhánh `codex/form-recognition-and-multiline`. Mục đích: thay một phần nhận xét định tính bằng phép đo lặp lại được, **không mở rộng kết luận ra toàn bộ CT01/TK01**.

## Nguồn và phạm vi

- Ảnh trắng CT01 `private-documents/form-research-20/F20-p1.png`, 1026 × 1450 px. Chỉ chú giải **9 hàng dữ liệu × 5 cột cần nhập** trong bảng; bỏ cột TT, header, chữ ký/footer và tất cả field phía trên bảng.
- Biên cột/hàng và tên header được chép tay từ ảnh nguồn vào `tests/fixtures/recognition-ct01-table-ground-truth.json`. Người chép đã xem đầu ra detector trong quá trình phát triển, nên đây là **development set**, không phải holdout mù hay ground truth được hai người xác nhận.
- Browser opt-in vẫn gọi OpenCV WASM và VietOCR local thật, không lưu asset/workflow. Test ghép one-to-one mỗi ô chú giải với `table_cell` được đề xuất bằng IoU YXYX ≥ 0.5; không tái sử dụng một prediction cho hai ô.

| Chỉ số trong đúng bảng này | Kết quả |
| --- | ---: |
| Ô chú giải | 45 |
| Ô dự đoán khớp một-một | 45 |
| Ô dự đoán dư trong `table_cell` | 0 |
| Mean IoU của 45 cặp | 0.9668 |
| Min IoU | 0.9299 |
| Nhãn cột+hàng khớp nguyên văn | 36/45 |

Chín nhãn còn thiếu đều ở cột ngày sinh: OCR/grounding hiện đưa `năm sinh — dòng N`, trong khi chữ in nguồn là `Ngày, tháng, năm sinh`. Hình học đúng không đồng nghĩa Voice có thể đọc nhãn thiếu mà không cần review.

## Kiểm chứng

`tests/browser/form-recognition.spec.ts` đọc annotation JSON, kiểm tra frame, 45 match, không có `table_cell` dư và tối thiểu 36 nhãn đúng, rồi ghi số đo vào evidence Git-ignored `private-documents/recognition-evaluation/F20-p1.png.browser.json`. Browser CT01 opt-in 1/1 PASS sau thay đổi. Không gọi cloud hoặc ghi DB.

## Giới hạn và bước kế

1. Phép đo không cho biết precision/recall của toàn biểu mẫu: CT01 còn 20 vùng chưa nhãn ngoài/ở rìa bảng và TK01 còn 24. Cần chú giải độc lập cả field ngoài bảng, static/description, checkbox, character slots và nhiều dòng.
2. Nhờ thành viên OCR/QA rà soát lại biên bảng, tên cột và ngưỡng IoU, rồi khóa tập holdout khác chủ đề/độ phân giải trước khi tiếp tục chỉnh heuristic. Không dùng đúng bảng đã xem kết quả để tuyên bố khả năng tổng quát.
3. Cải thiện OCR header nhiều dòng và word-level grounding để lấy đủ `Ngày, tháng, năm sinh`; bảo vệ nhãn khỏi biến thể pháp lý và ký hiệu footnote. QR, ảnh, dấu, đa trang/PDF và DB staging vẫn nằm trong checkpoint step-17.
