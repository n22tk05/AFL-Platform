# Báo cáo kỹ thuật tích hợp frontend P2P

## Mục tiêu và phạm vi

This report records the citizen UI, voice support, and admin UI integration with existing APIs, plus automated lifecycle safeguards. Baseline: accepted Task 3 commit `f2cf714607182dbbdbb0c7b9a8fa4114b4c582a8` on `feat/p2p-frontend-api-integration`; the accepted Task 4 candidate records this report and normalizes documentation structure while deleting the temporary Dely plan. Delivery made no Prisma schema, migration, or Supabase table changes and performed no admin/workflow production mutation. The required `test:voice` gate can write `voice_cache` and generate audio/cache artifacts; this operational limitation is documented below.

Phạm vi kỹ thuật được mô tả dựa trên mã nguồn, kiểm thử tại module/tích hợp và các lệnh xác minh được liệt kê ở cuối. Không thuộc phạm vi: thay đổi schema hoặc migration; sửa pipeline upload/`FormUploadModal`; tạo/luân chuyển khóa quản trị; clone phiên bản workflow ACTIVE; xác nhận trên production; kiểm thử persistence có khả năng ghi database cấu hình.

## Kiến trúc và luồng dữ liệu

```text
Citizen guide (browser)
  → GET /api/forms/{formCode}/workflow
  → forms controller → persistence service → repository → Prisma
  → validated workflow → localStorage cache → render steps
  → cache fallback → compatible bundled fixture fallback

Voice panel (browser)
  → Web Speech API STT (vi-VN; finalized transcript only)
  → POST /api/llm/qa { formCode, stepIndex, userQuestion }
  → voice QA controller/service → answerText + optional audioUrl
  → HTMLAudioElement; media failure → speechSynthesis fallback
  → half-duplex lock + echo release guard → next microphone turn

Admin browser UI
  → /admin/library → GET /api/admin/forms
  → /admin/review/{formCode} → GET workflow → edit JSON
  → PUT workflow → authoritative GET → clean editor baseline
  → POST approve → ACTIVE only after successful server response
```

Các API route Next.js làm lớp chuyển đổi HTTP. Controller kiểm tra đầu vào và ánh xạ lỗi/envelope; service điều phối use case; repository cô lập truy cập dữ liệu và cache. Forms và Voice AI có `client.ts` với `'use client'` để browser chỉ lấy API an toàn. `index.ts` của module Forms/Voice AI là barrel/composition root phía server; component browser không import implementation Prisma hoặc dịch vụ voice server.

### Luồng citizen và quyền sở hữu dữ liệu

`src/app/(citizen)/guide` giải quyết alias giao diện thành form code canonical, yêu cầu workflow từ server và xác thực envelope, form code, thông tin cần thiết, step index liên tục bắt đầu từ 1 và các trường tọa độ. Chỉ workflow không rỗng, hợp lệ mới được cache bằng khóa `afl:forms:workflow:<canonical-code>`. Khi fetch/API/envelope không dùng được, client thử cache hợp lệ cùng mã biểu mẫu rồi fixture tương thích đã đóng gói. Fixture chỉ bổ sung metadata trình bày còn thiếu như trang/page number cho step khớp `boxId`; step và giá trị do server quản lý vẫn lấy từ workflow live. Cache storage lỗi không làm hỏng luồng; nếu không có nguồn hợp lệ thì UI báo không tải được. Kiểm thử client xác nhận response rỗng/sai cấu trúc không ghi đè cache tốt.

Server là nguồn chính cho workflow và trạng thái. Cache trình duyệt và fixture là chế độ dự phòng cho hướng dẫn, không phải nơi ghi nhận sửa đổi hoặc trạng thái phê duyệt. Metadata trang chỉ phục vụ hiển thị, chưa được thêm vào hợp đồng lưu trữ.

### Voice QA, STT, playback và half-duplex

Hook voice chạy nhận dạng tiếng Việt qua Web Speech API trên trình duyệt. Chỉ transcript cuối được gom và gửi QA; request có `formCode` thật và `stepIndex` một-based. Câu trả lời được hiển thị và phát bằng URL âm thanh nếu có; lỗi phát media chuyển sang `speechSynthesis` khi khả dụng. Half-duplex controller khóa microphone trong lúc phát, và guard 300 ms sau playback giảm nguy cơ thu lại tiếng loa. Request generation/context, session ID bất biến, callback gắn với recognizer cụ thể, abort và trạng thái release ngăn callback cũ sửa transcript, gửi câu hỏi vào turn mới hoặc hồi sinh trạng thái nghe. Kết thúc một turn chỉ gửi một lần; thay form/step hủy request, recognition và playback cũ.

Kiểm thử hook/client kích hoạt callback thật được gắn lên fake recognizer/audio/speech driver: release trước `onstart`, final/end đến muộn, abort/restart, start thất bại, QA chậm, media lỗi/kết thúc/hủy và timer echo. Đây là kiểm thử deterministic bằng fake; không đo âm học hoặc phần cứng thật.

### Admin list, review, save, reconcile và approve

Library nhận khóa bằng input password và giữ khóa trong React state bộ nhớ. Review session được tạo theo cặp form code/khóa; khi một trong hai đổi hoặc unmount, session cũ bị invalidate. Kết quả bất đồng bộ từ GET/PUT/POST của session cũ không được áp lên route/key hiện tại. Chỉ DRAFT/PENDING_REVIEW được sửa; ACTIVE chỉ xem. Save từ chối đổi `formCode` hoặc status do server sở hữu. Save thành công luôn tiếp tục GET workflow có thẩm quyền; PUT response không được dùng làm baseline. Nếu GET đối chiếu lỗi hoặc khác identity, nội dung editor còn dirty và approval bị chặn. Approval chỉ chạy khi không dirty, thành công chỉ được hiển thị khi server trả đúng form code và `ACTIVE`; lỗi không giả lập thành công.

## Ánh xạ API và hợp đồng HTTP

Các envelope/status dưới đây là hợp đồng hiện hành trong route/controller; frontend không thay chúng. JSON thành công có dạng `{ "success": true, "data": ... }`; lỗi thường là `{ "success": false, "error": ... }`.

| URL | Method | Caller/auth | Thành công | Lỗi/status và hành vi UI |
| --- | --- | --- | --- | --- |
| `/api/forms/[formCode]/workflow` | GET | Citizen guide; không có admin header | `200`, `data` là workflow | `400` thiếu mã, `404` không có workflow, `503` database; client chuyển cache/fixture khi không nhận workflow hợp lệ |
| `/api/llm/qa` | POST | Voice client; JSON `{formCode, stepIndex, userQuestion}`; không có admin header | `200`, `data` có `answerText`, có thể có `audioUrl` | Body sai/thiếu `400`; quá lớn `413`; step không active `404 ACTIVE_STEP_NOT_FOUND`; lỗi QA `503 QA_FAILED` (cùng các lỗi 500 khác); UI giữ thông báo lỗi và không phát câu trả lời lỗi |
| `/api/admin/forms` | GET | Admin library; `x-admin-key` (client cũng gửi `cache: no-store`) | `200`, `data.forms` | `401 UNAUTHORIZED`, `503 ADMIN_KEY_UNCONFIGURED` hoặc `DATABASE_UNAVAILABLE`; UI trình bày lỗi, không thay bằng danh sách giả |
| `/api/admin/forms/[formCode]/workflow` | GET | Admin review; `x-admin-key` | `200`, `data` workflow | `401`, `503` cấu hình/database, `404` không tìm thấy; lỗi giữ màn review không có workflow |
| `/api/admin/forms/[formCode]/workflow` | PUT | Admin review; `x-admin-key`; JSON workflow tối đa 128 KiB | `200`, `data` có `formCode`, `workflowId`, `stepCount`; frontend sau đó gọi GET authoritative | Auth `401`/`503`; JSON `400`, quá lớn `413`; validation `400`, thiếu `404`, ACTIVE/conflict `409`, database `503`; editor giữ nguyên dirty và không cho approve |
| `/api/admin/forms/[formCode]/approve` | POST | Admin review; `x-admin-key`; `{reviewConfirmed:true, performedBy, note}` tối đa 4 KiB | `200`, data xác nhận `formCode`, status `ACTIVE`, `approvedAt` | Auth `401`/`503`; input `400`/`413`; lỗi trạng thái/conflict `409`, không tìm thấy `404`, lỗi controller `500 INTERNAL_SERVER_ERROR`, database `503`; UI không hiện ACTIVE giả |

`ADMIN_SECRET_KEY` được so khớp ở server qua dịch vụ authorization. Trong candidate không có khóa cấu hình; UI không lưu khóa vào `localStorage`, cookie hay `NEXT_PUBLIC_*`. Không thực hiện approval trực tiếp để thử endpoint.

## Bằng chứng regression và mutation

Kiểm thử Forms client/module và `tests/integration/p2p-api-integration.test.ts` xác nhận URL/method/header/envelope, từ chối workflow rỗng, giữ cache hợp lệ, fallback fixture và không báo approve thành công trên lỗi. Review-session tests xác nhận dirty/failed save chặn POST, status ACTIVE do editor gửi bị từ chối, PUT được theo sau bởi GET authoritative, GET đối chiếu lỗi giữ nguyên editor và trạng thái dirty, cùng việc invalidate kết quả cũ khi đổi form hoặc khóa. Voice client tests chạy callback production đã gắn lên fake để kiểm tra callback recognizer cũ, release trước `onstart`, exactly-once QA, failed start, request trễ, half-duplex và fallback playback. Kiểm thử route/module bảo vệ auth và status semantics; typecheck/build kiểm tra ranh giới import và route production.

Đây là bằng chứng tự động trong môi trường giả lập/in-memory. Các API test fake không thay cho smoke test browser đã deploy.

Evidence includes mocked/in-memory API tests and the other paths listed below. The required `npm run test:voice` gate was run against production `TTSService` and `PrismaVoiceCacheRepository.save`; it can write `voice_cache` and create audio/cache artifacts in the configured environment. The review read-only SQL probe found the generated hash already present and cannot certify zero database writes. API fake tests do not replace deployed browser smoke testing.

## Xác minh

Các lệnh dưới đây đã chạy trên đúng cây nội dung được đưa vào commit Task 4. Các kết quả test:voice/test:local có thể in log fallback Gemini trong khi bộ kiểm thử vẫn kết thúc mã 0; xem giới hạn tương ứng, không diễn giải đây là phép đo dịch vụ production.

| Lệnh | Kết quả | Điều được xác nhận |
| --- | --- | --- |
| `npm run test:p2p` | PASS (exit 0) | Forms API/client, tích hợp P2P và voice client |
| `npm run test:voice-client` | PASS (exit 0) | Callback voice, race và playback bằng fake deterministic |
| `npm run test:stt` | PASS (exit 0, 16/16 tiêu chí) | Chạy Node không có browser `SpeechRecognition`, gồm cả đường timer thật; fake-recognizer coverage nằm trong `npm run test:voice-client` |
| `npm run test:voice` | PASS (exit 0, 16/16 tests; Gemini trả 503/timeout và service chạy fallback) | Voice QA/service regressions |
| `npm run test:local` | PASS (exit 0; QA 6/6 fixture/API integrity PASS) | QA suite và API integrity local |
| `npx tsc --noEmit --incremental false` | PASS (exit 0) | TypeScript toàn dự án, không dùng incremental cache |
| `npm run build` | PASS (exit 0; production route table có `/admin/library`, `/admin/review/[id]` và API routes) | Build production và route graph Next.js |
| `git diff --check` | PASS (exit 0) | Whitespace/conflict marker trong thay đổi |
| Deterministic content probe (PowerShell; 26 marker bắt buộc + regex cấm claim sai) | PASS; 26/26 marker có, 0 claim cấm | Giới hạn bắt buộc, mappings canonical, browser boundary và từ chối tuyên bố live/device/persistence đã pass |

`npm run test:persistence` được cố ý không chạy: script có thể ghi vào database đang cấu hình. Đây không phải kết quả đạt được. Không có lượt chạy persistence nào được tuyên bố.

## Thay đổi, tác động dữ liệu và bàn giao

Candidate Task 3 cung cấp các entry point client, API workflow/admin, trang citizen/admin, voice hook/panel và kiểm thử module/tích hợp. Task 4 chỉ sửa tiêu chuẩn cấu trúc nhóm, thêm báo cáo này và xóa kế hoạch tạm `docs/plans/2026-09-27-p2p-frontend-api-integration.md`; durable decision record vẫn được giữ. Các protected pre-existing dirty paths (đường dẫn dirty được bảo vệ có trước Task 4) được giữ nguyên và không thuộc candidate.

Delivery did not change Prisma schema, migrations, Supabase configuration/tables, or perform admin/workflow production mutations. The required `npm run test:voice` gate was run and can write `voice_cache` and create audio/cache artifacts in the configured environment; the read-only SQL probe found the generated hash already present and cannot certify zero database writes. `npm run test:persistence` was intentionally not run because it can write to the configured database. This remains an explicit limitation and operational risk. Existing rollback and handoff guidance remains applicable.

## Giới hạn và việc còn lại

- Chưa xác minh physical microphone permission (quyền microphone vật lý), acoustic recognition (nhận dạng âm học), speaker quality (chất lượng loa/giọng phát) hoặc device latency (độ trễ thiết bị); không có phiên kiểm tra micro/âm thanh trên thiết bị thật.
- Không có successful live admin approval (phê duyệt quản trị live thành công): không có `ADMIN_SECRET_KEY` được cấu hình và không có disposable pending production form được cho phép để thử.
- `npm run test:persistence` cố ý không chạy vì có thể mutate database đã cấu hình; đây is not a passing claim (không phải tuyên bố đạt).
- Delivery made no schema, migration, Supabase configuration/table changes and performed no admin/workflow production mutation. The required `test:voice` gate remains write-capable for `voice_cache` and generated audio/cache artifacts; zero production row writes cannot be certified.
- Các tệp dirty có trước và thuộc diện bảo vệ được giữ nguyên, không nằm trong candidate.
- Còn cần cấp khóa theo quy trình vận hành, chọn môi trường và bản ghi thử an toàn được phê duyệt, rồi thực hiện smoke test browser/thiết bị và persistence trong môi trường cô lập nếu cần chứng minh vận hành thực tế.
