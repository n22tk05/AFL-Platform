import { formController } from '@/modules/forms';

export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  const result = await formController.listActiveForms();
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
