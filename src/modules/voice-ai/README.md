# PHÂN HỆ VOICE AI & ĐẢM BẢO CHẤT LƯỢNG (AFL VOICE & QA ENGINE)
## Thư mục: `src/modules/voice-ai/`
### Phụ trách chính: Nguyễn Thanh Chiến (Người 4 — Voice & QA Lead)

---

## 1. MỤC ĐÍCH & PHẠM VI CHỨC NĂNG

Thư mục này chứa toàn bộ mã nguồn xử lý ngôn ngữ tự nhiên, giọng nói hai chiều và bộ kiểm thử đảm bảo chất lượng độc lập của dự án **AFL Platform**:
* **`gemini-prompt.ts` (FR-8):** Tiếp nhận `FormGeometricManifest` từ module OpenCV (Người 3) $\rightarrow$ Sử dụng Google Gemini (chế độ Pure Text LLM) tự động sinh kịch bản tiếng Việt bình dân, chữ mẫu đỏ in hoa `#D32F2F`, mảng câu hỏi gợi ý `faqs` (Touch-to-Ask) và cờ kiểm duyệt pháp lý `legalWarningFlag`.
* **`tts-service.ts` (FR-3):** Tích hợp Google Cloud Text-to-Speech (Neural2 vi-VN) tạo file MP3 tốc độ chậm 0.9x (giọng Bắc `vi-VN-Neural2-A`, Nam `vi-VN-Neural2-D`) và trích xuất bảng mốc thời gian từ vựng (`WordTimestamp[]`) phục vụ hiệu ứng phụ đề Karaoke cho Người 2 (Frontend).
* **`stt-service.ts` (FR-4):** Module nhận dạng giọng nói on-device tiếng Việt qua Web Speech API (`vi-VN`), triệt tiêu độ trễ mạng khi công dân phát biểu tại quầy tiếp dân.
* **`use-voice-assistant.ts` (FR-4):** React Hook (`'use client'`) trọn gói dành riêng cho Người 2 (Frontend), tích hợp STT, Audio Player, Touch-to-Ask FAQs và bảo vệ bán song công `HalfDuplexController` với khoảng trễ 300ms Echo-Guard.
* **`voice-qa.ts` (FR-4):** Xử lý hỏi đáp ngữ cảnh tức thì (độ trễ $\le 1.5$s) kết hợp bộ điều khiển bán song công (`HalfDuplexController`) với khoảng trễ 300ms Echo-Guard triệt tiêu hiện tượng lặp dội âm.
* **`local-cache.ts` (Vaccine 1):** Bộ nhớ đệm cục bộ lưu vào `gemini-cache.json`, chống cạn kiệt Quota API và bảo vệ thẻ tín dụng khi lập trình/kiểm thử.
* **`tests/test-voice.ts`:** Kịch bản kiểm thử độc lập phân hệ Voice AI (16/16 test cases).
* **`tests/test-stt.ts`:** Kịch bản kiểm thử độc lập bộ nhận dạng STT và bảo vệ Half-Duplex (16/16 test cases).
* **`tests/qa-suite.ts`:** Kịch bản kiểm toán tuân thủ toàn diện 11 Yêu cầu Chức năng (FR-1 đến FR-11) và 4 NFRs.
* **`tests/test-tts-api.ts`:** Kịch bản kiểm tra kết nối trực tiếp khóa API Google Cloud TTS thực tế.
* **`tests/generate-full-audio.ts`:** Kịch bản tổng hợp tự động trọn bộ 9 file MP3 và xuất `public/audio/timestamps.json` kèm kiểm chuẩn NFR-2.

---

## 2. HƯỚNG DẪN CÀI ĐẶT DÀNH CHO CÁC THÀNH VIÊN KHÁC

Khi các thành viên khác (`Người 1 - Tech Lead`, `Người 2 - Frontend`, `Người 3 - OpenCV`) kéo mã nguồn về máy:

### Bước 1: Cài đặt Dependencies
Toàn bộ thư viện đã được khai báo chính thức trong [`package.json`](../../../package.json). Chỉ cần chạy:
```bash
npm install
```

Các thư viện đã được bổ sung bao gồm:
* `@google/genai` (SDK Google Gemini thế hệ mới)
* `@google-cloud/text-to-speech` (Google Cloud Neural2 TTS)
* `@techstark/opencv-js` (OpenCV WebAssembly cho Người 3)
* `lucide-react` (Bộ icon chuẩn cho Người 2)
* `dotenv` & `tsx` (Công cụ nạp cấu hình và chạy TypeScript trực tiếp)

### Bước 2: Thiết lập Biến môi trường
Sao chép file [`.env.example`](../../../.env.example) thành `.env.local`:
```bash
cp .env.example .env.local
```

Điền các khóa cấu hình cần thiết:
```env
# Cho phép bật/tắt Mock Data
NEXT_PUBLIC_USE_MOCK_DATA=true

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Google Cloud TTS
GOOGLE_TTS_API_KEY=your_google_cloud_tts_api_key_here
# Hoặc đường dẫn file JSON Service Account:
# GOOGLE_APPLICATION_CREDENTIALS=./config/google-cloud-key.json

# Bật bộ nhớ đệm cục bộ chống tốn Quota (Khuyên dùng: true)
VOICE_CACHE_ENABLED=true
```

> **Lưu ý:** Module được thiết kế cơ chế **Tự động Fallback Thông minh**. Nếu chưa có API Key, hệ thống vẫn tự động nạp từ `mock-workflow.json` và mô phỏng âm thanh/timestamps, bảo đảm quá trình code giao diện (Người 2) và kiểm thử không bao giờ bị gián đoạn!

---

## 3. CÁC LỆNH KIỂM THỬ ĐỘC LẬP

Mọi thành viên đều có thể chạy các lệnh kiểm thử sau từ thư mục gốc của dự án:

```bash
# Kiểm thử phân hệ Voice AI (FR-8, FR-3, FR-4, Half-Duplex):
npm run test:voice

# Kiểm thử bộ nhận dạng STT & Half-Duplex 300ms Echo-Guard:
npm run test:stt

# Kiểm toán chất lượng tuân thủ 11 FRs & 4 NFRs (QA Master Suite):
npm run test:qa

# Kiểm tra kết nối trực tiếp khóa API Google Cloud TTS thực tế:
npm run test:tts

# Tổng hợp toàn bộ 9 file MP3 và mốc thời gian Karaoke (FR-3 & NFR-2):
npm run generate:audio
```

---

## 4. HỢP ĐỒNG DỮ LIỆU THAM CHIẾU
Toàn bộ kiểu dữ liệu giao tiếp tuân thủ tuyệt đối [`src/shared/contracts.ts`](../../shared/contracts.ts):
* `FormGeometricManifest` $\to$ Đầu vào từ Người 3 (OpenCV).
* `WorkflowStep` & `FormWorkflow` $\to$ Đầu ra bàn giao cho Người 2 (Frontend) và Người 1 (Database).
