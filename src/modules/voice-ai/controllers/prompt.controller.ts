import type { FormPersistenceService } from '@/modules/forms';
import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import { PromptControllerDto } from '@/modules/voice-ai/types/voice-ai.types';
import { FormGeometricManifest } from '@/shared/contracts';

export class PromptController {
  constructor(
    private readonly geminiPromptService: GeminiPromptService,
    private readonly formPersistenceService: FormPersistenceService
  ) {}

  public async generate(dto: PromptControllerDto): Promise<ControllerResult<unknown>> {
    try {
      const manifest = dto.manifest as FormGeometricManifest | undefined;
      if (!manifest || !manifest.boxes || manifest.boxes.length === 0) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'INVALID_MANIFEST',
              message_vi: 'Thiếu dữ liệu bộ khung hình học biểu mẫu (FormGeometricManifest).',
            },
          },
        };
      }

      const workflow = await this.geminiPromptService.generateWorkflow(manifest);
      await this.formPersistenceService.saveGeometricManifest(manifest);
      const persistResult = await this.formPersistenceService.saveWorkflow(workflow);

      return {
        status: 200,
        body: {
          success: true,
          data: workflow,
          meta: {
            persisted: persistResult.success,
            source: persistResult.source,
          },
        },
      };
    } catch (error) {
      console.error('[PromptController] Lỗi xử lý:', error);
      return {
        status: 500,
        body: {
          success: false,
          error: {
            code: 'PROMPT_GENERATION_FAILED',
            message_vi: 'Không thể sinh kịch bản biểu mẫu từ AI. Hệ thống đang kích hoạt chế độ dự phòng.',
          },
        },
      };
    }
  }
}
