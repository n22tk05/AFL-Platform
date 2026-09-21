# BẢNG THEO DÕI TIẾN ĐỘ & DANH MỤC BÁO CÁO KỸ THUẬT
## NGƯỜI 1: NGUYỄN TUẤN KHÁNH (TECH LEAD & PM)

> **Vai trò:** Quản trị Kiến trúc Hệ thống, Thiết kế CSDL PostgreSQL, Điều phối Sprint & Phê duyệt Pull Requests.  
> **Nhánh làm việc chính:** `main`.  
> **Trạng thái hiện tại:** 🟢 **Đang triển khai CSDL & Điều phối Tích hợp Phase 1**.

---

## 1. TỔNG QUAN CÁC ĐẦU VIỆC & MỤC TIÊU PHỤ TRÁCH

Người 1 chịu trách nhiệm chính về "xương sống" kiến trúc và dữ liệu lâu dài của nền tảng AFL Platform:

* **Quản trị Kiến trúc Tổng thể:** Điều phối luồng dữ liệu tuần tự OpenCV WASM $\rightarrow$ Gemini LLM $\rightarrow$ PostgreSQL $\rightarrow$ Mobile UI.
* **Mô hình hóa CSDL Quan hệ (Prisma ORM):** Thiết kế 9 models trong [`prisma/schema.prisma`](../../../prisma/schema.prisma) phục vụ lưu trữ template tờ khai, tọa độ hình học, kịch bản hướng dẫn, FAQ và voice cache.
* **Hạ tầng & Cấu hình Môi trường:** Đồng bộ hóa biến môi trường `.env`, thiết lập container CSDL PostgreSQL, quy chuẩn hóa git branching và review code.

---

## 2. BẢNG THEO DÕI CÁC BƯỚC & BÁO CÁO KỸ THUẬT CỦA TECH LEAD

| Bước | Hạng mục công việc | Chi tiết & Kết quả cốt lõi | Trạng thái | Ghi chú & Báo cáo |
| :---: | :--- | :--- | :---: | :--- |
| **01** | **Thiết kế Kiến trúc Hệ thống** | Hoàn thành sơ đồ Mermaid 3 tầng, quy định cơ chế Session RAM và pipeline xử lý tuần tự. | ✅ Hoàn thành | Tham chiếu [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| **02** | **Thiết kế CSDL & Khởi tạo Prisma** | Xây dựng 9 models quan hệ, ánh xạ quan hệ 1-1, 1-nhiều, cờ kiểm duyệt và migration ban đầu. | ✅ Hoàn thành | File [`prisma/schema.prisma`](../../../prisma/schema.prisma) |
| **03** | **Đồng bộ Môi trường & Lệnh Postinstall** | Sửa script `postinstall` sang `prisma generate`, đồng bộ `.env` giữa các thành viên. | ✅ Hoàn thành | Commit `2d1a0e2`, `11fb383` |
| **04** | **Phê duyệt Pull Requests (PR Review)** | Rà soát và merge PR #2 (SSML Marks) và PR #3 (SHA-256 Cache) của Người 4 vào `main`. | ⏳ Đang duyệt | Theo dõi tại GitHub PR #2 & PR #3 |
| **05** | **Đấu nối API Backend với CSDL** | Nối endpoint `POST /api/llm/prompt` vào hàm ghi dữ liệu `prisma.formWorkflow.create()`. | 🚀 Đang triển khai | Sprint 2 |

---

## 3. CÁC TÀI LIỆU QUAN TRỌNG LIÊN QUAN ĐẾN TECH LEAD

* **Sơ đồ Kiến trúc Cốt lõi:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)
* **Kế hoạch Phân công & Lộ trình Sprint:** [`docs/WORKFLOW-PIPELINE.md`](../../WORKFLOW-PIPELINE.md)
* **Tài liệu Yêu cầu Sản phẩm (PRD):** [`docs/PRD.md`](../../PRD.md)
* **Trạng thái Sprint:** `_bmad-output/implementation-artifacts/sprint-status.yaml`
