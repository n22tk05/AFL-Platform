# BIÊN BẢN BÀN GIAO TIẾN ĐỘ & KHỞI TẠO PHIÊN LÀM VIỆC TIẾP THEO (SESSION HANDOFF)

## DỰ ÁN AFL PLATFORM — NGƯỜI 4: NGUYỄN THANH CHIẾN (VOICE AI & QA LEAD)

> **Thời điểm lập:** 21/09/2026  
> **Phiên bản hoàn tất:** Sprint 1 — Bước 06 (Prisma Database Integration & Live Supabase Verification)  
> **Nhánh Git hiện tại:** `feat/prisma-database-integration` (Tracking `origin/feat/prisma-database-integration`)  
> **Pull Request:** [PR #4: feat/prisma-database-integration](https://github.com/n22tk05/AFL-Platform/pull/4) (Commit duy nhất: `962a213`)  
> **Trạng thái CSDL:** 🟢 **ONLINE** trên Supabase Cloud (`aws-0-ap-northeast-1.pooler.supabase.com:6543`)  

---

## 1. QUY TẮC CỐT LÕI CỦA NGƯỜI 4 (BẮT BUỘC DUY TRÌ TRONG MỌI SESSION)

1. **Quy tắc Git (Global Operating Contract):** TUYỆT ĐỐI KHÔNG tự động chạy lệnh `git commit` hoặc `git push` lên Git/GitHub trừ khi người dùng yêu cầu rõ ràng. Luôn giữ code ở trạng thái modified/staged để người dùng kiểm soát.
2. **Quy tắc Báo cáo Tinh gọn (Single Consolidated Report):** Mỗi bước kỹ thuật chỉ lưu 1 file báo cáo kỹ thuật duy nhất trong `docs/reports//`. Không tạo file lẻ tẻ.
3. **Quy chuẩn Bảo mật (Nghị định 13/2023/NĐ-CP):** Không lưu trữ bất kỳ PII (thông tin định danh cá nhân) của công dân vào cơ sở dữ liệu. Dữ liệu công dân chỉ xử lý trong Session RAM tự hủy.
4. **Chuẩn Trợ năng (WCAG 2.1 AAA):** Chữ mẫu đỏ `#D32F2F` in hoa $\ge 18\text{pt}$, độ tương phản $\ge 7:1$, giọng đọc tốc độ 0.9x ấm áp cho người cao tuổi.

---

## 2. TỔNG KẾT TOÀN DIỆN TIẾN ĐỘ SPRINT 1 (ĐÃ HOÀN THÀNH 100%)

Người 4 đã hoàn thành xuất sắc toàn bộ 6 bước công việc trong Sprint 1:

| Bước | Tên Hạng mục | Kết quả Kỹ thuật Chi tiết | Trạng thái |
| :---: | :--- | :--- | :---: |
| **01** | **Kế hoạch Tác chiến Sprint 1** | Lập Ma trận I/O P2P, tiêu chuẩn WCAG 2.1 AAA, 8 rủi ro Pre-Mortem và Master QA Test Suite 11 FRs. | ✅ Hoàn tất |
| **02** | **Ma trận Bàn giao P2P** | Định hình giao diện cắm giắc cho Người 1 (DB), Người 2 (Frontend), Người 3 (OpenCV). | ✅ Hoàn tất |
| **03** | **SSML Karaoke Timepoints (FR-3)** | Tích hợp Google TTS SSML Marks `v1beta1`, đồng bộ 9 file audio và mốc thời gian Karaoke mili-giây. | ✅ PR #2 |
| **04** | **Hàm băm SHA-256 & Canonical Cache** | Nâng cấp hàm hash 256-bit chuẩn hóa khóa $A \to Z$, chống trùng lặp lãng phí Quota TTS. | ✅ PR #3 |
| **05** | **Deep Research SDK** | Đánh giá kiến trúc Google GenAI SDK vs Vercel AI SDK, phân tích streaming UI và Nghị định 13. | ✅ Hoàn tất |
| **06** | **Tích hợp CSDL Prisma & Supabase Live** | Xây dựng `FormPersistenceService`, Circuit Breaker, đồng bộ Supabase PostgreSQL, 16/16 test PASS. | ✅ PR #4 |

---

## 3. HIỆN TRẠNG KỸ THUẬT & DỮ LIỆU ĐÃ XÁC THỰC THỰC TẾ

### 3.1. Kết quả Kiểm thử Tự động (Automated Test Suites)

* `npm run test:persistence`: **16/16 PASS (100%)** — Tình trạng CSDL `🟢 ONLINE`, nguồn lưu trữ `database`.
* `npm run test:cache`: **13/13 PASS (100%)** — Kiểm thử hàm băm SHA-256 canonical.
* `npm run test:voice`: **16/16 PASS (100%)** — Kiểm thử Voice AI, SSML Karaoke và Touch-to-Ask.
* `npm run test:qa`: **11/11 PASS (100%)** — Kiểm toán chất lượng toàn diện 11 FRs và 4 NFRs.

### 3.2. Dữ liệu Đang Hiện Hữu Trực Tiếp Trên Supabase Cloud

Đã kiểm chứng thông qua script `npx tsx src/modules/voice-ai/tests/check-supabase-live.ts`:

* `form_templates`: 2 bản ghi (Mẫu 01/LPTB đang ở trạng thái `ACTIVE`).
* `form_workflows`: 1 kịch bản hoàn chỉnh liên kết với FormTemplate.
* `workflow_steps`: 9 bước hướng dẫn cho người cao tuổi (đủ tọa độ highlight chuẩn hóa và chữ mẫu đỏ in hoa).
* `step_faqs`: 10 câu hỏi - đáp nhanh khi quầy tiếp dân bị ồn (Touch-to-Ask).
* `form_geometric_manifests` & `form_geometric_boxes`: Đầy đủ 9 hộp bounding box từ OpenCV WASM.
* `form_audit_logs`: 2 bản ghi nhật ký phê duyệt của Tech Lead (*Nguyễn Tuấn Khánh*).
* `voice_cache`: Bộ nhớ đệm âm thanh L2 trên PostgreSQL.

---

## 4. BẢNG TRA CỨU FILE MÃ NGUỒN CỐT LÕI (KEY REPOSITORIES)

* **Tầng Lưu trữ CSDL & Phòng vệ Ngoại tuyến:** `src/modules/forms/form-persistence.ts`
* **Kết nối Prisma Singleton & PG Pool:** `src/lib/prisma.ts`
* **Schema Prisma 9 Model:** `prisma/schema.prisma`
* **Script Kiểm tra CSDL Supabase Live:** `src/modules/voice-ai/tests/check-supabase-live.ts`
* **Bộ Kiểm thử Persistence Master:** `src/modules/voice-ai/tests/test-persistence.ts`
* **Dịch vụ Giọng nói TTS 2 tầng:** `src/modules/voice-ai/tts-service.ts`
* **Dịch vụ Hỏi đáp Voice Q&A:** `src/modules/voice-ai/voice-qa.ts`
* **Hook Giao diện React Frontend:** `src/modules/voice-ai/use-voice-assistant.ts`
* **Báo cáo Kỹ thuật Bước 06 Đầy đủ:** `docs/reports/person-4-voice-qa/step-06-prisma-database-integration/PRISMA-POSTGRES-INTEGRATION-REPORT.md`

---

## 5. KẾ HOẠCH HÀNH ĐỘNG CHO SESSION TIẾP THEO (NEXT STEPS)

Khi mở Session mới, hãy tập trung vào 4 nhiệm vụ kế tiếp:

1. **Bàn giao PR #4:** Đợi Tech Lead (Người 1 - Nguyễn Tuấn Khánh) xem xét mã nguồn và merge PR #4 vào nhánh `main`.
2. **Hỗ trợ Người 2 (Mobile Frontend):**
   * Đấu nối endpoint `GET /api/forms/[formCode]/workflow` vào ứng dụng di động để hiển thị kịch bản 9 bước từ Supabase.
   * Gắn hook `useVoiceAssistant` vào UI để hiển thị Karaoke highlight và micro hỏi đáp.
3. **Phối hợp Người 3 (OpenCV):**
   * Đấu nối đầu ra của OpenCV WASM vào hàm `formPersistenceService.saveGeometricManifest()`.
4. **Khởi động Sprint 2:**
   * Tối ưu hóa Web Speech API on-device để giảm độ trễ phản hồi Voice Q&A $\le 1.5$s (`NFR-2`).
   * Kiểm thử Bán song công (Half-Duplex) trong môi trường quầy tiếp dân nhiều tạp âm.
   * Kiểm toán QA thực tế trên ứng dụng di động Android qua Capacitor.

---
