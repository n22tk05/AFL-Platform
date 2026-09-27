import { NextRequest, NextResponse } from 'next/server';
import { formController } from '@/modules/forms';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  const result = await formController.getWorkflowForReview({
    rawFormCode: params.formCode,
    authorization: req.headers.get('authorization'),
    adminKey: req.headers.get('x-admin-key'),
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  let body: unknown;
  try { body = await readLimitedJson(req, 128 * 1024); }
  catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_JSON';
    return NextResponse.json({ success: false, error: { code } }, { status: code === 'REQUEST_TOO_LARGE' ? 413 : 400 });
  }
  const result = await formController.saveReviewWorkflow({
    rawFormCode: params.formCode,
    authorization: req.headers.get('authorization'),
    adminKey: req.headers.get('x-admin-key'),
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
