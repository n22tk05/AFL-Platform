# TÀI LIỆU HƯỚNG DẪN KHỞI CHẠY & VẬN HÀNH TOÀN BỘ CHỨC NĂNG DỰ ÁN AFL-PLATFORM
> **AFL-Platform (AI-Assisted Form-Filling CRM for Elderly Citizens)**  
> *Hệ thống hỗ trợ công dân cao tuổi kê khai biểu mẫu hành chính thông minh bằng Trợ lý AI và Thị giác Máy tính*

---

## ⚡ KHỞI CHẠY TOÀN BỘ HỆ THỐNG CHỈ VỚI 1 CÂU LỆNH (QUICK START)

Bạn có thể khởi động đồng thời **Microservice VietOCR (cổng 8000)** và **Nền tảng Next.js Web (cổng 3001)** chỉ bằng một thao tác duy nhất:

### Lựa chọn 1: Dùng lệnh npm (Khuyên dùng)
```bash
npm run dev:all
```
*(hoặc `npm run start:all`)*

### Lựa chọn 2: Nhấp đúp chuột trên Windows
Nhấp đúp chuột trực tiếp vào file:
👉 **[`start-all.bat`](../start-all.bat)** tại thư mục gốc của dự án.

### Lựa chọn 3: Chạy script PowerShell
```powershell
.\start-all.ps1
```

> [!TIP]
> Script điều phối [`scripts/start-all.mjs`](../scripts/start-all.mjs) kiểm tra cấu hình, khởi động server VietOCR, chờ model và bật Next.js Web. Bấm `Ctrl + C` để dừng các tiến trình do launcher tạo. Nếu OCR khởi động lỗi, Web có thể tiếp tục chạy với trạng thái OCR chưa sẵn sàng; cần kiểm tra cổng 8000 trước khi đọc ảnh. Không đóng các server khác đang dùng cổng này bằng launcher.

---

## MỤC LỤC
1. [Khởi chạy Toàn bộ Hệ thống chỉ với 1 Câu lệnh](#-khởi-chạy-toàn-bộ-hệ-thống-chỉ-với-1-câu-lệnh-quick-start)
2. [Tổng quan Kiến trúc Hệ thống](#1-tổng-quan-kiến-trúc-hệ-thống)
3. [Yêu cầu Môi trường & Cài đặt Ban đầu](#2-yêu-cầu-môi-trường--cài-đặt-ban-đầu)
4. [Cấu hình Biến Môi trường (.env)](#3-cấu-hình-biến-môi-trường-env)
5. [Khởi chạy Thủ công từng Thành phần](#4-hướng-dẫn-khởi-chạy-microservice-vietocr-python-fastapi)
6. [Hướng dẫn Sử dụng Chi tiết Từng Chức năng](#6-hướng-dẫn-sử-dụng-chi-tiết-từng-chức-năng)
7. [Danh mục Lệnh Kiểm thử (Test Suites)](#7-danh-mục-lệnh-kiểm-thử--đảm-bảo-chất-lượng-test-suites)
8. [Xử lý Sự cố Thường gặp (Troubleshooting)](#8-xử-lý-sự-cố-thường-gặp-troubleshooting)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

Hệ thống **AFL-Platform** gồm 3 phân hệ liên kết chặt chẽ:

```mermaid
flowchart TD
    subgraph Client ["Client Browser (Citizen & Admin)"]
        UI1["/scan: Camera Chụp Biểu Mẫu"]
        UI2["/guide: Hướng Dẫn Điền Giấy (Chữ Đỏ #D32F2F)"]
        UI3["/scan-document: Bóc Tách OCR & Xuất .md"]
        UI4["/admin: Cổng Quản Trị & Review"]
        WASM["OpenCV.js WASM: Nắn Phối Cảnh & Bóc Tọa Độ [0.0 - 1.0]"]
        RAM["Session RAM: Lưu Trữ Tạm Tự Hủy 15 Phút (NĐ 13/2023)"]
    end

    subgraph NodeServer ["Next.js 14 App Router (Port 3001)"]
        RouteDoc["POST /api/documents/json"]
        RouteExtract["POST /api/documents/extract"]
        RouteForms["/api/forms & /api/admin/forms"]
        RouteLLM["POST /api/llm/prompt & /api/llm/qa"]
        Assembler["Grounded JSON Classifier / Assembler / Ajv"]
        Prisma["Prisma ORM & PostgreSQL"]
    end

    subgraph PythonMicroservice ["VietOCR Service (Port 8000)"]
        FastAPI["FastAPI Engine (app.py)"]
        Torch["PyTorch / Seq2Seq VietOCR Model"]
        Batch["Adaptive Binned Batching Engine"]
    end

    subgraph ExternalCloud ["Dịch vụ text và giọng nói riêng"]
        Gemini["Gemini Flash (Kịch Bản & Q&A)"]
        TTS["Cloud Text-to-Speech (Giọng Tiếng Việt 0.9x)"]
    end

    UI1 --> WASM
    WASM --> UI3
    RAM -.->|Đấu nối P2P| UI2
    UI3 --> RouteDoc
    RouteDoc --> Assembler
    RouteDoc --> FastAPI
    UI3 --> RouteExtract
    RouteExtract --> FastAPI
    RouteExtract -->|Text đã chọn| Gemini
    RouteExtract --> Review["Đối chiếu, sửa và xác nhận"]
    Review -->|Lưu rõ ràng| RAM
    FastAPI --> Torch
    Torch --> Batch
    UI4 --> RouteForms
    RouteForms --> Prisma
    RouteForms --> RouteLLM
    RouteLLM --> Gemini
```

---

## 2. YÊU CẦU MÔI TRƯỜNG & CÀI ĐẶT BAN ĐẦU

### 2.1. Yêu cầu Hệ thống
* **Hệ điều hành:** Windows 10/11, macOS, hoặc Linux (x64 / arm64).
* **Node.js:** Phiên bản `>= 18.18.0` hoặc `>= 20.x` (Khuyên dùng `20.x LTS`).
* **Python:** Phiên bản `>= 3.9` hoặc `3.11` (Dành cho VietOCR microservice).
* **Cơ sở dữ liệu:** PostgreSQL `>= 15` (hoặc Docker container PostgreSQL).
* **Trình duyệt:** Google Chrome, Microsoft Edge, hoặc Firefox hỗ trợ WebAssembly và WebRTC/Camera API.

### 2.2. Cài đặt Dependencies cho Node.js
Mở terminal tại thư mục gốc của dự án (`C:\TheAnhproject\AFL-Platform`):
```bash
# 1. Cài đặt các thư viện Node.js
npm install

# 2. Sinh Prisma Client
npx prisma generate
```

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG (.ENV)

Tạo file `.env` tại thư mục gốc dự án (sao chép từ `.env.example`):
```bash
copy .env.example .env
```

Nội dung cấu hình tối thiểu trong `.env`:

```dotenv
# 1. Kết nối Cơ sở dữ liệu PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/afl_platform?schema=public"

# 2. OCR cục bộ: chỉ hỗ trợ VietOCR
DOCUMENT_OCR_PROVIDER=vietocr
VIETOCR_ENDPOINT=http://127.0.0.1:8000/predict
DOCUMENT_OCR_TIMEOUT_MS=60000

# 3. Google Cloud Text-to-Speech tùy chọn (không dùng cho OCR)
# Đường dẫn credential nằm ngoài repository; không đưa vào biến NEXT_PUBLIC_.
GOOGLE_APPLICATION_CREDENTIALS=

# 4. Cấu hình Gemini AI (Kịch bản kẹp tọa độ, Voice Q&A)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_DOCUMENT_MODEL=gemini-2.5-flash
DOCUMENT_ACCEPTANCE_THRESHOLD=0.95

# 5. Khóa Quản trị Viên (Dành cho Admin API Guardrail)
NEXT_PUBLIC_ADMIN_KEY=afl_admin_secret_key_2026
ADMIN_SECRET_KEY=afl_admin_secret_key_2026
```

> [!NOTE]
> VietOCR là provider OCR duy nhất. Ảnh được xử lý bằng microservice Python cục bộ. JSON export không gọi Gemini; trích xuất trường riêng gửi OCR text đã chọn sang Gemini khi người dùng yêu cầu và có cấu hình API key. Google TTS vẫn là dịch vụ giọng nói độc lập.

---

## 4. HƯỚNG DẪN KHỞI CHẠY MICROSERVICE VIETOCR (PYTHON FASTAPI)

Microservice VietOCR nhận diện dòng chữ tiếng Việt bằng PyTorch và Transformer/Seq2Seq. Chưa có benchmark ảnh camera thực tế; kết quả vẫn cần đối chiếu với ảnh nguồn.

### Bước 4.1: Cài đặt Thư viện Python
Thực hiện hướng dẫn theo hệ điều hành trong [README VietOCR](../services/vietocr-service/README.md). Kiểm tra import PyTorch trước khi chạy Uvicorn. Trên Windows, nếu xuất hiện `WinError 4551` với `shm.dll`, Application Control đã chặn một binary hoặc dependency: server chưa khởi động, không phải lỗi crop ảnh hoặc OCR API key. Không tắt policy bảo mật để bỏ qua lỗi. Model weights có thể cần tải khi cài đặt/khởi động lần đầu.

### Bước 4.2: Khởi động Microservice

Có 3 cách để khởi động server VietOCR:

* **Cách 1 (Khuyên dùng từ thư mục gốc):**
  ```bash
  npm run vietocr:start
  ```
* **Cách 2 (Sử dụng PowerShell):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File services/vietocr-service/start.ps1
  ```
* **Cách 3 (Nhấp đúp chuột):**
  Nhấp đúp chuột trực tiếp vào file: `services/vietocr-service/start.bat`.

### Bước 4.3: Kiểm tra Server Hoạt động
Mở trình duyệt và truy cập:
* **Kiểm tra trạng thái:** `http://localhost:8000/` (Hiển thị `status: online`, `device: cpu/cuda`).
* **Health Check:** `http://127.0.0.1:8000/health` (phải trả HTTP thành công và trạng thái model sẵn sàng).
* **Swagger API Docs:** `http://localhost:8000/docs` (Xem chi tiết giao thức REST API).

### Bước 4.4: Kiểm thử Tích hợp VietOCR Độc lập
Kiểm tra kết nối trước bằng PowerShell:
```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```
Sau đó mở `/scan-document`, tải một ảnh chữ mẫu không chứa dữ liệu thật và chọn **Chuyển ảnh sang JSON**. Phải thấy nội dung đọc được, provider `vietocr`, raw attempts và bước duyệt. HTTP 200 hoặc một bản nháp rỗng chưa chứng minh OCR thành công. Thời gian đọc phụ thuộc ảnh, số dòng, CPU và model; không có cam kết 300 ms.

Hoặc chạy smoke test HTTP cục bộ: script tạo ảnh chữ tổng hợp trong RAM, kiểm tra model ready, kết quả không rỗng, đúng provider, provenance tối đa hai attempts và trạng thái cần duyệt. Không gửi giấy tờ thật, không log toàn văn OCR và không suy ra accuracy ảnh camera:

```bash
npx tsx scripts/test-vietocr-integration.ts
```

Nếu Web ở cổng khác, đặt `DOCUMENT_TEST_URL=http://127.0.0.1:<port>`. Harness chỉ cho phép endpoint loopback và từ chối redirect.

---

## 5. HƯỚNG DẪN KHỞI CHẠY ỨNG DỤNG WEB CHÍNH (NEXT.JS 14)

Mở một cửa sổ Terminal mới tại thư mục gốc:

```bash
# Đồng bộ lược đồ cơ sở dữ liệu (nếu có sử dụng PostgreSQL)
npx prisma db push

# Khởi động Next.js ở chế độ Development (Cổng 3001)
npm run dev
```

Mở trình duyệt và truy cập: **`http://localhost:3001`**.

---

## 6. HƯỚNG DẪN SỬ DỤNG CHI TIẾT TỪNG CHỨC NĂNG

### Chức năng 1: Luồng Kê khai dành cho Công dân (Citizen Flow)

#### 1. Màn hình Chụp và Nắn thẳng Phôi giấy (`/scan`)
- **Đường dẫn:** `http://localhost:3001/scan`
- **Các bước thao tác:**
  1. Nhấn nút **"Chụp ảnh tờ khai"** để mở CameraScannerModal.
  2. Cấp quyền truy cập máy ảnh cho trình duyệt.
  3. Đặt tờ khai giấy lên mặt bàn phẳng có độ tương phản.
  4. Hệ thống tự động kiểm tra chất lượng (Blur & Glare Guard). Nhấn nút tròn chụp ảnh.
  5. Thuật toán **OpenCV.js WASM** sẽ:
     - Sắp xếp 4 góc đỉnh bất biến TL/TR/BR/BL.
     - Thực hiện nắn phẳng phối cảnh (`warpPerspective`) chuyển ảnh chụp nghiêng thành ảnh phẳng $90^\circ$ theo tỷ lệ chuẩn A4.
  6. Nhấn **"Xác nhận sử dụng ảnh"** để chuyển sang màn hình hướng dẫn.

#### 2. Màn hình Hướng dẫn Kê khai Từng bước (`/guide`)
- **Đường dẫn:** `http://localhost:3001/guide`
- **Trải nghiệm dành cho người cao tuổi:**
  - **Khung sáng (Highlight Box):** Từng ô kê khai sáng lên tuần tự theo đúng tọa độ chuẩn hóa $[0.0 - 1.0]$.
  - **Giọng đọc AI bình dân:** Trợ lý ảo tự động phát giọng đọc giải thích từng ô bằng ngôn ngữ mộc mạc, tốc độ 0.9x ấm áp.
  - **Chữ mẫu đỏ (`#D32F2F`):** Hiển thị ví dụ mẫu in hoa rõ nét giúp người già nhìn vào và viết theo vào giấy bằng bút mực.
  - **Nút điều khiển lớn:** Phím bấm to bản, độ tương phản cao, hỗ trợ chuyển bước "Tiếp tục" / "Quay lại" hoặc nghe lại hướng dẫn.

#### 3. Bóc tách Chứng từ Tiên quyết & Bơm dữ liệu (FR-6)
- Nếu tờ khai yêu cầu chứng từ đi kèm (Ví dụ: Biên bản xử phạt vi phạm giao thông / Sổ đỏ):
  1. Người dân đưa chứng từ trước camera để quét.
  2. Hệ thống bóc tách các trường: Họ tên, số CCCD, ngày cấp, số tiền phạt, biển số xe...
  3. Người dùng đối chiếu vùng nguồn, sửa/xác nhận dữ liệu. Trường `needs_review` chưa xác nhận không được tự lưu.
  4. Chỉ sau thao tác lưu rõ ràng, các giá trị hợp lệ/đã xác nhận mới vào **Session RAM** với TTL 15 phút và được ánh xạ đúng trường vào `/guide`.

---

### Chức năng 2: Quét tài liệu và xuất JSON có nguồn

Mở /scan-document, chọn JPEG/PNG và chế độ ảnh, rồi bấm **Chuyển ảnh sang JSON**.
Ảnh nguồn bên trái, kết quả bên phải có Cấu trúc, JSON raw và Raw OCR. Xem
Unknown/warnings; chọn dòng hoặc trường để xem bbox thật nếu provider có trả.
Sửa giá trị sử dụng và xác nhận; raw OCR luôn giữ nguyên. Đối chiếu ảnh rồi bấm
**Copy JSON** hoặc **Tải .json**. Đổi ảnh/rerun xóa output cũ. Kết quả export không
tự đi vào /guide hay Session RAM. Không còn nút tải .md hoặc route /markdown.

Pipeline: OpenCV xử lý ảnh thích ứng → Python OpenCV phát hiện vùng chữ → VietOCR
nhận dạng từng dòng → phân loại tất định → JSON schema 1.0.0 → validation/review.
Bảng/checkbox/chữ ký không được coi đã xác minh bằng regex. Xem
[contract/API/tọa độ và giới hạn](DOCUMENT-JSON-EXPORT.md).

Luồng **Đọc chứng từ / Trích Xuất JSON** nghiệp vụ vẫn riêng: chỉ gửi OCR text tới
Gemini sau đồng ý, rồi duyệt trường trước hành động lưu Session RAM. Export tài
liệu không cần Gemini key và không dùng LLM để bổ sung chữ thiếu.

---

### Chức năng 3: Cổng Quản trị & Kiểm duyệt Biểu mẫu (Admin Portal)

#### 1. Thư viện Biểu mẫu Hành chính (`/admin` hoặc `/(admin)/library`)
- **Đường dẫn:** `http://localhost:3001/admin` hoặc `http://localhost:3001/library`
- **Tính năng:**
  - Xem danh mục các biểu mẫu hành chính trong hệ thống (Tờ khai LPTB nhà đất, Biên bản xử phạt vi phạm giao thông, Tờ khai đăng ký khai sinh lại...).
  - Lọc biểu mẫu theo trạng thái: Tất cả, Bản nháp (DRAFT), Đã xuất bản (PUBLISHED), Đã lưu trữ (ARCHIVED).

#### 2. Tải lên Phôi Biểu mẫu Mới (FormUploadModal)
- Nhấn nút **"Tải lên biểu mẫu mới"** ở góc phải màn hình thư viện.
- Điền mã thủ tục (ví dụ: `01/LPTB`), tên biểu mẫu, căn cứ pháp lý.
- Tải lên ảnh phôi biểu mẫu giấy trắng.
- Hệ thống thực thi 4 tầng tự động:
  - **Tầng 1:** Đọc và giải mã ảnh phôi.
  - **Tầng 2 (OpenCV WASM):** Nhận diện đường kẻ, bóc tách toàn bộ khung ô hình học (tối đa 200 ô).
  - **Tầng 3 (Gemini LLM):** Gọi API `/api/llm/prompt` (kèm header bảo mật `x-admin-key`) sinh kịch bản câu thoại bình dân 0.9x tương ứng với từng tọa độ ô thật.
  - **Tầng 4:** Lưu bản nháp vào hệ thống và tự động chuyển sang trang Đối soát.

#### 3. Cổng Đối soát & Tinh chỉnh Biểu mẫu (`/admin/review/[id]`)
- **Đường dẫn:** `http://localhost:3001/admin/review/tpl_01_lptb`
- **Tính năng chuyên viên:**
  - Nhấp chọn từng ô trên ảnh để kiểm tra tọa độ bounding box highlight.
  - Chỉnh sửa câu thoại hướng dẫn giọng nói, chữ mẫu đỏ hiển thị.
  - Bật/tắt cờ `requiresPrerequisiteDoc` (yêu cầu quét giấy tờ kèm theo).
  - Bật/tắt cờ `legalWarningFlag` (cảnh báo trách nhiệm pháp lý khi khai gian).
  - Nhấn nút **"Duyệt & Xuất bản"** để đưa biểu mẫu lên Cổng công dân.

---

### Chức năng 4: Trợ lý Giọng nói & Hỏi đáp Bình dân (Voice AI & Q&A)

- **Cơ chế Half-duplex:** Trợ lý AI tự động tạm dừng giọng đọc khi phát hiện công dân cất tiếng nói hỏi, tránh tình trạng nói đè lên nhau.
- **Tốc độ đọc 0.9x:** Được tinh chỉnh âm sắc ấm áp, phát âm chuẩn tiếng Việt ba miền phù hợp với người lớn tuổi.
- **Hỏi đáp thông minh (`POST /api/llm/qa`):** Người dân có thể hỏi bất kỳ câu hỏi nào về biểu mẫu (ví dụ: *"Bác không nhớ ngày cấp CCCD thì xem ở đâu con?"*), trợ lý sẽ giải thích ngắn gọn, dễ hiểu.

---

### Chức năng 5: Các Màn hình Thử nghiệm Kỹ thuật (Debug & Test Sandboxes)

* **`/opencv-test`:**
  - Hiển thị trực quan 9 canvas xử lý thị giác máy tính: *Ảnh đầu vào, Phối cảnh nắn phẳng, Đường viền tài liệu, Ảnh xám, Ảnh nhị phân (Binary), Đường kẻ ngang (Horizontal), Đường kẻ dọc (Vertical), Mặt nạ kết hợp (Combined), và Khung ô trích xuất (Candidates)*.
* **`/document-test`:**
  - Môi trường thử nghiệm độc lập cho pipeline JSON với các tập dữ liệu tổng hợp sẵn có trong repo.

---

## 7. DANH MỤC LỆNH KIỂM THỬ & ĐẢM BẢO CHẤT LƯỢNG (TEST SUITES)

Dùng các lệnh bên dưới để kiểm tra trạng thái hiện tại. Các bộ fake-provider/OpenCV kiểm tra xử lý và review; chúng không chứng minh độ chính xác OCR trên ảnh camera thật:

| Mục đích kiểm thử | Câu lệnh Terminal | Số lượng tests |
| :--- | :--- | :---: |
| **Tổng kiểm tra Giám sát (Toàn diện)** | `npm run test:supervise` | Toàn bộ hệ thống |
| **Kiểm tra Thuật toán OpenCV WASM** | `npm run test:opencv` | Xem kết quả chạy |
| **Kiểm tra Bóc tách Tài liệu & JSON** | `npm run test:documents` | Xem kết quả chạy |
| **Kiểm tra Line Segmentation & VietOCR** | `npx tsx --test src/modules/opencv/tests/line-segmentation.test.ts src/modules/ocr/tests/vietocr-adapter.test.ts` | Xem kết quả chạy |
| **Kiểm tra JSON độc lập** | `npm run evaluate:documents` | Fixed OCR, không gọi provider |
| **Kiểm tra Đấu nối P2P & Form API** | `npm run test:p2p` | Toàn bộ luồng |
| **Kiểm tra Voice AI & Audio** | `npm run test:voice` | Xem kết quả chạy |
| **Kiểm tra TypeScript Typecheck** | `npx tsc --noEmit` | Xem kết quả chạy |

---

## 8. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi không kết nối được VietOCR (`ECONNREFUSED 127.0.0.1:8000`)
- **Nguyên nhân:** Microservice VietOCR chưa chạy, import PyTorch thất bại, model chưa nạp, endpoint sai hoặc đang dùng sai port. `npm run dev:all` mở Web không có nghĩa OCR đã sẵn sàng.
- **Khắc phục:** Kiểm tra `/health` tại cổng 8000, log VietOCR và `VIETOCR_ENDPOINT`. Nếu thấy `WinError 4551`/`shm.dll`, xem [chẩn đoán Windows trong README VietOCR](../services/vietocr-service/README.md). Đảm bảo model đã nạp và Uvicorn đang lắng nghe trước khi thử đọc ảnh.

### 2. Lỗi 504 Gateway Timeout khi xử lý biểu mẫu dài
- **Nguyên nhân:** Số lượng dòng chữ quá lớn vượt thời gian timeout mặc định của Next.js.
- **Khắc phục:** Hệ thống đã được nâng cấp thuật toán **Fast Binned Batching** và cấu hình timeout `DOCUMENT_OCR_TIMEOUT_MS=60000` trong file `.env`. Nếu chạy trên máy CPU yếu, hãy tăng giá trị này lên `90000`.

### 3. Trình duyệt không mở được Camera trong `/scan`
- **Nguyên nhân:** Chưa cấp quyền truy cập Camera hoặc trình duyệt chặn kết nối không phải HTTPS/Localhost.
- **Khắc phục:** Kiểm tra biểu tượng ổ khóa hoặc camera trên thanh địa chỉ trình duyệt -> Nhấn "Cho phép" (Allow Camera). Đảm bảo truy cập qua `http://localhost:3001` hoặc `http://127.0.0.1:3001`.

### 4. Dữ liệu chữ đỏ trên `/guide` bị mất sau khi mở lại
- **Nguyên nhân:** Đây là tính năng bảo vệ an toàn thông tin theo Nghị định 13/2023/NĐ-CP. Dữ liệu chứng từ chỉ được lưu trong RAM trình duyệt và tự hủy sau 15 phút không hoạt động để tránh lộ lọt PII.
- **Khắc phục:** Người dùng chỉ cần quét lại chứng từ nếu phiên làm việc đã quá 15 phút.

---
*Tài liệu được cập nhật ngày 04/10/2026 bởi Đội ngũ Kỹ thuật AFL-Platform.*
