import { NextRequest, NextResponse } from 'next/server';
import { voiceQAController } from '@/modules/voice-ai';

export async function POST(req: NextRequest) {
  try {
    const result = await voiceQAController.answer(await req.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
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
