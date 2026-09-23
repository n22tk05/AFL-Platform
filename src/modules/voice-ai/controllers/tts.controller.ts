import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { TTSService } from '@/modules/voice-ai/services/tts.service';
import {
  TTSControllerDto,
  VietnameseVoiceRegion,
} from '@/modules/voice-ai/types/voice-ai.types';

export class TTSController {
  constructor(private readonly ttsService: TTSService) {}

  public async synthesize(dto: TTSControllerDto): Promise<ControllerResult<unknown>> {
    try {
      const text = dto.text as string;
      const stepIndex = (dto.stepIndex as number) || 1;
      const region = (dto.region as VietnameseVoiceRegion) || 'NORTH';

      if (!text) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'MISSING_TEXT',
              message_vi: 'Thiếu nội dung câu thoại cần phát âm.',
            },
          },
        };
      }

      const result = await this.ttsService.synthesizeSpeech(text, stepIndex, region);
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
        status: 500,
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
