import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { VoiceQAService } from '@/modules/voice-ai/services/voice-qa.service';
import { VoiceQAControllerDto } from '@/modules/voice-ai/types/voice-ai.types';
import { WorkflowStep } from '@/shared/contracts';

export class VoiceQAController {
  constructor(private readonly voiceQAService: VoiceQAService) {}

  public async answer(dto: VoiceQAControllerDto): Promise<ControllerResult<unknown>> {
    try {
      const currentStep = dto.currentStep as WorkflowStep;
      const userQuestion = dto.userQuestion as string;

      if (!currentStep || !userQuestion) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'INVALID_QA_REQUEST',
              message_vi: 'Thiếu thông tin bước hiện tại hoặc câu hỏi của công dân.',
            },
          },
        };
      }

      const result = await this.voiceQAService.answerQuestion({ currentStep, userQuestion });
      return { status: 200, body: { success: true, data: result } };
    } catch (error) {
      console.error('[VoiceQAController] Lỗi xử lý:', error);
      return {
        status: 500,
        body: {
          success: false,
          error: {
            code: 'QA_FAILED',
            message_vi: 'Dạ bác ơi, bác nhìn theo chữ mẫu màu đỏ trên màn hình và ghi theo giúp cháu nhé!',
          },
        },
      };
    }
  }
}
