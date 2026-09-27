export type DocumentErrorCode = 'OCR_NOT_CONFIGURED' | 'OCR_TIMEOUT' | 'OCR_UNAVAILABLE' | 'STRUCTURED_UNAVAILABLE' | 'INVALID_STRUCTURED_RESPONSE' | 'OCR_LIMIT_EXCEEDED';
export class DocumentPipelineError extends Error {
  constructor(public readonly code: DocumentErrorCode) { super(code); this.name = 'DocumentPipelineError'; }
}
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, code: DocumentErrorCode, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { if (controller.signal.aborted) throw new DocumentPipelineError(code); return work(controller.signal); }),
      new Promise<never>((_, reject) => {
        cancel = () => reject(new DocumentPipelineError(code));
        controller.signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(new DocumentPipelineError(code)); }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
    if (cancel) controller.signal.removeEventListener('abort', cancel);
  }
}
