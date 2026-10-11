# Chặng 33 — Header bảng cao, nhiều tầng và nhãn cột con

Ngày 10/10/2026, nhánh `codex/form-recognition-and-multiline`. Tiếp tục từ checkpoint chặng 32. Mẫu 09-HSB là **tập phát triển/hồi quy**, không còn là holdout độc lập. PDF/PNG và JSON đối soát nằm trong `private-documents/recognition-evaluation/` (ignored). Browser test chặn ghi asset, gọi Gemini và không dùng dữ liệu công dân hoặc database thật.

## Thay đổi

- `ruled_header_cells` nhận khoảng header cao đến một phần tư chiều cao trang khi có khung bảng và ít nhất ba ô chứa chữ. Vách dọc phải bắt đầu gần mép trên header, nên đường watermark chạy xuyên trang không trở thành cột giả.
- Nếu có đường chia ngang và vách con chỉ bắt đầu từ hàng thứ hai, OCR cắt riêng nhãn cha và các nhãn con. Trên 09-HSB, header từ y=631 đến 824 px cho ra 10 crop có giới hạn ô, gồm `Ngày, tháng, năm sinh`, `Nam` và `Nữ`; chữ giữa các cột không bị OCR ghép vào cùng crop.
- Kịch bản ô bảng kết hợp nhãn cha với nhãn con khi ô dữ liệu thẳng hàng với một ô header lồng bên dưới. Một header hình học bị OpenCV gắn `isContainer` vẫn được xét là ô header nếu nhỏ và không bao nhiều ô con đáng kể; các glyph nhỏ bên trong không được dùng làm header thay thế.
- Test tổng hợp kiểm tra header cao, vách con và watermark, cùng hai hàng dữ liệu có nhãn `Nam`/`Nữ` và một header dạng container với glyph giả. Không gắn trạng thái tự duyệt: ô bảng vẫn `needs_review`.

## Đo trên 09-HSB

| Chỉ số | Trước chặng 33 | Sau chặng 33 |
| --- | ---: | ---: |
| Ô bảng khớp chú giải hình học (IoU ≥ 0,5) | 24/24 | **24/24** |
| Ô bảng có nhãn không rỗng | 21/24 | **24/24** |
| Nhãn khớp nguyên văn chuỗi kỳ vọng | 0/24 | **6/24** |
| Tổng field / cần review | 33 / 33 | **33 / 33** |
| IoU trung bình / thấp nhất | 0,927 / 0,901 | **0,927 / 0,901** |

Sáu nhãn đúng nguyên văn là các ô `Ngày, tháng, năm sinh — Nam/Nữ` ở ba hàng. Các nhãn khác có thể chứa phần nghĩa đúng nhưng còn lỗi dấu/chữ, số chú dẫn hoặc đoạn giải thích dài; **6/24 không phải độ chính xác ngữ nghĩa**. Không tự động xuất bản hay phát Voice từ bản OCR chưa được cán bộ duyệt. Mẫu ANTT-01 giữ 5 field có nhãn, 0 checkbox giả, vẫn thiếu một cụm ngày/tháng gần chữ ký.

## Kiểm chứng

- Python VietOCR: **35/35**; `npm run test:recognition`: **62/62**; `npm run typecheck`: PASS.
- Browser đầy đủ khi bật `RECOGNITION_RESEARCH_BLANKS=1` và `RECOGNITION_INDEPENDENT_BLANKS=1`: **15/15**. Bao gồm CT01 hai trang, F05 và cả hai mẫu Quảng Trị. Không ghi asset hoặc gọi Gemini trong các ca mẫu thật.
- `npm run build` và `git diff --check`: PASS. Build chỉ có cảnh báo `<img>` đã biết tại `FormUploadModal.tsx`.

## Chưa hoàn tất

1. Lấy **phôi trắng mới, chưa dùng để chỉnh quy tắc**, chú giải thủ công từng field và đo TP/FP/FN, IoU, CER/nhãn theo tập độc lập. Không dùng lại 09-HSB để tuyên bố nghiệm thu.
2. Cải thiện OCR header dài, chữ dọc và cụm ngày gần chữ ký bằng bằng chứng từ tập mới; tránh sửa chuỗi theo riêng 09-HSB. Giữ review cho nhãn OCR còn sai hoặc không đầy đủ.
3. Trên staging tách biệt, kiểm thử admin duyệt → workflow ACTIVE → citizen FE/Voice và quyền DB/RLS; đợt này không đụng DB thật. Kiểm tra người dùng đọc đúng từng bước sau khi cán bộ sửa các nhãn OCR lỗi.
