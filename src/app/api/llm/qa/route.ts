import { NextRequest, NextResponse } from 'next/server';
import { voiceQAController } from '@/modules/voice-ai';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export async function POST(req: NextRequest) {
  try {
    const result = await voiceQAController.answer(await readLimitedJson(req, 4 * 1024) as Record<string, unknown>);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) {
      return NextResponse.json({ success: false, error: { code: error.message } }, { status: error.message === 'REQUEST_TOO_LARGE' ? 413 : 400 });
    }
    console.error('[API /api/llm/qa] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'QA_FAILED',
          message_vi: 'Dạ bác ơi, bác nhìn theo chữ mẫu màu đỏ trên màn hình và ghi theo giúp cháu nhé!',
        },
      },
      { status: 500 }
    );
  }
}
