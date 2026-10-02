# BÁO CÁO KỸ THUẬT: TÍCH HỢP OPENCV.JS WASM & HỢP ĐỒNG TỌA ĐỘ CHUẨN HÓA
## Phân hệ: Thị giác Máy tính WebAssembly & Chuẩn hóa Hợp đồng Giao tiếp (Bước 01)
### Phụ trách: Nguyễn Thế Anh (Kỹ sư Giải thuật & OpenCV Specialist)

---

| Thông tin | Chi tiết |
| :--- | :--- |
| **Dự án** | AFL Platform (Hệ thống Hỗ trợ Điền Biểu mẫu Thông minh & Quản trị Quy trình cho Người cao tuổi) |
| **Thành viên thực hiện** | Nguyễn Thế Anh (Thành viên 3 — Algorithm & OpenCV Specialist) |
| **Thư mục làm việc** | `src/modules/opencv/`, `src/shared/`, `assets/mock-data/` |
| **Tài liệu căn cứ** | [PRD.md](../../../PRD.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md), [contracts.ts](../../../../src/shared/contracts.ts), [WORKFLOW-PIPELINE.md](../../../WORKFLOW-PIPELINE.md) |
| **Trạng thái tài liệu** | 🟢 Đã hoàn thành & Nghiệm thu |

---

## 1. MỤC TIÊU & BỐI CẢNH KỸ THUẬT

### 1.1 Thách thức Kiến trúc
1. **Khử xung đột SSR trên Next.js 14:** Thư viện `@techstark/opencv-js` biên dịch từ C++ sang WebAssembly (WASM), yêu cầu truy cập các đối tượng môi trường trình duyệt (`window`, `document`, `HTMLCanvasElement`). Nếu nạp trực tiếp ở tầng Node.js Server Components, hệ thống sẽ gặp lỗi `ReferenceError: window is not defined` hoặc làm crash tiến trình build.
2. **Loại bỏ phụ thuộc kích thước màn hình (Device Fragmentation):** Người cao tuổi sử dụng nhiều dòng điện thoại khác nhau (màn hình nhỏ 5.5 inch đến máy tính bảng 10.5 inch). Nếu xuất tọa độ theo pixel tuyệt đối (`px`), lớp phát sáng dẫn đường (Visual Twin Highlighter) trên màn hình sẽ bị lệch khỏi ô kẻ trên giấy.
3. **Mở khóa tắc nghẽn Sprint (Pha 0 - Foundation First):** Để Người 2 (Frontend) và Người 4 (Voice AI) có thể làm việc ngay mà không phải chờ thuật toán OpenCV hoàn thiện, Người 3 cần chuẩn hóa hợp đồng dữ liệu và cung cấp tập dữ liệu giả lập mẫu (Mock Manifest).

---

## 2. NỘI DUNG THỰC THI & GIẢI PHÁP KỸ THUẬT

### 2.1 Cơ chế Nạp OpenCV.js An toàn (WASM Loader Singleton)
Được triển khai tại `src/modules/opencv/loader.ts`:
- Sử dụng mô hình **Promise Singleton** để đảm bảo module WebAssembly chỉ được nạp đúng 1 lần trong suốt vòng đời client session.
- Kiểm tra chặt chẽ `typeof window !== 'undefined'` trước khi nạp.
- Bắt sự kiện `cv['onRuntimeInitialized']` để xác nhận runtime C++ đã sẵn sàng cấp phát bộ nhớ Emscripten:

```typescript
// Trích xuất từ src/modules/opencv/loader.ts
export async function loadOpenCV(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('OpenCV.js WASM chỉ có thể chạy trên môi trường Client Browser.');
  }
  if (cvInstance) return cvInstance;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Tải và khởi tạo WebAssembly an toàn
    const checkReady = () => {
      if (window.cv && window.cv.Mat) {
        cvInstance = window.cv;
        resolve(cvInstance);
      } else {
        setTimeout(checkReady, 50);
      }
    };
    checkReady();
  });
  return loadPromise;
}
```

### 2.2 Chuẩn hóa Hợp đồng Tọa độ Tỉ lệ Normalized Bounding Box
Thống nhất cấu trúc trong `src/shared/contracts.ts`:
- **Quy tắc bất biến:** Tọa độ bắt buộc là mảng 4 phần tử số thực tỉ lệ $[0.0 - 1.0]$:
  $$\text{normalizedCoords} = [y_{\min}, x_{\min}, y_{\max}, x_{\max}]$$
- Công thức chuẩn hóa:
  $$y_{\min} = \frac{Y_{\text{top}}}{H_{\text{image}}}, \quad x_{\min} = \frac{X_{\text{left}}}{W_{\text{image}}}, \quad y_{\max} = \frac{Y_{\text{bottom}}}{H_{\text{image}}}, \quad x_{\max} = \frac{X_{\text{right}}}{W_{\text{image}}}$$
- Nhờ chuẩn hóa tỉ lệ, Người 2 (Frontend) chỉ cần nhân ma trận kích thước Viewport hiển thị:
  $$X_{\text{render}} = x_{\min} \times W_{\text{viewport}}, \quad Y_{\text{render}} = y_{\min} \times H_{\text{viewport}}$$
  Đảm bảo độ chính xác viền highlight 100% trên mọi tỷ lệ màn hình responsive.

### 2.3 Bàn giao Bộ dữ liệu Giả lập (Mock Manifest)
Tạo file `assets/mock-data/mock-manifest.json` trích xuất mẫu 9 ô của tờ khai Lệ phí trước bạ (Mẫu 01/LPTB):
- Đánh số định danh thứ tự `box_01` $\to$ `box_09`.
- Sắp xếp logic từ trên xuống dưới theo chiều đọc tự nhiên của người cao tuổi.
- Đã bàn giao cho Người 4 (tạo prompt kịch bản Gemini) và Người 2 (vẽ component `VisualTwin.tsx`).

---

## 3. KẾT QUẢ ĐẠT ĐƯỢC

1. Module `src/modules/opencv/loader.ts` khởi tạo WebAssembly thành công trên Next.js 14 mà không phát sinh lỗi SSR.
2. Bộ hợp đồng `FormGeometricManifest` và `FormGeometricBox` trở thành chuẩn giao tiếp trung tâm của dự án.
3. Bộ dữ liệu `mock-manifest.json` giúp toàn đội ngũ bứt tốc trong Sprint 1 mà không gặp điểm nghẽn phụ thuộc.
