import type { FormPageMetadata } from '@/shared/contracts';

export async function loadAdminTemplatePages(formCode: string, pages: FormPageMetadata[], adminKey: string, signal: AbortSignal,
  options: { fetcher?: typeof fetch; createUrl?: (blob: Blob) => string; revokeUrl?: (url: string) => void } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const createUrl = options.createUrl ?? URL.createObjectURL;
  const revokeUrl = options.revokeUrl ?? URL.revokeObjectURL;
  const loaded: FormPageMetadata[] = [];
  try {
    for (const page of pages) {
      const match = /\?asset=([a-f0-9]{64})$/.exec(page.imageUrl);
      const expected = `/api/forms/${encodeURIComponent(formCode)}/pages/${page.pageNumber}?asset=${match?.[1]}`;
      if (!match || page.imageUrl !== expected) throw new Error('INVALID_TEMPLATE_URL');
      const response = await fetcher(`/api/admin/forms/${encodeURIComponent(formCode)}/pages/${page.pageNumber}?asset=${match[1]}`,
        { headers: { 'x-admin-key': adminKey }, cache: 'no-store', signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error(`TEMPLATE_HTTP_${response.status}`);
      const blob = await response.blob();
      if (signal.aborted) throw new Error('TEMPLATE_ABORTED');
      loaded.push({ ...page, imageUrl: createUrl(blob) });
    }
    return { pages: loaded, dispose: () => loaded.forEach(page => revokeUrl(page.imageUrl)) };
  } catch (reason) { loaded.forEach(page => revokeUrl(page.imageUrl)); throw reason; }
}
