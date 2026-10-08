# Chặng 09 — Voice AI & QA: kết quả kiểm tra demo thật

Ngày kiểm tra: 08/10/2026. Phạm vi thay đổi bổ sung: module Voice AI, các route LLM/TTS thuộc Người 4, test QA và tài liệu mới.

## Kết luận hiện tại

**Bản QA demo chạy được; chưa thể xác nhận demo ứng dụng end-to-end trên DB thật.** Không biến lỗi DB thành kết quả thành công hay phục hồi bản ACTIVE từ cache. Bản QA được gắn cảnh báo chưa lưu/phê duyệt trên DB, không có QR hoặc quyền xuất bản thay thế API.

| Chặng | Thực hiện và test | Kết quả / phần còn thiếu |
| --- | --- | --- |
| 1. Đọc môi trường thật | SELECT 1, danh sách mã/trạng thái form, catalog RLS, Google models/voices, OCR health | DB đọc thành công lúc đầu; các kết nối sau lỗi tenant/user not found trên cả DATABASE_URL và DIRECT_URL. Gemini/TTS có khóa hợp lệ; file service-account được cấu hình nhưng không tồn tại, REST TTS vẫn hoạt động. |
| 2. Sửa Voice & QA | 9 test mới offline; test:local; test:p2p; TypeScript | Pass. Q&A không còn bảo chép tên/số ví dụ; không khớp FAQ bằng chuỗi con; bỏ phản hồi rỗng/truncated/quá dài. TTS kiểm tra UTF-8, marks và sidecar theo nội dung thực. |
| 3. Pipeline thật, phôi không có PII | Chrome/OpenCV thật → processed PNG → API documents/json → VietOCR CPU thật → Gemini text thật → Google TTS thật | Pass với gemini-3.5-flash được chọn rõ qua env. Hai vùng viết sau đối soát, 4 MP3 riêng cho hai bước và hai cấu hình giọng. Không mock HTTP trong bài kiểm tra live này. |
| 4. FE/hợp đồng và phát media | 4 browser tests HTTP giả lập của ứng dụng; kiểm tra browser phát MP3 thật trong artifact QA | 4/4 pass. Artifact QA decode/phát MP3 duration 7.92s, currentTime tăng; đổi bước/giọng đổi nguồn audio, FAQ đúng bước. Chưa nghiệm thu mic thiết bị thật hoặc API QA dựa trên ACTIVE trong DB thật. |
| 5. Lưu, duyệt, public read trên DB thật | Chạy live-demo --create --publish-demo, có preflight admin API trước khi tạo dữ liệu | Bị chặn bởi HTTP 503 DATABASE_UNAVAILABLE ngay preflight. Không tạo form demo, không duyệt hay ghi audit từ lần chạy này. Cần khôi phục kết nối Supabase rồi chạy lại. |

## Thay đổi kỹ thuật bổ sung

- Gemini generation chỉ retry tối đa 2 attempts trên lỗi tạm thời được chọn, không retry 400/401/403/429; deadline tổng vẫn 30s. Không tự đổi model khi lỗi. Mặc định ứng dụng vẫn theo GEMINI_MODEL hoặc gemini-3.6-flash; model 3.6 gặp 503 trong kiểm tra live, model 3.5 tạo được kịch bản sau khi được chọn rõ trong command.
- Prompt nhấn mạnh nhãn OCR là dữ liệu, chữ mẫu không phải thông tin công dân và không được tự phát minh quy định viết hoa, giấy tờ bắt buộc hay cách trả kết quả. **Prompt không bảo đảm grounding ngữ nghĩa tuyệt đối**: cán bộ vẫn phải duyệt nội dung, FAQ và các khẳng định nghiệp vụ.
- Q&A lấy context server như trước; system instruction tách riêng khỏi JSON chứa câu hỏi. FAQ chỉ khớp toàn câu đã chuẩn hóa. Output rỗng, finishReason khác STOP, ký tự điều khiển, trên 500 ký tự hoặc trên 70 từ dùng hướng dẫn an toàn theo nhãn hiện tại; không coi là source gemini. Giới hạn 3 lời gọi/process, 5s, một attempt, không ghi câu hỏi vào cache file.
- TTS giới hạn cả 2000 ký tự và 5000 byte UTF-8. Nếu SSML có marks vượt 5000 byte nhưng text hợp lệ thì dùng REST plain text; MP3 vẫn phải hợp lệ. Timestamps khi đó là ước lượng, được ghi rõ timestampSource: estimated.
- Timestamp sidecar mới lưu { wordTimestamps, timestampSource }; payload API thêm timestampSource, không bỏ audioUrl/wordTimestamps nên FE hiện tại vẫn đọc được. Sidecar cũ dạng array được đọc tương thích nhưng không tự tuyên bố là cloud marks. Chỉ chấp nhận thứ tự w_0…w_n, thời gian hữu hạn, không âm/tụt lùi, khớp từ hiện tại. ssml_marks xác nhận mốc bắt đầu từ Google, **endMs của từ cuối vẫn là ước lượng +350ms**; không gọi đây là karaoke chính xác đã nghiệm thu.
- test:voice nay là bộ offline; test:voice-client chạy thêm bộ này. Các lệnh live-demo tách riêng và yêu cầu --live. Test TTS chỉ ghi thư mục tạm và dùng MP3 fixture hợp lệ, không gọi cloud hay ghi đè public/audio.

## Bằng chứng và giới hạn pipeline ảnh

Phôi QA nằm tại src/modules/voice-ai/tests/fixtures/demo-blank.svg, được render PNG 1000×1400. Không chứa công dân thật, không phải mẫu hành chính có hiệu lực.

OpenCV trả 11 candidates, gồm vùng chữ/ứng viên không cần kê khai và hai cặp viền ngoài/viền trong của ô viết. QA giữ hai vùng viết gần nhất với ground truth của chính phôi synthetic, loại phần dư, đối soát nhãn bằng nội dung phôi. Đây là **review có giám sát**, không phải thuật toán nhận dạng form tự động đạt chuẩn cho mọi mẫu.

VietOCR thực tế có chuỗi nhiễu trong ô trống và cảnh báo OCR_TEXT_DISAGREEMENT, OCR_ACCURACY_NOT_MEASURED. Không sử dụng chuỗi đó làm nhãn hay dữ liệu công dân. Gemini chỉ nhận manifest text/hình học đã đối soát, không nhận ảnh Vision. Kịch bản Gemini ban đầu có khẳng định nghiệp vụ không có trên phôi; demo thay bằng hai lời hướng dẫn/FAQ đã đối soát, không công bố nguyên output AI.

Artifacts local được tạo trong private-documents/voice-demo: PNG, screenshot đối soát, evidence JSON và voice-qa-demo.html. Không thêm admin key/DB URL vào artifact. HTML self-contained có 4 MP3 thật; không gửi câu hỏi hay gọi API công khai dựa trên workflow chưa duyệt. HTML không phải FE citizen đã triển khai.

## Rủi ro DB cần Tech Lead xử lý trước triển khai

Lần truy vấn catalog thành công ghi nhận relrowsecurity=false cho form_templates, form_workflows, form_audit_logs và voice_cache. Chưa xác minh được grant anon/authenticated hoặc exposed schemas vì DB lỗi sau đó. Nếu public được expose và các role có grant, API key admin của Next.js **không ngăn truy cập thẳng Data API**. Không thay RLS/grant trong chặng này để tránh vượt role hoặc khóa luồng của đội khác.

Tech Lead cần kiểm tra project đang active, URL tại Connect, host/port/username/password và kết quả Advisors; xác minh grants/RLS, per-officer identity, persistent/shared asset+audio storage và quota phân tán. Không tắt TLS/RLS, sửa hostname bằng phỏng đoán hay đổi sang fake DB để làm demo trông như thành công. Các breaking changes Supabase đã được kiểm tra qua changelog trước khi truy vấn; không có migration được chạy.

Nguồn đối chiếu: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Gemini retry/troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking), [Google TTS SSML timepoints](https://docs.cloud.google.com/text-to-speech/docs/ssml).

## Các việc còn lại theo role

| Chủ trì | Đầu vào → đầu ra / giao diện | Tiêu chí nghiệm thu | Còn thiếu |
| --- | --- | --- | --- |
| Tech Lead | Connect URL và project active → admin list, atomic draft/approval trên DB thật | --create --publish-demo pass; workflow ACTIVE có 2 bước; draft public 404; image 200; audit đúng shared_admin_key | Kết nối hiện tại tenant/user not found; chưa kiểm thử transaction với DB thử riêng |
| Người 4 | Manifest đã đối soát → /api/llm/prompt, /api/tts, /api/llm/qa | Kịch bản đúng box, nội dung do cán bộ duyệt, audio đúng text, câu hỏi lấy đúng ACTIVE context | Cần chạy lại API live sau khi DB ổn; mic/loa thật và quota nhiều máy chủ chưa nghiệm thu |
| OpenCV/OCR | Phôi thực → processed frame, normalized geometry, OCR text + evidence | Loại candidate chữ/viền trùng, không OCR ô trống thành text; đo sai số trên bộ ảnh thật | 11 candidates dư/trùng và OCR nhiễu trên phôi demo; không sửa code role này trong chặng 09 |
| FE | Workflow/pages/audio ACTIVE → review/citizen/QR | Không đọc fixture cũ; click Play phát đúng bước; đổi form/bước dừng audio; lỗi DB không xuất bản từ localStorage | 4 tests đang mock HTTP; cần browser trên API DB thật, thiết bị mic thật, trợ năng và QR HTTPS |
| Tech Lead + FE + OpenCV | Contract/revision/pages v2 → multi-page theo kế hoạch chặng 08 | Không dùng sai ảnh trang, đủ box/page, duyệt atomic revision, client đọc đúng version | Chặng 09 vẫn một trang; không thay schema/FE của role khác để lách giới hạn |

## Checklist demo và chạy lại

Từ root dự án (PowerShell):

```powershell
npm run dev:all
```

Môi trường local VietOCR đã được chuẩn bị bằng Python 3.12.14, torch CPU 2.6.0 và requirements/setup hiện có. Không sửa file service hoặc policy Windows. Giữ .venv và .cache local; máy khác cần chuẩn bị runtime/weights theo README của đội OCR.

Để tái tạo QA artifact (có gọi cloud, tiêu tốn quota; không công bố workflow):

```powershell
$env:GEMINI_MODEL='gemini-3.5-flash'
$env:VOICE_DEMO_FORM_CODE='DEMO-VOICE-20261008-CLOUD35'
npx tsx src/modules/voice-ai/tests/live-demo.ts --live --cloud-only
node src/modules/voice-ai/tests/serve-demo.mjs
```

Mở <http://127.0.0.1:3102>, nhấn Play, chuyển Dòng kế tiếp, đổi giọng, thử FAQ. Hoặc mở private-documents/voice-demo/voice-qa-demo.html trực tiếp. Server preview chỉ bind loopback, không phục vụ thư mục chứa secrets, không có kết nối network từ HTML. Không dùng artifact để phát hành mẫu hành chính. Phần nghe/nhìn QA đã kiểm tra trong Chrome; cảm nhận chất giọng và mic thiết bị thật cần người dùng test.

Phiên kiểm tra để lại Web 3001, OCR 8000 và QA preview 3102 đang chạy tại thời điểm bàn giao. Nếu các cổng đã hoạt động thì không khởi động thêm instance. Sau khi sửa env/model/DB URL cần dừng instance Web cũ và khởi động lại để nạp cấu hình mới. Runtime/build/cache local không phải mã cần commit; không commit .env, audio demo hoặc private-documents. Bộ test P2P có 37 case TAP (6 route/integration, 7 voice-client, 9 voice readiness, 15 image/manifest), ngoài các assertion suites đã có. 219/219 regression và 4/4 browser tests pass; TypeScript và build pass. Đây không phải nghiệm thu toàn bộ FR hay môi trường production.

Sau khi DB được Tech Lead khôi phục, đặt GEMINI_MODEL cho **tiến trình Next.js trước khi khởi động**, dùng mã demo mới để không đè mẫu cũ:

```powershell
$env:GEMINI_MODEL='gemini-3.5-flash'
$env:VOICE_CACHE_ENABLED='false'
npm run dev:all
```

Trong terminal thứ hai, sau khi web/OCR ready:

```powershell
$env:VOICE_DEMO_FORM_CODE='DEMO-VOICE-20261008-DB-01'
npx tsx src/modules/voice-ai/tests/live-demo.ts --live --create
```

Lệnh này tạo nháp thực qua API, tạo 4 audio, lưu lời hướng dẫn/FAQ đã đối soát của phôi synthetic; không tự duyệt. Vào /admin/library, nhập ADMIN_SECRET_KEY từ môi trường local, đối soát phôi/nội dung, nghe audio, xác nhận review rồi duyệt trên UI. Không dán khóa vào báo cáo hoặc URL.

Nếu cần QA tự xuất bản **chỉ phôi synthetic đã đối soát** như được ủy quyền trong task, thêm --publish-demo ngay lúc tạo với một mã mới. Runner từ chối mọi mã không bắt đầu DEMO-VOICE-, từ chối form đã tồn tại kể cả nháp, kiểm tra draft public 404 trước duyệt, rồi kiểm tra ACTIVE/public image/audio/FAQ. Không tự đổi ACTIVE của biểu mẫu thật. Dữ liệu demo ở DB sẽ tồn tại sau lệnh; dọn bằng quy trình của Tech Lead, không có auto-delete.

Không đổi DATABASE_URL/DIRECT_URL trong mã, không chạy prisma db push/migrate hay sửa RLS. Khi DB offline, --create dừng trước upload, AI và approval, ghi evidence failed thay vì output thành công.
