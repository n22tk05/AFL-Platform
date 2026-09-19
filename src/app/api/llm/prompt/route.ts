import { NextRequest, NextResponse } from 'next/server';
import { geminiPromptService } from '@/modules/voice-ai/gemini-prompt';
import { FormGeometricManifest } from '@/shared/contracts';

/**
 * POST /api/llm/prompt
 * API bóc tách kịch bản tiếng Việt bình dân & chữ mẫu đỏ từ bộ khung hình học OpenCV (FR-8)
 * Bàn giao cho Võ Quốc Anh (Người 2) tích hợp Cột Phải của trang Admin Review (FR-9)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const manifest: FormGeometricManifest = body.manifest;

    if (!manifest || !manifest.boxes || manifest.boxes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_MANIFEST',
            message_vi: 'Thiếu dữ liệu bộ khung hình học biểu mẫu (FormGeometricManifest).'
          }
        },
        { status: 400 }
      );
    }

    const workflow = await geminiPromptService.generateWorkflow(manifest);

    return NextResponse.json({
      success: true,
      data: workflow
    });
  } catch (error: any) {
    console.error('[API /api/llm/prompt] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PROMPT_GENERATION_FAILED',
          message_vi: 'Không thể sinh kịch bản biểu mẫu từ AI. Hệ thống đang kích hoạt chế độ dự phòng.'
        }
      },
      { status: 500 }
    );
  }
}
