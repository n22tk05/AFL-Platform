# HƯỚNG DẪN SỬ DỤNG BỘ DỮ LIỆU GIẢ LẬP (MOCK DATA) - DỰ ÁN AFL

Thư mục này chứa toàn bộ các "Hợp đồng dữ liệu" và "Dữ liệu mẫu" phục vụ cho **Pha 0 (Walking Skeleton)** để 4 thành viên tác chiến song song độc lập.

---

## DANH MỤC CÁC FILE TRONG THƯ MỤC

| Tên File | Vai Trò & Đối Tượng Sử Dụng | Mục Đích |
| :--- | :--- | :--- |
| **`contracts.ts`** | Dành cho cả 4 thành viên | Định nghĩa TypeScript Interfaces chuẩn. **Quy tắc: Bắt buộc dùng Normalized Coordinates `[0.0 - 1.0]` để không bị lệch màn hình!** |
| **`mock-manifest.json`** | **Đầu ra của Người 3** (OpenCV) & **Đầu vào của Người 4** (Gemini) | Tọa độ bóc tách của 9 ô trên Tờ khai lệ phí trước bạ 01/LPTB đã được nắn thẳng và sắp xếp từ trên xuống dưới. |
| **`mock-workflow.json`** | **Đầu ra của Người 4** (Gemini + TTS) & **Đầu vào của Người 2** (Frontend) | Kịch bản 9 bước hoàn chỉnh gồm: Lời thoại đời thường 0.9x, chữ mẫu đỏ `#D32F2F`, tọa độ viền phát sáng nhấp nháy và nút câu hỏi thường gặp (FAQ fallback). |

---

## 🚀 HƯỚNG DẪN DÀNH RIÊNG CHO TỪNG THÀNH VIÊN

### 1. Dành Cho Người 3 (Thánh Giải Thuật OpenCV WASM):
* **Nhiệm vụ:** Viết thuật toán trong `src/modules/opencv/` sao cho khi đưa ảnh scan tờ khai vào, kết quả xuất ra phải khớp 100% với cấu trúc của file [mock-manifest.json](mock-manifest.json).
* **Lưu ý sống còn:** Tọa độ `normalizedCoords` bắt buộc phải là tỉ lệ phần trăm chia cho chiều dài/rộng ảnh (`ymin, xmin, ymax, xmax` nằm từ `0.0` đến `1.0`), và các ô phải được sắp xếp theo thứ tự đọc từ trên xuống dưới!

### 2. Dành Cho Người 4 (Thánh Prompt Gemini & Audio TTS):
* **Nhiệm vụ:** 
  1. Lấy file [mock-manifest.json](mock-manifest.json) làm dữ liệu đầu vào để viết Prompt cho Gemini 1.5 Flash (Structured JSON Mode).
  2. Ép Gemini sinh ra kết quả có cấu trúc khớp hoàn toàn với [mock-workflow.json](mock-workflow.json).
  3. Gọi Google Cloud TTS Neural2 tạo sẵn các file âm thanh `step_01.mp3`, `step_02.mp3`... với tốc độ 0.9x.

### 3. Dành Cho Người 2 (Thánh Frontend Mobile & Admin UI):
* **Nhiệm vụ:** 
  1. Nạp thẳng file [mock-workflow.json](mock-workflow.json) vào component React (`useMockData = true`).
  2. Render giao diện Mobile cho người già: đọc `highlightCoords` để vẽ viền nhấp nháy pulsing trên ảnh, hiển thị `exampleRedText` to rõ $\ge 18$pt, và gắn nút bấm nghe thử `audioUrl`.
  3. Test các ca khó: Bước 3 có địa chỉ rất dài (kiểm tra xem có bị tràn viền không), Bước 5 có liên kết Sổ đỏ.

### 4. Dành Cho Bạn (Người 1 - Tech Lead):
* Khi tạo Monorepo Next.js, copy file [contracts.ts](contracts.ts) vào `src/shared/contracts.ts` và khóa quyền chỉnh sửa. Mọi thành viên chỉ việc import interface từ file này.
