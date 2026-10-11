# Checkpoint tiếp tục công việc

**Trạng thái: PAUSED theo yêu cầu người dùng ngày 08/10/2026. Không tự tiếp tục phát triển cho đến khi người dùng yêu cầu.**

## 1. Workspace và Git

- Root: `D:\Users\BT\N3_K1\AFL\AFL-Platform`.
- Nhánh đang làm: `codex/form-recognition-and-multiline`, tạo từ `feat/p2p-frontend-api-integration`.
- Code và tài liệu đã lưu trên filesystem; **chưa commit, chưa push, chưa merge**. Không reset/clean/stash hoặc chuyển nhánh làm mất working tree.
- Đầu phiên chỉ có thư mục nghiên cứu step-14 chưa tracked; giữ nguyên thư mục đó. Các thay đổi nhận diện/review/Voice/test trong working tree hiện tại thuộc đợt này.
- Không dùng Dely theo lựa chọn trực tiếp trước đó của người dùng; không sửa AGENTS.md. Không tạo sub-agent cho đợt này.
- `git diff --check` không có lỗi whitespace; có cảnh báo chuyển LF/CRLF theo cấu hình Git Windows.

## 2. Đã hoàn thành trong working tree

1. Writing-guide detector từ mask pixel, giữ vùng viết riêng khỏi nhãn; kết nối vào pipeline OpenCV thật.
2. Grounding nhãn/vùng, phân loại nội dung tĩnh và input; hỗ trợ nhiều dòng, bảng hai chủ thể, bảng lặp, ma trận checkbox, dãy ô ký tự; giữ ca mơ hồ để review.
3. Sửa khung ngoài nuốt vùng nhập và inner-contour làm checkbox thành input chữ.
4. OCR bỏ đường bảng/chấm khỏi mask phân đoạn, không infer trang/crop trắng có viền; dùng ảnh nguồn khi đọc chữ; tối ưu xóa component bằng label lookup.
5. Hợp đồng optional `inputKind`, `inputRegions`, `highlightRegions`; validator chặn region sai/mất/ngoại lai; Gemini bị ràng buộc geometry manifest.
6. Lưu metadata trong artifact hashed hiện có, bind lại đúng box/primary geometry khi đọc DB và trước approval. Không đổi Prisma schema.
7. Admin editor chọn/sửa region, thêm/bỏ/gộp/tách trường; citizen highlight nhiều region với một bước đọc; Q&A fallback đúng loại checkbox/multiline/character slots.
8. Sửa auto-play lặp hai lần trong React Strict Mode; giữ hành động nghe lại.
9. Có kế hoạch và báo cáo kỹ thuật, smoke evaluator OCR local cùng test browser optional dùng evidence thật.

## 3. File cần đọc đầu tiên khi tiếp tục

- `IMPLEMENTATION-AND-TEST-PLAN.md` cùng thư mục: thiết kế/chặng.
- `PROGRESS-AND-TECHNICAL-HANDOFF.md` cùng thư mục: thuật toán, hợp đồng, kết quả, hạn chế, lệnh chạy và việc tiếp theo.
- `src/modules/forms/services/form-region-recognition.ts`, `form-field-metadata.ts`, `form-region-editor.ts`, `form-validation.service.ts`.
- `src/modules/opencv/writing-guide-detector.ts`, `box-filter.ts`, `geometric-sort.ts`, `debug-pipeline.ts`.
- `services/vietocr-service/text_layout.py`, `app.py`, `evaluate_recognition.py`.
- `src/modules/forms/services/form-artifact-store.ts`, `src/modules/forms/repositories/prisma-form.repository.ts`.
- `src/components/admin/FormUploadModal.tsx`, `src/app/admin/review/[id]/page.tsx`, `src/components/citizen/VisualTwin.tsx`, `VoiceAssistantPanel.tsx`.
- `tests/browser/form-recognition.spec.ts` và các test mới trong modules/forms, modules/opencv, service Python.

## 4. Kết quả đã xác nhận trước khi pause

| Kiểm tra | Kết quả |
|---|---|
| Recognition | 35/35 |
| OpenCV | 53/53 |
| Documents | 153/153 |
| Forms API | Client checks + 12/12 |
| Voice client | 7/7 |
| Voice | 19/19 sau khi thêm fallback theo kind |
| QA fixture / API integrity | 6/6 + PASS |
| Python unit tests | 19/19 |
| Browser đầy đủ với evidence OCR local | **12/12**, exit 0, lượt cuối 42.2 giây |
| TypeScript | PASS, exit 0 |
| Build cuối, đã có thay đổi Q&A theo kind | PASS, exit 0; output `.next-recognition-build` |

Các nhóm test có phần trùng nhau; không cộng tổng số test thành một tỷ lệ nghiệm thu sản phẩm. Cloud AI, API ghi DB/publish được mock trong test. Không có transaction PostgreSQL thật trên DB staging trong đợt này.

Smoke thật: VietOCR weights local trên ảnh tổng hợp, 3 dòng OCR, không chữ dư; trang/crop trắng có viền/chấm trả 0 prediction. Model vẫn sai dấu: `Nội dung đề nghi`, `Nhân trực tiếp`, thiếu dấu `:` ở `Họ và tên`. CER 3/41 ký tự trên mẫu nhỏ, không phải metric production. Browser ghép evidence này với OpenCV thật thành đúng 3 field, trong đó một field 3 region và một checkbox.

## 5. Runtime và evidence

- Dev app đang được giữ lại tại `http://127.0.0.1:3001`.
- VietOCR cổng 8000 đã restart bằng code mới, health `ready: true`; tiến trình mới đã sẵn sàng. Phiên shell OCR hiện tại ID `31116`, PID lúc khởi động `28432`; kiểm tra lại cổng/process, không mặc định PID còn đúng ở lần sau.
- Không dừng server dev/OCR khi pause. Không có build/test đang chạy còn phải chờ; hai lệnh cuối đã thu kết quả exit 0.
- `private-documents/recognition-evaluation/synthetic-ocr.json` và `.png`: evidence tổng hợp, ignored, không chứa thông tin công dân.
- `private-documents/form-research-20`: nguồn nghiên cứu cũ, một số mẫu đã điền chứa dữ liệu công khai; không gửi cloud.
- Build riêng đã được ignore; `tsconfig.json` thêm include generated types tương ứng do Next build tạo ra.
- Không sửa DB thật, không ban hành form demo, không gọi Gemini/TTS cloud trong kiểm thử.

## 6. Điểm bắt đầu lần sau

1. Chỉ khi người dùng yêu cầu tiếp tục: đọc checkpoint/báo cáo, kiểm tra branch và diff, đọc các AGENTS.md áp dụng; không ghi đè các thay đổi mới của người dùng.
2. Review toàn bộ diff trước commit; chưa có một vòng review độc lập của người khác. Nếu có sửa thêm, chạy lại các bộ test liên quan và TypeScript/build.
3. Ưu tiên tạo ground truth và benchmark phôi trắng đại diện; đo field precision/recall, IoU, CER và số thao tác sửa tay/form trước/sau. Đừng coi 20 tài liệu nghiên cứu là 20 form đã kiểm thử đạt.
4. Dùng DB staging riêng để kiểm chứng transaction/rollback/concurrent approval và phục hồi DB + artifact; không dùng production để thử phá dữ liệu.
5. Làm PDF/đa trang thành chặng riêng nếu tiếp tục phạm vi đó: hiện upload/validator/storage **chỉ một trang PNG/JPEG**, dù kiểu region có pageNumber. Chưa có detector QR/ảnh/dấu xác minh, bảng merge-cell hoặc calibration confidence.
6. Chỉ commit/push khi người dùng yêu cầu rõ; hiện toàn bộ thành quả nằm trong working tree và tài liệu này.
