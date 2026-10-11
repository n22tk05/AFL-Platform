# Báo cáo phát triển nhận diện trường và kết nối hướng dẫn

Ngày kiểm thử: 08/10/2026. Nhánh: `codex/form-recognition-and-multiline`, phát triển từ `feat/p2p-frontend-api-integration`. Không dùng Dely, không commit/push/merge trong đợt này. Giữ nguyên tài liệu nghiên cứu step-14 và các báo cáo trước.

## 1. Kết quả và phạm vi thật

Đã cải tiến pipeline ảnh một trang hiện có, không thay model VietOCR và không tự động phê duyệt. Mục tiêu đạt trong các ca kiểm thử là giảm việc vẽ lại tọa độ, phân loại và gộp dòng; chất lượng nhận chữ trên biểu mẫu thực tế vẫn cần benchmark riêng.

| Chặng | Đã triển khai | Bằng chứng |
|---|---|---|
| 1 — Hình học/ngữ nghĩa | Bóc đường chấm/gạch độc lập với nhãn; bỏ tiêu đề/mô tả/chữ ký/khung nhóm; bảng hai chủ thể, bảng lặp, ma trận Có/Không, dãy ô ký tự | Test mask pixel ở hai độ phân giải; test grounded layout; OpenCV WASM thật trong trình duyệt |
| 2 — Chữ/multiline | Xóa cấu trúc viền/chấm khỏi mask phân đoạn chữ; không infer ô trắng; giữ crop ảnh nguồn; gom các dòng cùng nhãn, cột và section | 19 test Python; chạy model và weights local trên phôi tổng hợp không chứa dữ liệu cá nhân |
| 3 — Review/Voice/FE | Hợp đồng nhiều region; editor chọn/sửa/gộp/tách; một bước cho một trường; highlight tất cả vùng; lưu và đọc lại metadata | Test artifact/repository với DB mock; kéo vùng thứ hai rồi save/reload trên FE; test Gemini giả mạo hình học và metadata ngoại lai |
| 4 — Hồi quy | Kiểm tra API, Voice, TypeScript, build, browser; smoke API OCR local | Các lệnh và giới hạn kiểm chứng ở mục 5 |

**Không được gọi kết quả này là nghiệm thu toàn bộ OCR, 20 biểu mẫu hoặc toàn bộ FR.**

## 2. Thuật toán đang dùng

### Hình học

1. Giữ bước chuẩn hóa ảnh và hệ tọa độ của pipeline hiện tại. OpenCV tạo mask foreground trắng/nền đen.
2. Detector writing guide tìm connected components: chấm nhỏ gần cùng baseline, khoảng cách đều và đủ số lượng; hoặc đoạn gạch dài/mảnh. Chiều cao vùng viết ước lượng từ chiều cao chữ, không lấy cả dòng chứa nhãn làm input.
3. Ưu tiên checkbox đã được detector hình học xác nhận hơn contour trùng viền; bỏ contour viền trong của checkbox. Khung chứa nhiều vùng hình học độc lập được đánh dấu container **trước** bước lọc row, tránh nuốt các dòng nhập nằm bên trong.
4. Ghép nhãn OCR dựa trên hàng/cột, khoảng cách và overlap. Nhãn cùng một dòng OCR được định vị bằng tỷ lệ ký tự khi chưa có word boxes; đây chỉ là ước lượng và được đánh dấu cần review.
5. Dòng writing guide liên tiếp có overlap ngang đủ lớn, gap phù hợp và không có nhãn/section mới được gom thành một field. Giữ từng region, không tạo một bounding box lớn phủ cả nhãn và khoảng trống giữa các dòng.
6. Bảng dùng các cell đóng, header và nhãn hàng/cột. Bảng lặp giữ từng hàng riêng; không tạo bước nhập từ STT/header. Dãy ít nhất bốn ô gần vuông liên tiếp cạnh nhãn định danh được xem là character slots, không tạo nhiều bước checkbox.

Các quy tắc này là heuristic, không phải model layout đã huấn luyện. Không suy ra field từ text không có tọa độ; không tự sửa dấu hay giá trị OCR. Vùng không ghép được nhãn vẫn hiện rõ để cán bộ sửa hoặc loại bỏ.

### OCR

`text_layout.py` dùng Otsu, morphology loại đường ngang/dọc mảnh, nhận chuỗi chấm đều và checkbox rỗng. Không dùng ngưỡng tương phản để loại chữ nhạt. Loại nhiễu góc còn lại sát đường đã xóa, không xóa đại trà dấu chấm/dấu tiếng Việt nhỏ. Việc xóa mask dùng lookup theo component label thay vì quét toàn ảnh cho từng chấm.

Mask sạch chỉ dùng để chọn/cắt vùng chữ. VietOCR vẫn đọc crop từ ảnh nguồn, không đọc ảnh đã tẩy nét. Trang/crop không còn bằng chứng chữ không được chuyển thành một dòng OCR giả.

Nhận diện đánh dấu `OCR_LOW_CONFIDENCE` dưới 0.93 và `OCR_CONFIDENCE_UNAVAILABLE` khi thiếu score. **0.93 là ngưỡng review thử nghiệm**, không phải độ chính xác đã hiệu chuẩn; score cao vẫn có thể sai.

## 3. Hợp đồng và lưu trữ

| Dữ liệu | Ý nghĩa và ràng buộc |
|---|---|
| `FormGeometricBox.inputKind` | `single_line_text`, `multiline_text`, `checkbox`, `character_slots`, `table_cell`; đồng bộ với `boxType` legacy |
| `inputRegions[]` | 1–64 vùng mỗi trường, ID không trùng trong trường, page 1, tọa độ YXYX hữu hạn trong `[0,1]` và đúng thứ tự |
| `normalizedCoords` | Bằng tọa độ region đầu tiên; không phải union của nhiều dòng |
| `recognition` | Bằng chứng nguồn và lý do review của draft nhận diện; thay đổi thủ công hủy xác nhận hiện tại |
| `WorkflowStep.highlightRegions`, `inputKind` | Sao chép từ manifest, không nhận tọa độ/kind tùy ý do Gemini tự tạo; một step cho mỗi box |
| `highlightCoords` | Tọa độ chính bằng region đầu tiên; legacy không có metadata vẫn đọc được |
| Artifact `afl-template-v1` | Thêm `fields` optional chứa kind/regions; file bất biến có SHA-256, tối đa 1 MiB. Cần ảnh phôi server để lưu metadata mới |

Không đổi Prisma schema. Các cột hình học cũ giữ primary region; toàn bộ metadata nhiều vùng lưu trong artifact, reference được lưu cùng transaction của draft/review đang có. Khi đọc/publish, metadata phải gắn đúng box và primary geometry DB; sai hoặc thiếu artifact trả lỗi, không âm thầm chỉ trả region đầu tiên. Khi review form mới đã có metadata, request không được bỏ metadata đi.

Admin có thể chỉnh region thứ hai mà không đổi region đầu, đổi loại trường, thêm/bỏ dòng, gộp hai trường chữ, hoặc tách thành các trường riêng. Trường mới sau khi tách để nhãn trống, bắt buộc đặt lại trước khi sinh kịch bản. Mọi sửa đổi bỏ xác nhận review; vẫn phải đối soát trước khi tạo draft và phê duyệt trên server.

Citizen highlight mọi region của step nhưng chỉ gọi giọng đọc một lần cho trường logic. Checkbox hiển thị hành động tích chọn; dãy ký tự và multiline có nhãn riêng. Đã sửa auto-play chạy hai lần khi effect bị React Strict Mode setup/cleanup lại; chỉ khởi chạy effect còn hiệu lực, không bỏ tính năng nghe lại.

Q&A giữ ngữ cảnh step đã duyệt ở server và nhận thêm kind/số vùng từ step đó. Fallback không còn hướng dẫn viết chữ vào checkbox; vẫn không suy diễn lựa chọn/căn cứ pháp lý thay cho cán bộ.

## 4. Ca thực tế đã chạy và bug tìm được

Phôi tổng hợp: 1000 × 800 px, ba nhãn tiếng Việt, một trường một dòng, một trường ba dòng, một checkbox, khung ngoài và đường chấm. Không chứa dữ liệu công dân.

| Quan sát | Kết quả sau sửa |
|---|---|
| Model OCR local | 3 vùng chữ, không có vùng chữ dư |
| Trang/crop trống có viền và đường chấm | 0 prediction; unit test cũng xác nhận không gọi predictor |
| Nhãn `Họ và tên:` | Model trả `Họ và tên`, thiếu dấu `:` |
| Nhãn `Nội dung đề nghị:` | Model trả `Nội dung đề nghi:`, sai một dấu |
| Nhãn `Nhận trực tiếp` | Model trả `Nhân trực tiếp`, sai một dấu |
| CER trên ba nhãn, tính cả dấu câu | 3 lỗi / 41 ký tự = khoảng 7.32%; mẫu rất nhỏ, không phải tỷ lệ production |
| Inference sau warmup, một lượt trên máy local | Khoảng 360 ms; không phải p95 hay SLA |
| Bóc field khi dùng OCR thật và OpenCV WASM | 3 field đúng nhóm; trường nội dung giữ 3 region; checkbox đúng loại; 2 nhãn score thấp có cảnh báo |
| Endpoint thật `POST /api/documents/json` | HTTP 200, success, frame `processed-primary`, ba line có bbox XYXY đúng hợp đồng |

Bug được tái hiện và sửa:

- Khung ngoài được nhận thành một cell rồi loại toàn bộ writing guides phía trong: phân loại container trước merge.
- Viền trong của checkbox sống sót thành contour riêng; sorting xem checkbox ngoài là container rồi loại loại checkbox: loại inner contour bằng bằng chứng checkbox và không cho sorter biến checkbox/writing guide thành container.
- Auto-play phát lại hai lần khi Strict Mode remount effect: hủy khởi chạy cũ trước khi phát.
- Hai test FE cũ giả định chỉ có một fetch khi mount và chỉ có một phần tử role alert: sửa fixture theo trạng thái dịch vụ, locator chọn đúng thông báo ứng dụng; không bỏ assertion chức năng.

Không tự chữa lỗi dấu bằng fuzzy replace vì có thể đổi tên trường/chủ thể. Cán bộ vẫn cần sửa những nhãn OCR sai trong ca này, nhưng không phải vẽ lại ba vùng hay phân loại checkbox.

## 5. Kiểm chứng và chạy lại

| Bộ kiểm tra | Kết quả |
|---|---|
| `npm run test:recognition` | 35/35; có fixture/mock Gemini và repository, không gọi cloud/DB thật |
| `npm run test:opencv` | 53/53 |
| `npm run test:documents` | 153/153 |
| `npm run test:forms-api` | Client checks và 12/12 test hợp đồng FE/API |
| `npm run test:voice-client` | 7/7 client; Voice sau bổ sung test kind: 19/19 |
| `npm run test:local` | 6/6 fixture/hợp đồng; API integrity PASS, không gọi là nghiệm thu 11 FR |
| Python service unit tests | 19/19, predictor mock, không download/call cloud |
| Browser mặc định | 11 ca FE/review/Voice/OpenCV, API write được mock |
| Browser có evidence OCR local | Thêm một ca tổng hợp, tổng 12 ca |
| TypeScript và production build | Đạt; build riêng `.next-recognition-build`, không ghi đè server dev đang chạy |

Lệnh PowerShell, chạy từ root dự án:

```powershell
npm run test:recognition
npm run test:opencv
npm run test:documents
npm run test:forms-api
npm run test:voice-client
npm run test:local
& services/vietocr-service/.venv/Scripts/python.exe -m unittest discover -s services/vietocr-service/tests -v
npm run typecheck
$env:AFL_BUILD_DIR = '.next-recognition-build'
$env:AFL_BUILD_THREADS = '1'
npm run build
```

Smoke OCR thật là opt-in, không nằm trong test mặc định; chỉ dùng weights/config có sẵn local và font Unicode:

```powershell
& services/vietocr-service/.venv/Scripts/python.exe services/vietocr-service/evaluate_recognition.py --output private-documents/recognition-evaluation/synthetic-ocr.json
$env:IMAGE_VOICE_TEST_URL = 'http://127.0.0.1:3001'
$env:RECOGNITION_LOCAL_EVIDENCE = 'private-documents/recognition-evaluation/synthetic-ocr.json'
npm run test:image-voice:browser
```

Evidence JSON/PNG nằm trong `private-documents`, đã được ignore. App dev cổng 3001 được giữ lại; VietOCR cổng 8000 đã khởi động lại bằng code mới và health `ready: true`. Không publish form demo, không sửa DB thật, không gọi Gemini/TTS cloud trong kiểm thử này. Transaction PostgreSQL thật chưa được chạy vì chưa có database thử nghiệm tách biệt được xác nhận.

## 6. Việc tiếp theo trước triển khai rộng

| Ưu tiên/phụ trách | Đầu việc và đầu vào | Đầu ra/tiêu chí | Điểm còn thiếu |
|---|---|---|---|
| P0 — OCR/QA | Tạo ground truth vùng/nhãn/kind trên phôi trắng từ 20 chủ đề, tách train/validation/test theo mẫu | Field precision/recall, region IoU, CER/WER, tỷ lệ gộp sai, số thao tác sửa tay/form và p95; so với baseline trên cùng dữ liệu | 20 mẫu nghiên cứu chưa phải benchmark, nhiều bản đã điền; không đưa ảnh chứa PII lên cloud |
| P0 — OCR | Kiểm tra lỗi dấu tiếng Việt và tách nhiều nhãn trên cùng dòng bằng token/word bbox | Gợi ý đối soát rõ nguồn, không thay nhãn/giá trị âm thầm; giảm lỗi dấu và ước lượng label bằng ký tự | VietOCR hiện vẫn sai dấu; threshold 0.93 chưa hiệu chuẩn |
| P0 — Tech Lead/Backend | Dùng DB staging riêng kiểm chứng save/review/approve với artifact đa vùng và concurrent review | Rollback đúng, không ACTIVE/audit khi artifact sai; backup/restore phục hồi cả DB reference và file | Hiện mới test bằng DB mock; artifact cần persistent shared volume/object storage nếu nhiều instance |
| P1 — OCR/FE/Backend | PDF/biểu mẫu nhiều trang và trường nối tiếp qua trang | OCR từng trang, hợp đồng region có page thật, trang ảnh server, editor/chuyển trang, một step nhiều page; test khác kích thước trang | Upload và validator hiện **vẫn chỉ một trang PNG/JPEG**; chưa triển khai PDF/đa trang, không dùng localStorage để vá |
| P1 — OCR | QR/ảnh chân dung/dấu/chữ ký, bảng merge cell/header nhiều tầng, dòng thiếu viền và ảnh khó | Classifier/layout có ground truth, confidence hiệu chuẩn, vùng khó đưa sang manual review | Chưa có detector QR/ảnh/dấu xác minh; heuristic hình học/regex không bảo đảm loại toàn bộ false positive |
| P1 — FE/QA | UX review ưu tiên vùng mơ hồ, thao tác keyboard/touch, highlight dài/nhiều vùng trên mobile | Cán bộ chỉ cần kiểm tra/sửa ca khó, đo số thao tác và test trợ năng người dùng thật | Có editor cơ bản và browser automation, chưa phải usability/accessibility acceptance thực địa |
| P0 — Tech Lead | Xác thực từng cán bộ, RLS/quyền Supabase, quota nhiều máy chủ và lưu trữ dùng chung | Kiểm thử quyền, audit actor thật, distributed quota và persistence an toàn | Không đổi mô hình khóa admin dùng chung hoặc RLS trong đợt này |

Đề xuất chặng kế tiếp là benchmark có ground truth và đo công sửa tay, rồi mới chọn ngưỡng/model layout. Không lấy số test pass làm bằng chứng rằng mọi biểu mẫu mới sẽ không cần chỉnh sửa.
