# SỔ TAY PHÒNG NGỪA RỦI RO & CÁC KỊCH BẢN XẤU (PRE-MORTEM PLAYBOOK)
## Dự án AFL - Nền tảng Hỗ trợ Điền Biểu mẫu cho Người cao tuổi
**Thời gian lập:** 18/09/2026  
**Mục đích:** Nhận diện trước 8 nguy cơ tiềm ẩn có thể làm đổ vỡ dự án và kích hoạt sẵn phương án phòng thủ (Vaccine).

---

## 1. BẪY NĂNG LỰC CÁ NHÂN (INDIVIDUAL TRAPS)

### 💥 Rủi Ro 1: Người 3 bị "sa lầy" vào cấu hình OpenCV WebAssembly (WASM)
* **Kịch bản:** Người 3 viết Python chạy trên máy cá nhân tốt, nhưng khi tích hợp vào Next.js/WASM thì bị dính lỗi: *file `opencv.wasm` nặng 10MB không tải nổi, lỗi tương thích SSR (Server-Side Rendering), hoặc tràn bộ nhớ RAM khi xử lý ảnh 4K*.
* **Hậu quả:** Mất 2-3 ngày chỉ để fix cấu hình môi trường mà chưa viết được dòng giải thuật nào.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Ở Pha 0, **Người 1 (Tech Lead) cài sẵn thư viện `@techstark/opencv-js` và chạy thử thành công 1 script mẫu trong Next.js**.
  * Đưa cho Người 3 một hàm đã load sẵn OpenCV, Người 3 chỉ việc viết thuật toán bên trong hàm đó, cấm tự ý cấu hình build WASM từ đầu.

---

### 💥 Rủi Ro 2: Người 4 làm "cháy Quota API" hoặc dính lỗi "JSON Ảo Giác"
* **Kịch bản:**
  1. Người 4 viết vòng lặp gọi Gemini hoặc test liên tục trong lúc code $\rightarrow$ Cháy sạch quota free, tài khoản bị rate-limit 429 hoặc khóa thẻ tín dụng.
  2. Gemini thỉnh thoảng trả về text bọc trong ````json ... ```` hoặc sinh thiếu dấu ngoặc $\rightarrow$ Hàm `JSON.parse` lăn đùng ra chết sập cả app.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Cài đặt **Mock Cache cục bộ**: Người 4 gọi API thành công 1 lần thì lưu ngay kết quả vào file `gemini-cache.json`. Các lần test sau chỉ đọc từ cache ra, không gọi API thật liên tục.
  * Ép Gemini dùng tính năng **Structured Outputs (`response_schema` với JSON Schema)** của Google SDK để đảm bảo 100% không bao giờ sinh sai cú pháp JSON.

---

### 💥 Rủi Ro 3: Người 2 bị "Ru ngủ bởi Mock Data" $\rightarrow$ Vỡ giao diện khi nhận Data thật
* **Kịch bản:** Người 2 bật Mock Switcher code giao diện cực đẹp vì data giả lập chỉ có 3 ô ngắn gọn. Đến Ngày 6 khi nhận data thật: có ô tên dài 50 chữ (*"Ủy ban nhân dân Phường..."*), có ô bị rỗng, có ô tọa độ nằm sát mép màn hình $\rightarrow$ Chữ nhảy đè lên nhau, vỡ layout.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Trong file `mock-workflow.json` ở Pha 0, đã cố tình cài sẵn các ca khó (Bước 3 địa chỉ dài, Bước 9 số tiền lớn).
  * Ép Người 2 phải xử lý tràn chữ (`text-overflow: ellipsis`, `break-words` hoặc tự co font) ngay từ Pha 1.

---

## 2. THẢM HỌA KHỚP NỐI NGÀY 5-6 (INTEGRATION COLLAPSE)

### 💥 Rủi Ro 4: "Bất Đồng Hệ Tọa Độ" (Coordinate System Mismatch)
* **Kịch bản:** 
  * Người 3 tính tọa độ theo pixel ảnh gốc ($3000 \times 4000$ px).
  * Người 2 vẽ Canvas theo pixel màn hình điện thoại ($390 \times 844$ px).
  * Khi ráp vào: Vòng tròn phát sáng nhảy tít ra ngoài màn hình!
* 🛡️ **Vaccine Phòng Ngừa:**
  * Bắt buộc dùng **Normalized Coordinates `[0.0 - 1.0]`** (chia cho chiều rộng/dài ảnh). Khi Người 2 render lên bất kỳ màn hình to nhỏ nào chỉ cần nhân tỷ lệ phần trăm là chính xác 100%.

---

### 💥 Rủi Ro 5: "Loạn Thứ Tự Điền Ô" (Sorting Chaos)
* **Kịch bản:** Thuật toán OpenCV phát hiện được 20 ô, nhưng trong mảng trả về: ô Dòng 5 nhảy lên trước ô Dòng 1 (do thứ tự quét contour). Gemini sinh kịch bản bảo người già: *"Bác điền ô Tổng tiền trước, rồi mới điền Họ tên sau"*.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Người 3 bắt buộc phải có bước **Sắp xếp hình học (Geometric Sort)**: Sắp xếp các ô từ trên xuống dưới (`ymin` tăng dần), từ trái qua phải (`xmin` tăng dần) trước khi bàn giao cho Người 4.

---

## 3. CÚ SỐC MÔI TRƯỜNG THỰC TẾ TẠI QUẦY TIẾP DÂN

### 💥 Rủi Ro 6: Bàn viết Một cửa quá ồn $\rightarrow$ Voice Q&A bị điếc
* **Kịch bản:** Tiếng loa gọi số thứ tự, tiếng người nói chuyện ồn ào khiến Web Speech STT trên điện thoại thu toàn tạp âm, nhận diện sai câu hỏi.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Luôn có **Fallback thị giác**: Bổ sung 2-3 nút gợi ý câu hỏi phổ biến ngay trên màn hình (*"Viết chữ in hoa hay thường?"*, *"Lấy diện tích ở đâu trên Sổ đỏ?"*). Cụ già bấm nút là có câu trả lời ngay không cần nói.

---

### 💥 Rủi Ro 7: Ảnh chụp bị bóng đầu đổ xuống hoặc tay che mất góc
* **Kịch bản:** Cụ già cúi đầu chụp ảnh, bóng đầu đổ đen sì lên tờ giấy trắng, hoặc ngón tay cái che mất một góc tờ khai $\rightarrow$ OpenCV không tìm thấy đường kẻ.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Khung ngắm Camera đổi viền đỏ và cất giọng nhắc nhở: *"Bác nghiêng điện thoại một chút để không bị sấp bóng nhé!"* nếu độ sáng trung bình dưới ngưỡng an toàn.

---

### 💥 Rủi Ro 8: Điện thoại giá rẻ của người già bị giật lag Canvas
* **Kịch bản:** Người 2 test trên máy tính mượt 60fps, nhưng người cao tuổi dùng điện thoại cũ giá rẻ (Vsmart, Samsung A cũ). Hiệu ứng nhấp nháy Canvas chạy liên tục làm máy nóng ran và giật lag 10fps.
* 🛡️ **Vaccine Phòng Ngừa:**
  * Dùng **CSS Animation (`@keyframes pulse`) thuần túy trên thẻ `<div>` phủ lên ảnh**, không dùng `requestAnimationFrame` trên Canvas nặng nề. CSS Animation được phần cứng GPU điện thoại tối ưu mượt mà.
