# Rà soát độ ổn định và kế hoạch tối ưu OpenCV WASM

Ngày kiểm tra: **30/09/2026**. Commit được kiểm tra: **3c51a7e**.

Phạm vi: khảo sát (Spike), chạy kiểm thử và lập kế hoạch theo AGENTS.md; chưa triển khai thay đổi thuật toán. Bao gồm loader, nhận diện giấy, nắn phối cảnh, tiền xử lý, nhận diện đường/ô, sắp xếp, camera mobile, upload Admin và chuẩn bị ảnh OCR/Markdown.

## Kết luận

Lõi hình học và luồng `/scan-document` chạy ổn định trong các ca đã kiểm tra. Có kiểm soát hình học, giới hạn kích thước đầu ra và giải phóng Mat trong lõi. Tuy nhiên, **chưa đủ cơ sở xác nhận toàn bộ chức năng OpenCV WASM đã ổn định để nghiệm thu**: camera có vòng lặp mở stream, thứ tự ô sai khi có khung bao, checkbox nhỏ bị bỏ sót, và Admin vẫn đưa tọa độ giả hoặc danh sách bị cắt vào workflow.

Lịch sử Git cho thấy thay đổi gần nhất bên trong `src/modules/opencv/` là `abb5af8`, ngày 23/09/2026. Những commit sau đó mở rộng tích hợp và tài liệu, chưa thay đổi lõi thuật toán. Các kiểm thử hiện tại đạt như báo cáo trước, nhưng không có phép đo trước/sau trên cùng ảnh và thiết bị để khẳng định độ ổn định hoặc tốc độ đã tăng.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả | Phạm vi bằng chứng |
| --- | --- | --- |
| `npm run test:opencv` | **41/41 đạt** | Logic hình học, cấu hình, lọc và sắp xếp trên dữ liệu test; không chạy WASM xử lý ảnh thật |
| `npm exec -- tsx --test src/modules/documents/tests/*.test.ts` | **43/43 đạt** | Hợp đồng, OCR/validation, phiên RAM, chất lượng ảnh tổng hợp; kiểm tra ownership Mat dùng runtime giả |
| `npm exec -- playwright test --config playwright.documents.config.ts` | **4/4 đạt**, 55,9 giây cả suite | WASM thật trên Chrome: scan, review, đổi/xóa ảnh, ba lượt camera; chặn mờ/lóa/không có giấy. API OCR được giả lập |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **Không đạt: 6 lỗi** | Sai chữ hoa/thường của trạng thái workflow; không phải lỗi bên trong lõi OpenCV |
| Audit bổ sung trên `/opencv-test` và `/scan` | **21 lượt pipeline và một phép đo camera** | Chrome 154.0.8037.58, Windows x64, Next.js dev; ảnh tổng hợp và ba trang biểu mẫu sẵn trong repo |

Kiểm thử cần tiến trình con và Chrome được chạy ngoài sandbox sau khi sandbox báo `spawn EPERM`. Lỗi môi trường ban đầu không được tính là lỗi thuật toán.

Script tái hiện: [scripts/audit-opencv.mjs](../../../../scripts/audit-opencv.mjs). Bản lưu số liệu và tọa độ chứng minh lỗi thứ tự: [audit-evidence.json](audit-evidence.json). Kết quả thô của lượt này: `test-results/opencv-audit.json` (thư mục bị Git ignore). Script chặn `/api/**`, dùng camera giả, không gọi OCR/Gemini thật.

### Kết quả bổ sung

| Ca | Kết quả |
| --- | --- |
| Scan tổng hợp 1200 × 1600, 10 ô lớn + 3 checkbox 24 × 24 | Cả **10 lượt** tìm cùng **10 ô lớn**; **0/3 checkbox** được giữ lại. Đối chiếu ô theo IoU ≥ 0,5 |
| Cùng ảnh có khung bao bảng | Tìm 11 vùng; thứ tự bắt đầu ở hàng `y=421`, rồi mới tới hàng `y=201`; nhiều hàng ở `x=101` được đưa trước nhóm `x=601` |
| 5 lượt camera tổng hợp xoay 2° | Cùng tứ giác và cùng 10 candidates; không lỗi JavaScript |
| Camera tổng hợp xoay 5° | Nắn và tìm được 10 candidates |
| Ảnh trống ở camera mode | Từ chối vì không thấy đủ bốn góc, đúng kỳ vọng |
| `01-lptb/page-1.jpg`, `page-2.jpg`, `khai-sinh-lai/page-1.jpg` | Lần lượt **1 / 16 / 0 candidates**; chưa có ground truth nên không suy ra độ chính xác |
| Mở camera giả trên `/scan`, quan sát khoảng 2 giây | **29 lần `getUserMedia`**, 18 lần dừng track trước đóng; 27 lần dừng sau đóng và chờ 300 ms |

Đo tốc độ pipeline debug, bao gồm runtime loading và kết xuất canvas:

- Lượt scan tổng hợp đầu: **5498,6 ms**, trong đó loader **5025,7 ms**.
- Chín lượt tiếp theo: **346,3–519,2 ms**; trung vị **362,5 ms**, P95 thực nghiệm **519,2 ms**. Chín mẫu chưa đủ ước lượng P95 ngoài thực tế.
- Stage lines trên chín lượt này: **240,8–261,5 ms**; binary: **66,9–87,1 ms**.
- Năm lượt camera: **182,9–483,1 ms**. Ba trang có sẵn: **74,4 / 71,0 / 203,0 ms**.

`lineDetectionTimeMs` gộp OpenCV với ba lần `imshow`; các stage khác cũng có render. Đây là bằng chứng pipeline còn tốn thời gian, **chưa xác định riêng chi phí morphology**. Số trên không đại diện cho điện thoại, production hay tốc độ riêng phép nắn. Chưa xác minh được tuyên bố lịch sử “≤95 ms cho nắn và trích xuất” trên toàn bộ tập ca.

## Vấn đề và hướng xử lý

### P0 — Camera liên tục mở và dừng stream

Bằng chứng: [CameraScannerModal.tsx](../../../../src/components/mobile/CameraScannerModal.tsx), dòng 35–95; phép đo 29 lần mở ở trên.

`startCamera` cập nhật state `stream`; `stopCamera` phụ thuộc state này; effect phụ thuộc `stopCamera`. Mỗi lần đổi stream làm effect cleanup và chạy lại, mở stream mới. `handleRetake` còn gọi `startCamera` trong khi effect cũng khởi động camera.

Sửa bằng ref quản lý quyền sở hữu stream, dependencies ổn định, một yêu cầu mở đang chờ; bỏ kết quả mở muộn sau khi đóng; dừng tracks khi retake/đóng/unmount. Chặn chụp khi video chưa sẵn sàng hoặc đang xử lý. Nghiệm thu: một stream hoạt động mỗi lần mở, cleanup đúng cả Strict Mode; 20 vòng mở/đóng/retake không còn stream sau đóng và không cập nhật kết quả muộn.

### P0 — Admin đưa ô giả và bỏ ô thật vào workflow

Bằng chứng: [FormUploadModal.tsx](../../../../src/components/admin/FormUploadModal.tsx), dòng 126–189.

- Luôn dùng `clean-scan`, nhưng thông báo đã nắn −0,8° tới 0° được viết cố định trước khi chạy. Ảnh camera nghiêng không được nắn trong nhánh này.
- Không có candidates thì tự tạo tọa độ mẫu rồi gửi LLM. Đây là lỗi dữ liệu tích hợp, độc lập với độ ổn định WASM.
- Workflow chỉ lấy `candidates.slice(0, 8)`; overlay chỉ hiển thị 12 ô. Trang có 16 candidates đã tái hiện sẽ mất ít nhất tám candidates ở bước lập manifest hiện tại.
- `rawText` là “Ô kê khai số …”, chưa phải nhãn đọc từ ảnh. Gemini chưa có bằng chứng ngữ nghĩa thực tế để biết tên trường.

Sửa bằng lựa chọn nguồn ảnh rõ ràng, trạng thái detect/warp thật; không có ô thì chuyển review/vẽ tay; giữ đủ ô hợp lệ hoặc báo giới hạn hợp đồng 200 ô; lấy nhãn OCR nếu tính năng cần đọc nhãn. Chuẩn hóa tọa độ bằng `pipelineResult.width/height` của đúng ảnh đã nắn. Nghiệm thu: không có tọa độ mẫu trong manifest production, không mất ô do `slice`, ảnh review và tọa độ khớp nhau, biểu mẫu hơn tám ô giữ đủ field sau review.

### P1 — Khung bao làm sai thứ tự đọc

Bằng chứng: [geometric-sort.ts](../../../../src/modules/opencv/geometric-sort.ts), `belongsInRow`/`addToRow`; [box-filter.ts](../../../../src/modules/opencv/box-filter.ts); fixture `synthetic-nested`.

Bộ lọc giữ bảng cha và ô con. `belongsInRow` dùng vùng bao của hàng đang mở; candidate rất cao làm vùng hàng lan qua nhiều hàng, từ đó đảo thứ tự điền. Tách vai trò container/cell từ hierarchy và bằng chứng đường kẻ; gom hàng từ cells; xử lý ô gộp theo cấu trúc bảng. Container debug không trở thành field cần điền. Nghiệm thu trên bảng cha, bảng lồng, ô gộp; thứ tự ổn định khi đảo thứ tự contours, không mất ô con hợp lệ.

### P1 — Checkbox nhỏ bị mất ở nhánh lọc đường

Bằng chứng: [config.ts](../../../../src/modules/opencv/config.ts), [line-detector.ts](../../../../src/modules/opencv/line-detector.ts); fixture 24 × 24 chỉ giữ 10/13 vùng.

Kernel mặc định trên ảnh 1200 × 1600 dài 40 pixel theo ngang và 53 pixel theo dọc. Đây là nguyên nhân phù hợp với việc các cạnh checkbox 24 pixel bị mất sau opening; cần xác nhận riêng mask trước/sau khi sửa. Contour chỉ chạy trên combined line mask nên thiếu nhánh bổ sung.

Thử nhánh checkbox trên binary trước lọc đường dài; kiểm tra cạnh gần vuông và đủ bốn cạnh để tránh nhận ký tự thành checkbox; hợp nhất bằng khử trùng. Thử vài chiều dài kernel theo độ phân giải cho bảng có ô ngắn. Không giảm toàn bộ kernel khi chưa đo false positives. Nghiệm thu: đủ 3/3 checkbox fixture; đo precision/recall checkbox riêng trên dữ liệu gán nhãn.

### P1 — OCR chạy cả pipeline debug không cần thiết

Bằng chứng: [prepare-image.ts](../../../../src/modules/documents/prepare-image.ts), dòng 13–29; [debug-pipeline.ts](../../../../src/modules/opencv/debug-pipeline.ts), dòng 119–148.

OCR/Markdown tạo chín canvas, threshold, tìm đường, contour và overlay, rồi chỉ dùng deskewed. Nhánh debug chuyển grayscale riêng và `preprocessToBinary` chuyển lần nữa. Gate mờ/lóa chạy sau toàn bộ bóc ô.

Tách API chuẩn bị ảnh khỏi API bóc ô và renderer. OCR chỉ decode → detect/warp nếu camera → quality gate → encode. Admin mới chạy thêm đường/ô. Đo core/render/encode/load riêng. Nghiệm thu: cùng geometry/quality trên fixture cũ; OCR không tạo line masks/candidates/overlay; đo trước/sau cùng thiết bị, không suy diễn mức tăng tốc chỉ từ số bước bị bỏ.

### P1 — Camera che lỗi quality gate và có nhánh không giải phóng output

Bằng chứng: [CameraScannerModal.tsx](../../../../src/components/mobile/CameraScannerModal.tsx), dòng 145–178.

Detect ném `DocumentDetectionError` khi từ chối giấy; camera bắt mọi lỗi rồi trả ảnh gốc với thông báo thành công. Nhánh `else` đọc rejection reasons không được dùng cho lần detect bị từ chối. Camera chưa gọi gate mờ/lóa của OCR. Output Mat chỉ `delete` sau `imshow` và `toDataURL`: nếu một bước ném lỗi, output không được giải phóng dù source được dọn.

Xử lý riêng lỗi giấy/quality/runtime; yêu cầu chụp lại hoặc cho chọn rõ dùng ảnh chưa nắn nếu sản phẩm cho phép. Bao output/canvas tạm trong `finally`; chia sẻ quality gate với cấu hình phù hợp. Nghiệm thu bằng lỗi render/encode/detect/timeout và ảnh blur/glare, không còn output Mat và không thông báo đã nắn khi detect từ chối.

### P2 — Upload, ảnh review, loader và threshold

- Admin quảng cáo PDF ở dòng 421 nhưng decode bằng `new Image`, chưa có rasterizer. Giới hạn JPEG/PNG hoặc triển khai từng trang PDF với quota.
- Admin tạo object URL mà không cleanup khi đổi file/unmount; workflow lưu `blob:` URL vào localStorage ở dòng 284/294. URL này không phải tham chiếu ảnh bền vững cho reload/phiên mới. Thiết kế lưu ảnh nháp và TTL phù hợp.
- Loader đã có timeout, singleton và retry; thiếu test init cũ hoàn tất muộn sau timeout và nhiều nơi gọi đồng thời. Bổ sung trước khi thay cách tải.
- `opencv.js` cài trong máy khoảng **13,30 MB trước nén**, không đồng nghĩa kích thước tải mạng. Đo tải production, cold/warm cache và mạng chậm trước quyết định preload/build tùy biến.
- Gate ảnh, Canny 50/150, adaptive block 31, closing 3 và divisors 30 là giá trị khởi đầu. Chưa có bộ ảnh camera gán nhãn để hiệu chỉnh và đánh giá false rejection.

### Gate toàn dự án: 6 lỗi TypeScript

Ba lỗi `pending_review` ở `gemini-prompt.service.ts` (72, 154, 187); hai lỗi trạng thái ở `adversarial-qa-stress-test.ts` (42, 126); một lỗi ở `api-integrity.test.ts` (85). Hợp đồng hiện dùng `PENDING_REVIEW`, `DRAFT`, `ACTIVE`, `ARCHIVED`. Cần thống nhất trước khi dùng gate toàn dự án làm điều kiện phát hành. 84 unit tests đạt không đồng nghĩa toàn dự án biên dịch đạt.

## Kế hoạch thực hiện

Ước lượng cho một người triển khai chính, có frontend hỗ trợ; thu thập dữ liệu/thiết bị có thể kéo dài lịch. Các mốc và ngưỡng dưới đây là đề xuất, chưa phải kết quả đã đạt.

| Giai đoạn | Dự kiến | Công việc | Điều kiện hoàn tất |
| --- | --- | --- | --- |
| **1. Sửa tính đúng đắn** | 1–2 ngày | Camera lifecycle/cleanup/quality; bỏ tọa độ mẫu và cắt tám ô; nguồn ảnh, frame tọa độ; trạng thái TypeScript | Hết P0; camera mở/đóng/retake đạt; không mất ô do adapter; typecheck đạt |
| **2. Tách xử lý và đo tốc độ** | 2–3 ngày | Tách prepare/geometry/fields/render; bỏ bóc ô ở OCR; tái sử dụng grayscale; đo decode/load/core/render/quality/encode | Baseline production theo stage; cùng kết quả fixture; 41 + 43 unit tests và 4 browser tests đạt |
| **3. Cải thiện ô và hàng** | 3–5 ngày | Tách container/cell; sửa row grouping; nhánh checkbox; kernel nhiều mức, closing theo trục; fixture bảng lồng/ô gộp | Sửa lỗi fixture; precision/recall và thứ tự tốt hơn trên tập validation độc lập |
| **4. Kiểm định thiết bị/runtime** | 2–3 ngày sau khi có dữ liệu | Worker nếu UI bị chặn; loader timeout/retry/cache; benchmark và 50 vòng xử lý | Không crash/stream sau đóng; allocations Mat ổn định; UI phản hồi; báo cáo theo thiết bị |

Thứ tự: sửa dữ liệu sai và vòng đời tài nguyên → tách pipeline/đo baseline → cải thiện nhận diện → kiểm định thiết bị. Khi chuyển sang triển khai bounded/architectural, thực hiện `dely:delivery` theo AGENTS.md. Báo cáo này là đầu vào, không phải delivery run đã hoàn tất.

### Thử nghiệm thuật toán sau baseline

1. **Giấy:** thử Canny theo thống kê cường độ/cạnh hoặc threshold bổ sung khi viền yếu; giới hạn số candidates kiểm tra tứ giác. Đo chọn nhầm bảng/khung màn hình và sai góc; thêm corner refinement khi có lợi trên ảnh thật.
2. **Ánh sáng:** so sánh hiện tại với background normalization/CLAHE trên ảnh có bóng; đo nét chữ, ô và false positives. Adaptive threshold đã có; không coi nó là khôi phục chữ mất do lóa.
3. **Đường/checkbox:** nhánh đa tỉ lệ có giới hạn số lần; closing theo từng trục để nối nét mà không gộp hai ô gần nhau. Opening là erosion rồi dilation, kernel quyết định foreground được giữ, theo [OpenCV](https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html). Chọn kernel cụ thể ở đây là giả thuyết cần benchmark.
4. **Lọc/sort:** xử lý hierarchy trước gom hàng; khử trùng theo vùng lân cận nếu profiler chứng minh lợi ích. Chưa cần thay O(n²) bằng index phức tạp: contour stage hiện nhỏ hơn lines nhiều lần trên fixture sạch.
5. **Worker:** chuyển core ra worker để giảm chặn UI; loader hiện từ chối môi trường không có `window`, coordinator phụ thuộc HTMLCanvasElement nên cần tách adapter trước. Worker có global riêng và không thao tác DOM trực tiếp theo [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Không bảo đảm compute tự nhanh hơn; tính cả truyền ảnh và bộ nhớ.
6. **Bộ nhớ:** giữ ownership/finally; failure injection và đo lặp runtime thật. `Mat.delete()` là yêu cầu của [OpenCV.js](https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html). WASM heap đạt đỉnh rồi giữ dung lượng không tự chứng minh leak; đo allocations còn sống hoặc khả năng tái sử dụng heap.

### Bộ đo và tiêu chí nghiệm thu

- Khoảng **100–200 ảnh gán nhãn**: scan/camera, xoay/phối cảnh, nền ít tương phản, bóng/mờ/lóa, checkbox, bảng lồng/ô gộp. Giữ ảnh thật đã được đồng ý sử dụng ngoài Git; fixture tổng hợp cố định trong test. Chia tuning/validation/test theo biểu mẫu hoặc phiên chụp, cố định test trước tinh chỉnh.
- Giấy: tỷ lệ detect đúng/từ chối nhầm/chấp nhận sai, sai số góc theo kích thước trang, orientation. Camera hiện chỉ kiểm tra xoay/affine; bổ sung phối cảnh thật, xoay 90°/180°, nền cùng màu, giấy mất góc.
- Ô: precision/recall/F1 tại IoU ≥ 0,5, tách checkbox/table cell; đúng thứ tự hàng. Không dùng số candidates hoặc heuristic confidence thay độ chính xác thực nghiệm.
- Tốc độ: P50/P95, ít nhất 30 lượt warm mỗi cấu hình; ghi độ phân giải/số ô/browser/thiết bị/production/cold-warm. Tách core/render/load. Mục tiêu đầu tiên: giảm **ít nhất 30%** thời gian warm OCR trên cùng fixture/thiết bị mà không giảm chất lượng; chỉ xét PRD ≤100 ms sau khi xác định stage và độ phân giải.
- Tài nguyên: 50 vòng xử lý và mở/đóng camera; không stream sau đóng, allocations Mat không tăng, không kết quả cũ ghi đè ảnh mới. Thiết bị tối thiểu: desktop Chrome, Android tầm trung, Safari iPhone.
- Chất lượng: sửa 3/3 checkbox và thứ tự bảng của fixture; đo trên test độc lập trước xác nhận PRD ≥98%.
- Hồi quy: test hiện có và ca mới cho lỗi đã tái hiện; typecheck/build đạt. Test mặc định giả lập OCR; OCR thật đánh giá riêng khi có dữ liệu/cấu hình provider.

## Chạy lại

Khởi động app ở terminal riêng:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Chạy khảo sát:

```powershell
npm run test:opencv
npm exec -- tsx --test src/modules/documents/tests/*.test.ts
npm exec -- playwright test --config playwright.documents.config.ts
node scripts/audit-opencv.mjs http://127.0.0.1:3100 test-results/opencv-audit.json
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Không benchmark đồng thời nhiều tiến trình khi cần so tốc độ. Script xuất JSON quan sát, không phải gate đạt/trượt của chất lượng production.
