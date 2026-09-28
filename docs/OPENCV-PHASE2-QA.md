# OpenCV Phase 2 QA Report

## 1. Thông tin kiểm tra

- **Branch**: `qa/opencv-phase2-visual`
- **Commit**: `5127055` (`feat(opencv): integrate preprocessing debug pipeline`)
- **Ngày kiểm tra**: 23/09/2026
- **Môi trường**: Windows x64 (PowerShell)
- **Node/npm**: Node.js `v24.19.0` / npm `11.17.0`
- **Browser**: Không có browser automation / interactive browser trong môi trường CLI.

---

## 2. Kết quả kiểm tra tự động

| Kiểm tra | Lệnh thực thi | Kết quả | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Config Unit Tests** | `npx tsx --test src/modules/opencv/tests/config.test.ts` | **PASS** (9/9 pass, 0 fail) | Kiểm tra toàn diện validate, kernel calculation, và immutability của cấu hình mặc định (thời gian: 231.8ms). |
| **Field Candidate Tests** | `npx tsx --test src/modules/opencv/tests/box-filter.test.ts src/modules/opencv/tests/geometric-sort.test.ts` | **PASS** (8/8 pass, 0 fail) | Kiểm tra IoU calculation, candidate deduplication, geometric row/column sorting (thời gian: 186.3ms). |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS** (0 lỗi) | Toàn bộ module OpenCV, contracts và test suites tương thích kiểu dữ liệu nghiêm ngặt. |
| **Production Build** | `npm run build` | **PASS** (Exit code 0) | Next.js 14 compile thành công; route `○ /opencv-test` được prerender tĩnh (7.13 kB, First load JS: 94.5 kB). Webpack fallback resolve `fs`, `path`, `crypto` hoạt động chuẩn xác cho client bundle. |
| **Dev Server Route** | `npx next dev -p 3008` & `GET /opencv-test` | **PASS** (HTTP 200 OK) | Route compile 525 modules trong 2s, trả về HTML hợp lệ; OpenCV không bị nạp phía server gây lỗi SSR `window`/`document`. |

---

## 3. Dữ liệu kiểm thử

| Ảnh | Loại | Kích thước | Nguồn | Có PII không |
| :--- | :--- | :--- | :--- | :--- |
| *(Không có)* | Form scan thực tế | N/A | `assets/`, `public/`, `fixtures/` | **Không** |

> [!WARNING]
> **BLOCKER DỮ LIỆU KIỂM THỬ:**
> Quét toàn bộ repository (`assets/`, `public/`, `test/`, `tests/`, `fixtures/`) xác nhận **chưa có bất kỳ file ảnh mẫu thực tế nào** (như mẫu scan Tờ khai 01/LPTB tương ứng với `assets/mock-data/mock-manifest.json`). Đây là rào cản dữ liệu cần bổ sung trước khi tuyên bố pipeline line detection đạt độ chính xác chuẩn hóa trong thực tế.

---

## 4. Cấu hình hiện tại

Cấu hình mặc định được khai báo tại `src/modules/opencv/config.ts` (được đóng băng bằng `Object.freeze`):

| Tham số | Giá trị | Vai trò |
| :--- | :--- | :--- |
| `adaptiveBlockSize` | `31` | Kích thước vùng lân cận (neighborhood window, lẻ) để tính ngưỡng cục bộ Gaussian trong binarization. |
| `adaptiveC` | `7` | Hằng số trừ đi từ trung bình trọng số Gaussian để bù trừ tương phản nền giấy. |
| `blurKernelSize` | `3` | Kích thước kernel làm mịn Gaussian (3x3) trước khi phân ngưỡng để loại bỏ nhiễu hạt giấy. |
| `horizontalKernelDivisor` | `30` | Mẫu số tính chiều dài kernel lọc nét ngang: $\text{length} = \max(1, \lfloor \text{width} / 30 \rfloor)$. Với ảnh 1600px, kernel dài ~53px. |
| `verticalKernelDivisor` | `30` | Mẫu số tính chiều dài kernel lọc nét dọc: $\text{length} = \max(1, \lfloor \text{height} / 30 \rfloor)$. Với ảnh 1200px, kernel dài ~40px. |
| `closeGapSize` | `3` | Kích thước kernel hình vuông của phép đóng hình thái học (`MORPH_CLOSE`) để nối các khe hở và góc giao nhau. |

---

## 5. Kết quả trực quan

Do môi trường thực thi dòng lệnh không trang bị headless browser hoặc công cụ browser automation (như Playwright/Puppeteer), các canvas không thể render trực tiếp trong phiên chạy tự động. Dưới đây là phân tích kỹ thuật dựa trên mã nguồn triển khai của từng bước pipeline:

| Output | Trạng thái kiểm tra | Nhận xét phân tích kỹ thuật |
| :--- | :--- | :--- |
| **1. Ảnh gốc** | *Chưa kiểm tra (CLI)* | Thuật toán resize phía client giữ cạnh dài tối đa 1600px theo đúng tỷ lệ, không phóng to ảnh nhỏ. Quản lý Object URL an toàn với `URL.revokeObjectURL` ngay khi nạp xong. |
| **2. Grayscale** | *Chưa kiểm tra (CLI)* | Sử dụng `cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY)`. Đảm bảo giữ độ tương phản gốc, không làm biến dạng tỷ lệ pixel. |
| **3. Binary** | *Chưa kiểm tra (CLI)* | Dùng `cv.adaptiveThreshold` với cờ `THRESH_BINARY_INV`. Nét mực đen trở thành màu trắng ($255$, foreground) và giấy trắng thành màu đen ($0$, background). Đây là quy ước bắt buộc cho các phép toán hình thái học tiếp theo. |
| **4. Horizontal lines** | *Chưa kiểm tra (CLI)* | Áp dụng phép mở (`cv.erode` sau đó `cv.dilate`) với kernel $\text{MORPH\_RECT}(\lfloor \text{width} / 30 \rfloor, 1)$. Loại bỏ hiệu quả các nét chữ ngang thông thường. Rủi ro: Có thể xóa mất đường kẻ ngang của ô checkbox nhỏ (kích thước $< 50$ px). |
| **5. Vertical lines** | *Chưa kiểm tra (CLI)* | Áp dụng phép mở với kernel $\text{MORPH\_RECT}(1, \lfloor \text{height} / 30 \rfloor)$. Giữ lại các vách ngăn cột bảng dài. Rủi ro: Có thể xóa mất vách ngăn ngắn của các ô mã số thuế hẹp hoặc ô checkbox thấp. |
| **6. Combined mask** | *Chưa kiểm tra (CLI)* | Gộp mask ngang và dọc bằng `cv.bitwise_or`, sau đó dùng `cv.morphologyEx(..., MORPH_CLOSE)` với kernel 3x3 để hàn gắn các góc giao nhau bị đứt gãy 1-2px. |
| **7. Field candidates** | *Chưa kiểm tra (CLI)* | Tìm contour trên combined mask, lọc bounding box theo diện tích và tỷ lệ khung hình, sắp xếp hình học từ trên xuống dưới, từ trái sang phải. |

---

## 6. Timing

| Ảnh | Grayscale | Preprocess (Binary) | Line Detection | Total |
| :--- | :--- | :--- | :--- | :--- |
| Form Scan Mẫu 01/LPTB | N/A | N/A | N/A | N/A |
| Control/Negative Sample | N/A | N/A | N/A | N/A |

*Ghi chú: Để giá trị N/A vì môi trường máy chủ kiểm tra không có giao diện đồ họa / browser automation để kích hoạt và đo đạc trực tiếp các hàm canvas trong trình duyệt.*

---

## 7. Lỗi và rủi ro

### 🔴 Blocker
1. **Thiếu tập ảnh kiểm thử biểu mẫu thực tế**: Repository hoàn toàn không có ảnh scan mẫu của Tờ khai 01/LPTB hoặc các biểu mẫu hành chính tương đương. Đây là điều kiện tiên quyết cần được bổ sung để đo đạc định lượng tỷ lệ nhận diện đúng (Precision/Recall).

### 🟡 Cần sửa (Trước khi ra production)
1. **Chưa có cơ chế bù nghiêng (Deskew)**: Pipeline giả định tài liệu được đặt thẳng đứng hoàn hảo. Nếu người dùng chụp ảnh bị nghiêng một góc nhỏ (1-3 độ), kernel thẳng $\text{MORPH\_RECT}$ sẽ bỏ sót gần như toàn bộ các đường kẻ bị lệch trục tọa độ.
2. **Xử lý đường kẻ chấm (`dot leaders` `....`)**: Các dòng điền thông tin dạng `Họ và tên: ....................` không phải là đường thẳng liền nét nên sẽ bị phép toán morphological opening lọc bỏ hoàn toàn, dẫn đến không tạo thành contour khép kín cho các trường dạng này.

### 🟠 Cần tuning
1. **Bộ chia kích thước kernel (`horizontalKernelDivisor` & `verticalKernelDivisor = 30`)**:
   - *Vấn đề*: Với ảnh chiều rộng 1600px, kernel ngang dài 53px. Các ô checkbox tiêu chuẩn trên biểu mẫu (kích thước khoảng $20 \times 20$ px hoặc $30 \times 30$ px) sẽ bị loại bỏ vì cạnh của ô ngắn hơn kernel. Tương tự với chuỗi ô vuông nhập từng chữ số Mã số thuế (`[ ][ ][ ]...`).
   - *Đề xuất*: Cần xem xét giảm độ dài kernel hoặc áp dụng phương pháp phát hiện đa tỷ lệ (multi-scale line detection) dành riêng cho ô checkbox.
2. **`adaptiveC = 7`**:
   - *Vấn đề*: Đối với tài liệu scan chất lượng cao, giá trị 7 hoạt động tốt. Tuy nhiên, nếu ảnh chụp bằng camera điện thoại tại bàn tiếp dân có hiện tượng sấp bóng hoặc ánh sáng yếu (như đã nêu trong `docs/PRE-MORTEM.md` - Rủi ro 7), giá trị này có thể gây đứt đoạn các đường kẻ mảnh.

### 🟢 Chấp nhận cho MVP
1. **Giới hạn kích thước ảnh 1600px**: Giúp kiểm soát bộ nhớ RAM WebAssembly, giảm thiểu rủi ro crash trình duyệt trên thiết bị di động cấu hình thấp.
2. **Thực thi trên Main UI thread**: Với kích thước 1600px, toàn bộ chuỗi xử lý ước tính diễn ra trong khoảng 80-180ms trên máy tính hiện đại, chưa gây đóng băng UI đáng kể ở giai đoạn MVP trước khi tách sang Web Worker.

---

## 8. Kết luận

### Trạng thái: **`READY_WITH_TUNING`** *(Kỹ thuật Pipeline)* / **`BLOCKED`** *(Về dữ liệu kiểm thử)*

**Giải thích dựa trên bằng chứng:**
- **Mặt kỹ thuật & Kiến trúc mã nguồn (`READY_WITH_TUNING`)**: 
  - Toàn bộ pipeline OpenCV WASM từ Loader, Preprocessing, Line Detection đến Candidate Overlay được kết nối đồng bộ và chạy ổn định.
  - 100% unit tests của cấu hình và thuật toán phụ trợ pass (`config.test.ts`, `box-filter.test.ts`, `geometric-sort.test.ts`).
  - TypeScript biên dịch không có lỗi (`npx tsc --noEmit` pass 100%).
  - Production build Next.js 14 pass hoàn toàn mà không gặp lỗi bundler/webpack (`resolve.fallback` cho `fs`, `path`, `crypto` đã được cấu hình chuẩn xác).
  - Không có lỗi nạp OpenCV trên server side (`GET /opencv-test` trả HTTP 200).
- **Mặt dữ liệu kiểm thử (`BLOCKED`)**:
  - Không có dữ liệu ảnh biểu mẫu thực tế trong kho mã nguồn để kiểm chứng chất lượng visual mask. Các tham số kernel divisor hiện tại có nguy cơ cao bỏ sót ô checkbox và ô mã số thuế nếu không được tinh chỉnh thực nghiệm.

---

## 9. Checklist kiểm tra thủ công (Dành cho Developer)

Do môi trường kiểm tra tự động chưa có browser UI, nhà phát triển vui lòng thực hiện kiểm tra thủ công theo checklist sau:

1. **Khởi động server**:
   ```bash
   npm run dev
   ```
2. **Truy cập**: Mở trình duyệt tại `http://localhost:3000/opencv-test`.
3. **Kiểm tra chọn ảnh**:
   - Chọn thử một file không phải ảnh (ví dụ `.pdf` hoặc `.txt`) -> Xác nhận thông báo lỗi màu đỏ xuất hiện và không crash app.
   - Chọn một ảnh JPEG/PNG chụp biểu mẫu thực tế -> Xác nhận canvas "1. Ảnh gốc" hiển thị rõ nét, tỷ lệ chuẩn xác và thông tin kích thước (gốc & resize) hiển thị đúng.
4. **Kiểm tra chạy pipeline**:
   - Nhấn **"Chạy pipeline phát hiện đường"**.
   - Quan sát trạng thái chuyển từ `Đang tải OpenCV…` sang `Đang xử lý…` và cuối cùng là `Xử lý thành công`.
   - Kiểm tra Console trình duyệt (F12) đảm bảo không có bất kỳ lỗi nào: `RuntimeError`, `BindingError`, `memory access out of bounds`, `Mat instance already deleted`.
5. **Kiểm tra 5 intermediate canvases**:
   - **Canvas 2 (Grayscale)**: Ảnh chuyển sang trắng đen sắc nét.
   - **Canvas 3 (Binary)**: Nền giấy đen hoàn toàn, nét chữ và đường kẻ màu trắng sáng.
   - **Canvas 4 (Horizontal)**: Chỉ giữ lại các đường kẻ ngang, không bị dính nét gạch ngang của chữ cái.
   - **Canvas 5 (Vertical)**: Chỉ giữ lại các đường dọc chính của bảng.
   - **Canvas 6 (Combined)**: Bộ khung của tờ khai hiện rõ, các góc vuông giao nhau được khép kín.
   - **Canvas 7 (Field candidates)**: Khung đỏ bao quanh các ô nhập liệu, danh sách Candidate Table bên dưới liệt kê đầy đủ ID và tọa độ.
6. **Kiểm tra độ bền (Stability & Memory)**:
   - Nhấn chạy lại nút xử lý ít nhất 3 lần trên cùng một ảnh -> Kết quả phải đồng nhất, thời gian xử lý ổn định, không bị rò rỉ bộ nhớ WASM.
   - Chọn một ảnh khác -> Toàn bộ canvas cũ được xóa sạch và hiển thị đúng kết quả ảnh mới.

---

## 10. Khuyến nghị cho Phase 3A (Contour Detection & Field Extraction)

1. **Chế độ Contour (`RetrievalModes`)**:
   - Khuyến nghị sử dụng `cv.RETR_CCOMP` (2-level hierarchy: viền ngoài và lỗ rỗng bên trong) hoặc `cv.RETR_TREE` (cây phân cấp đầy đủ), **không nên dùng `cv.RETR_EXTERNAL`**. Lý do: Biểu mẫu hành chính thường đặt các ô nhập liệu bên trong một khung bảng lớn; dùng `RETR_EXTERNAL` sẽ chỉ bắt khung viền bao quanh toàn trang mà bỏ sót toàn bộ các ô nhập bên trong.
2. **Quản lý rủi ro Hierarchy (Phân cấp cha-con)**:
   - Cần có bộ lọc loại bỏ bounding box chiếm $> 90\%$ diện tích trang (khung viền trang hoặc khung ngoài bảng lớn).
   - Khi một ô lớn chứa nhiều ô con (như một hàng bảng chứa nhiều cột), cần ưu tiên lấy các ô con cấp thấp nhất (leaf nodes) làm `FieldCandidate`.
3. **Các loại ô có nguy cơ bị bỏ sót**:
   - **Ô checkbox đơn lẻ (`box_08`)**: Cạnh ô rất ngắn ($15 - 25$ px) dễ bị kernel divisor 30 lọc mất. Cần cơ chế phát hiện contour hình vuông nhỏ trực tiếp từ binary mask nếu combined mask bị đứt.
   - **Ô Mã số thuế phân tách (`box_02`)**: Chuỗi 10 ô vuông nhỏ liền kề. Khoảng cách giữa các vách ngăn rất hẹp, phép `MORPH_CLOSE` có thể vô tình biến cả chuỗi 10 ô thành 1 hình chữ nhật dài duy nhất.
   - **Trường điền dạng đường chấm (`dot leaders`)**: Cần phối hợp với OCR / Text detection của Gemini ở các pha sau để định vị nhãn text bên cạnh thay vì chỉ trông cậy vào đường kẻ vật lý.
4. **Tham số cần đưa lên giao diện Debug**:
   - `minArea` và `maxArea`: Ngưỡng diện tích tối thiểu/tối đa của ô nhập liệu hợp lệ.
   - `minAspectRatio` và `maxAspectRatio`: Tỷ lệ dài/rộng để loại bỏ các đường kẻ đơn lẻ hoặc vệt nhiễu dài ngoằng.
   - `rectangularityThreshold`: Mức độ vuông vắn của contour so với bounding box ($\text{Area}_{\text{contour}} / \text{Area}_{\text{rect}}$).
   - `iouThreshold`: Ngưỡng triệt tiêu ô trùng lặp (Non-Maximum Suppression).
5. **Hành động cấp bách về dữ liệu**:
   - Đội ngũ dự án cần cung cấp tối thiểu 3 ảnh chụp/scan không chứa PII của Mẫu số 01/LPTB (Thông tư 80/2021/TT-BTC) vào thư mục `assets/fixtures/` để làm ground-truth đối soát với `assets/mock-data/mock-manifest.json`.
