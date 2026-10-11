# Chặng 41 — Baseline mù trên biểu mẫu xây dựng độc lập

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Nguồn là Phụ lục III, Mẫu số 01, trang PDF 59 của [bản PDF trên cổng Văn phòng Chính phủ](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/01/175_2024_nd-cp_30122024_1-signed.pdf). Mẫu này khác nguồn và cấu trúc so với các trang hộ tịch TP.HCM đã dùng để phát triển. Đây chỉ là mẫu bố cục lịch sử để đo pipeline, **không xác nhận hiệu lực pháp lý hiện hành**.

## Quy trình khóa mù

- Render trang 59 thành `private-documents/recognition-evaluation/central-construction-application-p59.png`, 1238 × 1744 px. Ảnh và PDF nằm trong thư mục ignored, không đưa lên dịch vụ ngoài pipeline OCR local.
- Trước khi gọi OCR/OpenCV, gán thủ công 29 vùng chấm có thể điền vào `tests/fixtures/recognition-construction-p59-ground-truth.json`; gồm cả ô hành chính trên đầu trang và ô chèn trong câu, không gồm văn bản giải thích/tiêu đề/chữ ký. SHA-256 của fixture trước và sau lượt chạy: `306461E9AEB93C9DD6A384BB4335387909141300079E15110C425E8A776C17C3`.
- Test browser chỉ đọc fixture, chặn request ghi asset và gọi model, không lưu DB. Kết quả đầu tiên ghi `.blind-baseline.{ocr,draft,benchmark}.json` trong thư mục ignored. SHA-256 benchmark: `5F43A006D2296EAAF796453B214FC2E77C8523D759933433F12578F71CFE0FF3`.

## Kết quả đầu tiên, chưa chỉnh thuật toán theo mẫu

| Chỉ số IoU ≥0,5 toàn trang | Kết quả |
| --- | ---: |
| Vùng gán nhãn | 29 |
| Vùng do pipeline sinh | 26 |
| TP / FN / FP | **20 / 9 / 6** |
| Có nhãn trên toàn bộ vùng sinh | 14/26 |
| Nhãn đúng ngữ cảnh trên TP | **1/20** |
| Vùng phải admin review | 25/26 |

Chín FN: năm ô số văn bản/ngày đầu trang, một mô tả công việc, hai mốc thời hạn và một hậu tố Sở Xây dựng. Các ô ngắn chèn trong câu là điểm yếu rõ nhất. Sáu FP gồm hai viền ở đỉnh trang, một guide ở đáy trang, một gạch trang trí bị gắn nhãn `Văn bản số`, một vùng trùng với `Đại diện cho`, và một contour vuông giả ở phần thân. Số `exactLabels` dùng **nhãn ngữ cảnh mong đợi** như `Fax tại chính quốc`, không chỉ OCR nguyên văn `Fax`; vì vậy đây không phải CER thuần túy và không được so sánh trực tiếp với bộ hộ tịch.

Nguồn ảnh là trang scan có vùng đen sát mép. Ba FP viền trang có tọa độ chạm đúng y=0 hoặc đáy y=1744; đây là lỗi hình học có thể xử lý chung mà không đụng fixture. Chưa điều chỉnh một vùng gán nhãn nào theo output; các tọa độ thủ công vẫn cần kiểm tra độc lập trước khi dùng làm nghiệm thu chính thức.

## Kiểm chứng và hướng xử lý

- Test blind opt-in **1/1 PASS**; TypeScript PASS. Đây là bằng chứng đo được chứ không phải test yêu cầu đạt ngưỡng nhận diện.
- Lượt tiếp theo giữ baseline và fixture nguyên trạng, loại viền trang/gạch trang trí bằng điều kiện tổng quát có test chống loại nhầm, rồi đánh giá trên file `.development.*` riêng.
- Sau đó cần tăng khả năng nhận ô chấm ngắn có nhãn cùng hàng trong câu, tránh mượn nhãn của trường cạnh bên, và đánh giá thêm phôi bảng/checkbox từ nguồn khác. Trang 59 không có checkbox hoặc trường nhiều dòng thật nên một mình nó không chứng minh đủ mục tiêu tổng thể.
