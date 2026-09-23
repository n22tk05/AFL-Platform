import type { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import type { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import {
  ApproveWorkflowDto,
  GetWorkflowDto,
} from '@/modules/forms/types/form.types';
import { ControllerResult } from '@/modules/shared/types/controller-result';

export class FormController {
  constructor(
    private readonly persistenceService: FormPersistenceService,
    private readonly authorizationService: AdminAuthorizationService
  ) {}

  public async getWorkflow(dto: GetWorkflowDto): Promise<ControllerResult<unknown>> {
    try {
      if (!dto.rawFormCode) {
        return { status: 400, body: { success: false, error: 'Thiếu tham số formCode' } };
      }

      const formCode = decodeURIComponent(dto.rawFormCode);
      const workflow = await this.persistenceService.getWorkflowByFormCode(formCode);
      if (!workflow) {
        return {
          status: 404,
          body: {
            success: false,
            error: {
              code: 'WORKFLOW_NOT_FOUND',
              message_vi: `Không tìm thấy kịch bản hướng dẫn cho biểu mẫu: ${formCode}`,
            },
          },
        };
      }

      return { status: 200, body: { success: true, data: workflow } };
    } catch (error) {
      console.error('[FormController.getWorkflow] Lỗi:', error);
      return {
        status: 500,
        body: {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message_vi: 'Lỗi máy chủ khi truy xuất kịch bản biểu mẫu.',
          },
        },
      };
    }
  }

  public async approveWorkflow(dto: ApproveWorkflowDto): Promise<ControllerResult<unknown>> {
    try {
      if (!this.authorizationService.isAuthorized(dto.authorization, dto.adminKey)) {
        return {
          status: 401,
          body: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message_vi: 'Từ chối truy cập: Thiếu hoặc sai khóa xác thực Cán bộ Quản trị.',
            },
          },
        };
      }

      if (!dto.rawFormCode) {
        return { status: 400, body: { success: false, error: 'Thiếu tham số formCode' } };
      }

      const formCode = decodeURIComponent(dto.rawFormCode);
      const approval = this.authorizationService.sanitizeApproval(dto.body);
      const result = await this.persistenceService.approveWorkflow(
        formCode,
        approval.performedBy,
        approval.note
      );

      if (!result.success && result.newStatus === 'NOT_FOUND') {
        return {
          status: 404,
          body: {
            success: false,
            error: {
              code: 'FORM_NOT_FOUND',
              message_vi: `Không tìm thấy biểu mẫu hoặc kịch bản hợp lệ cho mã: ${formCode}`,
            },
          },
        };
      }

      if (!result.success) {
        return {
          status: 500,
          body: {
            success: false,
            error: {
              code: 'APPROVAL_FAILED',
              message_vi: `Không thể phê duyệt biểu mẫu ${formCode}.`,
            },
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          data: {
            formCode,
            status: result.newStatus,
            approvedBy: approval.performedBy,
            approvedAt: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      console.error('[FormController.approveWorkflow] Lỗi:', error);
      return {
        status: 500,
        body: {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message_vi: 'Lỗi máy chủ khi thực hiện phê duyệt biểu mẫu.',
          },
        },
      };
    }
  }
}
