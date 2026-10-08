import type { FormWorkflow } from '@/shared/contracts';
import { FormArtifactStore } from './services/form-artifact-store';
import type { AdminAuthorizationService } from './services/admin-authorization.service';

export async function handleFormImage(req: Request, formCode: string, pageNumber: string, dependencies: {
  load: (formCode: string) => Promise<FormWorkflow | null>; store: FormArtifactStore; authorization?: AdminAuthorizationService;
}): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (dependencies.authorization) {
    const status = dependencies.authorization.authorize(req.headers.get('authorization'), req.headers.get('x-admin-key'));
    if (status !== 200) return Response.json({ success: false }, { status, headers });
  }
  const asset = new URL(req.url).searchParams.get('asset') ?? '';
  if (!/^[1-9]\d*$/.test(pageNumber) || !/^[a-f0-9]{64}$/.test(asset)) return Response.json({ success: false }, { status: 400, headers });
  try {
    const workflow = await dependencies.load(formCode);
    if (!dependencies.authorization && workflow?.status !== 'ACTIVE') return Response.json({ success: false }, { status: 404, headers });
    const page = workflow?.pages?.find(candidate => candidate.pageNumber === Number(pageNumber));
    if (!page || page.imageUrl !== dependencies.store.imageUrl(formCode, Number(pageNumber), asset)) return Response.json({ success: false }, { status: 404, headers });
    return new Response(new Uint8Array(dependencies.store.readImage(asset)), { headers: { ...headers, 'Content-Type': 'image/png' } });
  } catch { return Response.json({ success: false }, { status: 503, headers }); }
}
