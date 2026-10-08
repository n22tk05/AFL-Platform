# Kế hoạch triển khai biểu mẫu nhiều trang

## Phạm vi và trạng thái

Không giới hạn thiết kế ở MVP một trang và không dùng localStorage làm kho trang. Đợt hiện tại đã nối luồng ảnh đơn với OpenCV, VietOCR, Gemini, review và citizen; **chưa triển khai nhập nhiều ảnh/PDF hoặc migration đa trang**. Tài liệu này là hợp đồng mục tiêu cho đợt tiếp theo, không phải mô tả API đã tồn tại. Không dùng Dely.

Lý do cần đổi toàn tuyến: Prisma hiện chỉ có một cặp `imageWidth/imageHeight` trên manifest, không lưu trang của box/step. Thêm `pages[]` trên FE đơn thuần sẽ mất thông tin sau khi đọc lại DB hoặc đặt highlight lên trang sai. Việc hardcode `pageNumber = 1` phải được thay cùng repository, validator, prompt và Q&A khi chuyển sang contract v2.

## 1. Hợp đồng mục tiêu

| Đối tượng | Trường và bất biến |
| --- | --- |
| Manifest v2 | `contractVersion: 2`, `formCode`, `revisionId`, `revisionVersion`, `formTitle`, `pages[]`, `boxes[]`. Không có một `imageDimensions` chung cho cả bộ. |
| Trang | `pageId` ổn định, `pageNumber` liên tục từ 1, `width`, `height` của **ảnh đã chuẩn hóa**, `assetHash`, `imageUrl`, `frame: processed-primary`, nguồn và phép biến đổi từ ảnh gốc. |
| Ô | `boxId` duy nhất toàn bộ revision, `pageId`, `normalizedCoords: [ymin,xmin,ymax,xmax]`, `rawText`, `boxType`, `spatialOrder`, `estimatedWidthRatio`; provenance nhãn OCR được giữ riêng với vùng cần viết. |
| Bằng chứng OCR | `pageId`, `sourceBlockIds`, tọa độ nhãn `XYXY`, text, confidence thực hoặc `null`, cảnh báo/phiên bản OCR. Không giả confidence và không lấy bbox nhãn làm bbox nhập liệu. |
| Bước | `stepIndex` liên tục 1-based toàn bộ workflow, `boxId`, `pageId`, `pageNumber`, `label`, `voiceGuidance`, `highlightCoords`, FAQ và audio. Đúng một bước cho mỗi ô được duyệt. |
| Workflow | `contractVersion: 2`, `revisionId`, `version`, `pages[]`, `totalPages`, `totalSteps`, `steps[]`, trạng thái; toàn bộ thuộc cùng một revision. |
| Q&A | `{formCode, revisionId, stepIndex, userQuestion}`; server lấy bước từ revision ACTIVE, không nhận `currentStep`. Revision khác với phiên công dân đang xem phải trả lỗi yêu cầu tải lại, không đổi ngữ cảnh âm thầm. |

Box ID không lấy từ số trang có thể đổi: dùng ID ổn định như `p_<opaque-id>_b_<opaque-id>` trong giới hạn 64 ký tự. Khi kéo đổi thứ tự trang, `pageId/boxId` không đổi; cập nhật `pageNumber/spatialOrder/stepIndex` theo một snapshot mới. Sau phê duyệt, không chỉnh snapshot ACTIVE tại chỗ.

Các ô tên giống nhau ở hai trang vẫn là hai ô độc lập. Tiêu đề lặp lại chỉ là ngữ cảnh, không tự sinh bước. Trang không có ô phải được cán bộ xác nhận là trang tham chiếu, không tự bỏ khỏi bộ mẫu.

## 2. Lưu trữ và migration cần chốt

**Owner: Tech Lead/BE; phối hợp OpenCV, FE và Voice AI & QA.** Đây là đề xuất migration, chưa chạy vào DB.

- `FormRevision`: revision độc lập cho bản nháp và bản ACTIVE, phiên bản, trạng thái, hash toàn manifest, thông tin đối soát. Form giữ con trỏ revision ACTIVE; tạo revision mới thay vì ghi đè bản đã công bố.
- `FormPage`: liên kết revision, `pageId`, thứ tự, hash ảnh, kích thước processed frame, storage key và provenance biến đổi. Ràng buộc duy nhất revision + số trang, revision + pageId.
- Manifest/box/workflow/step liên kết cùng revision; box liên kết trang. Không dùng một kích thước ảnh của trang 1 cho cả bộ. Bảo đảm step tham chiếu box và trang cùng revision.
- API DTO luôn trả trang từ dữ liệu bền vững, không từ state upload trong trình duyệt. Chuẩn hóa image asset, metadata và trạng thái trước khi đổi ACTIVE.
- Ảnh nằm trong private object storage hoặc volume dùng chung được quản lý; DB giữ tham chiếu bất biến. Không public bucket bản nháp. API đọc trang kiểm tra quyền/trạng thái revision trước khi cấp bytes hoặc URL ký ngắn hạn.
- Upload ảnh trước, kiểm tra hash/kích thước rồi transaction manifest + workflow + tham chiếu ảnh + publication/audit. Lỗi DB giữ ảnh staged nhưng không công bố. Có cleanup orphan theo TTL, chỉ xóa asset không được revision tham chiếu.
- Backfill một trang chỉ khi xác minh được ảnh, kích thước và tọa độ. Dữ liệu cũ không có nguồn trang phải được đánh dấu cần đối soát, **không suy đoán rằng mọi bước nằm ở trang 1**.
- Cần migration/rollback trên DB thử nghiệm riêng, ràng buộc FK/index, RLS và kiểm tra quyền service role. Không backfill hoặc thay schema production từ phiên này.

Kho `FormArtifactStore` hiện tại dùng JSON bất biến được trỏ bởi `originalPdfUrl = afl-template-v1:<hash>`, là cầu nối **một trang**, không phải schema đa trang cuối cùng. Migration phải phân biệt tiền tố này với URL PDF cũ, nhập metadata sang revision/page rồi chuyển repository theo feature flag. Không ghi đè URL cũ thành URL giả hoặc công bố asset staged bằng đường dẫn tĩnh.

## 3. Các chặng implementation tiếp theo

Mỗi chặng phải có test đỏ trước khi sửa khi có lỗi có thể tái hiện, test xanh sau sửa, báo cáo file thay đổi + kết quả + giới hạn + phần còn lại. Không gọi cloud hoặc ghi DB thật trong suite mặc định.

| Chặng | Owner | Đầu vào → đầu ra / giao diện | Test bắt buộc và điều kiện hoàn thành |
| --- | --- | --- | --- |
| MP1: contract và adapter | Tech Lead/BE + Voice AI & QA | Manifest/workflow v1 → DTO v2, schema và adapter legacy có bằng chứng trang | 2 trang khác kích thước; page/box ID trùng; trang thiếu; tọa độ không hữu hạn; step trỏ sai trang; không suy đoán dữ liệu legacy thiếu nguồn. Chốt contract trước MP2–MP4. |
| MP2: persistence bền vững | Tech Lead/BE | DTO v2 + assets verified → revision/page/box/workflow đọc lại giống hệt | DB test riêng: atomic rollback, FK/unique, hai cán bộ sửa cùng revision, draft không lộ công khai, mất object storage không ACTIVE/audit. Có kế hoạch backup và rollback. |
| MP3: upload nhiều ảnh | FE admin + BE | Danh sách JPEG/PNG có thứ tự → bundle staged, `revisionId/pageId/assetHash` | Thêm/xóa/đổi trang; tải lại trình duyệt; thiếu một upload; ảnh sai MIME; hủy; giữ thứ tự; thử gửi asset của form khác. State lỗi không thể đi tiếp công bố. |
| MP4: geometry và OCR theo trang | OpenCV/VietOCR + FE admin | Mỗi processed frame → ô nhập + text/provenance riêng của trang | Scan thẳng, ảnh nghiêng, trang ngang/dọc; không ghép nhãn từ trang khác; failed page chỉ retry trang đó; giữ hash/frame và bbox sau retry. Đo sai số bằng bộ phôi có ground truth. |
| MP5: Gemini theo batch | Voice AI + BE | Manifest v2 đã đối soát → đủ bước cho toàn bộ bundle | Batch theo trang hoặc tối đa 40 ô/batch; pin page/box/order/geometry; model đảo thứ tự/thiếu/thừa/trùng ô; một batch lỗi không thành PENDING_REVIEW hoàn chỉnh/ACTIVE; timeout, concurrency và retry idempotent. |
| MP6: review/giọng đa trang | FE admin + Voice AI | Revision pending → màn hình từng trang, mapping đầy đủ và audio theo text | Chọn trang từ dữ liệu thật, không hardcode 1/2; kéo box chỉ trên trang chứa ô; đổi thứ tự trước generation; sửa text bỏ audio cũ; dirty/thiếu trang/thiếu mapping chặn approve. Server phải kiểm tra lại mọi điều kiện. |
| MP7: citizen/QR/Q&A | FE citizen + Voice AI + QA | QR form/revision → bước toàn cục, đúng ảnh/trang và context | Bước cuối trang 1 → đầu trang 2 và quay lại; đổi form cùng box label/index; late Q&A/STT/audio; revision đổi giữa phiên; QR cũ và offline; không fallback sang trang/fixture khác. |
| MP8: nghiệm thu có dữ liệu thật | QA + các owner | Bộ phôi độc lập + DB test + thiết bị + staging cloud → báo cáo định lượng | 2/3/10 trang, bảng xuyên trang, tiêu đề lặp, phụ lục trống/không ô, một trang OCR sai. Đo OCR, box IoU/sai số tâm, tỷ lệ ánh xạ đúng, latency/quota, zoom/screen reader/mic/loa. Chỉ rollout khi đạt ngưỡng được ký xác nhận. |

## 4. API đề xuất (chưa có trong code hiện tại)

| API / kiểu dữ liệu | Đầu vào → đầu ra | Owner và tiêu chí |
| --- | --- | --- |
| `POST /api/admin/forms/[formCode]/revisions` | metadata + idempotency key → draft revision | BE: cùng key không tạo hai revision; không làm đổi ACTIVE hiện tại. |
| `POST /api/admin/forms/[formCode]/revisions/[revisionId]/pages` | một ảnh phôi đã xác nhận + thứ tự → verified page | BE/OpenCV: server xác minh bytes/hash/dimensions; không tin pageId hay dimensions do FE gửi. |
| `PUT .../pages/order` | danh sách pageId đầy đủ + expectedVersion → snapshot thứ tự mới | BE/FE: lỗi thiếu/trùng/ngoại revision trả 400/409, không ghi từng phần. |
| `POST .../manifest` | manifest v2 + expectedVersion + review confirmation → manifest persisted | BE/OpenCV: cùng frame; label evidence riêng; full mapping và quy tắc trang tham chiếu. |
| `POST .../generate` + `GET .../jobs/[jobId]` | manifest hash/revision → job bounded + kết quả hoàn chỉnh | Voice AI/BE: staged partial không được public; hủy/reset không nhận kết quả revision cũ. |
| `GET/PUT .../workflow` và `POST .../approve` | review snapshot + expectedVersion → saved/approved revision | BE/FE: transaction, checked storage, audit danh tính thật; mất một dependency không ACTIVE. |
| `GET /api/forms/[formCode]/workflow?revisionId=...` | form + optional revision → approved snapshot | BE: chỉ trả revision ACTIVE theo chính sách QR đã chốt; không silently lấy draft/version khác. |
| `GET /api/forms/[formCode]/revisions/[revisionId]/pages/[pageId]` | approved reference → PNG bytes hoặc URL ký | BE: private draft, no-store, không dựa vào biết hash là đủ quyền. |
| `POST /api/llm/qa` v2 | form/revision/global stepIndex/question → answer envelope | Voice AI: server kiểm tra snapshot; lỗi version khác yêu cầu reload; không gửi citizen question vào file cache. |

Giữ response envelope `{success:true,data,...}` / `{success:false,error:{code,message_vi}}`. Chốt lỗi `REVISION_CHANGED`, `PAGE_INCOMPLETE`, `FRAME_MISMATCH`, `REVIEW_CONFLICT`, `FORM_ASSET_UNAVAILABLE` trước khi FE implementation. Không tự chuyển phiên citizen sang revision mới giữa chừng.

## 5. Giới hạn và quan sát vận hành

Đề xuất khởi điểm để Tech Lead duyệt: tối đa 10 trang/bộ, 8 MB/ảnh, 12 triệu pixel/ảnh, 64 MB/bộ sau chuẩn hóa, 200 ô/trang và 500 ô/bộ. Batch model tối đa 40 ô, không quá 2 generation đồng thời trong một worker. Đây là giới hạn **mục tiêu**, không khẳng định backend hiện đã áp dụng cho bundle.

- PDF là chặng sau multi-image: raster ở server/worker cách ly, giới hạn số trang/DPI/thời gian/RAM, không nhận URL tùy ý, không xử lý PDF có mật khẩu hoặc raster thất bại như ảnh hợp lệ.
- VietOCR từng trang phải trả page/frame metadata; crop retry chỉ được quy về đúng trang qua transform đã lưu, không cộng offset theo pageNumber giả.
- Quota/queue/rate-limit phải dùng chung giữa các instance và giữa generation/Q&A/TTS theo nhà cung cấp; counter trong RAM không phải hạn mức toàn hệ thống.
- Logs chỉ giữ form/revision/job/page ID, trạng thái, thời gian và error code; không ghi khóa admin/câu hỏi/dữ liệu chứng từ công dân. Chính sách lưu ảnh áp dụng cho phôi trống, không cho hồ sơ cá nhân.
- Đề xuất đo geometry: IoU trung vị ≥ 0,80 và sai số tâm p95 ≤ 1% theo từng chiều trang; cần owner OpenCV + nghiệp vụ chốt ngưỡng trên dữ liệu thực trước khi dùng làm gate.
- Có feature flag v2, migration canary một số mẫu, backup, theo dõi mismatch/quota/error, rollback con trỏ ACTIVE. Đừng cho client v1 đọc một revision v2 bằng cách bỏ toàn bộ trang sau trang 1.

## 6. Những quyết định cần người dùng/Tech Lead chốt

1. Schema revision/page và storage adapter dùng cho môi trường triển khai, người vận hành backup/cleanup.
2. QR theo phiên bản cố định hay theo form hiện hành; chính sách bản bị thay thế/lưu trữ và citizen đang điền dở.
3. Giới hạn bundle, chi phí/latency mục tiêu, ngưỡng OCR/geometry nghiệp vụ.
4. Xác thực từng cán bộ, quyền truy cập revision/RLS và quota phân tán.

Trong lúc chưa chốt, giữ backend hiện tại chỉ nhận một trang, từ chối dữ liệu đa trang thay vì âm thầm làm phẳng nó.
