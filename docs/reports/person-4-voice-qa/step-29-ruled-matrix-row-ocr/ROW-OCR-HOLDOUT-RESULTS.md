# Chặng 29 — Đọc OCR theo ô nhãn của lưới bảng

Ngày 10/10/2026. Nhánh `codex/form-recognition-and-multiline`. Thử trên phôi trắng F05 hai trang, đối chiếu ảnh `F05-p2.png`/`F05-p3.png` local. Không gọi cloud, không ghi DB hoặc lưu asset. Ảnh và JSON kết quả trong `private-documents/recognition-evaluation/` là dữ liệu ignored.

## Thay đổi kỹ thuật

- VietOCR nhận dạng hình học một lưới có cột STT hẹp, cột mô tả rộng và hai cột lựa chọn tương đương. Chỉ khi có năm vách dọc dài, nhiều đường hàng ngang và tỷ lệ cột phù hợp, nó cắt riêng cột STT/mô tả theo hàng rồi phân đoạn chữ trong từng ô. Các vùng OCR cũ chỉ bị thay khi crop mới thật sự tìm được dòng chữ; bảng hình học khác vẫn đi theo đường xử lý cũ.
- Đầu trang nối có thể được OCR thành block STT `3.4` và block mô tả riêng. Bộ ghép manifest dùng cả hai block, nhưng vẫn đòi khung bảng và bằng chứng ô Có/Không; hai ô suy ra vẫn `OPEN_TOP_ROW_INFERRED` và `needs_review`.
- Fixture `recognition-f05-row-labels.json` chép 33 nhãn từ ảnh. Browser benchmark tính số nhãn khớp tuyệt đối và CER của toàn nhãn (NFC, giữ dấu và dấu câu), bên cạnh số hàng và IoU. Đây là phép đo trên **một biểu mẫu scan**, không thay thế benchmark nhiều loại form.

## Kết quả F05

| Phép đo | Trang p2 | Trang p3 |
| --- | ---: | ---: |
| Ô Có/Không khớp hình học (IoU≥0,5), không dư | 36/36 | 30/30 |
| Ô có nhãn, vẫn cần duyệt | 36/36 | 30/30 |
| Số thứ tự hàng đúng tuyệt đối | 18/18 | 15/15 |
| Toàn nhãn khớp bản chép chuẩn | 14/18 | 10/15 |
| CER toàn nhãn | 4,55% | 16,24% |

So với chặng 28, số thứ tự từ **26/33 lên 33/33**. Không có CER cũ để tuyên bố phần trăm cải thiện toàn văn. Sáu hàng có CER riêng >15%: p2 hàng `1.4`, `2.5`; p3 hàng `4.3`, `4.5`, `5.1`, `5.2`. Một số dòng dài vẫn bị mất hoặc VietOCR đọc sai dù số hàng đã đúng. **24/33 nhãn đúng hoàn toàn không đủ để phê duyệt tự động**; cán bộ phải đối chiếu từng nhãn, nhất là các hàng trên. Tất cả 66 ô F05 tiếp tục `needs_review`; không được coi độ tin cậy model là độ chính xác đã hiệu chuẩn.

## Kiểm chứng

- `npm run test:recognition`: 56/56 PASS; VietOCR Python: 29/29 PASS; `npm run typecheck`, `npm run build`: PASS. Build còn cảnh báo `<img>` đã biết tại màn admin.
- Browser local F19-p5, F20-p1, F20-p2, F14-p5, CT01 hai trang, F05 hai trang: 6/6 PASS. Sau build khởi động lại Next dev và browser mặc định: 4/4 PASS. `git diff --check` không thấy lỗi whitespace.
- Test thực tế F05 giữ 36+30 ô, trang 2 vẫn có đúng hai ô hàng đầu suy ra và cảnh báo admin. Lưới CT01 không bị nhận nhầm là mẫu năm vách của bộ OCR mới.

## Việc còn lại

1. Cải thiện phân đoạn nhiều dòng sát nhau trong một ô; p3 hàng `4.3`, `5.1`, `5.2` còn thiếu nội dung dài. Đo CER trên **holdout scan khác** trước khi thay thuật toán tiếp.
2. Chú giải/đo precision–recall cho nhãn, static, checkbox, ô nhập trên nhiều biểu mẫu; đánh giá ảnh mờ, lệch, bảng khác số cột. Không hạ `needs_review` chỉ từ F05.
3. Kiểm thử staging luồng workflow `ACTIVE` với API/FE/Voice, quyền DB và asset; giữ chặn phê duyệt nếu nhãn/vùng chưa được cán bộ xác nhận.
