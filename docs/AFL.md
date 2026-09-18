---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-AFL-2026-09-13/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-AFL-2026-09-13/ARCHITECTURE-SPINE.md
---

# AFL Platform - Phân rã Epics & User Stories

## Tổng quan (Overview)

Tài liệu này cung cấp bản phân rã Epics và User Stories hoàn chỉnh cho dự án AFL (Hệ thống Hỗ trợ Điền Biểu mẫu Thông minh & Quản trị Quy trình cho Người cao tuổi tại Việt Nam). Toàn bộ yêu cầu từ PRD và các quyết định kỹ thuật từ Architecture Spine được chuyển hóa thành các User Story chi tiết, có giá trị người dùng độc lập và tiêu chí nghiệm thu (Acceptance Criteria) chuẩn Given-When-Then để đội ngũ kỹ sư sẵn sàng hiện thực hóa.

---

## Danh mục Yêu cầu (Requirements Inventory)

### Yêu cầu Chức năng (Functional Requirements)

* **FR-1: Nhận diện Biểu mẫu Giấy qua Camera**  
  Người dùng chụp ảnh tờ khai giấy đang cầm trên tay; hệ thống dùng Vision AI nhận diện chính xác mẫu biểu trong $\le 3$ giây (độ chính xác $\ge 95\%$) và tải quy trình tương ứng từ thư viện.
* **FR-2: Bản sao Thị giác & Điểm sáng Dẫn đường**  
  Hiển thị ảnh scan nắn phẳng của tờ giấy, tự động phóng to và khoanh vùng phát sáng (highlight) vào đúng dòng/ô đang cần điền (độ lệch $\le 5\%$), hỗ trợ nút điều hướng lớn $\ge 56 \times 56\text{ dp}$.
* **FR-3: Trợ lý Giọng nói Đọc Hướng dẫn Từng Dòng**  
  Phát giọng đọc tiếng Việt chậm rãi, rõ ràng (chọn giọng Bắc / Nam, tốc độ 0.9x), giải thích bằng ngôn ngữ đời thường và tự động ngắt khi người dùng bấm mic.
* **FR-4: Hỏi đáp Tương tác Ngữ cảnh bằng Giọng nói**  
  Người dùng nhấn giữ mic hỏi bất kỳ thắc mắc nào ở dòng hiện tại; AI giải thích ngắn gọn trong 2-3 câu với độ trễ phản hồi $\le 1.5$ giây.
* **FR-5: Minh họa Chữ Mẫu Màu Đỏ Tương Phản Cao**  
  Tại mỗi ô/dòng, hiển thị chữ mẫu in hoa màu đỏ đậm (`#D32F2F`) tương phản cao trên nền trắng, chuẩn WCAG AAA, font $\ge 18\text{pt}$ để người già nhìn theo chép lại.
* **FR-6: Quét Chứng từ Tiên quyết Thông minh**  
  Đối với biểu mẫu có chứng từ phụ thuộc (Biên bản phạt, Sổ đỏ, CCCD), cung cấp bước quét giấy tờ gốc ban đầu; AI tự động bóc tách các trường khóa và giữ sẵn để đưa vào các bước hướng dẫn sau.
* **FR-7: Tự động Bóc tách Biểu mẫu Mới (Quy trình Tuần tự: OpenCV First → AI Semantic Mapping)**  
  Chuyên viên tải lên file PDF/ảnh mẫu mới; thuật toán OpenCV WASM quét các đường kẻ và khung bảng để định vị hình học chính xác 100% tọa độ ô và trích xuất text nhãn, kết hợp Gemini 1.5 Flash (Text LLM) bóc tách ngữ nghĩa nhãn trường và điều kiện rẽ nhánh (độ chính xác $\ge 90\%$), có chế độ dự phòng Offline/Fallback khi mất mạng.
* **FR-8: Tự động Sinh Kịch bản Hướng dẫn Bình dân**  
  AI tự động chuyển hóa tên trường hành chính thành câu thoại hướng dẫn thân thiện và tạo sẵn ví dụ chữ mẫu màu đỏ cho từng bước.
* **FR-9: Cổng Kiểm duyệt Chia đôi Màn hình**  
  Giao diện đối soát: Bên trái là file gốc, bên phải là quy trình AI tạo; chuyên viên có thể chỉnh sửa câu chữ, nghe thử giọng đọc, điều chỉnh khung highlight và bấm duyệt trước khi xuất bản.
* **FR-10: Cấu hình Liên chứng từ & Tra cứu Dữ liệu**  
  Admin cấu hình điều kiện phụ thuộc (chứng từ nguồn, trường trích xuất, ánh xạ vào bước chính) với công cụ sơ đồ trực quan và chạy thử nghiệm (Test Run).
* **FR-11: Quản lý Thư viện Biểu mẫu & Tạo Mã QR**  
  Quản lý vòng đời biểu mẫu (Bản nháp, Đang hoạt động, Đã lưu trữ) và tự động sinh mã QR liên kết trực tiếp vào biểu mẫu đó trên Web di động để in dán tại bàn tiếp dân.

---

### Yêu cầu Phi chức năng (Non-Functional Requirements)

* **NFR-1 (Trợ năng Người cao tuổi - Accessibility):** Đạt chuẩn WCAG 2.1 AAA về độ tương phản ($\ge 7:1$). Cỡ chữ tối thiểu 18pt trên giao diện di động. Vùng cảm ứng nút bấm tối thiểu $48 \times 48\text{ dp}$.
* **NFR-2 (Hiệu năng & Độ trễ - Latency):** Thời gian nhận diện biểu mẫu $\le 3.0$s; độ trễ phản hồi giọng nói khi hỏi đáp $\le 1.5$s; tải trang ban đầu $\le 2.0$s trên 4G.
* **NFR-3 (Bảo mật & Tuân thủ Nghị định 13/2023/NĐ-CP):** Ảnh chụp giấy tờ tùy thân (CCCD, Biên bản phạt) chỉ lưu trong bộ nhớ tạm thời của phiên (Session RAM) và tự hủy ngay sau khi kết thúc phiên; mã hóa toàn bộ dữ liệu qua TLS 1.3.
* **NFR-4 (Độ tin cậy & Cơ chế Dự phòng - Fallback):** Khi AI không nghe rõ giọng nói do tiếng ồn tại trụ sở, giao diện tự động phóng to nút điều hướng và chữ mẫu đỏ để người dùng tiếp tục thao tác bằng tay không gián đoạn.

---

### Yêu cầu Kỹ thuật Bổ sung từ Kiến trúc (Additional Requirements from Architecture)

* **Khởi tạo Dự án & Monorepo:** Next.js 14+ (App Router) kết hợp TypeScript trong một Monorepo duy nhất, đóng gói di động bằng Capacitor 6.x.
* **Tích hợp Máy quét Tài liệu:** Tích hợp Google ML Kit Document Scanner Plugin (`@capacitor-community/mlkit-document-scanner`) để tự động tìm góc, nắn thẳng phối cảnh và lọc bóng tờ khai giấy.
* **Xử lý Ảnh Hình học Cục bộ:** Tích hợp OpenCV (`@techstark/opencv-js` / OpenCV WASM) để quét đường kẻ ngang dọc, khung bảng và ô vuông bằng Morphological Operations với độ chính xác pixel tuyệt đối, làm cơ chế định vị hình học và fallback.
* **Mô hình Ngôn ngữ LLM:** Tích hợp Google Gemini 1.5 Flash (Text & LLM Engine với Structured JSON Schema) để phân tích ngữ nghĩa các trường hành chính và tự động sinh câu thoại hướng dẫn tiếng Việt từ dữ liệu dạng text đã được OpenCV bóc tách sẵn (hoàn toàn không dùng Vision).
* **Hạ tầng Giọng nói Kết hợp:** Tích hợp Google Cloud Text-to-Speech (Neural2 vi-VN) để sinh file MP3 cache sẵn (tốc độ 0.9x) và Web Speech API on-device cho hỏi đáp tức thì.
* **Sơ đồ Quy trình Kéo-thả (Workflow Canvas):** Sử dụng React Flow (`@xyflow/react`) kết hợp `@dagrejs/dagre` để xây dựng màn hình biên tập sơ đồ quy trình dạng node kéo-thả và tự động sắp xếp cây logic trong Admin Portal.
* **Cơ sở Dữ liệu & Lưu trữ:** PostgreSQL 16 + Prisma ORM quản lý bảng `form_templates` và trường `workflow_steps` (JSONB); Cloudflare R2 / Supabase Storage lưu file PDF và MP3.
* **Bảo mật Dữ liệu Phi lưu trữ (In-Memory Processing):** Xây dựng middleware Session RAM tự động dọn dẹp dữ liệu người dùng sau 15 phút hoặc khi kết thúc phiên.

---

### Yêu cầu Thiết kế Trải nghiệm (UX Design Requirements)

* **UX-DR1 (Bản sao Thị giác - Visual Twin):** Thành phần Canvas hiển thị ảnh scan nắn phẳng, hỗ trợ vẽ lớp phủ SVG/Canvas vòng tròn phát sáng (animated pulsing highlighter) đúng tọa độ bounding box `[ymin, xmin, ymax, xmax]`.
* **UX-DR2 (Thành phần Chữ mẫu Đỏ Tương phản cao):** Component hiển thị chữ mẫu in hoa màu đỏ (`#D32F2F`) trên nền giấy trắng, font chữ $\ge 18\text{pt}$, có nút bấm to/nhỏ nhanh.
* **UX-DR3 (Bộ điều khiển Âm thanh Trợ năng):** Component phát âm thanh với nút Loa lớn, hiển thị sóng âm khi đang đọc, hỗ trợ nút bấm "Nghe lại" một chạm và tự động ngắt khi bấm mic.
* **UX-DR4 (Giao diện Quản trị Đối soát Chia đôi Màn hình):** Layout chia đôi màn hình trên Desktop (bên trái là PDF Viewer, bên phải là danh sách bước hoặc canvas React Flow) cho phép chuyên viên chỉnh sửa trực tiếp.

---

* **FR-1:** Epic 3 — Nhận diện biểu mẫu giấy qua camera
* **FR-2:** Epic 3 — Bản sao thị giác và điểm sáng dẫn đường
* **FR-3:** Epic 4 — Trợ lý giọng nói đọc hướng dẫn từng dòng (tốc độ 0.9x)
* **FR-4:** Epic 4 — Hỏi đáp tương tác ngữ cảnh bằng giọng nói
* **FR-5:** Epic 3 — Minh họa chữ mẫu đỏ tương phản cao
* **FR-6:** Epic 4 — Quét chứng từ tiên quyết thông minh (Biên bản phạt, Sổ đỏ, CCCD)
* **FR-7:** Epic 2 — Tự động bóc tách biểu mẫu mới bằng AI Vision
* **FR-8:** Epic 2 — Tự động sinh kịch bản hướng dẫn bình dân và chữ mẫu đỏ
* **FR-9:** Epic 2 — Cổng kiểm duyệt chia đôi màn hình cho chuyên viên
* **FR-10:** Epic 2 — Cấu hình liên chứng từ và tra cứu dữ liệu (React Flow)
* **FR-11:** Epic 1 — Quản lý thư viện biểu mẫu và tạo mã QR

---

## Danh sách Epics (Epic List)

### Epic 1: Khởi tạo Nền tảng & Quản lý Thư viện Biểu mẫu Mẫu (Foundation & Form Library)
Quản trị viên và người dân có thể truy cập hệ thống nền tảng (Web / Capacitor); Quản trị viên xem và quản lý danh mục biểu mẫu mẫu sẵn có (Tờ khai lệ phí trước bạ, Biểu mẫu nộp phạt), xuất mã QR dán tại quầy tiếp dân để người dân quét truy cập ngay.  
**Yêu cầu chức năng bao phủ:** FR-11 (kèm khởi tạo Monorepo Next.js, Capacitor, CSDL PostgreSQL Prisma).

### Epic 2: Tự động Bóc tách Biểu mẫu & Biên tập Quy trình AI (Admin Ingestion & Visual Workflow Editor)
Chuyên viên có thể tải file PDF/ảnh biểu mẫu mới; AI Vision bóc tách cấu trúc, tự sinh kịch bản hướng dẫn tiếng Việt và chữ mẫu đỏ; chuyên viên kiểm duyệt qua màn hình chia đôi và sơ đồ kéo-thả React Flow, thiết lập điều kiện liên chứng từ (Biên bản phạt, Sổ đỏ) trước khi xuất bản ra thư viện.  
**Yêu cầu chức năng bao phủ:** FR-7, FR-8, FR-9, FR-10.

### Epic 3: Máy quét Thông minh & Trải nghiệm Thị giác Dẫn đường (Smart Scanning & Visual Guidance Experience)
Người cao tuổi mở ứng dụng di động, quét tờ khai giấy trên bàn bằng Google ML Kit (tự nắn phẳng, khử bóng), xem ảnh scan với vòng tròn highlight màu xanh nhấp nháy khoanh đúng ô đang điền, và nhìn rõ chữ mẫu in hoa màu đỏ tương phản cao (`#D32F2F`) để tự tay cầm bút chép lại chính xác.  
**Yêu cầu chức năng bao phủ:** FR-1, FR-2, FR-5.

### Epic 4: Trợ lý Giọng nói Đồng hành & Xử lý Liên chứng từ (Voice Assistant Companion & Prerequisite Document Handling)
Người cao tuổi được trợ lý ảo đọc giọng tiếng Việt chậm rãi, ấm áp (tốc độ 0.9x) dẫn dắt từng dòng, có thể bấm mic hỏi đáp thắc mắc theo ngữ cảnh; đồng thời dễ dàng chụp trước các giấy tờ gốc (như Biên bản xử phạt) để AI tự bóc tách thông tin đưa vào các bước hướng dẫn điền form chính.  
**Yêu cầu chức năng bao phủ:** FR-3, FR-4, FR-6 (kèm cơ chế bảo mật Session RAM tự hủy theo Nghị định 13).

---

## Chi tiết Từng Epic & User Stories

## Epic 1: Khởi tạo Nền tảng & Quản lý Thư viện Biểu mẫu Mẫu (Foundation & Form Library)

**Mục tiêu Epic 1:** Thiết lập nền tảng dự án hợp nhất (Monorepo Web + Capacitor) và xây dựng giao diện Cổng Quản trị cho phép Chuyên viên xem, tìm kiếm danh mục các biểu mẫu hành chính mẫu sẵn có, xuất mã QR liên kết nhanh để in dán tại bàn tiếp dân.

### Story 1.1: Khởi tạo Monorepo Next.js và Vỏ bọc Di động Capacitor

As a Developer / System Administrator,  
I want to initialize the Next.js 14+ App Router Monorepo configured with TypeScript, Tailwind CSS, shadcn/ui, and Capacitor 6.x,  
So that the team has a unified, type-safe foundation capable of running on Web and building to Android APK.

**Acceptance Criteria:**

**Given** môi trường Node.js 18+ và repository trắng,  
**When** chạy lệnh khởi tạo dự án và chạy `npm run dev`,  
**Then** hệ thống khởi chạy thành công cả 2 route nhóm `/(citizen)` và `/(admin)`,  
**And** cấu hình `capacitor.config.ts` nhận diện đúng `webDir: "out"` và build được bản Android skeleton qua `npx cap sync android`.

### Story 1.2: Thiết kế Schema CSDL Biểu mẫu trên PostgreSQL với Prisma ORM

As a Developer,  
I want to define the `form_templates` model with metadata and a `workflow_steps` JSONB field in Prisma,  
So that form templates, step sequences, and bounding boxes can be stored and queried reliably.

**Acceptance Criteria:**

**Given** cơ sở dữ liệu PostgreSQL đã được kết nối,  
**When** chạy `npx prisma migrate dev`,  
**Then** bảng `form_templates` được tạo thành công với các trường: `id`, `code`, `title_vi`, `category`, `status` (DRAFT, ACTIVE, ARCHIVED), `pdf_url`, `workflow_steps` (JSONB), `created_at`, `updated_at`,  
**And** hỗ trợ seed sẵn 2 mẫu dữ liệu thử nghiệm ban đầu: *Tờ khai lệ phí trước bạ nhà đất* và *Biểu mẫu nộp phạt vi phạm hành chính*.

### Story 1.3: Giao diện Quản lý Danh mục Thư viện Biểu mẫu (Admin Form Catalog)

As an Admin / Specialist,  
I want to view the list of available administrative form templates (with status: Draft, Active, Archived) and search by name/code,  
So that I can monitor and manage all official forms deployed in the system.

**Acceptance Criteria:**

**Given** chuyên viên đã đăng nhập vào Cổng Quản trị,  
**When** chuyên viên truy cập vào danh mục thư viện biểu mẫu (`/admin/library`),  
**Then** màn hình hiển thị danh sách biểu mẫu dạng bảng trực quan (có lọc theo trạng thái: Đang hoạt động, Bản nháp, Đã lưu trữ),  
**And** có thanh tìm kiếm theo từ khóa (như "trước bạ", "nộp phạt") với thời gian phản hồi tức thì $< 200$ms.

### Story 1.4: Tự động Tạo và Tải Mã QR Liên kết Nhanh cho Biểu mẫu

As an Admin / Public Service Officer,  
I want to generate, download, and print dedicated QR codes for each active form template,  
So that citizens can scan the QR code at the counter table to directly launch the form guidance session on their phone.

**Acceptance Criteria:**

**Given** một biểu mẫu đang ở trạng thái `ACTIVE`,  
**When** chuyên viên bấm nút **[Tạo mã QR]** tại dòng của biểu mẫu đó,  
**Then** hệ thống sinh ra mã QR chứa URL trực tiếp: `https://app.afl.vn/citizen/scan?formId={id}`,  
**And** cung cấp nút bấm **[Tải file in (PNG/PDF)]** có kèm tiêu đề tên biểu mẫu và dòng hướng dẫn ngắn gọn: *"Quét mã để được trợ lý ảo hướng dẫn điền từng dòng"*.

---

## Epic 2: Tự động Bóc tách Biểu mẫu & Biên tập Quy trình AI (Admin Ingestion & Visual Workflow Editor)

**Mục tiêu Epic 2:** Chuyên viên có thể tải lên file PDF/ảnh biểu mẫu mới bất kỳ; OpenCV WASM quét hình học và trích xuất text nhãn, Gemini 1.5 Flash (Text LLM) phân tích ngữ nghĩa và tự sinh kịch bản hướng dẫn tiếng Việt kèm chữ mẫu đỏ; chuyên viên kiểm duyệt qua màn hình chia đôi và sơ đồ kéo-thả React Flow, thiết lập điều kiện liên chứng từ trước khi xuất bản ra thư viện dùng chung.

### Story 2.1: Bóc tách Biểu mẫu Mới bằng Quy trình Tuần tự (OpenCV First → Gemini Semantic Mapping)

As an Admin / Specialist,  
I want the system to run OpenCV WASM first to generate a numbered Geometric Manifest skeleton of table cells and input boxes along with local text labels, and then feed this structured text data to Gemini 1.5 Flash (Text LLM),  
So that geometrical coordinates are anchored with 100% pixel accuracy on black-and-white paper, Gemini operates purely on text/JSON to map labels 1-to-1 to box IDs without spatial drift or vision processing overhead, and the system instantly falls back to the pre-rendered OpenCV skeleton if Cloud AI is unreachable.

**Acceptance Criteria:**

**Given** chuyên viên tải lên một file PDF hoặc ảnh chụp biểu mẫu (dung lượng $\le 20\text{MB}$) tại `/admin/upload`,  
**When** quy trình bóc tách được kích hoạt,  
**Then** module OpenCV WASM thực thi trước tiên, dùng toán tử hình thái học quét các đường kẻ ngang dọc và khung bảng để trích xuất danh sách bounding box chuẩn xác pixel ($\ge 98\%$) kèm định danh duy nhất (`box_01`, `box_02`...) và văn bản nhãn trong thời gian $\le 100\text{ms}$,  
**And** bộ tiền xử lý đóng gói payload JSON thuần text gửi sang Gemini 1.5 Flash (Text API - không gửi ảnh) để đọc hiểu nhãn trường tương ứng và ánh xạ 1-1 với thời gian phản hồi $\le 1$ giây,  
**And** nếu Gemini API gặp sự cố kết nối hoặc quá tải sau 2 lần retry, hệ thống kích hoạt chế độ Fallback tức thì: nạp thẳng bộ khung Bounding Box Skeleton của OpenCV lên màn hình để chuyên viên gán nhãn thủ công mà không bị đình trệ công việc.

### Story 2.2: Tự động Sinh Kịch bản Hướng dẫn Tiếng Việt Bình dân và Chữ Mẫu Đỏ

As an Admin,  
I want the system to automatically generate plain-language Vietnamese guidance prompts and high-contrast red example text for each extracted step,  
So that the administrative form is translated into an intuitive sequence for elderly citizens without manual copywriting.

**Acceptance Criteria:**

**Given** kết quả bóc tách các trường từ Story 2.1,  
**When** AI xử lý sinh kịch bản tự động,  
**Then** mỗi bước đều được điền sẵn: (1) Câu thoại hướng dẫn (`prompt_vietnamese`) không quá 3 câu, dùng từ ngữ mộc mạc; (2) Chữ mẫu in hoa màu đỏ (`red_example_text`) ví dụ cụ thể,  
**And** các bước được sắp xếp theo thứ tự điền logic tự nhiên từ trên xuống dưới.

### Story 2.3: Giao diện Đối soát Chia đôi Màn hình (Split-Screen Review Gate)

As a Public Service Specialist,  
I want a split-screen review interface (original PDF viewer on the left, interactive step list on the right) where I can edit prompts, preview highlights, and test audio playback before approving,  
So that no unverified or hallucinatory AI-generated content can be published to citizens.

**Acceptance Criteria:**

**Given** một biểu mẫu mới bóc tách ở trạng thái `PENDING_REVIEW`,  
**When** chuyên viên truy cập vào giao diện đối soát `/admin/review/[id]`,  
**Then** màn hình hiển thị đồng thời: khung xem PDF bên trái (có thể phóng to/thu nhỏ) và danh sách các bước có thể chỉnh sửa trực tiếp bên phải,  
**And** khi chuyên viên bấm vào một bước, khung xem PDF bên trái tự động nhảy tới và viền đỏ ô tương ứng để kiểm tra độ chuẩn xác,  
**And** chỉ khi chuyên viên nhấn nút **[Phê duyệt & Xuất bản]**, biểu mẫu mới chuyển sang trạng thái `ACTIVE`.

### Story 2.4: Biên tập Sơ đồ Quy trình Kéo-thả và Cấu hình Liên chứng từ với React Flow

As an Admin,  
I want an interactive node-based workflow canvas using React Flow with auto-layout to visualize the form steps and configure prerequisite document dependencies,  
So that complex multi-document procedures are mapped clearly and saved into the JSONB workflow schema.

**Acceptance Criteria:**

**Given** chuyên viên mở tab Sơ đồ Quy trình (Workflow Canvas),  
**When** màn hình tải lên,  
**Then** React Flow tự động xếp các bước thành sơ đồ cây logic trực quan (Auto-layout qua `@dagrejs/dagre`),  
**And** chuyên viên có thể cấu hình bước "Chứng từ tiên quyết": chọn loại chứng từ (`BIEN_BAN_PHAT`, `SO_DO`, `CCCD`), chọn trường khóa cần bóc tách và kéo đường nối ánh xạ sang các bước tiếp theo,  
**And** có nút **[Chạy thử nghiệm (Test Run)]** để giả lập luồng điền form trước khi lưu vào CSDL.

### Story 2.5: Tự động Tạo và Lưu trữ File Âm thanh TTS khi Phê duyệt Biểu mẫu

As a System Administrator,  
I want the backend to generate and cache Google Cloud TTS Neural2 MP3 audio files (0.9x speed) for all approved steps when a form is published,  
So that elderly users experience zero latency and the system incurs zero redundant TTS API costs during citizen usage.

**Acceptance Criteria:**

**Given** chuyên viên nhấn nút [Phê duyệt & Xuất bản] ở Story 2.3,  
**When** quy trình lưu vào cơ sở dữ liệu,  
**Then** backend gửi văn bản của từng bước sang Google Cloud TTS Neural2 (tạo cả 2 phiên bản giọng Bắc `vi-VN-Neural2-A` và giọng Nam `vi-VN-Neural2-D`),  
**And** các file âm thanh `.mp3` được tải lên Storage (Cloudflare R2/Supabase) và lưu đường dẫn `audio_url` vào trường `workflow_steps` tương ứng trong PostgreSQL.

---

## Epic 3: Máy quét Thông minh & Trải nghiệm Thị giác Dẫn đường (Smart Scanning & Visual Guidance Experience)

**Mục tiêu Epic 3:** Người cao tuổi mở ứng dụng di động trên điện thoại, quét tờ khai giấy trên bàn bằng Google ML Kit (tự động nắn phẳng góc, khử bóng), xem ảnh scan sắc nét với vòng tròn highlight màu xanh nhấp nháy khoanh đúng ô đang điền, và nhìn rõ chữ mẫu in hoa màu đỏ tương phát cao (`#D32F2F`) để tự tay cầm bút chép lại chính xác vào tờ giấy thật.

### Story 3.1: Tích hợp Google ML Kit Document Scanner Plugin trên Di động

As an Elderly Citizen,  
I want to tap a large [Chụp biểu mẫu] button to activate Google's Document Scanner,  
So that the camera automatically detects the paper form corners, flattens the perspective, removes shadows, and outputs a high-contrast clean image without manual adjustments.

**Acceptance Criteria:**

**Given** người dùng mở ứng dụng trên thiết bị di động (qua Capacitor),  
**When** người dùng chạm vào nút [Chụp biểu mẫu] (diện tích chạm $\ge 64 \times 64\text{ dp}$),  
**Then** plugin Google ML Kit Document Scanner khởi chạy giao diện quét toàn màn hình, tự động bắt góc, khử bóng và cho phép bấm Lưu (Save),  
**And** trả về đường dẫn file ảnh cục bộ JPEG sắc nét nắn góc vuông 90 độ,  
**And** nếu chạy trên trình duyệt Web thông thường (không có native ML Kit), hệ thống tự động fallback sang camera HTML5 với hướng dẫn giữ thẳng góc.

### Story 3.2: Tự động Nhận diện Biểu mẫu và Khởi động Quy trình Hướng dẫn

As an Elderly Citizen,  
I want the system to identify which administrative form I just scanned within 3 seconds,  
So that the appropriate step-by-step guidance workflow is automatically launched on my phone without manual search.

**Acceptance Criteria:**

**Given** ảnh chụp biểu mẫu đã được nắn thẳng từ Story 3.1,  
**When** ứng dụng gửi ảnh lên API nhận diện,  
**Then** hệ thống đối chiếu với thư viện biểu mẫu và trả về kết quả trong thời gian $\le 3$ giây (NFR-2),  
**And** tự động chuyển người dùng sang màn hình hướng dẫn bước đầu tiên của biểu mẫu đó,  
**And** nếu không nhận diện được (do biểu mẫu chưa có trong hệ thống), hiển thị thông báo bằng giọng nói và chữ to: *"Biểu mẫu này chưa có trong hệ thống, bác vui lòng nhờ cán bộ hỗ trợ nhé"*.

### Story 3.3: Thành phần Bản sao Thị giác & Vòng sáng Dẫn đường (Visual Twin & Pulsing Highlighter)

As an Elderly Citizen with declining vision,  
I want the screen to display my scanned document zoomed in, with a pulsing green circle/border highlighting the exact box/line I need to fill,  
So that I instantly know where to focus on the paper form without getting lost among dense text.

**Acceptance Criteria:**

**Given** người dùng đang ở một bước bất kỳ trong quy trình,  
**When** màn hình tải bước đó lên,  
**Then** component `visual-twin.tsx` vẽ ảnh scan và hiển thị hiệu ứng viền sáng nhấp nháy (pulsing animation) đúng tọa độ `bounding_box` của dòng đó (độ lệch $\le 5\%$),  
**And** hình ảnh tự động căn giữa màn hình và phóng to vùng đang điền để người già nhìn rõ mà không cần dùng cử chỉ chụm/zoom bằng 2 ngón tay.

### Story 3.4: Hiển thị Chữ Mẫu Màu Đỏ Tương Phản Cao & Bộ Nút Điều Hướng Trợ Năng

As an Elderly Citizen,  
I want to see a prominent example of what to write displayed in large bold red text (`#D32F2F`, $\ge 18$pt) on white background, alongside extra-large navigation buttons ($\ge 56\times 56$dp),  
So that I can comfortably read the example and copy it with my pen without straining my eyes or mis-tapping.

**Acceptance Criteria:**

**Given** người dùng đang ở màn hình hướng dẫn từng dòng,  
**When** quan sát phần chữ mẫu ví dụ,  
**Then** chữ mẫu hiển thị bằng màu đỏ đậm `#D32F2F` trên nền trắng, font chữ in hoa nét dày (Bold) đạt chuẩn tương phản WCAG 2.1 AAA ($\ge 7:1$),  
**And** hai nút điều hướng **[Dòng tiếp theo]** và **[Dòng trước đó]** có kích thước tối thiểu $56 \times 56\text{ dp}$ với màu nền tương phản cao, chạm vào là lập tức nhảy bước mượt mà.

---

## Epic 4: Trợ lý Giọng nói Đồng hành & Xử lý Liên chứng từ (Voice Assistant Companion & Prerequisite Document Handling)

**Mục tiêu Epic 4:** Người cao tuổi được trợ lý ảo cất giọng đọc tiếng Việt chậm rãi, ấm áp (tốc độ 0.9x) dẫn dắt từng dòng, có nút bấm "Nghe lại" một chạm, có thể bấm giữ mic để hỏi đáp thắc mắc theo ngữ cảnh; đồng thời dễ dàng chụp trước các giấy tờ gốc (như Biên bản xử phạt vi phạm giao thông) để AI tự bóc tách số liệu đưa vào các bước hướng dẫn điền form chính.

### Story 4.1: Bộ Phát Âm thanh Hướng dẫn Từng Bước với Nút Loa Lớn & Tốc độ Chậm 0.9x

As an Elderly Citizen,  
I want the app to automatically play the warm Vietnamese voice explanation when I arrive at each step (at a comfortable 0.9x speed) and provide a large Replay speaker button,  
So that I can listen clearly and replay anytime without needing to read complex instructions.

**Acceptance Criteria:**

**Given** người dùng chuyển sang bước điền mới có chứa `audio_url`,  
**When** bước đó được kích hoạt,  
**Then** component `voice-player.tsx` tự động phát file âm thanh MP3 với tốc độ `playbackRate = 0.9`,  
**And** trên màn hình luôn hiển thị một nút biểu tượng **[Loa phát thanh]** kích thước lớn ($\ge 64 \times 64\text{ dp}$), khi chạm vào sẽ tua lại âm thanh từ đầu câu,  
**And** hỗ trợ chuyển đổi linh hoạt giữa giọng đọc miền Bắc (`vi-VN-Neural2-A`) và giọng đọc miền Nam (`vi-VN-Neural2-D`) trong menu cài đặt nhanh.

### Story 4.2: Hỏi đáp Trực tiếp bằng Giọng nói với Trợ lý AI (Contextual Voice Q&A)

As an Elderly Citizen,  
I want to press and hold a large Microphone button to ask questions about the current line,  
So that the assistant pauses any active voice playback, understands my speech, and answers concisely in natural Vietnamese within 1.5 seconds.

**Acceptance Criteria:**

**Given** người dùng bấm giữ nút Micro,  
**When** người dùng bắt đầu nói,  
**Then** hệ thống lập tức ngắt âm thanh đang phát (`voicePlayer.pause()`) và thu âm qua Web Speech API on-device,  
**And** gửi văn bản câu hỏi cùng ngữ cảnh của bước hiện tại tới Gemini 1.5 Flash,  
**And** trợ lý cất giọng trả lời ngắn gọn trong 2-3 câu với tổng thời gian phản hồi $\le 1.5$ giây (NFR-2).

### Story 4.3: Quét và Bóc tách Chứng từ Tiên quyết Thông minh (Smart Prerequisite Document Scan)

As an Elderly Citizen,  
I want the assistant to guide me to take a photo of my prerequisite document (such as a Traffic fine citation, Land deed, or CCCD) at the start of a procedure,  
So that AI automatically extracts key identifiers and carries them into the form-filling steps without me searching manually.

**Acceptance Criteria:**

**Given** người dùng bắt đầu một biểu mẫu có cấu hình liên chứng từ (như Biểu mẫu nộp phạt vi phạm hành chính),  
**When** trợ lý thông báo *"Bác chụp tờ Biên bản xử phạt giúp cháu nhé"*,  
**Then** camera quét ảnh biên bản và Gemini bóc tách chính xác các trường khóa (`SO_BIEN_BAN`, `SO_TIEN_PHAT`, `NGAY_VI_PHAM`),  
**And** ở các bước điền tiếp theo, hệ thống tự động điền các thông tin này vào mục chữ mẫu màu đỏ và trợ lý cất lời: *"Theo biên bản của bác, số tiền phạt là 800.000 đồng, bác ghi vào ô số tiền nhé"*.

### Story 4.4: Xử lý Phi Lưu trữ Dữ liệu Cá nhân theo Nghị định 13/2023/NĐ-CP & Cơ chế Dự phòng khi Ồn

As an Elderly Citizen & System Compliance Officer,  
I want all photos of identity cards and fine citations to reside strictly in volatile session RAM and be completely wiped upon session completion or 15-minute timeout, with graceful fallback to enlarged manual buttons if ambient noise prevents voice recognition,  
So that citizens' privacy is fully protected under Vietnamese law and noisy environments never block form completion.

**Acceptance Criteria:**

**Given** người dùng chụp ảnh CCCD hoặc biên bản xử phạt trong phiên làm việc,  
**When** phiên làm việc kết thúc hoặc hết thời gian chờ 15 phút,  
**Then** middleware dọn dẹp bộ nhớ tự động xóa toàn bộ dữ liệu ảnh trong RAM, không ghi bất kỳ tệp tin nhạy cảm nào xuống ổ cứng cơ sở dữ liệu hay lưu trữ cố định (NFR-3),  
**And** nếu nhận diện giọng nói thất bại 2 lần do tiếng ồn trụ sở, hệ thống kích hoạt cơ chế dự phòng (Fallback): tự động phóng to gấp đôi các nút bấm điều hướng và làm nổi bật khung chữ đỏ để người dùng tiếp tục thao tác bằng mắt và tay mà không bị gián đoạn (NFR-4).




