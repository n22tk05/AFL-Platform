# BẢNG THEO DÕI TIẾN ĐỘ & DANH MỤC BÁO CÁO KỸ THUẬT
## NGƯỜI 4: NGUYỄN THANH CHIẾN (AI VOICE & QA LEAD)

> **Vai trò:** Phụ trách Module Voice AI (FR-3, FR-4, FR-8) & Trưởng nhóm Đảm bảo Chất lượng (QA Lead 11 FRs).  
> **Nhánh làm việc chính:** `feat/ssml-karaoke-timepoints` (PR #2), `feat/sha256-canonical-cache` (PR #3).  
> **Trạng thái hiện tại:** ✅ **100% Hoàn thành Sprint 1** (16/16 Test Cases Voice AI PASS, 13/13 Test Cases Cache PASS, 11/11 QA Criteria PASS).

---

## 1. TỔNG QUAN CÁC BƯỚC THỰC HIỆN & DANH MỤC BÁO CÁO

Thư mục này lưu trữ toàn bộ các báo cáo kỹ thuật theo từng bước phát triển của Người 4, phục vụ việc tra cứu độc lập, bàn giao P2P và lưu trữ bằng chứng kiểm thử cho Tech Lead và các thành viên khác:

```
person-4-voice-qa/
├── README.md                                 <-- Bạn đang ở đây (Dashboard tổng hợp Người 4)
├── SESSION-HANDOFF-SPRINT-01-COMPLETE.md     <-- [HOT] Biên bản bàn giao tiến độ & khởi tạo session mới
├── step-01-action-plan/
│   └── ACTION-PLAN-VOICE-QA.md               <-- Kế hoạch tác chiến Sprint 1, Ma trận I/O, 11 FRs
├── step-02-handoff-integration/
│   └── HANDOFF-INTEGRATION-VOICE-QA.md       <-- Báo cáo bàn giao P2P & Ma trận đấu nối 3 người
├── step-03-ssml-timepoints/
│   └── SSML-TIMEPOINTS-UPGRADE-REPORT.md     <-- Nâng cấp Google TTS SSML Marks chính xác mili-giây
├── step-04-cache-sha256/
│   └── CACHE-KEY-SHA256-UPGRADE-REPORT.md    <-- Nâng cấp hàm băm SHA-256 & Canonicalization đệ quy
├── step-05-sdk-deep-research/
│   └── SDK-COMPARISON-DEEP-RESEARCH.md       <-- Nghiên cứu sâu Google SDK vs Vercel AI SDK & Lộ trình
├── step-06-prisma-database-integration/
│   └── PRISMA-POSTGRES-INTEGRATION-REPORT.md <-- [Bước 6] Tích hợp CSDL Prisma, ACID Transactions, Cache Đa Tầng & QA
└── step-07-api-integrity/
    └── API-INTEGRITY-AND-INTEGRATION-HANDOFF.md <-- [Bước 7] Toàn vẹn API, xác thực Admin, kiểm tra Manifest/Workflow & Audio Identity
```

---

## 2. BẢNG THEO DÕI TIẾN ĐỘ CHI TIẾT TỪNG BƯỚC

| Bước | Hạng mục công việc & Báo cáo | Mục tiêu & Kết quả cốt lõi | Trạng thái | Đường dẫn báo cáo chi tiết |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **Kế hoạch Tác chiến Sprint 1** | Xây dựng kế hoạch 7 ngày, ma trận I/O, tiêu chuẩn WCAG 2.1 AAA, 8 rủi ro Pre-Mortem và bộ kiểm thử Master QA Suite cho 11 FRs. | ✅ Hoàn thành | [`step-01-action-plan/ACTION-PLAN-VOICE-QA.md`](step-01-action-plan/ACTION-PLAN-VOICE-QA.md) |
| **02** | **Báo cáo Bàn giao & Ma trận Đấu nối P2P** | Tổng hợp kết quả thực nghiệm, ma trận I/O phân công cho Người 1 (DB), Người 2 (Frontend), Người 3 (OpenCV) và hướng dẫn cắm giắc tích hợp. | ✅ Hoàn thành | [`step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md`](step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md) |
| **03** | **Nâng cấp SSML Marks Timepointing (FR-3)** | Thay thế thuật toán phỏng đoán thời gian bằng Google Cloud TTS SSML Marks `v1beta1`, đồng bộ 9 file âm thanh và mốc thời gian Karaoke mili-giây. | ✅ Đã mở PR #2 | [`step-03-ssml-timepoints/SSML-TIMEPOINTS-UPGRADE-REPORT.md`](step-03-ssml-timepoints/SSML-TIMEPOINTS-UPGRADE-REPORT.md) |
| **04** | **Nâng cấp Hàm băm SHA-256 & Canonicalization** | Nâng cấp hàm `generateKey` từ 32-bit lên SHA-256, khử nhạy thứ tự key bằng đệ quy $A \to Z$, đồng bộ với bảng `VoiceCache.cacheKey` trong Prisma. | ✅ Đã mở PR #3 | [`step-04-cache-sha256/CACHE-KEY-SHA256-UPGRADE-REPORT.md`](step-04-cache-sha256/CACHE-KEY-SHA256-UPGRADE-REPORT.md) |
| **05** | **Deep Research: Google SDK vs Vercel AI SDK** | Nghiên cứu so sánh kiến trúc, streaming UI, Zod schema, tuân thủ Nghị định 13/2023/NĐ-CP và đề xuất mô hình lai (Hybrid) cho Sprint 2. | ✅ Hoàn thành | [`step-05-sdk-deep-research/SDK-COMPARISON-DEEP-RESEARCH.md`](step-05-sdk-deep-research/SDK-COMPARISON-DEEP-RESEARCH.md) |
| **06** | **Tích hợp Tầng Lưu trữ CSDL & Cache Đa Tầng** | Xây dựng `FormPersistenceService`, ACID transactions, Prisma Singleton Pool, RESTful endpoints (`/workflow`, `/approve`), RAM Cache L0 + L1/L2, vá 6 góc khuất QA. | ✅ Hoàn thành (16/16 PASS, 6/6 QA PASS) | [`step-06-prisma-database-integration/PRISMA-POSTGRES-INTEGRATION-REPORT.md`](step-06-prisma-database-integration/PRISMA-POSTGRES-INTEGRATION-REPORT.md) |
| **07** | **Toàn vẹn API & Bàn giao Tích hợp** | Xác thực Admin Key, giới hạn kích thước payload (256KB/8KB/4KB), validate chặt chẽ Manifest/Workflow, định danh Audio hash & không tạo file giả, phân lập ngữ cảnh Q&A. | ✅ Hoàn thành (API Integrity PASS) | [`step-07-api-integrity/API-INTEGRITY-AND-INTEGRATION-HANDOFF.md`](step-07-api-integrity/API-INTEGRITY-AND-INTEGRATION-HANDOFF.md) |

---

## 3. CÁC MÃ NGUỒN & TEST SUITE DO NGƯỜI 4 QUẢN LÝ

* **Dịch vụ Lưu trữ & Khắc phục Ngoại tuyến:** [`src/modules/forms/form-persistence.ts`](../../../src/modules/forms/form-persistence.ts)
* **Kết nối Prisma Singleton & Pool:** [`src/lib/prisma.ts`](../../../src/lib/prisma.ts)
* **Dịch vụ Kịch bản Gemini (FR-8):** [`src/modules/voice-ai/gemini-prompt.ts`](../../../src/modules/voice-ai/gemini-prompt.ts)
* **Dịch vụ Giọng nói TTS & Cache 2 tầng (FR-3):** [`src/modules/voice-ai/tts-service.ts`](../../../src/modules/voice-ai/tts-service.ts)
* **Dịch vụ Hỏi đáp & Bán Song công (FR-4):** [`src/modules/voice-ai/voice-qa.ts`](../../../src/modules/voice-ai/voice-qa.ts)
* **Bộ nhớ đệm Vaccine Quota L1:** [`src/modules/voice-ai/local-cache.ts`](../../../src/modules/voice-ai/local-cache.ts)
* **Hook Giao diện React Frontend:** [`src/modules/voice-ai/use-voice-assistant.ts`](../../../src/modules/voice-ai/use-voice-assistant.ts)
* **Các bộ kiểm thử chuyên trách:**
  - `npm run test:voice`: Kiểm thử tích hợp toàn diện Voice AI (16/16 PASS)
  - `npm run test:cache`: Kiểm thử đơn vị hàm băm SHA-256 (13/13 PASS)
  - `npm run test:persistence`: Kiểm thử CSDL Prisma & Bộ nhớ đệm 2 tầng (16/16 PASS)
  - `npm run test:qa:stress`: Kiểm toán chất lượng khắc nghiệt & Stress test 6 bất cập góc tối
  - `npm run test:stt`: Kiểm thử bán song công & bảo vệ dội âm Half-Duplex (16/16 PASS)
  - `npm run test:qa`: Kiểm toán chất lượng toàn diện 11 FRs & 4 NFRs (11/11 PASS)

---

## 4. HƯỚNG DẪN DÀNH CHO CÁC THÀNH VIÊN KHÁC

* **Nguyễn Tuấn Khánh (Người 1 - Tech Lead):**
  1. Xem [`step-06-prisma-database-integration/PRISMA-POSTGRES-INTEGRATION-REPORT.md`](step-06-prisma-database-integration/PRISMA-POSTGRES-INTEGRATION-REPORT.md) về kiến trúc `FormPersistenceService` và pool kết nối.
  2. Xem endpoint `POST /api/admin/forms/[formCode]/approve` để tích hợp nút duyệt trên màn hình Admin Dashboard.
* **Võ Quốc Anh (Người 2 - Frontend):**
  - Sử dụng API `GET /api/forms/:formCode/workflow` để nạp kịch bản 9 bước, chữ đỏ và danh sách FAQ thay vì chỉ đọc mock file.
  - Xem [`step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md`](step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md) mục **2.2** để lấy hướng dẫn cắm hook `useVoiceAssistant` vào UI Mobile.
* **Nguyễn Thế Anh (Người 3 - OpenCV):**
  - Khi module WASM trích xuất xong tọa độ hộp, gọi `FormPersistenceService.saveGeometricManifest()` hoặc `POST /api/llm/prompt` để nạp toàn bộ vào cơ sở dữ liệu.
