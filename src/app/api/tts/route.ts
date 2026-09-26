import { NextRequest, NextResponse } from 'next/server';
import { ttsController } from '@/modules/voice-ai';
import { adminAuthorizationService } from '@/modules/forms';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const adminKey = req.headers.get('x-admin-key');
  const authStatus = adminAuthorizationService.authorize(authorization, adminKey);
  if (authStatus !== 200) return NextResponse.json({ success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } }, { status: authStatus });
  try {
    const body = await readLimitedJson(req, 8 * 1024) as Record<string, unknown>;
    const result = await ttsController.synthesize({ ...body, authorization, adminKey });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) {
      return NextResponse.json({ success: false, error: { code: error.message } }, { status: error.message === 'REQUEST_TOO_LARGE' ? 413 : 400 });
    }
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
