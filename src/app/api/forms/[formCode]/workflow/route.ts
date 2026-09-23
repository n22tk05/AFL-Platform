import { NextRequest, NextResponse } from 'next/server';
import { formController } from '@/modules/forms';

export async function GET(
  _req: NextRequest,
  { params }: { params: { formCode: string } }
) {
  const result = await formController.getWorkflow({ rawFormCode: params.formCode });
  return NextResponse.json(result.body, { status: result.status });
}
