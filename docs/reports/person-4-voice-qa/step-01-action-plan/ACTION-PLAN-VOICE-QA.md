# KẾ HOẠCH HÀNH ĐỘNG KỸ THUẬT SPRINT 1 (7 NGÀY)
## Phân hệ: Trí tuệ Nhân tạo Ngôn ngữ, Xử lý Giọng nói & Đảm bảo Chất lượng (Voice AI & QA)
### Phụ trách: Nguyễn Thanh Chiến (Kỹ sư Voice AI & Trưởng nhóm QA)

---

| Thông tin | Chi tiết |
| :--- | :--- |
| **Dự án** | AFL Platform (Hệ thống Hỗ trợ Điền Biểu mẫu Thông minh & Quản trị Quy trình cho Người cao tuổi) |
| **Thành viên thực hiện** | Nguyễn Thanh Chiến (Thành viên 4 — Voice & QA Lead) |
| **Thư mục làm việc độc quyền** | `src/modules/voice-ai/` & `src/app/api/llm/`, `src/app/api/tts/` |
| **Thời lượng thực thi** | 7 ngày làm việc (1 Sprint) |
| **Tài liệu căn cứ** | [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [contracts.ts](../src/shared/contracts.ts), [WORKFLOW-PIPELINE.md](./WORKFLOW-PIPELINE.md) |
| **Trạng thái tài liệu** | Chính thức (Approved Baseline) |

---

## 1. MỤC TIÊU VÀ PHẠM VI TRÁCH NHIỆM

### 1.1 Mục tiêu Kỹ thuật
1. Hiện thực hóa **Bộ sinh Kịch bản Ngữ nghĩa (FR-8)** sử dụng mô hình ngôn ngữ lớn Google Gemini 1.5 Flash (chế độ Text LLM, hoàn toàn không gọi Vision API), chuyển đổi dữ liệu hình học thành câu thoại tiếng Việt bình dân và chữ mẫu in hoa màu đỏ tương phản cao (`#D32F2F`).
2. Xây dựng **Hạ tầng Giọng nói Hai chiều (FR-3 & FR-4)**:
   - Dịch vụ tổng hợp giọng nói tĩnh (TTS) tốc độ 0.9x kèm bảng mốc thời gian từ vựng (Word-level Timestamps) phục vụ hiển thị phụ đề chạy đồng bộ (Karaoke Live Captions).
   - Dịch vụ hỏi đáp tương tác thời gian thực (Voice Q&A) độ trễ $\le 1.5$ giây, tích hợp cơ chế bán song công (Half-Duplex) triệt tiêu dội âm.
3. Đảm nhiệm vai trò **Trưởng nhóm Đảm bảo Chất lượng (QA Lead)**: Thiết lập bộ tiêu chuẩn kiểm thử, giám sát tiến độ và trực tiếp nghiệm thu toàn bộ 11 Yêu cầu Chức năng (FR-1 đến FR-11) cùng 4 Yêu cầu Phi chức năng (NFR-1 đến NFR-4).

### 1.2 Phạm vi Yêu cầu Phụ trách

| Mã Yêu cầu | Tên Yêu cầu | Vai trò của Thành viên 4 |
| :---: | :--- | :--- |
| **FR-8** | Tự động sinh kịch bản hướng dẫn bình dân và chữ mẫu đỏ | **Trực tiếp xây dựng 100%** |
| **FR-3** | Trợ lý giọng nói đọc hướng dẫn từng dòng (tốc độ 0.9x) | **Trực tiếp xây dựng 100%** |
| **FR-4** | Hỏi đáp tương tác ngữ cảnh bằng giọng nói & Touch-to-Ask Chips | **Trực tiếp xây dựng 100%** |
| **FR-1 $\to$ FR-11** | Toàn bộ 11 Yêu cầu Chức năng của hệ thống | **Chủ trì thẩm định & nghiệm thu (QA Gatekeeper)** |
| **NFR-1 $\to$ NFR-4** | WCAG 2.1 AAA, Độ trễ $\le 1.5$s, Nghị định 13/2023/NĐ-CP, Fallback | **Chủ trì kiểm chuẩn kỹ thuật** |

---

## 2. MA TRẬN PHỤ THUỘC & GIAO DIỆN DỮ LIỆU (I/O MATRIX)

### 2.1 Ràng buộc Đầu vào (Upstream Dependencies)

| Đơn vị cung cấp | Dữ liệu / Cấu phần bàn giao | Định dạng kỹ thuật | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| **Nguyễn Tuấn Khánh**<br>*(Tech Lead)* | Hợp đồng giao tiếp TypeScript | `src/shared/contracts.ts` | Khóa cấu trúc kiểu dữ liệu bất biến giữa các phân hệ. |
| | Khung dự án Next.js 14 Monorepo | Mã nguồn gốc | Đảm bảo môi trường biên dịch TypeScript và chạy API routes. |
| | Khóa truy cập API dịch vụ đám mây | `.env.local` (`GEMINI_API_KEY`, Google Cloud Service Account) | Xác thực khi gọi Gemini API và Google Cloud TTS API. |
| **Nguyễn Thế Anh**<br>*(Kỹ sư CV)* | Bộ khung hình học biểu mẫu mẫu | `assets/mock-data/mock-manifest.json` (Pha 0) | Dữ liệu giả lập 9 ô của tờ khai LPTB để kiểm thử Prompt độc lập. |
| | Dữ liệu bóc tách hình học thực tế | Interface `FormGeometricManifest` (Pha 2) | Danh sách các ô (`FormGeometricBox[]`) với tọa độ chuẩn hóa $[0.0 - 1.0]$, nhãn thô (`rawText`), sắp xếp từ trên xuống dưới theo trục dọc (`ymin`). |
| **Võ Quốc Anh**<br>*(Kỹ sư Frontend)* | Giao diện hiển thị Client & Admin | Tuyến trang `/(citizen)` và `/(admin)` | Môi trường kiểm thử độ tương thích phụ đề Karaoke, kiểm thử độ trễ hỏi đáp và thẩm định trợ năng WCAG AAA. |

### 2.2 Sản phẩm Bàn giao Đầu ra (Downstream Deliverables)

| Đơn vị tiếp nhận | Dữ liệu / Cấu phần bàn giao | Định dạng kỹ thuật | Đặc tả chi tiết |
| :--- | :--- | :--- | :--- |
| **Võ Quốc Anh**<br>*(Kỹ sư Frontend)* | Dữ liệu quy trình hoàn chỉnh | `WorkflowStep[]` (khớp interface `contracts.ts`) | Kịch bản hướng dẫn, chữ mẫu đỏ in hoa, mảng nút câu hỏi gợi ý (`StepFaqItem[]`). |
| | Tệp tin âm thanh hướng dẫn | Định dạng `.mp3` (bitrate 64kbps) | Đọc bằng giọng tiếng Việt (Bắc `vi-VN-Neural2-A`, Nam `vi-VN-Neural2-D`), tốc độ 0.9x. |
| | Bảng đồng bộ mốc thời gian từ vựng | `Array<{ word: string, startMs: number, endMs: number }>` | Dữ liệu điều khiển phụ đề Karaoke đồng bộ thời gian thực với âm thanh. |
| | API Endpoint phục vụ giao diện | `POST /api/llm/qa` | Tiếp nhận câu hỏi âm thanh/văn bản, trả về phản hồi $\le 1.5$s. |
| **Nguyễn Tuấn Khánh**<br>*(Tech Lead)* | API Endpoint bóc tách quy trình | `POST /api/llm/prompt` | Nhận `FormGeometricManifest`, trả về `FormWorkflow` để lưu trữ CSDL. |
| | Gói tệp âm thanh nén (Audio Bundle) | Dung lượng $\le 1.5\text{MB}$ / biểu mẫu | Lưu trữ phục vụ cơ chế nạp trước ngoại tuyến (Offline Pre-cache qua Service Worker). |
| | Báo cáo kiểm chuẩn chất lượng (QA Report) | Văn bản nghiệm thu E2E | Căn cứ điều kiện trước khi tích hợp vào nhánh `main`. |
| **Nguyễn Thế Anh**<br>*(Kỹ sư CV)* | Báo cáo phản hồi độ chính xác OCR | Biên bản lỗi sai lệch nhãn thô | Yêu cầu tinh chỉnh thuật toán xử lý ảnh hình thái học khi phát hiện thiếu ô hoặc sai thứ tự quét. |

### 2.3 Đặc tả Hợp đồng Dữ liệu Thực thi (TypeScript Data Contracts)
Theo thỏa thuận chuẩn hóa tại [`src/shared/contracts.ts`](../src/shared/contracts.ts), cấu trúc đối tượng do Thành viên 4 chịu trách nhiệm khởi tạo và bàn giao bao gồm:

```typescript
export interface StepFaqItem {
  question: string;                  // Câu hỏi người già thường gặp tại bước này
  answer: string;                    // Lời giải đáp ngắn gọn, súc tích (tối đa 2 câu)
}

export interface WorkflowStep {
  stepIndex: number;                 // Số thứ tự bước (1, 2, 3...)
  boxId: string;                     // Ánh xạ 1-1 với boxId của OpenCV WASM
  sectionName: string;               // Phân mục hành chính chuẩn hóa
  label: string;                     // Tên nhãn trường thông tin
  voiceGuidance: string;             // Câu thoại hướng dẫn bình dân
  audioUrl: string;                  // Đường dẫn tệp tin MP3 (tốc độ 0.9x)
  exampleRedText: string;            // Chữ mẫu màu đỏ (#D32F2F), in hoa, WCAG AAA
  highlightCoords: NormalizedBoundingBox; // [ymin, xmin, ymax, xmax] trong khoảng [0.0 - 1.0]
  requiresPrerequisiteDoc?: boolean; // Cờ đánh dấu phụ thuộc chứng từ tiên quyết
  sourceFieldFromPrerequisite?: string; // Tên trường dữ liệu nguồn (ví dụ: "so_do.dien_tich")
  faqs: StepFaqItem[];               // Mảng câu hỏi hỗ trợ nút bấm nhanh (Touch-to-Ask)
}

export interface FormWorkflow {
  formId: string;
  formTitle: string;
  formCode: string;
  status: 'draft' | 'pending_review' | 'active' | 'archived';
  steps: WorkflowStep[];
}
```

---

## 3. CƠ CHẾ KIỂM SOÁT RỦI RO KỸ THUẬT (TECHNICAL SAFEGUARDS)

1. **Kiểm soát Định mức API (Quota & Rate-Limit Management):**
   - Triển khai lớp đệm lưu trữ cục bộ (`local-cache.ts` lưu vào `gemini-cache.json`).
   - Mọi yêu cầu kiểm thử có chữ ký đầu vào trùng lặp bắt buộc sử dụng kết quả trong bộ nhớ đệm, loại bỏ tình trạng phát sinh chi phí hoặc vượt ngưỡng `429 Too Many Requests`.
2. **Loại trừ Hoàn toàn Hiện tượng Sai cấu trúc Dữ liệu (Strict Schema Enforcement):**
   - Kích hoạt chế độ `Structured Outputs` với `response_schema` nghiêm ngặt theo tiêu chuẩn của Google GenAI SDK.
   - Tuyệt đối không trích xuất dữ liệu bằng biểu thức chính quy (Regex) trên chuỗi văn bản tự do, bảo đảm 100% phản hồi khớp kiểu dữ liệu `WorkflowStep`.
3. **Cơ chế Bán song công Chống Dội âm (Half-Duplex Safeguard):**
   - Trình điều khiển âm thanh lập tức vô hiệu hóa Micro khi bắt đầu phát âm qua loa (`voicePlayer.pause()`).
   - Áp dụng khoảng trễ an toàn **300ms Echo-Guard** sau khi kết thúc phát âm thanh trước khi mở lại luồng thu âm của Micro.
4. **Cơ chế Dự phòng Trợ năng khi Môi trường Nhiễu âm (Visual Touch-to-Ask Fallback):**
   - Tại mỗi bước, hệ thống luôn sinh sẵn tối thiểu 2 đối tượng `StepFaqItem` gắn liền với các nút bấm thao tác nhanh. Khi nhận diện giọng nói thất bại hoặc môi trường vượt ngưỡng tiếng ồn cho phép, giao diện lập tức chuyển hướng sang tương tác một chạm.

---

## 4. KẾ HOẠCH TRIỂN KHAI CHI TIẾT THEO NGÀY (7-DAY ACTION PLAN)

```mermaid
gantt
    title LỘ TRÌNH 7 NGÀY SPRINT 1 - PHÂN HỆ VOICE AI & QA
    dateFormat  YYYY-MM-DD
    section Pha 0: Nền tảng
    Cấu hình SDK & Local Cache Engine            :p0, 2026-09-18, 1d
    section Pha 1: Xây dựng Lõi
    FR-8: Gemini Prompt & Structured Schema      :p1a, 2026-09-19, 1d
    FR-3: Google Cloud TTS 0.9x & Timestamps     :p1b, 2026-09-20, 1d
    FR-4: Voice Q&A, Half-Duplex & Touch-to-Ask  :p1c, 2026-09-21, 1d
    section Pha 2: Ghép nối
    Khớp nối P2P (Wiring với Thành viên 2 & 3)   :p2, 2026-09-22, 1d
    section Pha 3: Nghiệm thu
    Tổng chỉ huy Kiểm thử QA 11 FRs & 4 NFRs     :p3a, 2026-09-23, 1d
    Diễn tập Thực địa & Ký Biên bản Nghiệm thu   :p3b, 2026-09-24, 1d
```

---

### NGÀY 1 (GIAI ĐOẠN 0): KHỞI TẠO NỀN TẢNG, HỢP ĐỒNG & MOCK CACHE

* **Mục tiêu:** Thiết lập hoàn chỉnh cấu trúc module `src/modules/voice-ai/`, tích hợp các thư viện SDK phụ thuộc và kích hoạt tầng lưu trữ đệm cục bộ chống lãng phí quota API.
* **Đầu vào (Inputs):**
  - Tệp tin [`src/shared/contracts.ts`](../src/shared/contracts.ts).
  - Tệp tin [`assets/mock-data/mock-manifest.json`](../assets/mock-data/mock-manifest.json).
  - Biến môi trường hệ thống trong `.env.local`.
* **Nhiệm vụ kỹ thuật:**
  1. Khởi tạo cấu trúc tệp mã nguồn độc quyền:
     - `src/modules/voice-ai/gemini-prompt.ts`
     - `src/modules/voice-ai/tts-service.ts`
     - `src/modules/voice-ai/stt-service.ts`
     - `src/modules/voice-ai/voice-qa.ts`
     - `src/modules/voice-ai/local-cache.ts`
     - `src/modules/voice-ai/test-voice.ts`
  2. Hiện thực hóa lớp `LocalCacheService` hỗ trợ băm (hash) nội dung đầu vào, thực hiện cơ chế đọc/ghi bất đồng bộ đối với tệp `gemini-cache.json`.
  3. Cấu hình kịch bản kiểm thử độc lập trong `package.json`: `"test:voice": "tsx src/modules/voice-ai/test-voice.ts"`.
* **Đầu ra (Deliverables):**
  - Chạy lệnh `npm run test:voice` xác nhận kết nối SDK và hệ thống cache hoạt động ổn định (Exit code 0).

---

### NGÀY 2 (GIAI ĐOẠN 1): HIỆN THỰC HÓA FR-8 — BỘ SINH KỊCH BẢN NGỮ NGHĨA

* **Mục tiêu:** Xây dựng dịch vụ Prompt Engineering cho Gemini 1.5 Flash tiếp nhận `FormGeometricManifest` và xuất ra `FormWorkflow` chuẩn hóa.
* **Đầu vào (Inputs):**
  - Tệp tin `mock-manifest.json` gồm 9 ô tọa độ mẫu.
* **Nhiệm vụ kỹ thuật:**
  1. **Xây dựng System Instruction chuyên biệt:**
     - Thiết lập ngôi xưng: Trợ lý xưng *"cháu"*, gọi công dân là *"bác"*.
     - Giới hạn độ dài câu: Tối đa 2 đến 3 câu đơn, sử dụng từ ngữ thuần Việt phổ thông.
     - Triển khai nguyên tắc **Strict Grounding**: Chỉ sử dụng ngữ nghĩa từ văn bản nhãn (`rawText`), tuyệt đối không suy diễn các điều khoản pháp luật không xuất hiện trong biểu mẫu.
  2. **Định nghĩa Response Schema (JSON Schema):**
     - Khóa cứng cấu trúc trường: `stepIndex`, `boxId`, `sectionName`, `label`, `voiceGuidance`, `exampleRedText`, `highlightCoords`, `faqs`.
     - Ràng buộc: `exampleRedText` bắt buộc ở định dạng IN HOA toàn bộ.
  3. **Thuật toán Gán Cờ Cảnh báo Pháp lý (`legalWarningFlag`):**
     - Tự động đánh dấu cờ đối với các trường có từ khóa: *Số tài khoản, Kho bạc, Số tiền, Mức phạt, Diện tích đất, Thửa đất, Cơ quan thụ lý*.
* **Đầu ra (Deliverables):**
  - Tệp tin kịch bản đầu ra khớp 100% với cấu trúc [`assets/mock-data/mock-workflow.json`](../assets/mock-data/mock-workflow.json).
  - Bàn giao dữ liệu cho Thành viên 2 (Frontend) tích hợp giao diện hiển thị chữ mẫu đỏ `#D32F2F` ($\ge 18$pt).

---

### NGÀY 3 (GIAI ĐOẠN 2): HIỆN THỰC HÓA FR-3 — DỊCH VỤ TỔNG HỢP GIỌNG NÓI & TIMESTAMPS

* **Mục tiêu:** Chuyển đổi toàn bộ câu thoại kịch bản thành tệp âm thanh nén và trích xuất bảng thời gian từ vựng phục vụ hiệu ứng phụ đề Karaoke.
* **Đầu vào (Inputs):**
  - Mảng chuỗi ký tự `voiceGuidance` từ kịch bản đã sinh ở Ngày 2.
* **Nhiệm vụ kỹ thuật:**
  1. **Tích hợp Google Cloud Text-to-Speech (Neural2):**
     - Cấu hình 2 hồ sơ giọng đọc:
       - Giọng miền Bắc: `vi-VN-Neural2-A` (Nữ, tần số tự nhiên).
       - Giọng miền Nam: `vi-VN-Neural2-D` (Nam, âm vực trầm ấm).
     - Khóa tham số tốc độ phát: `speakingRate = 0.9` (tốc độ đọc chậm dành cho người cao tuổi).
  2. **Bóc tách Dữ liệu Mốc thời gian (Timepoints):**
     - Kích hoạt tùy chọn `enableTimepointing: ['WORD']`.
     - Chuyển đổi phản hồi API thành mảng cấu trúc:
       ```typescript
       interface WordTimestamp {
         word: string;
         startMs: number;
         endMs: number;
       }
       ```
  3. **Đóng gói và Nén Âm thanh:**
     - Xuất các tệp âm thanh mã hóa MP3 chuẩn bitrate 64kbps, lưu trữ tại `public/audio/`.
     - Kiểm soát dung lượng: Tổng dung lượng các tệp âm thanh của một quy trình không vượt quá 1.5MB.
* **Đầu ra (Deliverables):**
  - Bộ tệp âm thanh `step_01.mp3` $\to$ `step_09.mp3` kèm tệp kê khai `timestamps.json`.
  - Bàn giao cấu phần âm thanh cho Thành viên 2 phục vụ hiển thị Karaoke phụ đề chữ chạy ($\ge 20$pt).

---

### NGÀY 4 (GIAI ĐOẠN 3): HIỆN THỰC HÓA FR-4 — HỆ THỐNG HỎI ĐÁP NGỮ CẢNH & CHỐNG DỘI ÂM

* **Mục tiêu:** Cung cấp khả năng hỏi đáp ngữ cảnh tức thời bằng giọng nói với độ trễ $\le 1.5$ giây, đồng thời loại trừ triệt để hiện tượng phản hồi âm thanh (Echo loop).
* **Đầu vào (Inputs):**
  - Ngữ cảnh bước hiện tại (`WorkflowStep`).
  - Dữ liệu âm thanh thu nhận từ Microphone của thiết bị.
* **Nhiệm vụ kỹ thuật:**
  1. **Triển khai Nhận dạng Giọng nói On-Device (STT):**
     - Sử dụng Web Speech API (`webkitSpeechRecognition`), cấu hình ngôn ngữ `vi-VN`.
     - Thực thi chuyển đổi trực tiếp trên thiết bị khách nhằm tối ưu độ trễ ($< 200$ms) và không phụ thuộc băng thông tải dữ liệu âm thanh lên máy chủ.
  2. **Hiện thực hóa Module Xử lý Hỏi đáp (`voice-qa.ts`):**
     - Xây dựng hàm xử lý kết hợp ngữ cảnh: `generateContextualAnswer(currentStep, userQuery)`.
     - Áp dụng cấu hình suy luận ngắn: Phản hồi bị giới hạn tối đa 40 từ (tương đương 2 câu ngắn), tập trung trực tiếp vào thắc mắc thao tác.
     - Đảm bảo độ trễ toàn trình từ khi kết thúc câu hỏi đến khi bắt đầu phát âm thanh phản hồi đạt $\le 1.5$ giây.
  3. **Thiết lập Khung điều khiển Bán song công (Half-Duplex Controller):**
     - Kích hoạt sự kiện ngắt tức thì đối với luồng phát âm thanh khi người dùng kích hoạt Micro.
     - Khóa thu âm và áp dụng bộ đếm thời gian trễ 300ms sau khi âm thanh hướng dẫn kết thúc trước khi kích hoạt lại bộ thu.
* **Đầu ra (Deliverables):**
  - Module logic điều khiển giọng nói hoàn chỉnh sẵn sàng tích hợp vào component `VoicePlayer`.

---

### NGÀY 5 (GIAI ĐOẠN 4): TÍCH HỢP HỆ THỐNG TRỰC TIẾP (P2P SYSTEM WIRING)

* **Mục tiêu:** Kết nối trực tiếp module Voice AI với module Xử lý Ảnh của Thành viên 3 và Giao diện Quản trị / Di động của Thành viên 2, thay thế hoàn toàn dữ liệu giả lập.
* **Nội dung phối hợp kỹ thuật:**
  1. **Tích hợp với Thành viên 3 (Kỹ sư CV):**
     - Nạp dữ liệu hình học thực tế xuất ra từ thuật toán OpenCV WASM vào `gemini-prompt.ts`.
     - Thẩm định tính tuần tự không gian: Kiểm tra trật tự mảng `boxes` bảo đảm tính đơn điệu tăng dần của tọa độ `ymin`. Yêu cầu tái sắp xếp hình học nếu phát hiện đảo lộn thứ tự.
  2. **Tích hợp với Thành viên 2 (Kỹ sư Frontend):**
     - Triển khai API Route `src/app/api/llm/prompt/route.ts` phục vụ Cột Phải của Giao diện Đối soát Chia đôi Màn hình (FR-9).
     - Đấu nối API Route `src/app/api/llm/qa/route.ts` vào nút bấm Micro trên giao diện di động.
     - Chuyển cờ cấu hình hệ thống: `useMockData = false`.
  3. **Tích hợp với Thành viên 1 (Tech Lead):**
     - Hoàn thiện việc chuyển đổi và lưu trữ đối tượng `FormWorkflow` vào bảng `form_templates` (trường `workflow_steps` kiểu JSONB) trong PostgreSQL thông qua Prisma.
* **Đầu ra (Deliverables):**
  - Luồng xử lý tuần tự (Sequential Pipeline: Upload PDF $\to$ OpenCV $\to$ Gemini Text $\to$ Admin Review) hoạt động trơn tru trên môi trường tích hợp.

---

### NGÀY 6 (GIAI ĐOẠN 5): TỔNG CHỈ HUY KIỂM THỬ TOÀN DIỆN (QA MASTER EXECUTION)

* **Mục tiêu:** Thực hiện kiểm chuẩn độc lập, đánh giá mức độ đáp ứng của toàn bộ 11 Yêu cầu Chức năng và 4 Yêu cầu Phi chức năng theo đúng tiêu chuẩn nghiệm thu định lượng.
* **Nhiệm vụ của Trưởng nhóm QA:**
  1. Vận hành bộ công cụ kiểm thử tự động và bán tự động trên thiết bị di động thực tế.
  2. Lập biên bản theo dõi lỗi (Defect Log) phân loại theo mức độ nghiêm trọng (Blocker, Critical, Major, Minor).
  3. Yêu cầu các thành viên liên quan tiến hành khắc phục triệt để các lỗi phát sinh trong ngày.

---

### NGÀY 7 (GIAI ĐOẠN 6): DIỄN TẬP QUY TRÌNH THỰC ĐỊA & KÝ BIÊN BẢN NGHIỆM THU

* **Mục tiêu:** Tái hiện hoàn chỉnh kịch bản nghiệp vụ thực tế của công dân lớn tuổi tại bàn viết cơ quan Một cửa để đo lường các chỉ số thành công cốt lõi.
* **Quy trình diễn tập hiện trường:**
  1. Chuẩn bị tài liệu vật lý: In tờ khai giấy trắng *Tờ khai lệ phí trước bạ nhà, đất (Mẫu 01/LPTB)* và bảng mica chứa mã QR cùng mã rút gọn 3 số.
  2. Sử dụng thiết bị di động cấu hình phổ thông (RAM 2GB–3GB) vận hành thử nghiệm:
     - Thao tác quét mã QR và nắn thẳng góc phối cảnh.
     - Đặt máy nằm ngang trên bàn viết, kích hoạt chế độ phát âm thanh hướng dẫn 0.9x.
     - Quan sát chữ mẫu đỏ `#D32F2F` trên màn hình và dùng bút mực điền trực tiếp vào biểu mẫu giấy.
     - Kiểm tra khả năng giữ sáng màn hình liên tục của Web Wake Lock API trong 10 phút.
     - Thực hiện ngắt kết nối mạng (Bật chế độ máy bay) để thẩm định tính khả dụng của gói dữ liệu ngoại tuyến (Offline PWA Cache).
  3. Đo lường chỉ số KPIs:
     - **Tỷ lệ hoàn thành chính xác lần đầu (SM-1):** Đo lường tỷ lệ ô điền đúng quy chuẩn, không gạch xóa (Mục tiêu: $\ge 90\%$).
     - **Thời gian hoàn thành biểu mẫu (SM-2):** Đo lường tổng thời gian từ khi quét form đến khi ký tên (Mục tiêu: $\le 12$ phút).
* **Đầu ra (Deliverables):**
  - **Biên bản Nghiệm thu Kỹ thuật Toàn diện (Final E2E QA Sign-Off)** ký xác nhận cùng Tech Lead Nguyễn Tuấn Khánh, phê duyệt phát hành phiên bản Sprint 1.

---

## 5. MA TRẬN NGHIỆM THU 11 YÊU CẦU CHỨC NĂNG (QA ACCEPTANCE MATRIX)

Bảng tiêu chuẩn kỹ thuật do Nguyễn Thanh Chiến trực tiếp áp dụng để nghiệm thu sản phẩm:

| Mã Yêu Cầu | Hạng Mục Thẩm Định | Tiêu Chuẩn Kỹ Thuật Nghiệm Thu (Pass Criteria) | Trách Nhiệm Sửa Lỗi |
| :---: | :--- | :--- | :---: |
| **FR-1** | Nhận diện & Mã 3 số | Thời gian nhận diện ảnh $\le 3.0$s (độ chính xác $\ge 95\%$); nhập mã rút gọn $\ge 24$pt chuyển bước ngay lập tức. | Thành viên 2 & 3 |
| **FR-2** | Bản sao Thị giác (Visual Twin) | Tọa độ chuẩn hóa $[0.0 - 1.0]$, viền sáng nhấp nháy khoanh đúng ô với sai số $\le 1\%$; diện tích nút bấm điều hướng $\ge 56 \times 56\text{ dp}$. | Thành viên 2 |
| **FR-3** | Giọng nói 0.9x & Phụ đề | Phát âm chuẩn xác, tốc độ cố định 0.9x; chữ phụ đề Karaoke đồng bộ hiển thị với cỡ chữ $\ge 20$pt (chuẩn WCAG AAA). | **Thành viên 4** |
| **FR-4** | Voice Q&A & Touch-to-Ask | Độ trễ phản hồi giọng nói $\le 1.5$s; hiển thị đầy đủ 2-3 nút câu hỏi nhanh phản hồi bằng âm thanh không qua thu âm. | **Thành viên 4** |
| **FR-5** | Chữ Mẫu Đỏ Tương Phản Cao | Mã màu `#D32F2F` trên nền trắng, tỷ lệ tương phản $\ge 7:1$ (WCAG 2.1 AAA), định dạng in hoa nét đậm, kích thước $\ge 18$pt. | Thành viên 2 |
| **FR-6** | Bóc tách Chứng từ Tiên quyết | Trích xuất chính xác số biên bản, ngày lập, số tiền phạt; dữ liệu chỉ tồn tại trong Session RAM, tự hủy sau 15 phút. | Thành viên 1 & 3 |
| **FR-7** | OpenCV WASM Ingestion | Xử lý phát hiện khung bảng trong thời gian $\le 100$ms với độ chính xác pixel $\ge 98\%$; công cụ vẽ ô thủ công hoạt động mượt mà. | Thành viên 3 |
| **FR-8** | Sinh Kịch bản Tự động | Câu từ bình dân, tối đa 3 câu đơn; có cờ cảnh báo `DRAFT_PENDING_LEGAL_CHECK` tại các trường tài chính/pháp lý. | **Thành viên 4** |
| **FR-9** | Cổng Đối soát Split-Screen | Màn hình hiển thị song song hai cột; nút Phê duyệt bắt buộc bị khóa cho đến khi tích chọn cam kết trách nhiệm pháp lý. | Thành viên 2 |
| **FR-10** | Cấu hình Liên chứng từ | Canvas React Flow hiển thị sơ đồ cây trực quan, cho phép kéo thả liên kết trường và thực thi kiểm thử giả lập (Test Run). | Thành viên 2 |
| **FR-11** | Thư viện Biểu mẫu & Mã QR | CRUD biểu mẫu ổn định, tự động sinh mã QR liên kết sâu; hiển thị biển cảnh báo ngưng tiếp nhận khi quá hạn `valid_until`. | Thành viên 1 |
| **NFR-1** | Trợ năng & Khóa Màn hình | Tích hợp Web Wake Lock API giữ màn hình sáng liên tục; hỗ trợ nút Thoát nhanh và xóa sạch phiên làm việc (Quick Flush). | Thành viên 2 |
| **NFR-2** | Khả năng Vận hành Ngoại tuyến | Service Worker lưu trữ đệm toàn bộ kịch bản và gói âm thanh $\le 1.5$MB; ứng dụng chạy bình thường khi ngắt toàn bộ kết nối mạng. | **Thành viên 4** |
| **NFR-3** | Tuân thủ Nghị định 13 | Không lưu trữ bất kỳ tệp tin ảnh CCCD hoặc biên bản xử phạt nào xuống ổ đĩa vật lý hay LocalStorage/IndexedDB. | Thành viên 1 |
| **NFR-4** | Cơ chế Dự phòng Đa tầng | Khi mất kết nối AI, Cổng Admin lập tức chuyển sang chế độ gán nhãn thủ công trên khung ô có sẵn mà không bị đình trệ. | Thành viên 1, 2, 4 |

---

## 6. DANH MỤC SẢN PHẨM BÀN GIAO CUỐI CÙNG (DELIVERABLES INVENTORY)

Khi kết thúc Sprint 1, Thành viên 4 có trách nhiệm bàn giao các cấu phần kỹ thuật sau:
1. **Module Bộ não Ngôn ngữ:** `src/modules/voice-ai/gemini-prompt.ts` tích hợp Structured Outputs Schema.
2. **Module Hạ tầng Giọng nói:** `src/modules/voice-ai/tts-service.ts` xuất định dạng MP3 0.9x kèm bảng mốc thời gian từ vựng.
3. **Module Hỏi đáp Thời gian thực:** `src/modules/voice-ai/voice-qa.ts` tích hợp cơ chế bán song công Half-Duplex và trễ an toàn 300ms.
4. **Hệ thống Kiểm soát Định mức:** `src/modules/voice-ai/local-cache.ts` quản lý bộ nhớ đệm kiểm thử cục bộ.
5. **Bộ Tuyến API Next.js:** 
   - `src/app/api/llm/prompt/route.ts`
   - `src/app/api/llm/qa/route.ts`
   - `src/app/api/tts/route.ts`
6. **Biên bản Đảm bảo Chất lượng:** Tệp tài liệu nghiệm thu kỹ thuật xác nhận toàn bộ 11 FRs và 4 NFRs đạt chuẩn trước khi phát hành.

---
*Tài liệu này được lưu trữ chính thức tại `docs/ACTION-PLAN-VOICE-QA.md` và đóng vai trò là chuẩn mực vận hành độc lập của Kỹ sư Voice AI & Trưởng nhóm QA.*
