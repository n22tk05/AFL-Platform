import { NextRequest, NextResponse } from 'next/server';
import { formPersistenceService } from '@/modules/forms/form-persistence';

/**
 * GET /api/forms/[formCode]/workflow
 * Truy vấn kịch bản hướng dẫn và tọa độ ô chuẩn hóa từ CSDL PostgreSQL (qua Prisma)
 * Phục vụ Võ Quốc Anh (Người 2 - Frontend) render ứng dụng Mobile cho Người cao tuổi
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  try {
    const rawFormCode = params.formCode;
    if (!rawFormCode) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tham số formCode' },
        { status: 400 }
      );
    }

    // Decode URL-encoded formCode (ví dụ: "01%2FLPTB" -> "01/LPTB")
    const formCode = decodeURIComponent(rawFormCode);

    const workflow = await formPersistenceService.getWorkflowByFormCode(formCode);

    if (!workflow) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message_vi: `Không tìm thấy kịch bản hướng dẫn cho biểu mẫu: ${formCode}`
          }
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: workflow
    });
  } catch (error: any) {
    console.error('[API /api/forms/[formCode]/workflow] Lỗi:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message_vi: 'Lỗi máy chủ khi truy xuất kịch bản biểu mẫu.'
        }
      },
      { status: 500 }
    );
  }
}
