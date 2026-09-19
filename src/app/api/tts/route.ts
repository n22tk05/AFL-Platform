import { NextRequest, NextResponse } from 'next/server';
import { ttsService, VietnameseVoiceRegion } from '@/modules/voice-ai/tts-service';

/**
 * POST /api/tts
 * API tổng hợp giọng nói tiếng Việt tốc độ 0.9x & trích xuất mốc thời gian Karaoke (FR-3)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text;
    const stepIndex: number = body.stepIndex || 1;
    const region: VietnameseVoiceRegion = body.region || 'NORTH';

    if (!text) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_TEXT',
            message_vi: 'Thiếu nội dung câu thoại cần phát âm.'
          }
        },
        { status: 400 }
      );
    }

    const result = await ttsService.synthesizeSpeech(text, stepIndex, region);

    return NextResponse.json({
      success: true,
      data: {
        audioUrl: result.audioUrl,
        wordTimestamps: result.wordTimestamps
      }
    });
  } catch (error: any) {
    console.error('[API /api/tts] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TTS_SYNTHESIS_FAILED',
          message_vi: 'Không thể tạo âm thanh cho bước này.'
        }
      },
      { status: 500 }
    );
  }
}
