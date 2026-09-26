import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { TTSService } from '@/modules/voice-ai/services/tts.service';
import {
  TTSControllerDto,
} from '@/modules/voice-ai/types/voice-ai.types';
import type { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';

export class TTSController {
  constructor(private readonly ttsService: TTSService, private readonly authorizationService: AdminAuthorizationService) {}

  public async synthesize(dto: TTSControllerDto): Promise<ControllerResult<unknown>> {
    const authStatus = this.authorizationService.authorize(dto.authorization, dto.adminKey);
    if (authStatus !== 200) return { status: authStatus, body: { success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } } };
    try {
      const text = dto.text;
      const stepIndex = dto.stepIndex;
      const region = dto.region ?? 'NORTH';

      if (typeof text !== 'string' || !text.trim() || text.length > 2000 ||
          !Number.isSafeInteger(stepIndex) || (stepIndex as number) < 1 || (stepIndex as number) > 1000 ||
          (region !== 'NORTH' && region !== 'SOUTH')) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'INVALID_TTS_REQUEST',
              message_vi: 'Nội dung, chỉ số bước hoặc vùng giọng không hợp lệ.',
            },
          },
        };
      }

      const result = await this.ttsService.synthesizeSpeech(text, stepIndex as number, region);
      return {
        status: 200,
        body: {
          success: true,
          data: {
            audioUrl: result.audioUrl,
            wordTimestamps: result.wordTimestamps,
          },
        },
      };
    } catch (error) {
      console.error('[TTSController] Lỗi xử lý:', error);
      return {
        status: 503,
        body: {
          success: false,
          error: {
            code: 'TTS_SYNTHESIS_FAILED',
            message_vi: 'Không thể tạo âm thanh cho bước này.',
          },
        },
      };
    }
  }
}
