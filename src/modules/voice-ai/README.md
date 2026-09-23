# Voice AI module

Module này tuân theo luồng `route → controller → service → repository → Prisma/cache`.

- `controllers/`: nhận DTO thuần và trả `ControllerResult`, không phụ thuộc Next.js.
- `services/`: Gemini prompt, TTS, STT và hỏi đáp theo ngữ cảnh.
- `repositories/`: truy cập bảng Prisma `voice_cache`.
- `hooks/`: tích hợp Web Speech/half-duplex ở phía client.
- `types/`: kiểu dữ liệu nội bộ của Voice AI.
- `tests/`: các script kiểm thử bằng `tsx`.

Composition root và public API duy nhất là `@/modules/voice-ai`. Cache file dùng chung nằm tại `@/modules/cache`; nghiệp vụ Forms nằm tại `@/modules/forms`.
