# Khái quát thuật toán bóc text và tọa độ ô

Ngày 08/10/2026. Phân tích mã nguồn hiện tại trong working tree, không chỉ phiên bản đã commit. Phạm vi: luồng nhập phôi quản trị, OpenCV, dịch vụ VietOCR và bước nối sang Voice AI/FE. Không chỉnh thuật toán, gọi cloud hoặc ghi DB trong lượt nghiên cứu này. Các số liệu demo bên dưới lấy từ kiểm thử trước ở step-12, không phải một lần benchmark mới.

## 1. Ý chính

Dự án **không dùng một model duy nhất để vừa đọc chữ vừa xác định ô**. Nó kết hợp:

| Công việc | Thành phần | Cách làm |
|---|---|---|
| Tìm trang giấy, nắn ảnh chụp | OpenCV.js trong trình duyệt | Cạnh, contour tứ giác, kiểm chất lượng, biến đổi phối cảnh |
| Tìm ô/vùng hình học | OpenCV.js | Đường ngang/dọc, contour, hình vuông checkbox, gom cụm theo dòng |
| Tìm dòng chữ và đọc chữ | OpenCV Python + VietOCR local | Phân đoạn dòng bằng morphology; CNN/Transformer nhận dạng crop |
| Tách nhãn/giá trị và cấu trúc JSON | TypeScript | Regex, từ vựng nhãn, tham chiếu nguồn, schema validation |
| Ghép nhãn với ô điền | Form manifest assembler | Khoảng cách hình học, chặn trường hợp nhãn mơ hồ/trùng |
| Sinh lời hướng dẫn | Gemini, sau đối soát | Nhận manifest có nhãn và ô; không phải bộ phát hiện tọa độ từ ảnh |

**Hai loại tọa độ khác nhau:** bounding box dòng chữ cho biết “chữ nằm đâu”; bounding box ô điền cho biết “người dân viết vào đâu”. Không thể mặc nhiên lấy vùng chữ làm vùng cần viết.

## 2. Luồng đang dùng ở màn hình thêm phôi

```text
JPEG/PNG phôi trống
    ↓ kiểm file, giải mã, resize có giới hạn
OpenCV: scan thẳng hoặc phát hiện giấy + nắn phối cảnh
    ↓ ảnh xử lý chuẩn dùng chung
    ├─ OpenCV.js → đường kẻ/checkbox/contour/dòng → candidates hình học
    └─ POST /api/documents/json
          → VietOCR /predict → phân đoạn dòng → nhận dạng text
          → JSON nguồn + nhãn/giá trị + cảnh báo
    ↓ ghép nhãn OCR với candidates theo khoảng cách
Manifest nháp: boxId + nhãn + loại ô + tọa độ
    ↓ cán bộ sửa nhãn/ô/thứ tự và xác nhận
Lưu ảnh phôi → POST /api/llm/prompt → workflow PENDING_REVIEW
    ↓ review, audio, phê duyệt
Workflow ACTIVE → FE dùng ảnh chuẩn + highlightCoords + hướng dẫn
```

Hai nhánh trên độc lập về thuật toán; code upload hiện chạy OpenCV trước rồi mới gọi OCR, không thực thi song song. Cùng ảnh chuẩn giúp nhãn, ô và ảnh hiển thị không lệch hệ quy chiếu.

## 3. Cách bóc tọa độ ô

### 3.1. Chuẩn hóa ảnh

`FormUploadModal` nhận JPEG/PNG, giới hạn file 8 MB, ảnh 12 triệu pixel; canvas đầu vào giữ tỉ lệ và giảm cạnh lớn nhất xuống tối đa 4096 pixel khi cần.

- **clean-scan:** coi ảnh đã thẳng; bỏ qua phát hiện giấy và kiểm chất lượng tứ giác. Chọn scan không có nghĩa ảnh đã được thuật toán chứng minh tốt.
- **camera-photo:** giảm ảnh để phát hiện cạnh, Gaussian blur, Canny, đóng khoảng đứt bằng morphology, tìm contour rồi xấp xỉ đa giác bốn góc lồi. Chọn ứng viên qua kiểm diện tích/tính hình chữ nhật/biên và chất lượng; sắp TL–TR–BR–BL; `getPerspectiveTransform` + `warpPerspective` nắn về hình chữ nhật. Nếu không đủ tin cậy, luồng phôi này báo lỗi, không âm thầm coi toàn ảnh là giấy.

Tọa độ ô sau đó thuộc **ảnh đã xử lý**, không phải ảnh chụp gốc. Giảm ảnh/nắn phối cảnh làm thay đổi kích thước và vị trí pixel.

### 3.2. Tạo ảnh nhị phân

OpenCV chuyển ảnh sang grayscale, Gaussian blur mặc định 3×3, adaptive Gaussian threshold với block 31 và C=7. Threshold đảo màu: nét mực thành foreground trắng, nền thành đen để thuận tiện cho morphology.

### 3.3. Phát hiện ba nhóm hình học

| Nhóm | Thuật toán thực tế | Điểm cần hiểu |
|---|---|---|
| Ô kín/ô bảng | Erode rồi dilate với kernel dài ngang và dọc, mặc định chiều dài theo kích thước ảnh chia 30. OR hai mask, closing 3×3, `findContours(RETR_TREE)` rồi `boundingRect` | Đây là phát hiện đường kẻ/khung, không hiểu ý nghĩa nội dung hoặc loại thủ tục. |
| Checkbox | Tìm contour trực tiếp trên binary trước khi erosion đường dài; kích thước 12–80 px, aspect ratio 0.75–1.33, rectangularity ≥0.60, đa giác lồi 4–5 đỉnh; loại lỗ viền bên trong | Tìm được hình ô vuông chưa chứng minh đó là checkbox nghiệp vụ hoặc đã được tích. |
| Dòng/cụm chữ | Dilation ngang kernel 14×3 để nối nét chữ/dấu chấm; contour ngoài, lọc chiều cao/rộng/diện tích, padding. Rộng ≥35% trang là field_row, nhỏ hơn là phrase_cluster | Dòng text dài có thể bị xem là ứng viên dòng điền; đây là một nguồn ô dư. |

Ứng viên chứa `{x, y, width, height}`, source, area ratio, aspect ratio, rectangularity và thông tin contour. Row detector đặt rectangularity=0.85 theo heuristic; đây **không phải** điểm tin cậy do model đo.

### 3.4. Lọc, gộp và sắp thứ tự

- Lọc geometry bất thường, nhiễu nhỏ, khung gần toàn trang; khử các viền gần trùng bằng IoU và độ giống kích thước/vị trí. IoU mặc định 0.88; không xóa mọi trường hợp containment vì có thể mất ô con thật.
- Gộp ô kín, checkbox, dòng độc lập; loại dòng nằm trong ô lớn hơn hoặc chồng checkbox nhiều.
- Phân cấp container–ô con theo containment và tỉ lệ diện tích ≥1.3; nhóm các ô gần cùng hàng, sắp trên xuống dưới/trái sang phải, cấp ID `candidate_001`…
- Khi tạo manifest, bỏ `isContainer` và `phrase_cluster`. Các ô còn lại vẫn là **ứng viên cần đối soát**, không phải tập field đã được xác minh tự động.

## 4. Cách bóc text

### 4.1. Phân đoạn dòng trong dịch vụ Python

Backend `VietOcrProvider` gửi ảnh chuẩn qua adapter tới dịch vụ FastAPI local. Adapter gửi một vùng `[0,0,1,1]`; Python nhận ra đây là trang đầy đủ và tự phân đoạn:

1. Nếu rộng hơn 1200 px, giảm bản sao xuống 1200 để tìm vùng; crop nhận dạng vẫn lấy pixel từ ảnh input dịch vụ, không phải bản sao thu nhỏ.
2. Grayscale → blur 3×3 → **Otsu threshold đảo màu**. Chú ý nhánh này dùng Otsu, khác adaptive threshold ở nhánh tìm ô trình duyệt.
3. Dilation ngang với kernel thay đổi theo kích thước để nối ký tự cùng dòng; tìm contour ngoài.
4. Lọc vùng quá mỏng/quá nhỏ/quá cao và một số đường ngang; sắp các vùng theo hàng và từ trái sang phải.
5. Map tọa độ về ảnh input bằng scale X/Y riêng, floor/ceil, thêm padding rồi crop. Trả tọa độ dòng dạng normalized YXYX.

Giới hạn Python hiện là **120 vùng** cho mỗi request; vượt giới hạn báo lỗi, không âm thầm bỏ các vùng nhỏ. Đây là giới hạn chặt hơn `ocrLines=4000` của tầng ứng dụng.

### 4.2. Nhận dạng VietOCR

Cấu hình inference hiện dùng `vgg19_bn` làm CNN và `seq_modeling: transformer`; weights `vgg_transformer.pth` nạp từ local. Đây là **inference model có sẵn**, không có bằng chứng pipeline này huấn luyện model riêng cho dự án.

Crop được chuẩn hóa cao 32 px, giới hạn chiều rộng 32–512. Code gom ảnh theo bin chiều rộng, padding bên phải, chạy batch tối đa 8 crop, giải mã qua vocabulary tiếng Việt rồi trả `lineId`, text, confidence và tọa độ. Có inference lock để tránh nhiều request cùng chạy model trong process; CPU giới hạn tối đa tám thread, hoặc CUDA nếu khả dụng.

**Confidence là model score, không phải phần trăm chính xác đã được hiệu chuẩn.** Điểm cao không chứng minh tên, số tiền hay ô trống được đọc đúng. Vùng có đường viền/chấm dù không có chữ vẫn có thể lọt phân đoạn và khiến model nhận dạng ra chữ không tồn tại.

### 4.3. Retry có giới hạn và JSON

- OCR kém, thiếu confidence/geometry, nhiều score thấp hoặc có warning có thể kích hoạt tối đa **hai lượt** cùng ngân sách timeout mặc định 60 giây. Lượt sau dùng ảnh tăng tương phản/ánh sáng; luồng upload phôi hiện không gửi enhancements nên có thể dùng fallback Sharp trên server.
- Không chọn kết quả dài hơn hoặc score cao hơn một cách tự động. Mặc định giữ primary; chỉ thay trong một số điều kiện unreadable/damaged có kiểm soát. Hai lượt khác text/số thì ghi cảnh báo và vùng cần review.
- `assembleJson` giữ `rawText`, blocks có bbox/confidence, dòng nguồn, nodes, source IDs và warnings. Regex nhận tiêu đề, mục, nhãn quen thuộc, dấu `:`, dấu chấm trống, ký hiệu checkbox… rồi tách label/rawValue.
- `blank` từ regex chỉ nghĩa phần text đọc được rỗng hoặc là placeholder; **không xác minh trực tiếp ảnh ô trống**. Nhãn ngoài vocabulary hoặc OCR mất dấu/dấu `:` có thể không được nhận ra.
- JSON luôn `requiresReview: true`; `status: success` không có nghĩa đã chính xác hay đã duyệt. Provider hiện trả `tokens: []`, `tables: []`: phát hiện khung bảng ở OpenCV chưa tạo ra JSON bảng đầy đủ với rowSpan/columnSpan và text từng cell.

## 5. Cách ghép text với ô và đổi hệ tọa độ

### 5.1. Hệ tọa độ

| Tầng | Quy ước |
|---|---|
| OpenCV candidate | Pixel `{x, y, width, height}` trên ảnh xử lý |
| VietOCR/contract nội bộ | `[ymin, xmin, ymax, xmax]` trong [0,1] — YXYX |
| Document JSON export | `[xmin, ymin, xmax, ymax]` — XYXY |
| Manifest / workflow highlight | YXYX; assembler đổi XYXY về YXYX rõ ràng |
| FE | CSS `%` tương đối với chính ảnh trang được lưu |

Với ảnh chuẩn rộng W, cao H và candidate `(x,y,w,h)`:

```text
normalizedCoords = [y/H, x/W, (y+h)/H, (x+w)/W]
CSS top = ymin×100%; left = xmin×100%
height = (ymax−ymin)×100%; width = (xmax−xmin)×100%
```

Ví dụ ảnh 1000×1400, ô `(80,300,840,100)` → YXYX `[0.214286,0.08,0.285714,0.92]`. FE vẽ trên ảnh input gốc khác crop/phối cảnh sẽ lệch dù những con số này hợp lệ. CSS helper còn áp dụng kích thước tối thiểu 0.8% để vùng rất nhỏ vẫn nhìn được; đây là điều chỉnh hiển thị, không tăng độ chính xác detector.

### 5.2. Matching nhãn với ô

`assembleFormManifest` yêu cầu OCR và candidates cùng frame `processed-primary`, đúng kích thước và một trang. Nó lấy nhãn từ `structure.fields`/`structure.checkboxes`, truy lại blocks nguồn và tính khoảng cách nhãn–ô:

```text
score = 4 × verticalGap + horizontalGap
chỉ xét verticalGap ≤ 0.05 và horizontalGap ≤ 0.18
```

Ưu tiên gần theo chiều dọc. Nhãn khác có score sát nhau trong 0.02 → để nhãn rỗng. Một nhãn nguồn bị ghép cho nhiều ô → xóa nhãn tự động, yêu cầu sửa. Tọa độ vẫn lấy từ candidate ô, **không thay bằng bbox nhãn OCR**.

Matching này là nearest-neighbour heuristic, không phải mô hình hiểu layout; chưa bảo đảm ghép đúng nhãn nằm bên trái/phía trên trong bảng phức tạp. Cán bộ phải sửa nhãn, vẽ/chỉnh vùng, loại ô dư, chỉnh loại/thứ tự và xác nhận trước khi sinh kịch bản.

## 6. Điểm nối với Gemini và FE

Gemini Prompt Service nhận manifest đã đối soát dưới dạng JSON, không nhận ảnh để tự đo ô. Nó sinh lời hướng dẫn, nhãn, ví dụ và FAQ; kiểm một bước cho mỗi boxId. Server gán `highlightCoords` lại từ manifest, không tin geometry model sinh. Workflow phải được duyệt trước khi công dân đọc.

FE VisualTwin lấy ảnh page và highlightCoords cùng workflow đã duyệt để overlay; hook Voice đọc nội dung của bước hiện tại. Như vậy lỗi OCR/matching đi vào nhãn và hướng dẫn, còn lỗi frame/XYXY–YXYX làm highlight sai. Hai nhóm lỗi cần đo và sửa riêng.

## 7. Những luồng dễ nhầm

| Luồng | Khác luồng phôi ở đâu? |
|---|---|
| `/opencv-test` → `/api/documents/candidates-ocr` | Crop từng candidate rồi gọi nhận dạng; API giới hạn 70 vùng. JSON xuất là partial và có cảnh báo, không chứng minh đã OCR toàn trang. Đây không phải luồng FormUploadModal hiện tại. |
| `/document-test` hoặc đọc chứng từ → `/api/documents/extract` | OCR rồi Gemini phân loại/bóc dữ liệu có nguồn; service hiện chỉ cho tự xử lý loại traffic_violation_record phù hợp. Khác Gemini sinh hướng dẫn từ manifest phôi. |
| `prepareDocumentImage` | Có xử lý chất lượng/enhancements và trường hợp đọc toàn ảnh với điều kiện riêng. Không áp dụng quy tắc fallback này cho nhánh camera-photo của upload phôi. |
| JSON/types có pages | Cấu trúc có trường page không đồng nghĩa pipeline đa trang hoàn tất: VietOcrProvider trả pageCount=1, manifest assembler bắt buộc một trang, prompt gán pageNumber=1. Upload phôi hiện chỉ nhận một PNG/JPEG, không PDF đa trang. |

## 8. Đánh giá ngắn

**Điểm tốt:** tách OCR/geometry/LLM; giữ nguồn và cảnh báo; cùng frame xử lý; giới hạn tài nguyên; không dùng OCR offline giả trong provider thật; đối soát bắt buộc; tọa độ không do Gemini tự bịa.

**Điểm chưa đủ ổn:** trong kiểm thử step-12, phôi hai ô sinh 11 ứng viên và phải sửa thủ công. Bộ lọc hình học chưa đủ phân biệt text dài/viền kép/ô thật; matching nhãn dựa khoảng cách và vocabulary hạn chế; chưa có phát hiện mực/chữ đủ tốt để chống hallucination ô trống; chưa khôi phục bảng và đa trang toàn luồng. Không thể suy ra “độ chính xác X%” từ số unit test hoặc confidence model.

**Nhận định nguyên nhân, chưa là kết luận benchmark:** contour bên trong/bên ngoài của một viền có thể cùng tồn tại nếu không vượt điều kiện duplicate; tỉ lệ diện tích <1.3 cũng không được đánh dấu container. Dilation nối text và đường kẻ có thể tạo crop không đúng dòng. Những cơ chế này phù hợp hiện tượng dư ô/chữ giả đã quan sát, cần kiểm bằng mask/crop cụ thể trước khi tuning.

Hướng cải thiện ưu tiên: (1) đo riêng chất lượng text bằng CER/WER và field detection bằng precision/recall/IoU; (2) xem crop/mask, lọc viền kép và vùng không có chữ; (3) matching nhãn–input có hướng và ràng buộc layout; (4) dữ liệu ground truth bảng/nhiều trang. Không dùng Gemini để đoán bổ sung chữ thiếu hoặc tọa độ thiếu rồi coi đó là OCR thật.

## 9. Bản đồ mã nguồn để tra cứu

| File | Điểm bắt đầu | Vai trò |
|---|---|---|
| `src/components/admin/FormUploadModal.tsx` | dòng 56 | Orchestrate pipeline phôi hiện tại |
| `src/modules/opencv/debug-pipeline.ts` | dòng 85 | Điều phối xử lý giấy, binary, detector, gộp/sort |
| `src/modules/opencv/document-detector.ts` | dòng 11 | Tìm tứ giác giấy |
| `src/modules/opencv/perspective-transform.ts` | dòng 32 | Warp phối cảnh |
| `src/modules/opencv/contour-detector.ts` | dòng 17 | Ô từ contour đường kẻ |
| `src/modules/opencv/checkbox-detector.ts` | dòng 63 | Checkbox hình học |
| `src/modules/opencv/row-detector.ts` | dòng 57 | Dòng/cụm chữ |
| `src/modules/opencv/box-filter.ts` | dòng 14 | Lọc/khử trùng; merge bắt đầu dòng 99 |
| `src/modules/opencv/geometric-sort.ts` | dòng 32 | Container, nhóm hàng và thứ tự |
| `services/vietocr-service/app.py` | dòng 162 | Segment dòng; batch inference dòng 257; /predict dòng 393 |
| `services/vietocr-service/inference.yml` | dòng 1 | Cấu hình CNN/Transformer inference |
| `src/modules/documents/providers/vietocr-provider.ts` | dòng 9 | OCR provider trang đơn, không offline synthesizer |
| `src/modules/documents/adaptive-ocr.ts` | dòng 94 | Hai lượt OCR và review disagreement |
| `src/modules/documents/json-assembler.ts` | dòng 31 | JSON có provenance, tọa độ XYXY |
| `src/modules/documents/json-content-classifier.ts` | dòng 22 | Regex classification, label-value |
| `src/modules/forms/services/form-manifest-assembler.ts` | dòng 17 | Matching nhãn–ô, normalized YXYX |
| `src/modules/voice-ai/services/gemini-prompt.service.ts` | dòng 64 | Sinh workflow; gắn tọa độ manifest dòng 153 |
| `src/shared/utils/geometry.ts` | dòng 6 | Đổi normalized bbox thành CSS |

Tóm lại: **OpenCV tìm hình học; VietOCR đọc crop; regex xác định nhãn; matching nối nhãn với vùng viết; cán bộ xác nhận; Gemini diễn đạt hướng dẫn; FE hiển thị đúng ảnh và tọa độ đã duyệt.**
