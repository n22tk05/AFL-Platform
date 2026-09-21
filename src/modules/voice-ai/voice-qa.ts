import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { WorkflowStep } from '../../shared/contracts';
import { localCache } from './local-cache';

// Nạp biến môi trường từ .env
dotenv.config();

export interface QARequest {
  currentStep: WorkflowStep;
  userQuestion: string;
}

export interface QAResponse {
  answerText: string;
  latencyMs: number;
  source: 'gemini' | 'faq_match' | 'fallback';
}

/**
 * Bộ điều khiển Bán Song Công (Half-Duplex Controller)
 * Triệt tiêu hoàn toàn hiện tượng dội âm (Echo loop) tại bàn tiếp dân.
 */
export class HalfDuplexController {
  private isSpeakingState: boolean = false;
  private isListeningState: boolean = false;
  private lastSpokenAt: number = 0;
  private readonly ECHO_GUARD_DELAY_MS = 300; // Khoảng trễ 300ms triệt tiêu sóng âm

  /**
   * Trạng thái loa đang phát
   */
  public get isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  /**
   * Trạng thái mic đang thu
   */
  public get isListening(): boolean {
    return this.isListeningState;
  }

  /**
   * Khi loa bắt đầu phát âm thanh
   */
  public onAudioPlaybackStart(): void {
    this.isSpeakingState = true;
    this.isListeningState = false; // Khóa cứng Micro
  }

  /**
   * Khi loa phát xong
   */
  public onAudioPlaybackEnd(): void {
    this.isSpeakingState = false;
    this.lastSpokenAt = Date.now();
  }

  /**
   * Khi người dùng bấm nút Mic (Push-to-Talk)
   * Lập tức ngắt loa và mở Micro
   */
  public onMicPress(): { shouldPauseSpeaker: boolean } {
    const shouldPauseSpeaker = this.isSpeakingState;
    this.isSpeakingState = false;
    this.isListeningState = true;
    return { shouldPauseSpeaker };
  }

  /**
   * Khi người dùng nhả Mic
   */
  public onMicRelease(): void {
    this.isListeningState = false;
  }

  /**
   * Kiểm tra điều kiện mở Micro an toàn (Sau khi loa dứt + trễ 300ms Echo-Guard)
   */
  public canSafelyListen(): boolean {
    if (this.isSpeakingState) return false;
    return (Date.now() - this.lastSpokenAt) >= this.ECHO_GUARD_DELAY_MS;
  }
}

/**
 * Dịch vụ Hỏi đáp Ngữ cảnh Tức thì (FR-4)
 */
export class VoiceQAService {
  private client: GoogleGenAI | null = null;
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

    // 2. Kiểm tra Cache
    const cacheKey = { stepId: currentStep.boxId, query: normalizedQuery };
    const cachedAnswer = localCache.get<string>(cacheKey);
    if (cachedAnswer) {
      return {
        answerText: cachedAnswer,
        latencyMs: Date.now() - startTime,
        source: 'gemini'
      };
    }

    // 3. Nếu không có client đám mây -> Fallback nghiệp vụ an toàn
    const client = this.getClient();
    if (!client) {
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

      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        contents: prompt,
        config: {
          maxOutputTokens: 100,
          temperature: 0.2, // Nhiệt độ thấp để trả lời nhất quán, không sáng tạo tùy tiện
        }
      });

      const answerText = response.text?.trim() || 'Dạ bác nhìn vào chữ mẫu màu đỏ trên màn hình và chép lại giúp cháu nhé!';
      localCache.set(cacheKey, answerText);

      return {
        answerText,
        latencyMs: Date.now() - startTime,
        source: 'gemini'
      };

    } catch (err) {
      console.warn('[VoiceQAService] Lỗi khi gọi Gemini QA:', err);
      return this.getSafeFallbackResponse(currentStep, startTime);
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

export const voiceQAService = new VoiceQAService();
