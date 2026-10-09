import { formController } from '@/modules/forms';

export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const result = await formController.listForms({ authorization: req.headers.get('authorization'), adminKey: req.headers.get('x-admin-key') });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
