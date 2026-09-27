import { GoogleGenAI } from '@google/genai';
import type { WorkflowStep } from '@/shared/contracts';
import type { QARequest, QAResponse } from '@/modules/voice-ai/types/voice-ai.types';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
export { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';

/** Server-side Gemini QA implementation. */
export class VoiceQAService {
  private client: GoogleGenAI | null = null;
  private activeGeminiCalls = 0;
  private readonly maxGeminiCalls = 3;
  public halfDuplex: HalfDuplexController;

  private apiKey: string | undefined;

  constructor() {
    this.refreshClient();
    this.halfDuplex = new HalfDuplexController();
  }

  /**
   * Khởi tạo hoặc làm mới client từ GEMINI_API_KEY trong .env
   */
  public refreshClient(): GoogleGenAI | null {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.client = null;
    }
    return this.client;
  }

  /**
   * Lấy client Gemini, tự động nạp lại nếu biến môi trường được cập nhật
   */
  public getClient(): GoogleGenAI | null {
    if (!this.client || this.apiKey !== process.env.GEMINI_API_KEY) {
      return this.refreshClient();
    }
    return this.client;
  }

  /**
   * Trả lời câu hỏi thắc mắc của người già trong thời gian <= 1.5s
   */
  public async answerQuestion(req: QARequest): Promise<QAResponse> {
    const startTime = Date.now();
    const { currentStep, userQuestion } = req;

    // 1. Kiểm tra khớp câu hỏi nhanh với FAQ có sẵn (Latency < 10ms)
    const normalizedQuery = userQuestion.toLowerCase().trim();
    if (currentStep.faqs && currentStep.faqs.length > 0) {
      const match = currentStep.faqs.find(f => 
        normalizedQuery.includes(f.question.toLowerCase().replace(/[?.,]/g, '')) ||
        f.question.toLowerCase().includes(normalizedQuery)
      );
      if (match) {
        return {
          answerText: match.answer,
          latencyMs: Date.now() - startTime,
          source: 'faq_match'
        };
      }
    }

    // 2. Nếu không có client đám mây -> Fallback nghiệp vụ an toàn
    const client = this.getClient();
    if (!client || this.activeGeminiCalls >= this.maxGeminiCalls) {
      return this.getSafeFallbackResponse(currentStep, startTime);
    }

    try {
      const prompt = `
Bác cao tuổi đang điền ô "${currentStep.label}" (Hướng dẫn hiện tại: "${currentStep.voiceGuidance}", Chữ mẫu: "${currentStep.exampleRedText}").
Bác hỏi: "${userQuestion}"

Hãy trả lời bác:
- Bắt đầu bằng: "Dạ bác ơi, ..." hoặc "Dạ thưa bác, ..."
- Tối đa 2 câu đơn giản (dưới 35 từ), đi thẳng vào câu trả lời cụ thể.
- Tuyệt đối không trích dẫn số hiệu điều luật dài dòng.
`;

      this.activeGeminiCalls++;
      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        contents: prompt,
        config: {
          maxOutputTokens: 100,
          temperature: 0.2, // Nhiệt độ thấp để trả lời nhất quán, không sáng tạo tùy tiện
          abortSignal: AbortSignal.timeout(5000),
        }
      });

      const answerText = response.text?.trim() || 'Dạ bác nhìn vào chữ mẫu màu đỏ trên màn hình và chép lại giúp cháu nhé!';

      return {
        answerText,
        latencyMs: Date.now() - startTime,
        source: 'gemini'
      };

    } catch (err) {
      console.warn('[VoiceQAService] Lỗi khi gọi Gemini QA:', err);
      return this.getSafeFallbackResponse(currentStep, startTime);
    } finally {
      this.activeGeminiCalls--;
    }
  }

  private getSafeFallbackResponse(currentStep: WorkflowStep, startTime: number): QAResponse {
    const answerText = currentStep.exampleRedText 
      ? `Dạ bác nhìn vào chữ mẫu màu đỏ "${currentStep.exampleRedText}" và lấy bút ghi theo nhé!`
      : `Dạ bác ghi thông tin theo hướng dẫn của dòng này, nếu chưa rõ bác nhờ cán bộ quầy hỗ trợ thêm nhé!`;

    return {
      answerText,
      latencyMs: Date.now() - startTime,
      source: 'fallback'
    };
  }
}
