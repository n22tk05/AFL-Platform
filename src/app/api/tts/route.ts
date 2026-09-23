import { NextRequest, NextResponse } from 'next/server';
import { ttsController } from '@/modules/voice-ai';

export async function POST(req: NextRequest) {
  try {
    const result = await ttsController.synthesize(await req.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[API /api/tts] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TTS_SYNTHESIS_FAILED',
          message_vi: 'Không thể tạo âm thanh cho bước này.',
        },
      },
      { status: 500 }
    );
  }
}
