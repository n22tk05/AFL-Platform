import { NextRequest, NextResponse } from 'next/server';
import { promptController } from '@/modules/voice-ai';

export async function POST(req: NextRequest) {
  try {
    const result = await promptController.generate(await req.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
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
