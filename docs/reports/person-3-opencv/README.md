# BẢNG THEO DÕI TIẾN ĐỘ & DANH MỤC BÁO CÁO KỸ THUẬT
## NGƯỜI 3: NGUYỄN THẾ ANH (ALGORITHM & OPENCV SPECIALIST)

> **Vai trò:** Phụ trách Phân hệ Thị giác Máy tính (FR-1, FR-7), Nhận diện 4 góc phôi giấy tờ khai, Nắn phối cảnh (Perspective Transform) và Bóc tách Tọa độ ô hình học (Bounding Boxes).  
> **Thư viện chính:** OpenCV.js (WebAssembly / WASM).  
> **Trạng thái hiện tại:** 🟢 **Đã hoàn thành chuẩn hóa Mock Manifest & Đang tối ưu hóa WASM Client-side**.

---

## 1. TỔNG QUAN CÁC ĐẦU VIỆC & MỤC TIÊU PHỤ TRÁCH

Người 3 chịu trách nhiệm tầng xử lý thị giác máy tính cục bộ tại trình duyệt của công dân:

* **Bảo vệ Quyền riêng tư (Nghị định 13/2023/NĐ-CP):** 100% việc xử lý ảnh camera và nắn phối cảnh được thực hiện bằng WebAssembly (WASM) trực tiếp trên trình duyệt, không gửi ảnh chụp giấy tờ lên server.
* **Nắn Phối Cảnh (Perspective Transform):** Tìm 4 góc của tờ khai hành chính giấy đặt trên mặt bàn, nắn thẳng góc chụp xiên thành ảnh phẳng góc nhìn từ trên xuống ($90^\circ$).
* **Chuẩn hóa Tọa độ Hình học:** Xuất ra mảng tọa độ chuẩn hóa tỷ lệ $[0.0 - 1.0]$ gồm `[ymin, xmin, ymax, xmax]` để các thiết bị màn hình khác nhau đều hiển thị viền highlight chính xác.
* **Cung cấp Hợp đồng Dữ liệu `FormGeometricManifest`:** Xuất file kết quả cho Voice AI (Người 4) và Frontend (Người 2).

---

## 2. BẢNG THEO DÕI CÁC BƯỚC & BÁO CÁO KỸ THUẬT CỦA OPENCV

| Bước | Hạng mục công việc | Chi tiết & Kết quả cốt lõi | Trạng thái | Ghi chú & Tài liệu liên quan |
| :---: | :--- | :--- | :---: | :--- |
| **01** | **Xây dựng Hợp đồng Tọa độ (Contracts)** | Thống nhất cấu trúc `FormGeometricManifest` và `FormGeometricBox` trong `src/shared/contracts.ts`. | ✅ Hoàn thành | Tham chiếu [`docs/MOCK-DATA.md`](../../MOCK-DATA.md) |
| **02** | **Tạo File Dữ liệu Mẫu (Mock Manifest)** | Bóc tách mẫu 9 ô của tờ khai LPTB (01/LPTB) thành `assets/mock-data/mock-manifest.json`. | ✅ Hoàn thành | Đã bàn giao cho Người 4 & Người 2 |
| **03** | **Tích hợp Thư viện `@techstark/opencv-js`** | Cài đặt và cấu hình nạp module WebAssembly an toàn trên Next.js 14 mà không bị xung đột SSR. | ✅ Hoàn thành | Dependencies trong `package.json` |
| **04** | **Thuật toán Tìm 4 Góc & Perspective Transform** | Dùng Canny Edge Detection + `findContours` + `approxPolyDP` để nhận diện góc tờ giấy. | 🚀 Đang tinh chỉnh | Thử nghiệm thực tế quầy Một cửa |
| **05** | **Đấu nối Pipeline Trực tiếp với Voice AI** | Gửi manifest thời gian thực từ OpenCV WASM sang `geminiPromptService.generateWorkflow()`. | ⏳ Kế hoạch Sprint 2 | Xem ma trận tại [`person-4-voice-qa/step-02-handoff-integration`](../person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md#23-người-3---algorithm-specialist-nguyễn-thế-anh) |

---

## 3. TÀI LIỆU HỖ TRỢ DÀNH RIÊNG CHO THÀNH VIÊN OPENCV

* **Cấu trúc Dữ liệu Đầu ra Chuẩn:** [`assets/mock-data/mock-manifest.json`](../../../assets/mock-data/mock-manifest.json)
* **Ma trận Đấu nối với Phân hệ Voice AI:** [`docs/reports/person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md`](../person-4-voice-qa/step-02-handoff-integration/HANDOFF-INTEGRATION-VOICE-QA.md)
* **Kế hoạch Tác chiến Toàn nhóm:** [`docs/WORKFLOW-PIPELINE.md`](../../WORKFLOW-PIPELINE.md)
