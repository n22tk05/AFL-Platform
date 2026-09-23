import { NextRequest, NextResponse } from 'next/server';
import { formController } from '@/modules/forms';

export async function POST(
  req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body keeps the existing default approval metadata.
  }

  const result = await formController.approveWorkflow({
    rawFormCode: params.formCode,
    authorization: req.headers.get('authorization'),
    adminKey: req.headers.get('x-admin-key'),
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
