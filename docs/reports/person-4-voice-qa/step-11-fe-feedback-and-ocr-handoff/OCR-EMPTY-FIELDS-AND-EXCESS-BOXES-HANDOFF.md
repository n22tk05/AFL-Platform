# Bàn giao OCR/OpenCV: chữ trong ô trống và dư vùng nhập

Ngày 08/10/2026. Gửi **Nguyễn Thế Anh — phụ trách Giải thuật/Thị giác (Person 3)** theo phân công README.md. Phối hợp **Võ Quốc Anh — FE**, **Nguyễn Thanh Chiến — Voice & QA**, **Nguyễn Tuấn Khánh — Tech Lead** nếu cần thay contract. Báo cáo này để triển khai sửa; chưa sửa thuật toán OCR/OpenCV trong chặng FE.

## 1. Quan sát đã xác nhận

Hai lỗi độc lập, không nên gom thành một lỗi Gemini:

1. **OCR hallucination:** phôi không có chữ trong hai khung nhập nhưng rawText có `Contransitionalists` dưới cả Họ và tên / Địa chỉ liên hệ.
2. **Dư vùng nhập:** phôi có hai khung cần viết, UI đối soát nhận 11 ứng viên; tất cả CHƯA RÕ NHÃN. Không thể mặc định mỗi contour/field_row là một bước của workflow.

Lần đầu tái hiện trong kiểm thử sản phẩm step-10; lần test lại sau sửa FE vẫn có 11 ứng viên. Không gọi Gemini khi ghi nhận các lỗi này, không sinh/publish form thật. Cửa human review đang chặn công bố nhưng chỉ là biện pháp an toàn, không chứng minh detector/OCR đúng.

## 2. Phôi và tái hiện

Fixture portable trong repo: `src/modules/voice-ai/tests/fixtures/demo-blank.svg`, 1000×1400, giấy trắng, chữ in đen, hai khung trống. Companion ground truth: `src/modules/voice-ai/tests/fixtures/demo-blank.expected-fields.json`. PNG dùng trong test local: `private-documents/voice-demo/demo-blank.png` (ignored, không trông chờ file này có trong checkout máy khác; render SVG bằng sharp đang cài ra PNG trong thư mục test riêng).

Thao tác:

1. Khởi động web local 3001 và VietOCR 8000; GET /health phải ready=true. Không dùng ảnh công dân thật.
2. Mở /admin/library → Thêm phôi trống. Không cần key để chạy phân tích local; không bấm sinh/approve. Dùng mã DEMO mới, tên ghi rõ kiểm thử.
3. Chọn PNG của fixture, mode Ảnh scan thẳng, xác nhận phôi trống → Phân tích OpenCV và VietOCR.
4. Đếm option Ô cần đối soát; mở Text OCR và cảnh báo nguồn. Lưu geometry candidates, JSON OCR, ảnh processed-primary và crops để so sánh.
5. Không sửa nhãn/xóa ô thủ công trước khi lưu evidence, vì như vậy sẽ che baseline của lỗi.

Chỉ cần OCR local cho tái hiện; DB/Gemini/TTS không phải điều kiện. DB đang 503 trong phiên QA không ngăn tái hiện hai lỗi trên.

## 3. Ground truth hình học

| Vùng nhập thật | Rect pixel (x,y,w,h), frame fixture-original | Normalized YXYX = [top,left,bottom,right] | Text bên trong |
|---|---|---|---|
| Họ và tên | (80,300,840,100) | [0.214286,0.08,0.285714,0.92] | Rỗng |
| Địa chỉ liên hệ | (80,520,840,100) | [0.371429,0.08,0.442857,0.92] | Rỗng |

Đây là vị trí đường viền được vẽ trong SVG, **không phải bbox nhãn OCR** và không phải kết quả model. Khi resize/warp/deskew thay frame, cần biến đổi ground truth sang processed-primary trước khi tính IoU/sai số. Phân biệt outer border và vùng viết bên trong khi đặt tolerance. Nhãn Họ và tên/Địa chỉ liên hệ nằm ngoài khung, không được mất do filter blank input.

## 4. Điểm kiểm tra và giả thuyết nguyên nhân

| Nhánh | Điểm code | Điều đã biết / điều cần xác minh |
|---|---|---|
| Python segmentation | services/vietocr-service/app.py, segment_document_lines → fast_predict_batch → predict_lines | Dilation + contour dùng bbox; filter separator ưu tiên vùng ngang rất thấp. Giả thuyết khung chữ nhật trống qua filter và vào line-only recognizer. Cần crop trace để kết luận, chưa khẳng định mọi chữ nhiễu đều do đường viền. |
| Blank crop guard | services/vietocr-service/app.py, guard uniform crop | Crop có border không phải uniform; chỉ kiểm tra uniform không đủ phân biệt border-only và chữ. Không nâng threshold mù vì có thể xóa chữ mờ thật. |
| OCR adapter/export | src/modules/ocr/vietocr-adapter.ts; src/shared/document-export.types.ts | Provider coordinates theo YXYX; DocumentJsonExport bbox theo normalized-xyxy. Phải bảo toàn source IDs/confidence/null và frame, không tự nâng confidence để làm đẹp JSON. |
| OpenCV detector/merge | src/modules/opencv/debug-pipeline.ts, contour-detector.ts, row-detector.ts, box-filter.ts, field-types.ts | Candidate source gồm closed_contour/checkbox/field_row/phrase_cluster và isContainer; cần log trước/sau filter/merge để biết 11 vùng đến từ đâu. Chưa có trace đủ để gán chính xác từng vùng dư là duplicate/title/border. |
| OCR ↔ geometry bridge | src/modules/forms/services/form-manifest-assembler.ts | Chỉ bỏ container/phrase_cluster, ghép nhãn từ structure.fields/checkboxes theo sourceBlockIds; ambiguous/nhãn trùng thành rỗng. Có thể cấu trúc OCR không cấp nhãn phù hợp hoặc cùng nhãn gần nhiều candidate. Không bỏ ambiguity gate để ép ra kịch bản. |

Không giải quyết bằng blacklist chữ `Contransitionalists`, cắt cứng còn hai box hoặc dùng Gemini tưởng tượng text/coords. Phải sửa theo bằng chứng pixel/source; fixture khác có số ô khác nhau.

## 5. Đầu việc giao thực hiện

| Chủ trì | Đầu vào | Đầu ra / contract | Tiêu chí nghiệm thu đề xuất | Điểm đang thiếu |
|---|---|---|---|---|
| Nguyễn Thế Anh — OCR | PNG fixture + processed-primary; crop debug theo line_id, mask nhị phân và bbox | VietOCR predictions có text/bbox/confidence thật; DocumentJsonExport giữ provenance. Border-only không sinh text; vùng chữ thật vẫn được nhận. | Hai vùng trống không có chữ nhận diện; nhãn thật vẫn có nguồn OCR. Thêm unit segmentation + live integration trước/sau trên fixture và ảnh chữ mờ. | Crop trace, thống kê blank false-positive; chưa benchmark CER/WER đại diện |
| Nguyễn Thế Anh — OpenCV | Ảnh cùng frame, contours/hierarchy và source candidate trước/sau merge | Danh sách FieldCandidate cho vùng cần điền; loại title/container/phrase đúng; bỏ duplicate mà không mất ô gần nhau | Fixture có đúng 2 vùng nhập, không title/footer; ghép 1-1 với GT. Mục tiêu demo đề xuất IoU ≥0.90 mỗi vùng sau frame mapping, phải ghi sai số pixel thực đo và rationale tolerance. Không coi mục tiêu này đã đạt. | Chưa lưu candidate trace/bbox/IoU baseline; chưa biết chính xác origin của 11 vùng |
| Võ Quốc Anh — FE + Nguyễn Thanh Chiến — bridge/QA | Candidates, JSON OCR/source blocks, labels và frame metadata | Draft manifest nhãn text/input coords/boxType/thứ tự có evidence; ảnh overlay hiển thị cùng frame | Hai ô ghép đúng nhãn, không lấy bbox chữ làm vùng viết; ambiguous giữ needs_review. Cán bộ đối soát đủ trước Gemini, không tự xác nhận. | Lần test mọi nhãn rỗng; cần raw field classification/sourceBlockIds để tách lỗi OCR và matcher |
| Nguyễn Thanh Chiến — QA | Bản sửa, fixture trước/sau, dataset synthetic và ground truth | Báo cáo FP/FN, precision/recall, IoU/sai số, CER/WER cho vùng có chữ; regression offline riêng live OCR | Có test phát hiện lại lỗi, không dùng check(true); output Gemini sau đó đúng một bước/box đã đối soát, không sinh bước cho tiêu đề hoặc vùng trống giả | Chưa có bộ ảnh camera/synthetic biến thể và độ chính xác thực đo |
| Nguyễn Tuấn Khánh — Tech Lead | Đề xuất evidence/debug flags hoặc contract nếu phát sinh | Quyết định contract tương thích; log debug chỉ cho test/local, không PII/secret, không tự đổi schema | Không phá source frame/coordinate enum/provider-null; pipeline cũ còn hợp đồng, thông tin nhạy cảm không ra logs | Chưa có quyết định rollout nếu phải đổi API/type |

## 6. Test cases bắt buộc

| ID | Input | Expected |
|---|---|---|
| OCR-BLANK-01 | Ảnh trắng hoàn toàn | Không text/block bịa; không fallback đưa toàn trang vào recognizer để ép ra chữ |
| OCR-BLANK-02 | Rectangle border-only, hai độ dày đường viền | Không sinh chữ; không dùng blacklist từ; không coi border là text crop |
| OCR-TEXT-01 | Nhãn nằm trên/trái ô trống | Nhãn vẫn đọc được, source bbox đúng, không có value bịa trong ô |
| OCR-TEXT-02 | Chữ mờ và chữ thật bên trong ô | Không bị blank filter xóa; đo CER/WER bằng GT, không dùng confidence đơn lẻ làm nghiệm thu |
| CV-FIELDS-01 | Fixture hai ô hiện tại, có header/footer | Chính xác 2 input; không title/footer/contour trùng; tính IoU từng ô |
| CV-FIELDS-02 | Ô lồng container/bảng và hai ô sát nhau | Container không thành bước; không merge nhầm hai ô thật; duplicate loại đúng |
| FRAME-01 | Resize + camera warp có transform xác định | GT, candidates, OCR và preview ở cùng processed frame; các bbox nằm [0,1], đúng thứ tự |
| BRIDGE-01 | Một nhãn gần hai vùng hoặc thiếu nhãn | Giữ unresolved, không auto-confirm; không lấy chữ hallucination làm nhãn |
| PIPELINE-01 | Bản manifest hai ô đã review → model | Đúng 2 bước, boxId/coords/order được giữ; không gọi model để tự chữa detector |

Các test default không gọi Gemini/TTS/DB thật; test OCR local tách thành nhóm live rõ ràng. Không so CER/WER cho vùng GT rỗng bằng mẫu số 0; dùng blank false-positive rate/count riêng. Đánh giá field detection bằng matching 1-1 để duplicate không được tính true-positive nhiều lần.

## 7. Gói kết quả cần trả cho QA

- Commit/diff thuật toán, câu lệnh tái hiện và phiên bản model/config/CPU/GPU.
- Ảnh đầu vào/processed, mask, overlay, crop line và predictions cùng source IDs; **chỉ synthetic**, không crop giấy tờ công dân.
- Candidate JSON trước/sau filter, danh sách lý do bỏ/giữ vùng; GT đã biến đổi frame khi cần.
- Bảng trước/sau: số ô thật/phát hiện/FP/FN, IoU/sai số từng ô, text sinh ở vùng trống, CER/WER vùng có chữ, thời gian xử lý.
- Kết quả regression offline và live OCR local. Khóa manual review vẫn bật; không công bố chính thức chỉ vì fixture này qua test.

Bằng chứng local hiện tại: private-documents/product-workflow-test/03-real-ocr-needs-review.jpg; nội dung rawText/cảnh báo đã ghi ở step-10/PRODUCT-WORKFLOW-TEST-RESULTS.md. Những file ignored không tự được gửi cho đồng đội; fixture SVG + GT JSON ở repo là đầu vào tái hiện portable. Chặng FE mới chỉ sửa stale draft/thông báo lỗi, không làm mất các dấu vết lỗi OCR này.
