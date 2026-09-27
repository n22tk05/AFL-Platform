import { NextRequest, NextResponse } from 'next/server';
import { formController } from '@/modules/forms';

export async function GET(req: NextRequest) {
  const result = await formController.listForms({
    authorization: req.headers.get('authorization'),
    adminKey: req.headers.get('x-admin-key'),
  });
  return NextResponse.json(result.body, { status: result.status });
}
