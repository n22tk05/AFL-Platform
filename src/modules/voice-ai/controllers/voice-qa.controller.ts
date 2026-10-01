import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { VoiceQAService } from '@/modules/voice-ai/services/voice-qa.service';
import { VoiceQAControllerDto } from '@/modules/voice-ai/types/voice-ai.types';
import type { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';

export class VoiceQAController {
  constructor(private readonly voiceQAService: VoiceQAService, private readonly formPersistenceService: FormPersistenceService) {}

  public async answer(dto: VoiceQAControllerDto): Promise<ControllerResult<unknown>> {
    try {
      const formCode = dto.formCode;
      const stepIndex = dto.stepIndex;
      const userQuestion = dto.userQuestion;

      if (typeof formCode !== 'string' || !formCode.trim() || formCode.length > 200 ||
          !Number.isSafeInteger(stepIndex) || (stepIndex as number) < 1 ||
          typeof userQuestion !== 'string' || !userQuestion.trim() || userQuestion.length > 500) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'INVALID_QA_REQUEST',
              message_vi: 'Mã biểu mẫu, bước hoặc câu hỏi không hợp lệ.',
            },
          },
        };
      }

      const workflow = await this.formPersistenceService.getWorkflowByFormCode(formCode);
      const currentStep = workflow?.steps.find(step => step.stepIndex === stepIndex);
      if (!currentStep) return { status: 404, body: { success: false, error: { code: 'ACTIVE_STEP_NOT_FOUND' } } };
      const result = await this.voiceQAService.answerQuestion({ formCode, currentStep, userQuestion });
      return { status: 200, body: { success: true, data: result } };
    } catch (error) {
      console.error('[VoiceQAController] Lỗi xử lý:', error);
      return {
        status: error instanceof Error && error.message === 'DATABASE_UNAVAILABLE' ? 503 : 500,
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
