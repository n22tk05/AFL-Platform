'use client';
import { useEffect, useState } from 'react';
import type { FormPageMetadata } from '@/shared/contracts';
import { loadAdminTemplatePages } from '../services/template-preview.client';

export function useTemplatePreview(formCode: string, pages: FormPageMetadata[] | undefined, adminKey: string) {
  const serialized = JSON.stringify(pages ?? []);
  const [loaded, setLoaded] = useState<{ code: string; key: string; serialized: string; pages: FormPageMetadata[]; error: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    setLoaded(null);
    if (adminKey) loadAdminTemplatePages(formCode, JSON.parse(serialized), adminKey, controller.signal).then(result => {
      if (controller.signal.aborted) { result.dispose(); return; }
      dispose = result.dispose;
      setLoaded({ code: formCode, key: adminKey, serialized, pages: result.pages, error: '' });
    }).catch(reason => {
      if (!controller.signal.aborted) setLoaded({ code: formCode, key: adminKey, serialized, pages: [], error: reason instanceof Error ? reason.message : 'Không tải được phôi.' });
    });
    return () => { controller.abort(); dispose?.(); };
  }, [formCode, adminKey, serialized]);
  return loaded?.code === formCode && loaded.key === adminKey && loaded.serialized === serialized ? loaded : { pages: [], error: '' };
}
