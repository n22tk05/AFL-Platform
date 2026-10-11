# Chặng 47 — Ưu tiên OCR → JSON → Gemini và tọa độ ô

Ngày 11/10/2026, nhánh `codex/form-recognition-and-multiline`. Đây là báo cáo tiến độ local; chưa nghiệm thu trên dữ liệu sản xuất.

## Mục tiêu đã thu hẹp theo quyết định của người dùng

1. Trích xuất **văn bản trên phôi trống chính xác**, giữ thứ tự đọc và xuất xứ theo trang/dòng hoặc block trong JSON có thể kiểm tra được.
2. Đưa JSON văn bản đã đối soát, cùng các ô logic và loại ô cần thiết, vào ngữ cảnh Gemini để sinh kịch bản hướng dẫn; đầu ra vẫn phải khớp đúng một bước cho mỗi ô và chờ admin duyệt.
3. Xác định **tọa độ tương đối đủ chính xác** của vùng nhập, ô tích và các vùng nhiều dòng để admin dễ đối soát/sửa những trường hợp khó. Tọa độ chuẩn hóa `[ymin, xmin, ymax, xmax]` phải gắn đúng trang và không do Gemini tự tạo.
4. Không đặt mục tiêu nhận diện hết mọi nhãn ô. Nhãn suy đoán và loại ô chỉ là gợi ý; trường hợp mơ hồ giữ `needs_review`, không tự công bố. Đo nhãn khớp chính xác như chỉ số chẩn đoán, **không** coi là điều kiện hoàn thành chính.

Thứ tự ưu tiên tiếp theo: kiểm chứng chất lượng text OCR bằng ground truth độc lập và CER/word accuracy; thiết kế JSON ngữ cảnh OCR có giới hạn kích thước, provenance và kiểm tra schema; kiểm chứng chính JSON đó thực sự được gửi tới Gemini; rồi đo precision/recall và sai số tọa độ trên nhiều nguồn ảnh độc lập. Không tiếp tục thêm heuristic chỉ để tăng số nhãn khớp chính xác nếu không cải thiện ba mục tiêu trên.

## Kiểm tra hợp đồng hiện tại

- `/api/documents/json` trả `DocumentJsonExport` chứa `rawText`, `lines`, `blocks`, cấu trúc và cảnh báo. FE giữ các kết quả này trong `ocrPages` để admin xem.
- `assembleFormManifest`/`assembleMultipageReviewDraft` hiện chuyển kết quả OCR thành `FormGeometricManifest` với `boxes` và nhãn `rawText` cạnh ô; **không mang theo toàn văn OCR có thứ tự/provenance**.
- `POST /api/llm/prompt` hiện nhận manifest tối đa 256 KiB. `GeminiPromptService` gửi tới model `formTitle`, `formCode`, căn cứ, phòng ban và `boxes`, không gửi `ocrPages.rawText`, `lines` hoặc `blocks`. Vì vậy ngữ cảnh ở phần văn bản tĩnh, lời mô tả, hướng dẫn, tiêu đề mục có thể mất; không được tuyên bố luồng OCR JSON → Gemini đã hoàn chỉnh.
- Hiện `validateManifest` yêu cầu `rawText` không rỗng cho từng box ở thời điểm xác nhận. Đây là cổng admin đối soát, không phải bằng chứng máy đã nhận diện mọi nhãn. Bất kỳ thay đổi hợp đồng nào sau này phải giữ giới hạn request, chống prompt injection từ OCR và không đưa dữ liệu công dân vào phôi.

## Phôi ủy quyền — blind baseline và lượt phát triển

Ảnh kiểm chứng là trang 61 của phụ lục Chính phủ, một phôi “Giấy ủy quyền” cùng PDF nguồn với trang xây dựng đã dùng trước. Ground truth 20 vùng dấu chấm được ghi **trước** khi chạy pipeline. Đây là trang khác nhưng **không phải holdout nguồn độc lập**.

| Chỉ số, IoU ≥ 0,5 | Blind baseline đã khóa | Lượt phát triển sau sửa |
| --- | ---: | ---: |
| TP / FN / FP | 10 / 10 / 4 | **20 / 0 / 0** |
| Tổng trường phát hiện | 14 | **20** |
| Nhãn khớp chính xác | 1/20 | 9/20 |
| Trường cần admin đối soát | 14 | **20** |

Sửa cục bộ: nhận diện `Số:` và ngày ở cùng hàng hành chính, ghép các đoạn guide của một trường nhiều dòng khi đã có nhãn gốc, nhận diện chỗ trống ngày trong câu “Quyết định”, loại gạch trang trí và dòng lưu hồ sơ. Một quy tắc ghép guide đầu tiên quá rộng đã làm hồi quy F19-p5; test browser phát hiện và quy tắc đã được thu hẹp. Chỉ số **20/20** là kết quả trên trang phát triển này, không ước lượng độ chính xác tổng quát. Chất lượng OCR toàn văn và chất lượng kịch bản Gemini chưa được đo ở chặng này.

Ảnh local ignored: `private-documents/recognition-evaluation/central-authorization-p61.png`; SHA-256 `8A4CAC053E4DEF2AA321ED9BBE16111110D15068415B9292A87ED61B0D692087`. Ground truth `tests/fixtures/recognition-authorization-p61-ground-truth.json`; SHA-256 `2EE164E6FAF08C543BFAD8424A80A06A57C9802E9D6B57821BE6AC544739126D`. Blind baseline `private-documents/recognition-evaluation/CENTRAL-AUTHORIZATION-P61.blind-baseline.benchmark.json`; SHA-256 `48E08C6414B7D8C0F95A9240B1272A880A62E8703D44BEC9ADB9A670B3ECD1CC`. Không ghi đè baseline.

## Kiểm chứng và giới hạn

- Browser opt-in trên ảnh thật **19/19 PASS**, có F19/F20/F14, CT01/F05, Quảng Trị, khai sinh, kết hôn, xây dựng, ủy quyền và đường admin/citizen. Test chặn ghi asset/model; không dùng cloud, DB hoặc audio cache thật.
- Unit recognition **90/90**, Voice **19/19**, Python OCR **36/36**; TypeScript và build PASS. Build còn cảnh báo `<img>` không chặn trong `FormUploadModal.tsx`.
- Lượt build và Next dev dùng chung `.next`; nếu app local báo thiếu chunk/HTTP 500 sau build thì cần kiểm tra log và khởi động lại dev server trước khi test giao diện. Không coi lỗi hạ tầng đó là lỗi OCR.
- Chưa có CER/word accuracy trên ground truth văn bản độc lập, chưa có kiểm thử hợp đồng toàn văn OCR → Gemini và chưa có nghiệm thu staging admin → `ACTIVE` → citizen/Voice trên DB/RLS thử nghiệm. Mục tiêu tổng thể còn mở.

## Chặng kế tiếp

1. Chọn phôi độc lập khác nguồn/kiểu scan, chép ground truth văn bản trước khi chạy, đo CER, thứ tự đọc, số đoạn mất/sinh thêm; kiểm tra vùng blank không bị OCR bịa chữ.
2. Thiết kế JSON ngữ cảnh OCR theo trang gồm text có giới hạn, thứ tự đọc và provenance; kiểm tra schema/byte limit; cho admin xem/đối soát; test fake Gemini xác nhận đúng JSON vào prompt. Không gửi dữ liệu công dân hay ảnh chứa PII vào model.
3. Kiểm chứng tọa độ/loại ô trên holdout độc lập bằng TP/FP/FN, IoU và sai số tâm/biên, đặc biệt vùng nhiều dòng/ô tích. Giữ quyền sửa thủ công và mọi suy đoán ở `needs_review`.
4. Sau khi hợp đồng dữ liệu ổn định, kiểm thử staging riêng cho luồng lưu, duyệt, công bố, FE đọc/Voice và quyền DB; không dùng DB sản xuất làm bộ test tự động.
