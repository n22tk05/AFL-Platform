# THƯ MỤC TÀI LIỆU QUAN TRỌNG DỰ ÁN AFL
## Trung Tâm Tri Thức & Kế Hoạch Tác Chiến (Documentation Center)

Chào mừng bạn đến với thư mục tài liệu cốt lõi của dự án **AFL** (*Hệ thống Hỗ trợ Điền Biểu mẫu Thông minh & Quản trị Quy trình cho Người cao tuổi*).  
Toàn bộ tài liệu quan trọng nhất đã được tổng hợp, phân loại và đặt tên theo thứ tự ưu tiên dưới đây để cả 4 thành viên dễ dàng tra cứu hàng ngày.

---

## THÀNH VIÊN DỰ ÁN
* **Người 1 (Tech Lead / PM):** Nguyễn Tuấn Khánh
* **Người 2 (Frontend Specialist):** Võ Quốc Anh
* **Người 3 (Algorithm Specialist):** Nguyễn Thế Anh
* **Người 4 (AI Voice & QA Lead):** Nguyễn Thanh Chiến

---

## MỤC LỤC TÀI LIỆU CỐT LÕI

| STT | Tài Liệu | Mô Tả & Nội Dung Trọng Tâm | Dành Cho Ai? |
| :---: | :--- | :--- | :--- |
| **01** | [PRD.md](PRD.md) | **Tài liệu Yêu cầu Sản phẩm (PRD):** Toàn bộ 11 Yêu cầu Chức năng (FR-1 đến FR-11) kèm 11 sơ đồ Mermaid trực quan, tiêu chuẩn WCAG AAA, Nghị định 13/2023/NĐ-CP. | **Cả 4 thành viên** |
| **02** | [ARCHITECTURE.md](ARCHITECTURE.md) | **Kiến trúc Kỹ thuật (Architecture Spine):** Pipeline tuần tự OpenCV WASM $\rightarrow$ Gemini 1.5 Flash (Pure Text LLM), CSDL PostgreSQL JSONB, Session RAM. | **Người 1 & Người 3** |
| **03** | [AFL.md](AFL.md) | **Phân rã Công việc (Epics & Stories):** 4 Epics lớn và 17 User Stories chi tiết với tiêu chuẩn nghiệm thu Given-When-Then. | **Cả 4 thành viên** |
| **04** | [WORKFLOW-PIPELINE.md](WORKFLOW-PIPELINE.md) | **Kế hoạch Phân công & Action Sheets:** Tờ lệnh nhiệm vụ chi tiết của 4 người, quy tắc "Nền móng là số 1", phân tách 2 dòng chảy, lộ trình Sprint 7 ngày. | **Cả 4 thành viên** |
| **05** | [MOCK-DATA.md](MOCK-DATA.md) | **Hợp đồng Dữ liệu & Hướng dẫn Mock:** Chi tiết file `contracts.ts`, `mock-manifest.json` (OpenCV) và `mock-workflow.json` (Gemini & UI). | **Cả 4 thành viên** |
| **06** | [PRE-MORTEM.md](PRE-MORTEM.md) | **Sổ tay Phòng ngừa Rủi ro (Pre-Mortem Playbook):** 8 kịch bản xấu có thể làm đổ vỡ dự án và phương án phòng thủ (Vaccine). | **Cả 4 thành viên** |
| **07** | [ACTION-PLAN-VOICE-QA.md](ACTION-PLAN-VOICE-QA.md) | **Kế hoạch Tác chiến Sprint 1 (Voice & QA):** Kế hoạch hành động 7 ngày chi tiết của Người 4, ma trận I/O và tiêu chuẩn nghiệm thu 11 FR. | **Người 4 (Chiến)** |
| **08** | [HANDOFF-INTEGRATION-VOICE-QA.md](HANDOFF-INTEGRATION-VOICE-QA.md) | **Báo Cáo Tiến Độ & Ma Trận Khớp Nối (Handoff & P2P Integration):** Tổng hợp những gì đã làm được, ma trận I/O chi tiết cho từng người (Tech Lead, Frontend, OpenCV) và hướng dẫn đấu nối. | **Cả 4 thành viên** |
| **09** | [SSML-TIMEPOINTS-UPGRADE-REPORT.md](SSML-TIMEPOINTS-UPGRADE-REPORT.md) | **Báo Cáo Nâng Cấp Mốc Thời Gian Karaoke (SSML Timepointing):** Đánh giá hạn chế thuật toán heuristic cũ, triển khai cơ chế SSML Marks chính xác mili-giây từ Google TTS Neural2. | **Cả 4 thành viên** |
| **10** | [CACHE-KEY-SHA256-UPGRADE-REPORT.md](CACHE-KEY-SHA256-UPGRADE-REPORT.md) | **Báo Cáo Nâng Cấp Khóa Băm Cache (SHA-256 & Canonicalization):** Triệt tiêu rủi ro đụng độ mã băm, khử nhạy thứ tự thuộc tính, đồng bộ kiến trúc với bảng `voice_cache` trong Prisma CSDL. | **Người 1 & Người 4** |
| **11** | [SDK-COMPARISON-DEEP-RESEARCH.md](SDK-COMPARISON-DEEP-RESEARCH.md) | **Nghiên Cứu Sâu So Sánh Google SDK vs Vercel AI SDK:** Phân tích kiến trúc nội tại, tác động đến 4 vai trò, khả năng streaming thời gian thực, chủ quyền dữ liệu và lộ trình mô hình lai (Hybrid). | **Cả 4 thành viên** |

---

## ĐƯỜNG DẪN DỮ LIỆU MOCK THỰC TẾ (PHA 0)

Toàn bộ mã nguồn hợp đồng TypeScript và file dữ liệu giả lập mẫu nằm tại:
* **Hợp đồng Ổ cắm:** [`assets/mock-data/contracts.ts`](../assets/mock-data/contracts.ts)
* **Tọa độ mẫu của Người 3 (OpenCV):** [`assets/mock-data/mock-manifest.json`](../assets/mock-data/mock-manifest.json)
* **Kịch bản mẫu của Người 4 (Gemini + Audio):** [`assets/mock-data/mock-workflow.json`](../assets/mock-data/mock-workflow.json)

---

## NGUYÊN TẮC ĐỌC TÀI LIỆU DÀNH CHO TỪNG BẠN

* **Võ Quốc Anh (Người 2 - Frontend):** Đọc kỹ mục FR-1, FR-2, FR-5, FR-9, FR-10 trong [PRD.md](PRD.md), xem tờ lệnh chi tiết trong [WORKFLOW-PIPELINE.md](WORKFLOW-PIPELINE.md), lấy kịch bản trong [MOCK-DATA.md](MOCK-DATA.md) (file `assets/mock-data/mock-workflow.json`), và bật `useMockData = true` để code giao diện.
* **Nguyễn Thế Anh (Người 3 - OpenCV):** Đọc kỹ mục FR-7 và FR-1 trong [PRD.md](PRD.md), xem tờ lệnh chi tiết trong [WORKFLOW-PIPELINE.md](WORKFLOW-PIPELINE.md), và đảm bảo kết quả bóc tách hình học khớp 100% với chuẩn trong [MOCK-DATA.md](MOCK-DATA.md) (`assets/mock-data/mock-manifest.json`).
* **Nguyễn Thanh Chiến (Người 4 - Prompt & Voice):** Đọc kỹ mục FR-8, FR-3, FR-4 trong [PRD.md](PRD.md), xem tờ lệnh trong [WORKFLOW-PIPELINE.md](WORKFLOW-PIPELINE.md), và đọc kỹ [PRE-MORTEM.md](PRE-MORTEM.md) để tránh lỗi quota API hoặc JSON ảo giác.
* **Nguyễn Tuấn Khánh (Người 1 - Tech Lead):** Điều phối toàn diện bằng [WORKFLOW-PIPELINE.md](WORKFLOW-PIPELINE.md) và theo dõi tiến độ công việc tại file [`sprint-status.yaml`](../_bmad-output/implementation-artifacts/sprint-status.yaml).
