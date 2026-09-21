# BẢNG THEO DÕI TIẾN ĐỘ & DANH MỤC BÁO CÁO KỸ THUẬT
## NGƯỜI 2: VÕ QUỐC ANH (FRONTEND SPECIALIST)

> **Vai trò:** Phụ trách Giao diện Mobile Người cao tuổi (FR-1, FR-2, FR-5, FR-9, FR-10), Tiêu chuẩn Trợ năng WCAG 2.1 AAA, Audio Player Karaoke.  
> **Thư mục mã nguồn:** `src/components/mobile/`, `src/app/`.  
> **Trạng thái hiện tại:** 🟢 **Đang phát triển Giao diện Mobile Touch-first & Tích hợp Voice Assistant**.

---

## 1. TỔNG QUAN CÁC ĐẦU VIỆC & MỤC TIÊU PHỤ TRÁCH

Người 2 chịu trách nhiệm toàn bộ lớp trải nghiệm người dùng (UX/UI) dành cho đối tượng đặc thù là **Người cao tuổi (60 - 80 tuổi)**:

* **Giao diện Touch-First & Chống run tay:** Thiết kế kích thước phím bấm lớn (Target Size tối thiểu $48 \times 48\text{px}$), khoảng cách giãn cách rộng rãi, tránh chạm nhầm.
* **Tiêu chuẩn Trợ năng WCAG 2.1 AAA:** Đảm bảo độ tương phản màu sắc đạt $\ge 7:1$ (màu đỏ mẫu `#D32F2F` trên nền trắng đạt $7.5:1$), chữ mẫu bắt buộc in HOA rõ nét.
* **Đồng bộ Âm thanh Karaoke:** Tích hợp hook `useVoiceAssistant`, làm sáng viền ô tờ khai và đổi màu chữ vàng chạy song song theo giọng đọc của loa phát.
* **Tương thích máy yếu (Assumption 4):** Sử dụng CSS keyframes thay vì Canvas nặng nề để hoạt động mượt mà trên điện thoại Android $\le 2\text{GB RAM}$.

---

## 2. BẢNG THEO DÕI CÁC BƯỚC & BÁO CÁO KỸ THUẬT CỦA FRONTEND

| Bước | Hạng mục công việc | Chi tiết & Kết quả cốt lõi | Trạng thái | Ghi chú & Tài liệu liên quan |
| :---: | :--- | :--- | :---: | :--- |
| **01** | **Thiết kế Khung Giao diện Mobile (Wireframe)** | Dựng Layout điện thoại dọc, thanh chỉ báo bước, khung camera và bảng điều khiển âm thanh. | ✅ Hoàn thành | FR-1, FR-2 |
| **02** | **Tích hợp Dữ liệu Giả lập (Mock Workflow)** | Đấu nối với `assets/mock-data/mock-workflow.json` của Người 4 qua cờ `useMockData = true`. | ✅ Hoàn thành | Không bị nghẽn bởi Backend |
| **03** | **Tích hợp Hook `useVoiceAssistant`** | Cắm hook điều khiển giọng nói 0.9x, tự động phát âm thanh và quản lý trạng thái loa/mic. | 🚀 Đang tích hợp | Xem hướng dẫn tại [`person-4-voice-qa/step-02-handoff-integration`](../person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md#22-người-2---frontend-specialist-võ-quốc-anh) |
| **04** | **Hiển thị Chữ Vàng Karaoke Thời gian thực** | Đọc mốc mili-giây từ `public/audio/timestamps.json` do Người 4 sinh ra để highlight từng từ. | 🚀 Đang tích hợp | Xem báo cáo [`person-4-voice-qa/step-03-ssml-timepoints`](../person-4-voice-qa/step-03-ssml-timepoints/SSML-TIMEPOINTS-UPGRADE-REPORT.md) |
| **05** | **Giao diện Chatbox Hỏi đáp Trợ lý Ảo (FR-4)** | Thử nghiệm hiển thị tin nhắn streaming `useChat` và nút nhấn giữ nói (Push-to-Talk). | ⏳ Kế hoạch Sprint 2 | Xem mẫu code tại [`person-4-voice-qa/step-05-sdk-deep-research`](../person-4-voice-qa/step-05-sdk-deep-research/SDK-COMPARISON-DEEP-RESEARCH.md) |

---

## 3. TÀI LIỆU HỖ TRỢ DÀNH RIÊNG CHO FRONTEND

* **Hướng dẫn Cắm giắc Voice Assistant:** [`docs/reports/person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md`](../person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md)
* **Kịch bản Mẫu & Dữ liệu Âm thanh:** `assets/mock-data/mock-workflow.json` và `public/audio/`
* **Mẫu Code Chatbox Streaming:** [`docs/reports/person-4-voice-qa/step-05-sdk-deep-research/SDK-COMPARISON-DEEP-RESEARCH.md`](../person-4-voice-qa/step-05-sdk-deep-research/SDK-COMPARISON-DEEP-RESEARCH.md)
