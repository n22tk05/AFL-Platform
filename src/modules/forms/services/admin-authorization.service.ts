import { ApprovalInput } from '@/modules/forms/types/form.types';

export class AdminAuthorizationService {
  constructor(private readonly getSecret = () => process.env.ADMIN_SECRET_KEY) {}

  public authorize(authorization?: string | null, adminKey?: string | null): 200 | 401 | 503 {
    const secret = this.getSecret();
    if (!secret?.trim()) return 503;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.substring(7)
      : adminKey;
    return token === secret ? 200 : 401;
  }

  public isAuthorized(authorization?: string | null, adminKey?: string | null): boolean {
    return this.authorize(authorization, adminKey) === 200;
  }

  public sanitizeApproval(body: unknown): ApprovalInput {
    const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    return {
      performedBy: this.sanitizeText(value.performedBy || '', 100),
      note: this.sanitizeText(
        value.note || 'Đã xác nhận kiểm duyệt kịch bản và tọa độ hình học.',
        500
      ),
    };
  }

  private sanitizeText(value: unknown, maxLength: number): string {
    return String(value || '').replace(/<[^>]*>?/gm, '').trim().substring(0, maxLength);
  }
}
