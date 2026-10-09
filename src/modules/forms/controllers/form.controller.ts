import type { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import type { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import {
  ApproveWorkflowDto,
  GetWorkflowDto,
  ListFormsDto,
  AdminFormSummary,
  ReviewWorkflowDto,
  SaveReviewWorkflowDto,
} from '@/modules/forms/types/form.types';
import { ControllerResult } from '@/modules/shared/types/controller-result';
import type { FormWorkflow } from '@/shared/contracts';

export class FormController {
  constructor(
    private readonly persistenceService: FormPersistenceService,
    private readonly authorizationService: AdminAuthorizationService
  ) {}

   private authorizationFailure(status: 401 | 503): ControllerResult<unknown> {
    return { status, body: { success: false, error: { code: status === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } } };
  }

  public async listForms(dto: ListFormsDto): Promise<ControllerResult<{ forms: AdminFormSummary[] } | unknown>> {
    const auth = this.authorizationService.authorize(dto.authorization, dto.adminKey);
    if (auth !== 200) return this.authorizationFailure(auth);
    try { return { status: 200, body: { success: true, data: { forms: await this.persistenceService.listForms() } } }; }
    catch { return { status: 503, body: { success: false, error: { code: 'DATABASE_UNAVAILABLE' } } }; }
  }

  public async getWorkflowForReview(dto: ReviewWorkflowDto): Promise<ControllerResult<unknown>> {
    const auth = this.authorizationService.authorize(dto.authorization, dto.adminKey);
    if (auth !== 200) return this.authorizationFailure(auth);
    if (!dto.rawFormCode) return { status: 400, body: { success: false, error: { code: 'FORM_CODE_REQUIRED' } } };
    try {
      const formCode = decodeURIComponent(dto.rawFormCode);
      const workflow = await this.persistenceService.getWorkflowForReview(formCode);
      if (!workflow) return { status: 404, body: { success: false, error: { code: 'FORM_NOT_FOUND' } } };
      return { status: 200, body: { success: true, data: workflow } };
    } catch { return { status: 503, body: { success: false, error: { code: 'DATABASE_UNAVAILABLE' } } }; }
  }

  public async saveReviewWorkflow(dto: SaveReviewWorkflowDto): Promise<ControllerResult<unknown>> {
    const auth = this.authorizationService.authorize(dto.authorization, dto.adminKey);
    if (auth !== 200) return this.authorizationFailure(auth);
    if (!dto.rawFormCode) return { status: 400, body: { success: false, error: { code: 'FORM_CODE_REQUIRED' } } };
    const formCode = decodeURIComponent(dto.rawFormCode);
    const workflow = dto.body as FormWorkflow | null;
    if (!workflow || typeof workflow !== 'object' || workflow.formCode !== formCode || !Array.isArray(workflow.steps)) {
      return { status: 400, body: { success: false, error: { code: 'INVALID_WORKFLOW' } } };
    }
    try {
      const result = await this.persistenceService.saveReviewWorkflow(formCode, workflow);
      return { status: 200, body: { success: true, data: { formCode, workflowId: result.workflowId, stepCount: result.stepCount } } };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'NOT_FOUND') return { status: 404, body: { success: false, error: { code: 'FORM_NOT_FOUND' } } };
      if (message === 'FORM_ACTIVE') return { status: 409, body: { success: false, error: { code: 'FORM_ACTIVE' } } };
      if (message === 'REVIEW_CONFLICT') return { status: 409, body: { success: false, error: { code: 'REVIEW_CONFLICT' } } };
      if (message === 'INVALID_WORKFLOW' || message === 'FORM_CODE_MISMATCH') return { status: 400, body: { success: false, error: { code: 'INVALID_WORKFLOW' } } };
      return { status: 503, body: { success: false, error: { code: 'DATABASE_UNAVAILABLE' } } };
    }
  }

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
        status: 503,
        body: {
          success: false,
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message_vi: 'Cơ sở dữ liệu tạm thời không khả dụng.',
          },
        },
      };
    }
  }

  public async approveWorkflow(dto: ApproveWorkflowDto): Promise<ControllerResult<unknown>> {
    try {
      const authStatus = this.authorizationService.authorize(dto.authorization, dto.adminKey);
      if (authStatus !== 200) {
        return {
          status: authStatus,
          body: {
            success: false,
            error: {
              code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED',
              message_vi: authStatus === 503 ? 'Chưa cấu hình khóa quản trị.' : 'Khóa quản trị không hợp lệ.',
            },
          },
        };
      }

      if (!dto.rawFormCode) {
        return { status: 400, body: { success: false, error: 'Thiếu tham số formCode' } };
      }

      const formCode = decodeURIComponent(dto.rawFormCode);
      if (!dto.body || typeof dto.body !== 'object' || (dto.body as Record<string, unknown>).reviewConfirmed !== true) {
        return { status: 409, body: { success: false, error: { code: 'REVIEW_NOT_CONFIRMED' } } };
      }
      const approval = this.authorizationService.sanitizeApproval(dto.body);
      const result = await this.persistenceService.approveWorkflow(
        formCode,
        'shared_admin_key',
        approval.note,
        approval.performedBy
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
        if (result.newStatus === 'REVIEW_CONFLICT') {
          return { status: 409, body: { success: false, error: { code: 'REVIEW_CONFLICT' } } };
        }
        return {
          status: 503,
          body: {
            success: false,
            error: {
              code: 'DATABASE_UNAVAILABLE',
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
            approvedBy: 'shared_admin_key',
            reviewerName: approval.performedBy,
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
