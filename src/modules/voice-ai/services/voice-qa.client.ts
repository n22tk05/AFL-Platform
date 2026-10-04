export interface VoiceAnswer { answerText: string; audioUrl?: string }
export type VoiceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestVoiceAnswer(formCode: string, stepIndex: number, userQuestion: string,
  options: { fetcher?: VoiceFetch; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<VoiceAnswer> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 10000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
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
    if (timedOut) throw new Error('QA_TIMEOUT');
    if (controller.signal.aborted) throw new Error('QA_ABORTED');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export class FinalTranscriptBuffer {
  private value = '';
  update(text: string, isFinal: boolean): void {
    const value = text.trim();
    if (!isFinal || !value) return;
    if (!this.value) this.value = value;
    else if (value.startsWith(this.value)) this.value = value;
    else if (!this.value.endsWith(value)) this.value = `${this.value} ${value}`;
  }
  take(): string { const result = this.value; this.value = ''; return result; }
  clear(): void { this.value = ''; }
}

export interface RecognitionContext { formCode: string; stepIndex: number }
interface RecognitionTurn { id: number; ended: boolean; released: boolean; submitted: boolean; context?: RecognitionContext }

/** Handles press/release independently of React and async recognition callbacks. */
export class RecognitionSubmissionLifecycle {
  private nextId = 0;
  private turn: RecognitionTurn | null = null;
  private readonly transcript = new FinalTranscriptBuffer();

  begin(): number | null {
    if (this.turn && !this.turn.ended) return null;
    this.transcript.clear();
    this.turn = { id: ++this.nextId, ended: false, released: false, submitted: false };
    return this.turn.id;
  }
  result(id: number, text: string, isFinal: boolean): boolean {
    if (!this.turn || this.turn.id !== id || this.turn.submitted) return false;
    this.transcript.update(text, isFinal);
    return true;
  }
  release(id: number, context: RecognitionContext): { ready: boolean; question: string } {
    if (!this.turn || this.turn.id !== id || this.turn.released) return { ready: false, question: '' };
    this.turn.released = true;
    this.turn.context = context;
    return this.flush();
  }
  end(id: number): { ready: boolean; question: string; context?: RecognitionContext } {
    if (!this.turn || this.turn.id !== id) return { ready: false, question: '' };
    this.turn.ended = true;
    return this.flush();
  }
  reset(): void { this.turn = null; this.transcript.clear(); }
  private flush(): { ready: boolean; question: string; context?: RecognitionContext } {
    const turn = this.turn;
    if (!turn?.ended || !turn.released || turn.submitted) return { ready: false, question: '' };
    turn.submitted = true;
    const question = this.transcript.take();
    return { ready: true, question, context: turn.context };
  }
}

/** Invalidates async responses when the citizen changes workflow context. */
export class VoiceRequestGeneration {
  private generation = 0;
  invalidate(): number { return ++this.generation; }
  current(): number { return this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation; }
}