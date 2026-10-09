import { adminAuthorizationService, formController } from '@/modules/forms';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { formCode: string } }): Promise<Response> {
  const result = await formController.getWorkflowForReview({ rawFormCode: params.formCode,
    authorization: req.headers.get('authorization'), adminKey: req.headers.get('x-admin-key') });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(req: Request, { params }: { params: { formCode: string } }): Promise<Response> {
  const authorization = req.headers.get('authorization'), adminKey = req.headers.get('x-admin-key');
  const auth = adminAuthorizationService.authorize(authorization, adminKey);
  if (auth !== 200) return Response.json({ success: false, error: { code: auth === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } }, { status: auth });
  try {
    const body = await readLimitedJson(req, 256 * 1024);
    const result = await formController.saveReviewWorkflow({ rawFormCode: params.formCode, authorization, adminKey, body });
    return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON';
    return Response.json({ success: false, error: { code } }, { status: code === 'REQUEST_TOO_LARGE' ? 413 : 400 });
  }
}
