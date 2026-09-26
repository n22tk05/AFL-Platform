import { NextRequest, NextResponse } from 'next/server';
import { promptController } from '@/modules/voice-ai';
import { adminAuthorizationService } from '@/modules/forms';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const adminKey = req.headers.get('x-admin-key');
  const authStatus = adminAuthorizationService.authorize(authorization, adminKey);
  if (authStatus !== 200) return NextResponse.json({ success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } }, { status: authStatus });
  try {
    const body = await readLimitedJson(req, 256 * 1024) as Record<string, unknown>;
    const result = await promptController.generate({ ...body, authorization, adminKey });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) {
      return NextResponse.json({ success: false, error: { code: error.message } }, { status: error.message === 'REQUEST_TOO_LARGE' ? 413 : 400 });
    }
    console.error('[API /api/llm/prompt] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PROMPT_GENERATION_FAILED',
          message_vi: 'Không thể sinh kịch bản biểu mẫu từ AI. Hệ thống đang kích hoạt chế độ dự phòng.',
        },
      },
      { status: 500 }
    );
  }
}
