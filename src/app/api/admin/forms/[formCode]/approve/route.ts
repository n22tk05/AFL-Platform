import { NextRequest, NextResponse } from 'next/server';
import { formPersistenceService } from '@/modules/forms/form-persistence';

/**
 * POST /api/admin/forms/[formCode]/approve
 * Cán bộ Một cửa bấm nút [Phê duyệt kịch bản] (FR-9 Gatekeeper)
 * Chuyển trạng thái FormWorkflow sang ACTIVE và ghi nhật ký kiểm định FormAuditLog
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  try {
    // 1. Kiểm tra xác thực Quản trị viên (RBAC / Admin Gatekeeper - QA-BUG-06)
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (adminSecret) {
      const authHeader = req.headers.get('authorization');
      const adminKeyHeader = req.headers.get('x-admin-key');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : adminKeyHeader;

      if (!token || token !== adminSecret) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message_vi: 'Từ chối truy cập: Thiếu hoặc sai khóa xác thực Cán bộ Quản trị.'
            }
          },
          { status: 401 }
        );
      }
    }

    const rawFormCode = params.formCode;
    if (!rawFormCode) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tham số formCode' },
        { status: 400 }
      );
    }

    const formCode = decodeURIComponent(rawFormCode);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body rỗng -> dùng giá trị mặc định
    }

    // 2. Vệ sinh dữ liệu (Sanitize inputs) chống Stored XSS & ký tự độc hại
    const sanitizeText = (str: string, maxLen: number) =>
      String(str || '').replace(/<[^>]*>?/gm, '').trim().substring(0, maxLen);

    const performedBy = sanitizeText(body.performedBy || 'Cán bộ Một cửa', 100);
    const note = sanitizeText(
      body.note || 'Đã đối soát tọa độ hình học và nội dung chữ mẫu đỏ đạt chuẩn WCAG AAA.',
      500
    );

    const result = await formPersistenceService.approveWorkflow(formCode, performedBy, note);

    if (!result.success) {
      if (result.newStatus === 'NOT_FOUND') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORM_NOT_FOUND',
              message_vi: `Không tìm thấy biểu mẫu hoặc kịch bản hợp lệ cho mã: ${formCode}`
            }
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'APPROVAL_FAILED',
            message_vi: `Không thể phê duyệt biểu mẫu ${formCode}.`
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        formCode,
        status: result.newStatus,
        approvedBy: performedBy,
        approvedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[API /api/admin/forms/[formCode]/approve] Lỗi:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message_vi: 'Lỗi máy chủ khi thực hiện phê duyệt biểu mẫu.'
        }
      },
      { status: 500 }
    );
  }
}
