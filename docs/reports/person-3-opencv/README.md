# BẢNG THEO DÕI TIẾN ĐỘ & DANH MỤC BÁO CÁO KỸ THUẬT
## NGƯỜI 3: NGUYỄN THẾ ANH (ALGORITHM & OPENCV SPECIALIST)

> **Vai trò:** Phụ trách Phân hệ Thị giác Máy tính (FR-1, FR-7), Nhận diện 4 góc phôi giấy tờ khai, Nắn phối cảnh (Perspective Transform), Bóc tách Tọa độ ô hình học (Bounding Boxes), Quét chứng từ tiên quyết (FR-6) và Xuất toàn văn OCR Markdown.  
> **Thư viện chính:** OpenCV.js (WebAssembly / WASM), Google Document AI, Google Gemini.  
> **Trạng thái hiện tại:** 💎 **100% Hoàn thành — 84/84 Unit Tests Pass — Sẵn sàng Nghiệm thu & Mở Pull Request**.

---

## 1. TỔNG QUAN CÁC ĐẦU VIỆC & MỤC TIÊU PHỤ TRÁCH

Người 3 chịu trách nhiệm tầng xử lý thị giác máy tính cục bộ tại trình duyệt của công dân:

* **Bảo vệ Quyền riêng tư (Nghị định 13/2023/NĐ-CP):** 100% việc xử lý ảnh camera và nắn phối cảnh được thực hiện bằng WebAssembly (WASM) trực tiếp trên trình duyệt, không gửi ảnh chụp giấy tờ lên server.
* **Nắn Phối Cảnh (Perspective Transform - FR-1):** Tìm 4 góc của tờ khai hành chính giấy đặt trên mặt bàn, nắn thẳng góc chụp xiên thành ảnh phẳng góc nhìn từ trên xuống ($90^\circ$).
* **Chuẩn hóa Tọa độ Hình học (FR-7):** Xuất ra mảng tọa độ chuẩn hóa tỷ lệ $[0.0 - 1.0]$ gồm `[ymin, xmin, ymax, xmax]` để các thiết bị màn hình khác nhau đều hiển thị viền highlight chính xác.
* **Quét Chứng Từ Tiên Quyết (FR-6):** Bóc tách thông tin từ Biên bản xử phạt vi phạm giao thông / Sổ đỏ, bảo mật lưu trữ tạm trong Session RAM và tự động bơm vào chữ mẫu đỏ `#D32F2F` trên Mobile Guide.
* **Xuất Toàn Văn OCR Markdown:** Trích xuất toàn văn bản và nhận diện cấu trúc đề mục heading bằng Gemini, hỗ trợ download file `.md` 1-click.

---

## 2. BẢNG THEO DÕI CÁC BƯỚC & BÁO CÁO KỸ THUẬT CHI TIẾT

| Bước | Báo cáo kỹ thuật chi tiết | Nội dung trọng tâm | Trạng thái | Tài liệu bàn giao |
| :---: | :--- | :--- | :---: | :--- |
| **01** | **Tích hợp OpenCV WASM & Hợp đồng Tọa độ** | • Nạp module WebAssembly an toàn trên Next.js 14 không xung đột SSR<br>• Chuẩn hóa hệ tọa độ Normalized Box $[0.0 - 1.0]$<br>• Xuất dữ liệu giả lập mẫu `mock-manifest.json` | 💎 Hoàn tất | [`step-01-wasm-contracts/OPENCV-WASM-CONTRACTS-REPORT.md`](step-01-wasm-contracts/OPENCV-WASM-CONTRACTS-REPORT.md) |
| **02** | **Thuật toán Nắn Góc Xiên (FR-1) & Bóc Khung Ô (FR-7)** | • Cổng kiểm soát chất lượng ảnh (Blur & Glare Guard)<br>• Sắp xếp 4 góc bất biến TL/TR/BR/BL<br>• Phép biến đổi hình thái học (Morphological Ops) quét đường kẻ<br>• Bộ lọc trùng lặp IoU (41/41 unit tests pass) | 💎 Hoàn tất | [`step-02-deskew-and-boxes/DESKEW-AND-BOUNDING-BOXES-REPORT.md`](step-02-deskew-and-boxes/DESKEW-AND-BOUNDING-BOXES-REPORT.md) |
| **03** | **Quét Chứng Từ Tiên Quyết (FR-6) & Session RAM** | • Pipeline OCR bóc tách Biên bản vi phạm giao thông<br>• Bảo mật Session RAM tự hủy sau 15 phút (Nghị định 13/2023/NĐ-CP)<br>• Đấu nối P2P tự động bơm dữ liệu vào chữ mẫu đỏ `#D32F2F` trên `/guide` (43/43 unit tests pass) | 💎 Hoàn tất | [`step-03-prerequisite-ocr-session/PREREQUISITE-OCR-SESSION-REPORT.md`](step-03-prerequisite-ocr-session/PREREQUISITE-OCR-SESSION-REPORT.md) |
| **04** | **Phân Hệ Xuất Toàn Văn OCR Ra Markdown** | • Bóc tách toàn văn bản bằng Google Document AI<br>• Gemini phân tích cấu trúc tiêu đề (Strict Grounding không bịa đặt chữ)<br>• Endpoint `POST /api/documents/markdown` & Tải file `.md` trực tiếp trên `/scan-document` | 💎 Hoàn tất | [`step-04-markdown-export/MARKDOWN-EXPORT-REPORT.md`](step-04-markdown-export/MARKDOWN-EXPORT-REPORT.md) |

---

## 3. CHỈ SỐ KIỂM ĐỊNH CHẤT LƯỢNG (TEST SUITE METRICS)

- **OpenCV Unit Tests:** `41/41 PASS` (`npm run test:opencv`)
- **Document Extraction Unit Tests:** `43/43 PASS` (`npx tsx --test src/modules/documents/tests/*.test.ts`)
- **Tổng số tests thuộc sở hữu Người 3:** `84/84 PASS (100%)`
- **Độ trễ xử lý WASM Client-side:** $\le 95\text{ms}$ (Đạt tiêu chuẩn PRD $\le 100\text{ms}$)
- **Tuân thủ Quyền riêng tư:** 100% tuân thủ Nghị định 13/2023/NĐ-CP (Zero Citizen PII trên Server/DB)

---

## 4. TÀI LIỆU QUY CHIẾU & ĐẤU NỐI LIÊN THÀNH VIÊN

* **Dữ liệu Đầu ra Chuẩn:** [`assets/mock-data/mock-manifest.json`](../../../assets/mock-data/mock-manifest.json)
* **Ma trận Đấu nối với Phân hệ Voice AI (Người 4):** [`docs/reports/person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md`](../person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md)
* **Kế hoạch Tác chiến Toàn nhóm:** [`docs/WORKFLOW-PIPELINE.md`](../../WORKFLOW-PIPELINE.md)
* **Bảng Dashboard Tổng quan Dự án:** [`docs/reports/README.md`](../README.md)
