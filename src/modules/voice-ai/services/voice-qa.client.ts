export interface VoiceAnswer { answerText: string; audioUrl?: string }
export type VoiceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestVoiceAnswer(formCode: string, stepIndex: number, userQuestion: string,
  options: { fetcher?: VoiceFetch; timeoutMs?: number } = {}): Promise<VoiceAnswer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const response = await (options.fetcher ?? fetch)('/api/llm/qa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formCode, stepIndex, userQuestion }), signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || typeof payload?.data?.answerText !== 'string') {
      throw new Error(payload?.error?.message_vi || `QA_HTTP_${response.status}`);
    }
    return { answerText: payload.data.answerText, ...(typeof payload.data.audioUrl === 'string' ? { audioUrl: payload.data.audioUrl } : {}) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('QA_TIMEOUT');
    throw error;
  } finally { clearTimeout(timeout); }
}

export class FinalTranscriptBuffer {
  private value = '';
  update(text: string, isFinal: boolean): void { if (isFinal && text.trim()) this.value = text.trim(); }
  take(): string { const result = this.value; this.value = ''; return result; }
  clear(): void { this.value = ''; }
}
