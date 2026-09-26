import type { FormPersistenceService } from '@/modules/forms';
import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import { PromptControllerDto } from '@/modules/voice-ai/types/voice-ai.types';
import { FormGeometricManifest } from '@/shared/contracts';
import { validateManifest } from '@/modules/forms/services/form-validation.service';
import type { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';

export class PromptController {
  constructor(
    private readonly geminiPromptService: GeminiPromptService,
    private readonly formPersistenceService: FormPersistenceService,
    private readonly authorizationService: AdminAuthorizationService
  ) {}

  public async generate(dto: PromptControllerDto): Promise<ControllerResult<unknown>> {
    const authStatus = this.authorizationService.authorize(dto.authorization, dto.adminKey);
    if (authStatus !== 200) return { status: authStatus, body: { success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } } };
    try {
      let manifest: FormGeometricManifest;
      try {
        manifest = validateManifest(dto.manifest);
      } catch {
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
      const persistResult = await this.formPersistenceService.saveDraft(manifest, workflow);

      return {
        status: 200,
        body: {
          success: true,
          data: workflow,
          meta: {
            persisted: Boolean(persistResult.workflowId),
            source: 'database',
          },
        },
      };
    } catch (error) {
      console.error('[PromptController] Lỗi xử lý:', error);
      const code = error instanceof Error ? error.message : '';
      return {
        status: code === 'FORM_ACTIVE' ? 409 : code === 'DATABASE_UNAVAILABLE' ? 503 : 502,
        body: {
          success: false,
          error: {
            code: code === 'FORM_ACTIVE' ? 'FORM_ACTIVE' : code === 'DATABASE_UNAVAILABLE' ? 'DATABASE_UNAVAILABLE' : 'PROMPT_GENERATION_FAILED',
            message_vi: 'Không thể tạo và lưu kịch bản biểu mẫu.',
          },
        },
      };
    }
  }
}
