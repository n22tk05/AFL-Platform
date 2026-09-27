import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { isDeepStrictEqual } from 'node:util';
import { FormGeometricManifest, FormWorkflow, WorkflowStep } from '@/shared/contracts';
import type { LocalCacheService } from '@/modules/cache';
import { validateWorkflow } from '@/modules/forms/services/form-validation.service';

// Nạp biến môi trường từ .env

/**
 * Danh sách từ khóa nhạy cảm cần bật cờ kiểm duyệt pháp lý (Legal Warning Flag)
 */
const SENSITIVE_LEGAL_KEYWORDS = [
  'tài khoản', 'kho bạc', 'tiền phạt', 'số tiền', 'mức phạt',
  'diện tích', 'thửa đất', 'tờ bản đồ', 'cơ quan thụ lý', 'chủ sở hữu'
];

/**
 * Kiểm tra xem nhãn trường có chứa từ khóa nhạy cảm hay không
 */
function shouldFlagLegalCheck(rawText: string, label: string): boolean {
  const combined = `${rawText} ${label}`.toLowerCase();
  return SENSITIVE_LEGAL_KEYWORDS.some(kw => combined.includes(kw));
}

export class GeminiPromptService {
  private client: GoogleGenAI | null = null;
  private apiKey: string | undefined;

  constructor(private readonly cache: LocalCacheService) {
    this.refreshClient();
  }

  /**
   * Khởi tạo hoặc làm mới client từ GEMINI_API_KEY trong file .env
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
   * Tự động sinh kịch bản hướng dẫn bình dân và chữ mẫu đỏ từ FormGeometricManifest (FR-8)
   */
  public async generateWorkflow(manifest: FormGeometricManifest, forceRefresh: boolean = false): Promise<FormWorkflow> {
    const client = this.getClient();
    if (!client || !this.apiKey) {
      return this.getOfflineFallback(manifest);
    }

    // 1. Kiểm tra cache cục bộ nếu không bắt buộc làm mới (Vaccine chống cháy Quota)
    if (!forceRefresh) {
      const cached = this.cache.get<FormWorkflow>(manifest);
      if (cached) {
        validateWorkflow(manifest, cached);
        return { ...cached, status: 'pending_review' };
      }
    }

    try {
      // 3. Chuẩn bị prompt và cấu trúc schema gửi lên Gemini 1.5 Flash
      const systemInstruction = `
Bạn là Trợ lý AI kiên nhẫn và tận tâm hỗ trợ người cao tuổi (từ 60-80 tuổi) tự tay cầm bút điền tờ khai hành chính giấy tại bàn tiếp dân Một cửa ở Việt Nam.
Quy tắc xưng hô: Luôn xưng "cháu" và gọi người dùng là "bác".
Quy tắc câu thoại (voiceGuidance):
- Chuyển ngữ từ hành chính khô khan thành lời hướng dẫn bình dân, mộc mạc, dễ hiểu.
- Tối đa 2 đến 3 câu đơn ngắn gọn.
- Chỉ dẫn chính xác bác cần ghi gì vào ô giấy đang phát sáng trên màn hình.
Quy tắc chữ mẫu đỏ (exampleRedText):
- Bắt buộc viết IN HOA toàn bộ, có dấu tiếng Việt đầy đủ.
- Ví dụ cụ thể, thực tế, dễ nhìn để người già chép lại.
Quy tắc câu hỏi thường gặp (faqs):
- Sinh 2 câu hỏi - trả lời ngắn gọn giải đáp các vướng mắc phổ biến nhất tại ô đó (phục vụ nút bấm nhanh Touch-to-Ask khi quầy ồn ào).
Nguyên tắc Strict Grounding: Tuyệt đối bám sát nhãn trường bóc tách được, không tự ý suy diễn các vấn đề pháp lý ngoài biểu mẫu.
`;

      const prompt = `
Dưới đây là danh sách các ô đã bóc tách từ biểu mẫu "${manifest.formTitle}" (${manifest.formCode}):
${JSON.stringify(manifest.boxes, null, 2)}

Hãy phân tích và trả về duy nhất một mảng JSON thuần túy gồm các đối tượng WorkflowStep theo đúng thứ tự:
[
  {
    "stepIndex": 1,
    "boxId": "box_01",
    "sectionName": "Mục I: Người nộp thuế",
    "label": "Tên nhãn",
    "voiceGuidance": "Câu thoại bình dân",
    "exampleRedText": "CHỮ MẪU IN HOA",
    "faqs": [
      { "question": "Câu hỏi?", "answer": "Câu trả lời" }
    ]
  }
]
`;

      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini trả về phản hồi rỗng');
      }

      const generatedSteps: WorkflowStep[] = JSON.parse(text);
      if (!Array.isArray(generatedSteps) || generatedSteps.length !== manifest.boxes.length ||
          new Set(generatedSteps.map(step => step?.boxId)).size !== manifest.boxes.length ||
          generatedSteps.some(step => !manifest.boxes.some(box => box.boxId === step?.boxId))) {
        throw new Error('INVALID_GEMINI_WORKFLOW');
      }

      // Chuẩn hóa tọa độ và bổ sung cờ kiểm duyệt pháp lý
      const normalizedSteps = generatedSteps.map((step, idx) => {
        const matchingBox = manifest.boxes.find(b => b.boxId === step.boxId)!;
        const isSensitive = shouldFlagLegalCheck(matchingBox?.rawText || '', step.label);

        return {
          ...step,
          stepIndex: idx + 1,
          boxId: matchingBox.boxId,
          highlightCoords: matchingBox.normalizedCoords,
          audioUrl: '',
          exampleRedText: typeof step.exampleRedText === 'string' ? step.exampleRedText.toUpperCase() : '',
          legalWarningFlag: isSensitive
        };
      });

      const result: FormWorkflow = {
        formId: manifest.formId,
        formTitle: manifest.formTitle,
        formCode: manifest.formCode,
        status: 'pending_review',
        steps: normalizedSteps
      };

      validateWorkflow(manifest, result);

      // Lưu vào cache
      this.cache.set(manifest, result);
      return result;

    } catch (error) {
      console.warn('[GeminiPromptService] Lỗi khi gọi Gemini API, chuyển sang chế độ Offline Fallback:', error);
      return this.getOfflineFallback(manifest);
    }
  }

  /**
   * Fallback ngoại tuyến nạp từ mock-workflow.json khi không có mạng hoặc không có API key
   */
  private getOfflineFallback(manifest: FormGeometricManifest): FormWorkflow {
    try {
      const manifestPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-manifest.json');
      const mockPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-workflow.json');
      if (fs.existsSync(mockPath) && fs.existsSync(manifestPath)) {
        const sampleManifest: FormGeometricManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!isDeepStrictEqual(manifest, sampleManifest)) throw new Error('AI_UNAVAILABLE');
        const content = fs.readFileSync(mockPath, 'utf-8');
        const fallbackWorkflow: FormWorkflow = JSON.parse(content);
        const result: FormWorkflow = {
          ...fallbackWorkflow,
          formId: manifest.formId,
          formTitle: manifest.formTitle,
          formCode: manifest.formCode,
          status: 'pending_review',
          steps: fallbackWorkflow.steps.map(step => {
            const matchingBox = manifest.boxes.find(b => b.boxId === step.boxId);
            return {
              ...step,
              legalWarningFlag: shouldFlagLegalCheck(matchingBox?.rawText || '', step.label)
            };
          })
        };
        validateWorkflow(manifest, result);
        return result;
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'AI_UNAVAILABLE') throw error;
    }
    throw new Error('AI_UNAVAILABLE');
  }
}
