export async function requestStepAudio(text: string, stepIndex: number, region: 'NORTH' | 'SOUTH', adminKey: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<string> {
  if (!adminKey.trim() || !text.trim() || text.length > 2000 || !Number.isSafeInteger(stepIndex) || stepIndex < 1 || stepIndex > 1000
    || !['NORTH', 'SOUTH'].includes(region)) throw new Error('INVALID_TTS_REQUEST');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 20000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await (options.fetcher ?? fetch)('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ text, stepIndex, region }), signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || !/^\/api\/audio\/[a-f0-9]{64}\.mp3$/.test(payload?.data?.audioUrl ?? '')) {
      throw new Error(payload?.error?.message_vi || `TTS_HTTP_${response.status}`);
    }
    return payload.data.audioUrl;
  } catch (reason) {
    if (timedOut) throw new Error('TTS_TIMEOUT');
    if (controller.signal.aborted) throw new Error('TTS_ABORTED');
    throw reason;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
