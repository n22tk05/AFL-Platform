# Step 78 — Remove redundant header rows from upload review

## Mục tiêu

Tiếp tục giảm số vùng nhiễu cần admin xem ở bước `/admin/upload`, nhưng chỉ tự loại khi có bằng chứng hình học độc lập; giữ nguyên mọi vùng không thỏa điều kiện.

## Thay đổi

- Nhận diện các `field_row` rất mảnh và rộng chỉ khi chúng phủ lên ít nhất hai đường `underline` đã được ghép thành cặp trang trí.
- Nhận diện gạch dưới ngắn, căn giữa và nằm sát dưới một tiêu đề/motto OCR đã phân loại là văn bản tĩnh; dòng nhập dưới nhãn thông thường không bị loại.
- Đánh dấu vùng dư với lý do `REDUNDANT_ROW_OVER_PAIRED_RULE`; không đưa nó vào danh sách trường chờ gắn nhãn.
- Không áp dụng cho hàng độc lập, đường chấm, ô nhập hoặc vùng không có cặp đường trang trí trùng hình học.
- Thêm test tổng hợp dương/âm và assertion browser trên mẫu P43 để khóa hành vi.

## Kết quả mẫu upload

| Mẫu | Phát hiện / nhãn / cần review | Benchmark có ground truth | Kết quả liên quan |
| --- | --- | --- | --- |
| HCMC Funeral P43 | 30 / 19 / 22 ở baseline; hiện 28 / 19 / 12 | Chưa có truth đầy đủ cho mọi trường và tọa độ | Hai candidate tiêu đề `candidate_001` và gạch dưới motto `candidate_011` chuyển sang vùng trang trí; actor scope vẫn giữ |
| HCMC Funeral P89 | 30 / 21 / 13 | Chưa có truth đầy đủ | Không hồi quy trong upload browser |
| HCMC Guardianship P49 | 33 / 23 / 13 | Chưa có truth đầy đủ | Hai nhóm người không bị gộp; trường scope chưa chắc chắn vẫn cần review |
| HCMC Marriage P20 | 29 / 29 / 13 | 29 TP, 0 FP, 0 FN; 29 nhãn chính xác, 15/15 continuation | Không hồi quy; 9 trường grouping chính xác |
| HCMC Birth P70 | 29 / 29 / 21 | 29 TP, 0 FP, 0 FN; 24 nhãn chính xác | Không hồi quy; còn sai lệch nhãn và nhiều mục ưu tiên review |

P43 giảm 10 mục `needsReview` so với baseline lưu ở bước 77, trong đó hai mục nhiễu vùng tiêu đề vừa được xác minh trực quan và bằng browser regression. Đây là proxy đếm trường/vùng, không phải đo thời gian admin. P49 và P89 không có ground truth đủ để kết luận recall/precision hoặc sai số tọa độ.

## Kiểm thử

- Recognition/manifest/multipage/assets: **121/121 passed**.
- OpenCV: **57/57 passed**.
- TypeScript: `npm run typecheck` passed; production `npm run build` passed.
- Browser upload holdouts: **5/5 passed** trên P20, P70, P89, P43 và P49; P43 chạy lại với assertion cho cả hai vùng trang trí: passed.
- Các bài kiểm thử chỉ đọc ảnh local, chặn asset/admin prompt writes; không ghi DB và không gọi Gemini.
- Build còn các cảnh báo lint có sẵn về `<img>` và dependency `useMemo`; không liên quan thay đổi nhận diện này.

## Giới hạn và việc còn lại

- Mục tiêu giảm tải tổng thể chưa được nghiệm thu: cần đo thời gian review và số chỉnh sửa trước/sau với admin trên tập biểu mẫu đa dạng.
- P43 còn 12 mục ưu tiên review, gồm nhiều `MISSING_LABEL`/OCR thấp-confidence bên trong nội dung; hai vùng tiêu đề đầu trang đã loại. Cần ground truth độc lập cho toàn bộ nhãn, input type, vùng tọa độ và continuation; không suy ra precision/recall từ summary.
- P70 còn 5 nhãn không exact và 21 mục ưu tiên review; cần phân loại lỗi và cải thiện bằng quy tắc có truth, không nới điều kiện auto-suggestion tùy tiện.
- Cần kiểm tra trang chụp camera (`camera-photo`) với ảnh thật và các trường hợp xoay/méo/viền yếu; holdout hiện tại chủ yếu là clean scan.
- Vẫn bắt buộc admin xác nhận trước khi lưu hoặc phê duyệt; chưa tự xuất bản biểu mẫu.
