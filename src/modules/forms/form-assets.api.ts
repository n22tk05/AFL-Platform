import { InputError, parseDocumentImage } from '@/modules/documents/api';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';
import type { AdminAuthorizationService } from './services/admin-authorization.service';
import { FormArtifactStore } from './services/form-artifact-store';

export async function handleFormAssetUpload(req: Request, authorization: AdminAuthorizationService, store: FormArtifactStore) {
  const headers = { 'Cache-Control': 'no-store' };
  const status = authorization.authorize(req.headers.get('authorization'), req.headers.get('x-admin-key'));
  if (status !== 200) return Response.json({ success: false, error: { code: status === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } }, { status, headers });
  try {
    const body = await readLimitedJson(req, 12 * 1024 * 1024) as Record<string, unknown>;
    if (!body || body.blankTemplateConfirmed !== true || typeof body.formCode !== 'string' || body.formCode.length > 200 || /[\x00-\x1f]/.test(body.formCode)
      || !/^[A-Za-z0-9À-ỹ][A-Za-z0-9À-ỹ\s:()./_-]*$/.test(body.formCode)
      || (body.pageNumber !== undefined && (!Number.isSafeInteger(body.pageNumber) || (body.pageNumber as number) < 1
        || (body.pageNumber as number) > 20))) throw new Error('INVALID_TEMPLATE_UPLOAD');
    const input = await parseDocumentImage(new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: body.imageBase64 }) }));
    const page = await store.saveImage(body.formCode, input.bytes, (body.pageNumber as number | undefined) ?? 1);
    return Response.json({ success: true, data: page }, { headers });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    const invalid = ['INVALID_TEMPLATE_UPLOAD', 'INVALID_JSON'].includes(message);
    const status = reason instanceof InputError ? reason.status : /TOO_LARGE/.test(message) ? 413 : invalid ? 400 : 503;
    const code = reason instanceof InputError ? reason.code : status === 503 ? 'FORM_ASSET_UNAVAILABLE' : message;
    return Response.json({ success: false, error: { code } }, { status, headers });
  }
}
