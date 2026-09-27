import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorizationService, formController } from '@/modules/forms';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  const authorization = req.headers.get('authorization');
  const adminKey = req.headers.get('x-admin-key');
  const authStatus = adminAuthorizationService.authorize(authorization, adminKey);
  if (authStatus !== 200) return NextResponse.json({ success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } }, { status: authStatus });
  let body: unknown;
  try {
    body = await readLimitedJson(req, 4 * 1024);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_JSON';
    return NextResponse.json({ success: false, error: { code } }, { status: code === 'REQUEST_TOO_LARGE' ? 413 : 400 });
  }

  const result = await formController.approveWorkflow({
    rawFormCode: params.formCode,
    authorization,
    adminKey,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
