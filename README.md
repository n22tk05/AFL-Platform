![AFL Platform](assets/banner.jpg)

# AFL Platform — AI-Assisted Form-Filling CRM for Elderly Citizens
## Hệ thống Hỗ trợ Điền Biểu mẫu Thông minh & Quản trị Quy trình cho Người cao tuổi tại Việt Nam

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.x-black)](https://nextjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-6.x-blue)](https://capacitorjs.com/)
[![WCAG 2.1 AAA](https://img.shields.io/badge/Accessibility-WCAG%20AAA-brightgreen)](https://www.w3.org/WAI/WCAG21/quickref/)
[![Nghị định 13/2023/NĐ-CP](https://img.shields.io/badge/Security-Ngh%E1%BB%8B%20%C4%91%E1%BB%8Bnh%2013-red)](#)

---

## MÔ TẢ SẢN PHẨM & TẦM NHÌN DỰ ÁN

### 1. Bối Cảnh Thực Tế & Nỗi Đau (Problem Statement)
Việt Nam đang đẩy mạnh chuyển đổi số dịch vụ công (Cổng Dịch vụ công Quốc gia, ứng dụng VNeID, nộp thuế trước bạ điện tử, nộp phạt vi phạm hành chính trực tuyến...). Tuy nhiên, **hơn 13 triệu người cao tuổi (từ 60 tuổi trở lên)** cùng hàng triệu công dân tại Việt Nam đang gặp phải những rào cản rất lớn khi thực hiện thủ tục hành chính tại cơ quan Một cửa:
* **Thị lực suy giảm & Tay run:** Mắt kém không đọc nổi các dòng chữ in li ti, ô vuông nhỏ trên giấy trắng mực đen.
* **Bối rối trước thuật ngữ pháp lý:** Các cụm từ hành chính khô khan như *"nguồn gốc phát sinh nghĩa vụ tài chính"*, *"diện tích chịu lệ phí trước bạ"* khiến người dân không hiểu phải ghi gì.
* **Tâm lý e ngại, sợ làm phiền:** Người già thường ngại hỏi cán bộ tiếp dân vì quầy Một cửa luôn quá tải và ồn ào; dẫn đến việc tự điền mò, viết sai, gạch xóa be bét và phải xin cấp lại tờ khai nhiều lần.

### 2. Tầm Nhìn Sản Phẩm: "Người Đồng Hành Số Kiên Nhẫn & Tin Cậy"
Thay vì ép người già phải học cách thao tác bàn phím cảm ứng phức tạp hay dùng chữ ký số, **AFL Platform** tôn trọng và gìn giữ thói quen cầm bút viết tay của người dân: **"Để công dân tự tay cầm bút mực hoàn thành tờ khai giấy ngay tại bàn viết, với sự dẫn đường của một Trợ lý AI kiên nhẫn, chuẩn mực và ấm áp như con cháu trong nhà."**

---

### 3. Trải Nghiệm Đột Phá Dành Cho Người Dân (Citizen Mobile Experience)
* **Nhận diện Biểu mẫu Giấy & Nắn thẳng phối cảnh (FR-1):** Công dân chỉ cần đặt điện thoại chụp tờ khai giấy trên bàn. Google ML Kit tự động tìm 4 góc, nắn thẳng góc chụp và nhận diện mẫu biểu trong thời gian <= 3 giây.
* **Bản sao Thị giác & Điểm sáng dẫn đường (Visual Twin - FR-2):** Màn hình hiển thị ảnh chụp tờ khai, tự động phóng to vào đúng khu vực đang điền và hiển thị viền phát sáng nhấp nháy (`pulsing highlighter`) chính xác tại ô cần ghi. Nút bấm chuyển bước lớn >= 56 x 56 dp.
* **Trợ lý Giọng nói Đọc Hướng dẫn Từng Dòng (FR-3):** Giọng đọc tiếng Việt tự nhiên (tùy chọn miền Bắc / miền Nam), phát âm chậm rãi (tốc độ 0.9x), tròn vành rõ chữ, tự động dừng lại ngay lập tức khi người dùng bấm mic nói (*Interruption handling*).
* **Chữ Mẫu Màu Đỏ Tương Phản Cao (FR-5):** Tại mỗi bước, màn hình hiển thị ví dụ mẫu bằng chữ in hoa màu đỏ đậm (`#D32F2F`) tương phản cao trên nền trắng đạt chuẩn **WCAG 2.1 AAA (>= 7:1)**, cỡ chữ tối thiểu 18pt để người già nhìn theo chép lại chuẩn xác từng nét.
* **Hỏi đáp Giọng nói Ngữ cảnh Tức thì (FR-4):** Người dùng nhấn giữ nút Micro hỏi bất kỳ thắc mắc nào (*"Cháu ơi, diện tích ghi theo Sổ đỏ hay Hợp đồng?"*). AI đối chiếu nghiệp vụ giải đáp ngắn gọn trong 2-3 câu với độ trễ phản hồi <= 1.5 giây.
* **Quét Chứng Từ Tiên Quyết Thông Minh (FR-6):** Tự động bóc tách số Căn cước công dân, số Biên bản phạt vi phạm giao thông hoặc thông tin Sổ đỏ để tự động đưa vào chữ mẫu đỏ ở các bước tiếp theo.

---

### 4. Cổng Quản Trị Quy Trình Dành Cho Cán Bộ Một Cửa (Admin Portal CRM)
* **Quy trình Bóc tách Form Tuần tự Đột phá (FR-7):** 
  * *Tầng 1 (OpenCV WASM cục bộ):* Quét các đường kẻ ngang dọc và khung ô trên giấy trắng mực đen trong <= 100ms với độ chính xác pixel >= 98%, xuất ra khung dữ liệu hình học đã chuẩn hóa tọa độ.
  * *Tầng 2 (Gemini 1.5 Flash Text LLM):* Tiếp nhận dữ liệu text, đọc hiểu ngữ nghĩa nhãn trường và điều kiện rẽ nhánh (hoàn toàn không cần Vision API), tự động sinh câu thoại hướng dẫn bình dân.
  * *Cơ chế Fallback tức thì:* Nếu Cloud AI mất mạng, khung ô OpenCV vẫn hiển thị sẵn sàng trên giao diện để cán bộ gán nhãn thủ công không gián đoạn.
* **Cổng Kiểm duyệt Chia đôi Màn hình (Split-Screen Review Gate - FR-9):** Bên trái hiển thị file PDF/scan gốc, bên phải hiển thị kịch bản các bước do AI tạo. Cán bộ nghe thử audio, tinh chỉnh câu chữ theo đặc thù địa phương và bấm [Phê duyệt & Xuất bản].
* **Cấu hình Liên chứng từ Kéo-thả (React Flow - FR-10):** Sơ đồ trực quan cho phép cán bộ nối thông tin từ Biên bản phạt / Sổ đỏ vào tờ khai nộp tiền.
* **Quản lý Thư viện Biểu mẫu & Sinh Mã QR (FR-11):** Tự động sinh mã QR liên kết nhanh để in dán trực tiếp tại từng bàn viết tiếp dân.

---

### 5. Bảo Mật & Tuân Thủ Tuyệt Đối Nghị Định 13/2023/NĐ-CP
* **Dữ liệu Phi lưu trữ (In-Memory Processing):** Hình ảnh CCCD, giấy phép lái xe, biên bản phạt của người dân chỉ được lưu tạm trong bộ nhớ đệm của phiên làm việc (Session RAM) và **tự động hủy hoàn toàn sau 15 phút** hoặc ngay khi kết thúc phiên. Tuyệt đối không lưu giữ vĩnh viễn hình ảnh nhạy cảm trên máy chủ.
* Toàn bộ luồng truyền tải dữ liệu bắt buộc mã hóa qua giao thức an toàn cao nhất TLS 1.3.

---

### 6. Chỉ Số Đo Lường Thành Công (Target KPIs)
* **Tỷ lệ điền đúng ngay lần đầu (Primary Metric):** Đạt >= 90% (so với mức trung bình tự điền hiện nay chỉ khoảng 55%).
* **Thời gian hoàn thành biểu mẫu:** Giảm thời gian công dân lớn tuổi loay hoay điền tờ khai từ 35 phút xuống dưới 12 phút.
* **Giảm tải quầy tiếp dân:** Giảm hơn 70% áp lực cho cán bộ Một cửa trong việc phải đứng cạnh chỉ từng ô cho người dân.

---

## TÀI LIỆU DỰ ÁN (DOCS)

Toàn bộ tài liệu quy chuẩn kỹ thuật và kế hoạch thực thi đã được tách riêng vào thư mục [`docs/`](docs/README.md). Bấm trực tiếp vào các liên kết bên dưới để xem chi tiết:

| STT | Tài Liệu Quy Chuẩn | Đường Dẫn Trực Tiếp | Nội Dung Trọng Tâm |
| :---: | :--- | :--- | :--- |
| **01** | **Yêu Cầu Sản Phẩm (PRD)** | [docs/PRD.md](docs/PRD.md) | 11 Yêu cầu Chức năng (FR-1 đến FR-11) kèm 11 sơ đồ Mermaid trực quan, NFRs, WCAG AAA. |
| **02** | **Kiến Trúc Kỹ Thuật** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc hệ thống, pipeline OpenCV WASM, PostgreSQL JSONB, Session RAM tự hủy (NĐ 13). |
| **03** | **Phân Rã Epics & Stories** | [docs/AFL.md](docs/AFL.md) | 4 Epics lớn và 17 User Stories chi tiết với tiêu chuẩn nghiệm thu Given-When-Then. |
| **04** | **Kế Hoạch Phân Công 4 Người** | [docs/WORKFLOW-PIPELINE.md](docs/WORKFLOW-PIPELINE.md) | Tờ lệnh nhiệm vụ của 4 thành viên, quy tắc "Nền móng số 1", phân tách 2 dòng chảy, lộ trình Sprint 7 ngày. |
| **05** | **Hợp Đồng Dữ Liệu & Mock Data** | [docs/MOCK-DATA.md](docs/MOCK-DATA.md) | Hướng dẫn sử dụng `contracts.ts`, `mock-manifest.json` (OpenCV) và `mock-workflow.json` (Gemini & UI). |
| **06** | **Sổ Tay Phòng Ngừa Rủi Ro** | [docs/PRE-MORTEM.md](docs/PRE-MORTEM.md) | 8 kịch bản xấu (lệch tọa độ, vỡ layout, cháy quota API, ồn quầy tiếp dân...) và phương án phòng thủ. |

---

## PHÂN BỔ NHÂN SỰ & TỜ LỆNH HÀNH ĐỘNG

| Thành Viên | Vị Trí & Trách Nhiệm Chính | Yêu Cầu Chức Năng (FR) Phụ Trách | Tài Liệu Bắt Buộc Phải Đọc |
| :--- | :--- | :--- | :--- |
| **Nguyễn Tuấn Khánh (Tech Lead)** | **Tổng chỉ huy & Kiến trúc sư**<br>Dựng Monorepo, viết `contracts.ts`, CSDL Prisma, sinh mã QR. | **FR-11** (Thư viện Form & QR) & Hỗ trợ **FR-6** (Session RAM) | [docs/WORKFLOW-PIPELINE.md](docs/WORKFLOW-PIPELINE.md) |
| **Võ Quốc Anh (Frontend)** | **Chủ trì Giao diện (Mobile & Admin)**<br>Vẽ Visual Twin người già, căn chỉnh font >= 18pt, nút >= 56dp, khung Split-screen. | **FR-1**, **FR-2**, **FR-5** (Mobile)<br>**FR-9**, **FR-10** (Admin UI) | [docs/WORKFLOW-PIPELINE.md](docs/WORKFLOW-PIPELINE.md)<br>[docs/MOCK-DATA.md](docs/MOCK-DATA.md) |
| **Nguyễn Thế Anh (Giải thuật)** | **Chủ trì Thuật toán Thị giác**<br>Quét đường kẻ/khung ô OpenCV WASM, nắn phẳng ảnh, bóc tách OCR biên bản phạt. | **FR-1** (Nắn thẳng ảnh Deskew)<br>**FR-6** (Quét biên bản OCR)<br>**FR-7** (OpenCV bóc tách khung ô) | [docs/WORKFLOW-PIPELINE.md](docs/WORKFLOW-PIPELINE.md)<br>[docs/MOCK-DATA.md](docs/MOCK-DATA.md) |
| **Nguyễn Thanh Chiến (Voice & QA)** | **Chủ trì Prompt, Giọng nói & QA**<br>Prompt Gemini sinh kịch bản tiếng Việt, phát loa 0.9x, Voice Q&A <= 1.5s, test 11 FR. | **FR-8** (Prompt kịch bản bình dân)<br>**FR-3** (Phát loa TTS 0.9x)<br>**FR-4** (Hỏi đáp Voice Q&A)<br>**Tổng chỉ huy QA 11 FR** | [docs/WORKFLOW-PIPELINE.md](docs/WORKFLOW-PIPELINE.md)<br>[docs/PRE-MORTEM.md](docs/PRE-MORTEM.md) |

---

## DỮ LIỆU MOCK THỰC TẾ CHO PHA 0 (DAY 1)

* **Hợp đồng Ổ cắm TypeScript:** [`assets/mock-data/contracts.ts`](assets/mock-data/contracts.ts)
* **Tọa độ mẫu của Người 3 (OpenCV):** [`assets/mock-data/mock-manifest.json`](assets/mock-data/mock-manifest.json)
* **Kịch bản mẫu của Người 4 (Gemini + Audio):** [`assets/mock-data/mock-workflow.json`](assets/mock-data/mock-workflow.json)

---

## HƯỚNG DẪN KHỞI CHẠY (QUICK START)

1. **Clone repository:**
   ```bash
   git clone <URL-REPO>
   cd AFL
   ```
2. **Cài đặt dependencies:**
   ```bash
   npm install
   ```
3. **Chạy máy chủ phát triển:**
   ```bash
   npm run dev
   ```
4. **Mở trình duyệt:** Truy cập `http://localhost:3000` để xem ứng dụng di động dành cho người cao tuổi hoặc `http://localhost:3000/admin` để vào Cổng Quản trị Một cửa.
