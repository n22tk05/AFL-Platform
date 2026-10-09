# Kế Hoạch Nghiệm Thu Độc Lập: Đánh Giá Chất Lượng Pipeline OCR → JSON

> **Dự án:** AFL-Platform  
> **Bộ phận:** QA & Independent Evaluation  
> **Mục tiêu:** Cung cấp phương pháp luận, tiêu chí định lượng và quy trình kiểm thử độc lập để đánh giá việc chuyển đổi từ xuất Markdown (`.md`) sang JSON có cấu trúc (`DocumentContent` / `JsonExportDraft`).

---

## 1. TỔNG QUAN VÀ ĐỐI TƯỢNG KIỂM THỬ

### 1.1 Kiến trúc Pipeline Thực tế
Đường đi của dữ liệu từ ảnh chụp tới file JSON:

```
[Ảnh Đầu Vào JPEG/PNG] 
       │
       ▼
[OpenCV WASM / Sharp]: Phân tích chất lượng ảnh (Quality gate, Deskew, Contrast/Lighting variants)
       │
       ▼
[VietOCR Provider] (Cổng 8000 microservice): Line detection + Transformer recognition
       │  ==> Trả về DocumentOcrResult (fullText, lines[], pageCount, warnings[])
       ▼
[Adaptive OCR Engine]: Kiểm tra cần retry -> So sánh và hòa giải (reconcile) giữa Primary và Enhanced variant
       │
       ▼
[JSON Content Classifier & Extractor]: Phân loại từng dòng OCR thành các thành phần thể thức (Headers, Title, Sections, Fields, Checkboxes, Tables, Signatures, FreeText)
       │
       ▼
[JSON Assembler]: Gom cụm dòng hiển thị (Visual Row Clustering), đóng gói thành DocumentContent
       │
       ▼
[JSON Validator]: Kiểm tra tính toàn vẹn cú pháp, ký tự điều khiển, giới hạn kích thước, tỷ lệ bao phủ (completeness)
       │
       ▼
[API Route & UI]: Trả về JsonExportDraft (contractVersion: 1, status: review_required) -> Preview & Tải file .json
```

### 1.2 Phân biệt Rõ 3 Tầng Lỗi

Khi hệ thống gặp sự cố, kiểm thử viên bắt buộc phải phân loại chính xác tầng phát sinh lỗi, tránh quy chụp mọi lỗi cho "AI" hoặc "OCR":

1. **Lỗi OCR (OCR Error):**
   - *Biểu hiện:* Văn bản trên ảnh có tồn tại nhưng `DocumentOcrResult.lines` đọc sai ký tự, mất dấu tiếng Việt, nhầm số, hoặc bỏ sót hoàn toàn dòng đó.
   - *Ví dụ:* Trên ảnh ghi `038092008765`, OCR trả về `38092008765` hoặc `O38O92OO8765`.
   - *Nguyên nhân:* Model VietOCR nhận diện kém, ảnh mờ, góc chụp nghiêng chưa được nắn phẳng.

2. **Lỗi Cấu trúc & Ghép nối (Structural / Assembly Error):**
   - *Biểu hiện:* OCR đọc đúng 100% dòng chữ, nhưng trong JSON output dòng đó bị gán nhầm sang trường khác, bị biến mất khỏi JSON, hoặc đảo lộn thứ tự.
   - *Ví dụ:* Dòng "Giới tính: Nữ" bị ghép vào value của trường "Họ và tên", hoặc ô trống của bảng làm thụt lùi toàn bộ cột phía sau.
   - *Nguyên nhân:* Regex gán nhãn sai, thuật toán visual row clustering sai ngưỡng tọa độ Y, hoặc logic gom bảng bỏ quên ô trống.

3. **Lỗi Giao diện & Xuất dữ liệu (UI & Export Error):**
   - *Biểu hiện:* Dữ liệu JSON trong bộ nhớ đúng, nhưng người dùng không tải được file, file tải về lỗi font encoding, hoặc thay đổi ảnh mới nhưng màn hình vẫn hiện kết quả cũ.
   - *Ví dụ:* File tải về bị lỗi mã hóa ANSI/ASCII thay vì UTF-8 làm vỡ dấu tiếng Việt, hoặc backend trả về mã lỗi `OCR_EMPTY_TEXT` nhưng UI vẫn hiển thị tick xanh thành công.
   - *Nguyên nhân:* Header response thiếu `charset=utf-8`, state React không reset khi upload file mới, hoặc xử lý HTTP status code lỏng lẻo.

---

## 2. PHÂN BIỆT KHÁI NIỆM "100% NỘI DUNG"

> [!IMPORTANT]
> **CẢNH BÁO VỀ ĐỊNH NGHĨA KỸ THUẬT:**
> Không được đánh đồng hai khái niệm sau thành một thuật ngữ chung "100% nội dung":
> 1. **100% Dòng OCR Được Bảo Toàn (OCR Line Preservation Rate = 100%):** Mọi dòng text mà VietOCR đọc ra (`ocr.lines`) đều phải có mặt trong kết quả JSON (trong các trường có cấu trúc hoặc trong mảng `lines`/`freeText`). Đây là trách nhiệm của **JSON Assembler**.
> 2. **Độ Chính Xác OCR So Với Ảnh (Image-to-Text OCR Accuracy):** Tỷ lệ ký tự/từ OCR đọc đúng so với chữ in thực tế trên tờ giấy. Đây là trách nhiệm của **Model VietOCR** và chất lượng ảnh đầu vào.
> 
> Một hệ thống có thể đạt **100% bảo toàn dòng OCR** nhưng vẫn có **độ chính xác OCR chỉ đạt 85%** nếu ảnh bị mờ hoặc model đọc sai dấu.

---

## 3. TIÊU CHÍ ĐÁNH GIÁ CHI TIẾT (4 NHÓM PHÉP KIỂM)

### Nhóm A: Chất Lượng OCR (Image-to-OCR Fidelity)

Áp dụng cho các mẫu đã có ground truth xác nhận (như bộ 10 synthetic fixtures).

1. **Đo lường sai số ký tự và từ:**
   - **CER (Character Error Rate):** $\text{CER} = \frac{S + D + I}{N}$ (Thay thế + Xóa + Chèn / Tổng số ký tự chuẩn).
   - **WER (Word Error Rate):** $\text{WER} = \frac{S_w + D_w + I_w}{N_w}$.
2. **Khớp chính xác các giá trị nghiệp vụ then chốt (Exact Match on Critical Values):**
   - Số biên bản, số quyết định, mã hồ sơ.
   - Số CCCD / CMND (đúng đủ 12 chữ số, giữ số 0 đầu).
   - Biển kiểm soát phương tiện.
   - Số tiền phạt (đúng từng chữ số, đúng đơn vị).
   - Ngày tháng năm (đúng định dạng ngày dương lịch hợp lệ).
3. **Báo cáo riêng biệt các nhóm lỗi đặc thù:**
   - *Lỗi dấu tiếng Việt:* Nhầm dấu hỏi/ngã, sắc/nặng, mất dấu mũ ở `â, ê, ô`, mất râu ở `ơ, ư`.
   - *Lỗi chữ số:* Nhầm `0` ↔ `O`/`D`, `1` ↔ `I`/`l`, `8` ↔ `B`, `5` ↔ `S`.
   - *Lỗi dấu phân cách:* Nhầm dấu chấm `.` thành dấu phẩy `,` trong số tiền `2.500.000`.
4. **Quy tắc chuẩn hóa khi so sánh (Normalization Rules):**
   - Unicode Normalization Form C (`NFC`) cho toàn bộ chuỗi tiếng Việt.
   - Gộp khoảng trắng liên tiếp thành 1 dấu cách đơn (`replace(/\s+/g, ' ')`), loại bỏ khoảng trắng đầu/cuối dòng (`trim()`).
   - **NGHIÊM CẤM:** Không áp dụng các hàm chuẩn hóa làm thay đổi ngữ nghĩa: không tự xóa số 0 đầu chuỗi, không tự đổi dấu chấm thành dấu phẩy trong số tiền, không tự viết hoa/thường chuỗi mã định danh.

---

### Nhóm B: Bảo Toàn Dữ Liệu (Data Preservation & Grounding)

Kiểm tra quá trình chuyển dịch từ `DocumentOcrResult` sang JSON output.

1. **Bảo toàn toàn bộ dòng OCR (Zero Line Dropping):**
   - Với mọi dòng $L \in \text{ocr.lines}$, phải tồn tại một thực thể trong JSON trích dẫn $L$ qua `sourceLineIds` hoặc lưu trong mảng `lines[]`.
   - Số lượng dòng OCR đầu vào phải bằng tổng số dòng được tham chiếu trong JSON.
   - **Vi phạm nghiêm trọng:** Bất kỳ dòng OCR nào bị âm thầm loại bỏ mà không có trong JSON.
2. **Tính toàn vẹn văn bản thô (Verbatim Raw Text):**
   - Trường `rawText` của mỗi field trong JSON phải trùng khớp từng ký tự với đoạn trích nguồn từ OCR, không bị thêm bớt cú pháp Markdown hay JSON.
3. **Tính hợp lệ của tham chiếu (Source ID Integrity):**
   - Mọi mã định danh dòng trong `sourceLineIds` phải tồn tại thực sự trong `ocr.lines`. Không được sinh ra ID giả hoặc ID không có nguồn gốc.
4. **Giữ lại dòng không thể phân loại (Unclassified Line Retention):**
   - Dòng chữ không khớp bất kỳ biểu thức chính quy (regex) nào của biểu mẫu hành chính bắt buộc phải được giữ lại trong `structure.freeText` hoặc mảng `lines` với type `free_text` / `unknown`.

---

### Nhóm C: Tính Chuẩn Xác Cấu Trúc (Structural Integrity)

1. **Gán nhãn đúng giá trị (Label-to-Value Mapping):**
   - Giá trị thuộc tính phải nằm đúng trường (ví dụ: `Họ và tên` không được chứa ngày sinh hay số tiền).
   - Với các dòng chứa nhiều trường song song (như TC03: Họ tên + Giới tính), assembler phải bóc tách đúng thành các trường độc lập.
2. **Quan hệ bảng (Table Grid Integrity):**
   - Mọi hàng trong bảng phải có số cột bằng `columnCount` của tiêu đề.
   - Các ô thực sự để trống trên văn bản phải được biểu diễn là `null` hoặc `""`, không được làm xô lệch các ô dữ liệu của cột kế tiếp.
   - Dữ liệu cột phải đúng thứ tự logic từ trái sang phải.
3. **Trạng thái Checkbox:**
   - Ký hiệu chọn (`☑`, `[x]`, `[X]`) gán `checked: true`.
   - Ký hiệu không chọn (`☐`, `[ ]`) gán `checked: false`.
   - Khi ký hiệu bị mờ, lem mực hoặc không rõ ràng: bắt buộc gán `status: "needs_review"` hoặc `checked: null / unknown`, cấm tự ý gán mặc định `false`.
4. **Phân biệt trường để trống vs Không đọc được:**
   - Trường có in nhãn nhưng dòng kẻ/dòng chấm phía sau hoàn toàn trắng: `value: null`, `status: "blank"`.
   - Vùng có mực/chữ viết tay nhưng quá mờ hoặc nhòe: `value: null`, `status: "unreadable"`, `validationErrors: ["Vùng chữ không thể nhận diện"]`.
5. **Thứ tự đọc hợp lý (Natural Reading Order):**
   - Văn bản phải tuân theo thứ tự từ trên xuống dưới, từ trái sang phải. Đối với văn bản 2 cột (như Quốc hiệu/Tiêu ngữ song song với Số công văn, hoặc Chữ ký 2 bên), hệ thống phải gom cụm theo khối hợp lý.

---

### Nhóm D: Trạng Thái Hệ Thống & Export (State, Protocol & Export)

1. **Tính hợp lệ cú pháp JSON:**
   - Chuỗi trả về từ API và file tải xuống phải parse được bằng `JSON.parse()`.
   - Thỏa mãn JSON Schema do Codex quy định (`contractVersion: 1`, đầy đủ các thuộc tính bắt buộc).
2. **Mã hóa và hiển thị tiếng Việt (Encoding & Diacritics):**
   - File `.json` tải xuống máy người dùng bắt buộc mã hóa chuẩn `UTF-8` (có hoặc không có BOM).
   - Khi mở lại trong phần mềm soạn thảo hoặc hệ thống khác, toàn bộ ký tự tiếng Việt có dấu phải hiển thị nguyên vẹn, không biến thành ký tự rác (Mojibake: `Cá»™ng hÃ²a`).
3. **Cô lập phiên và làm mới trạng thái (Session Isolation & Stale State Prevention):**
   - Khi người dùng tải lên ảnh mới hoặc chuyển đổi tài liệu, toàn bộ dữ liệu JSON của ảnh trước đó phải bị xóa hoàn toàn khỏi state hiển thị.
   - Không được xảy ra hiện tượng "lưu đệm" hiển thị nhầm kết quả cũ.
4. **Xử lý lỗi trung thực (Fail-Safe & Honest Error Reporting):**
   - Nếu OCR thất bại (ảnh rỗng, ảnh hỏng, mất kết nối microservice), hệ thống phải trả về mã lỗi rõ ràng (`OCR_EMPTY_TEXT`, `OCR_UNAVAILABLE`).
   - Tuyệt đối cấm hành vi che giấu lỗi bằng cách trả về HTTP 200 kèm dữ liệu giả lập (mock sample data).
5. **Cảnh báo cần kiểm tra (Human-in-the-Loop Flagging):**
   - Mọi tài liệu có vùng chữ confidence thấp (< 0.8), có cảnh báo méo/mờ/chói sáng, hoặc có trường nhạy cảm tài chính/pháp lý đều phải mang cờ `requiresReview: true` và `status: "review_required"`.

---

## 4. BẢNG ĐỀ XUẤT NGƯỠNG ĐO LƯỜNG (BENCHMARK THRESHOLDS)

> [!NOTE]
> Các ngưỡng dưới đây là **đề xuất kỹ thuật từ nhóm QA**. Chủ dự án / Product Owner cần rà soát và phê duyệt chính thức trước khi áp dụng làm tiêu chí nghiệm thu release (Go/No-Go Gate).

| Tiêu chí | Ngôn ngữ / Đối tượng | Ngưỡng đề xuất (Acceptance) | Mức độ cảnh báo (Warning) | Trạng thái phê duyệt |
|---|---|---|---|---|
| **OCR Line Preservation** | Toàn bộ dòng OCR | **100.0%** (Tuyệt đối không mất dòng) | < 100% | *Đề xuất chuẩn kỹ thuật* |
| **CER (Văn bản in rõ nét)** | Tiếng Việt có dấu (TC01, TC06) | **≤ 1.5%** | > 1.5% và ≤ 4.0% | *Cần PO xác nhận* |
| **WER (Văn bản in rõ nét)** | Tiếng Việt có dấu (TC01, TC06) | **≤ 3.0%** | > 3.0% và ≤ 8.0% | *Cần PO xác nhận* |
| **Exact Match: Số CCCD** | Chuỗi 12 chữ số | **100.0%** (Cấm mất số 0 đầu) | Bất kỳ sai lệch nào | *Bắt buộc pháp lý* |
| **Exact Match: Số tiền** | Tiền tệ VNĐ | **100.0%** (Cấm đổi giá trị) | Bất kỳ sai lệch nào | *Bắt buộc pháp lý* |
| **Table Column Alignment** | Bảng có ô trống (TC04) | **100.0%** số hàng đúng số cột | Hàng bị lệch cột | *Đề xuất kỹ thuật* |
| **Checkbox State Accuracy** | Checkbox rõ nét (TC05) | **≥ 95.0%** | < 95.0% | *Cần PO xác nhận* |
| **Empty Field Detection** | Dòng chấm chưa điền (TC02) | **100.0%** gán `value: null` | Gán `....` làm value | *Đề xuất kỹ thuật* |
| **Unclassified Retention** | Dòng tự do (TC09) | **100.0%** dòng có mặt trong JSON | Bị bỏ qua dòng nào | *Đề xuất kỹ thuật* |
| **Blank Document Response** | Ảnh trắng (TC10) | **100.0%** báo `OCR_EMPTY_TEXT` | Trả về dữ liệu giả | *Bắt buộc kiểm thử biên* |

---

## 5. QUY TRÌNH THỰC HIỆN ĐÁNH GIÁ (EXECUTION STEPS)

1. **Bước 1: Chuẩn bị môi trường & Endpoint**
   - Khởi động VietOCR microservice cục bộ: `http://127.0.0.1:8000/health`.
   - Khởi động AFL Next.js server trên port 3001.
2. **Bước 2: Gửi từng fixture trong bộ 10 mẫu**
   - Gửi ảnh qua `POST /api/documents/json` (hoặc test harness tự động).
   - Thu thập raw response JSON và lưu trữ vào thư mục kết quả đánh giá.
3. **Bước 3: Chạy script so khớp dữ liệu đối chiếu**
   - So sánh output với `tests/fixtures/ocr-json/ground-truth.json`.
   - Tính toán các chỉ số: Bảo toàn dòng, CER, Khớp trường then chốt, Cấu trúc bảng.
4. **Bước 4: Kiểm tra bằng mắt (Human Review)**
   - Mở UI đối soát tại `/scan-document` hoặc `/document-test`.
   - Tải file `.json` về máy, kiểm tra font UTF-8, thử nghiệm hành động tải lại/đổi ảnh.
5. **Bước 5: Lập báo cáo lỗi**
   - Điền phiếu theo mẫu `bug-report-template.md` cho từng lỗi phát hiện.
   - Bàn giao danh sách lỗi cho Codex xử lý theo `handoff-to-codex.md`.
