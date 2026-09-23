import { ApprovalInput } from '@/modules/forms/types/form.types';

export class AdminAuthorizationService {
  constructor(private readonly getSecret = () => process.env.ADMIN_SECRET_KEY) {}

  public isAuthorized(authorization?: string | null, adminKey?: string | null): boolean {
    const secret = this.getSecret();
    if (!secret) return true;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.substring(7)
      : adminKey;
    return Boolean(token && token === secret);
  }

  public sanitizeApproval(body: unknown): ApprovalInput {
    const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    return {
      performedBy: this.sanitizeText(value.performedBy || 'Cán bộ Một cửa', 100),
      note: this.sanitizeText(
        value.note || 'Đã đối soát tọa độ hình học và nội dung chữ mẫu đỏ đạt chuẩn WCAG AAA.',
        500
      ),
    };
  }

  private sanitizeText(value: unknown, maxLength: number): string {
    return String(value || '').replace(/<[^>]*>?/gm, '').trim().substring(0, maxLength);
  }
}
