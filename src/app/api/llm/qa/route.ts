import { NextRequest, NextResponse } from 'next/server';
import { voiceQAService } from '@/modules/voice-ai/voice-qa';
import { WorkflowStep } from '@/shared/contracts';

/**
 * POST /api/llm/qa
 * API hỏi đáp ngữ cảnh tức thì bằng giọng nói & Touch-to-Ask (FR-4)
 * Cam kết độ trễ <= 1.5s
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const currentStep: WorkflowStep = body.currentStep;
    const userQuestion: string = body.userQuestion;

    if (!currentStep || !userQuestion) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_QA_REQUEST',
            message_vi: 'Thiếu thông tin bước hiện tại hoặc câu hỏi của công dân.'
          }
        },
        { status: 400 }
      );
    }

    const qaResult = await voiceQAService.answerQuestion({
      currentStep,
      userQuestion
    });

    return NextResponse.json({
      success: true,
      data: qaResult
    });
  } catch (error: any) {
    console.error('[API /api/llm/qa] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'QA_FAILED',
          message_vi: 'Dạ bác ơi, bác nhìn theo chữ mẫu màu đỏ trên màn hình và ghi theo giúp cháu nhé!'
        }
      },
      { status: 500 }
    );
  }
}
