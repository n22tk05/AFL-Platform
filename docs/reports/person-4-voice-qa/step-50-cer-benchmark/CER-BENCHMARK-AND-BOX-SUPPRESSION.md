# Chặng 50 — Đánh giá Định lượng CER / Word Accuracy & Triệt tiêu Trùng lặp Hộp văn bản (NMS)

> **Nhánh thực hiện:** `feat/ocr-region-and-admin-workflow`  
> **Ngày:** 11/10/2026  
> **Người thực hiện:** Person 4 (Voice & OCR QA Lead)  
> **Mục tiêu:** Đo lường định lượng CER/WER trên Ground Truth độc lập; stress test phát hiện và triệt tiêu lỗi phân đoạn sinh hộp trùng lặp (duplicate overlapping bounding boxes).

---

## 1. PHÁT HIỆN QUA STRESS TEST (VẤN ĐỀ CỐT LÕI)

Trong quá trình stress test đối chiếu toàn văn OCR thực tế với bộ Ground Truth độc lập trên phôi **Đơn đề nghị cấp giấy phép hoạt động xây dựng (Trang 59)** và **Tờ khai hỗ trợ chi phí mai táng (Trang 7)**:

1. **Hiện tượng hộp trùng lặp (Overlapping Nested Boxes):**
   - Thuật toán `segment_document_lines` sau khi chạy `split_multiline_region` trên các cụm dòng lớn đã để lọt các hộp con bị bao trùm (ví dụ: các mảnh chữ nhỏ do OpenCV tìm thấy độc lập như `án.`, `tại`, `báo cho ông (bà).`, `có địa chỉ tại việt nam`).
   - Các mảnh này có độ bao phủ trùng lặp (overlap ratio) từ 66% đến 100% so với hộp dòng đầy đủ bên cạnh.
2. **Hậu quả:**
   - Cả hộp dòng lớn và các hộp con vụn đều bị đẩy vào VietOCR để nhận diện, dẫn đến văn bản OCR xuất hiện các dòng lặp lại liên tiếp.
   - Khi tính khoảng cách Levenshtein (Edit Distance), các dòng lặp gây lỗi chèn (insertions), làm tăng vọt CER (từ 2.61% lên 5.80%) và WER (từ 2.91% lên 6.54%).

---

## 2. GIẢI PHÁP THUẬT TOÁN ĐÃ TRIỂN KHAI

Đã bổ sung module triệt tiêu hộp trùng lặp `suppress_overlapping_boxes` tại `services/vietocr-service/text_layout.py` và tích hợp vào pipeline `services/vietocr-service/app.py`:

```python
def suppress_overlapping_boxes(boxes, overlap_threshold=0.6):
    """
    Triệt tiêu các bounding box con bị bao trùm >= 60% bởi một box lớn hơn,
    loại bỏ hiện tượng gửi lặp các đoạn text con vào VietOCR.
    """
    if len(boxes) <= 1:
        return boxes
    sorted_boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    kept = []
    for rect in sorted_boxes:
        x1, y1, w1, h1 = rect
        area1 = max(w1 * h1, 1)
        is_redundant = False
        for kx, ky, kw, kh in kept:
            ix1 = max(x1, kx)
            iy1 = max(y1, ky)
            ix2 = min(x1 + w1, kx + kw)
            iy2 = min(y1 + h1, ky + kh)
            if ix2 > ix1 and iy2 > iy1:
                inter_area = (ix2 - ix1) * (iy2 - iy1)
                if inter_area / area1 >= overlap_threshold:
                    is_redundant = True
                    break
        if not is_redundant:
            kept.append(rect)
    return kept
```

- Bổ sung unit test `test_suppress_overlapping_boxes_removes_nested_redundant_boxes` trong `services/vietocr-service/tests/test_text_layout.py` (38/38 tests Python PASS).

---

## 3. KẾT QUẢ ĐO LƯỜNG ĐỊNH LƯỢNG (EVIDENCE GATE)

Script đánh giá tự động: `scripts/evaluate-all-text-benchmarks.ts` chạy trên VietOCR Microservice đang hoạt động:

| Biểu mẫu kiểm thử | Số dòng | Thời gian OCR | CER (Lỗi ký tự) | WER (Lỗi từ ngữ) | Đánh giá |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Hải Phòng - Hỗ trợ mai táng (Trang 7)** | 52 | 8.286 ms | **1.00%** (12/1200) | **2.16%** (6/278) | Xuất sắc, toàn văn chuẩn xác |
| **Bộ Xây dựng - Đơn cấp phép (Trang 59)** | 39 | 8.615 ms | **2.61%** (31/1188) | **2.91%** (8/275) | Giảm hơn 50% lỗi sau khi khử trùng lặp |
| **Phụ lục CP - Giấy ủy quyền (Trang 61)** | 24 | 4.009 ms | **6.98%** (36/516) | **8.94%** (11/123) | Đầy đủ chữ, chênh lệch do thứ tự 2 cột |

### Phân tích lỗi còn lại:
1. **Lỗi ký tự in hoa đậm:** Dấu hỏi và dấu ngã trên chữ Ô in hoa (`HỖ TRỢ` $\rightarrow$ `HỒ TRỢ`).
2. **Thứ tự đọc 2 cột (Two-column Reading Order):** Trên Giấy ủy quyền, phần `Lưu: VT, đơn vị...` ở góc trái dưới cùng và phần `THAY MẶT (HOẶC THỪA ỦY QUYỀN)...` ở góc phải nằm so le nhẹ theo trục Y. Sắp xếp hình học thuần túy (`geometric-sort.ts`) đọc theo dòng ngang dẫn đến việc đọc khối ký tên xen kẽ trước dòng lưu cuối cùng.
3. **Ký tự số lọt vào dòng chấm:** Dãy chấm `Số: .../...` bị nhận thành `Số:..1...`.

---

## 4. TỒN ĐỌNG BỘC LỘ & MỤC TIÊU CHO CHẶNG 51

Stress test Chặng 50 đã bộc lộ 3 vấn đề cấu trúc cần giải quyết tại **Chặng 51**:
1. **Chưa phân định vai trò vùng (Region Roles):** Các dòng văn bản trích xuất được hiện mới dừng ở mức text block, chưa được gán vai trò rõ ràng giữa:
   - `static_text` (Quốc hiệu, tiêu ngữ, căn cứ pháp lý, nơi nhận, dòng lưu).
   - `label` (Nhãn trường: Họ và tên, Chức vụ, Số điện thoại).
   - `description` (Ghi chú dưới dòng: "(Kèm theo đơn này)", "(Ký, ghi rõ họ tên)").
   - `input` (Ô nhập liệu, khoảng trống viết tay, dòng kẻ chấm).
   - `checkbox` (Hộp kiểm đơn).
2. **Cơ chế Ambiguity Guard:** Cần bảo đảm bất kỳ vùng văn bản nào không chắc chắn 100% vai trò đều phải gán cờ `needs_review: true` để Admin đối soát, không để AI suy diễn bừa bãi.
3. **Kiểm tra hồi quy toàn diện:** TypeScript typecheck (0 lỗi), Test recognition (92/92 PASS), Test voice (19/19 PASS), Test local QA/API (PASS).
