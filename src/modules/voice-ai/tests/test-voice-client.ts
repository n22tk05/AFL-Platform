import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { startVoicePlayback } from '@/modules/voice-ai/services/voice-playback.service';
import { requestVoiceAnswer, FinalTranscriptBuffer, RecognitionSubmissionLifecycle, VoiceRequestGeneration } from '@/modules/voice-ai/services/voice-qa.client';
import { useVoiceAssistant } from '@/modules/voice-ai/hooks/use-voice-assistant';
import React from 'react';

// Small deterministic hook runner: the hook and its effects are production code;
// only React's dispatcher and browser clocks/devices are supplied by the test.
function hookHarness<T>(hook: () => T) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const slots: any[] = []; let cursor = 0; let pendingEffects: Array<() => void> = []; let canListenTrueTransitions = 0;
  const depsEqual = (a: any[] | undefined, b: any[] | undefined) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const dispatcher = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v: any) => { const next = typeof v === 'function' ? v(slots[i]) : v; if (i === 8 && next === true && slots[i] !== true) canListenTrueTransitions++; slots[i] = next; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || !depsEqual(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn: () => any, deps: any[]) { const i = cursor++; const prev = slots[i]; if (!prev || !depsEqual(prev.deps, deps)) { pendingEffects.push(() => { prev?.cleanup?.(); const cleanup = fn(); slots[i] = { deps, cleanup }; }); } },
  };
  let value!: T;
  const render = () => { cursor = 0; const old = internals.ReactCurrentDispatcher.current; internals.ReactCurrentDispatcher.current = dispatcher; try { value = hook(); } finally { internals.ReactCurrentDispatcher.current = old; } const effects = pendingEffects; pendingEffects = []; effects.forEach(run => run()); return value; };
  return { render, get value() { return value; }, get canListenTrueTransitions() { return canListenTrueTransitions; } };
}

async function run() {
  // Genuine hook callback regression: completing speech starts the echo timer;
  // stopping in that window must preserve the eventual listening recovery.
  const oldNow = Date.now; const oldSetTimeout = globalThis.setTimeout; const oldClearTimeout = globalThis.clearTimeout;
  let now = 1000; let timerId = 0; const timers = new Map<number, { at: number; fn: () => void }>();
  Date.now = () => now;
  (globalThis as any).setTimeout = (fn: () => void, ms: number) => { const id = ++timerId; timers.set(id, { at: now + ms, fn }); return id; };
  (globalThis as any).clearTimeout = (id: number) => { timers.delete(id); };
  const fireTimers = (advance: number) => { now += advance; for (const [id, timer] of Array.from(timers.entries())) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
  const speechClosures: Array<() => void> = [];
  const hook = hookHarness(() => useVoiceAssistant({ formCode: 'FORM', stepIndex: 1,
    fetcher: async () => Response.json({ success: false, error: { message_vi: 'FAQ unavailable' } }, { status: 503 }),
    speak: (_text, done) => { speechClosures.push(done); return () => {}; } }));
  let voice = hook.render();
  voice.playAnswer('hello');
  speechClosures[0]();
  voice = hook.render();
  assert.equal(voice.canListen, false);
  voice.stopAudio(); voice = hook.render();
  voice.stopAudio(); voice = hook.render();
  fireTimers(301); voice = hook.render();
  assert.equal(voice.canListen, true, 'cancel during echo guard recovers listening exactly once');
  assert.equal(hook.canListenTrueTransitions, 1, 'echo guard enables listening with one state transition');
  void voice.playAnswer('faq answer'); speechClosures[1](); voice = hook.render();
  voice.stopAudio(); await voice.askQuestion('FORM', 1, 'FAQ question');
  fireTimers(301); voice = hook.render();
  assert.equal(voice.canListen, true, 'failed FAQ after repeated stop still releases the echo guard');
  assert.equal(hook.canListenTrueTransitions, 2, 'failed FAQ guard recovery performs one additional enabled transition');
  (globalThis as any).setTimeout = oldSetTimeout; (globalThis as any).clearTimeout = oldClearTimeout; Date.now = oldNow;

  const oldWindow = (globalThis as any).window;
  const recognitionDevices: any[] = []; let failNextStart = false;
  class FakeRecognition {
    onstart: (() => void) | null = null; onresult: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null; onend: (() => void) | null = null;
    start() { if (failNextStart) { failNextStart = false; throw Object.assign(new Error('busy'), { name: 'InvalidStateError' }); } }
    stop() {} abort() {}
    constructor() { recognitionDevices.push(this); }
  }
  (globalThis as any).window = { SpeechRecognition: FakeRecognition };
  const submitted: string[] = []; const shown: string[] = [];
  const recognitionHook = hookHarness(() => useVoiceAssistant({ formCode: 'FORM', stepIndex: 1,
    onTranscriptUpdate: value => shown.push(value),
    fetcher: async (_url, init) => { submitted.push(JSON.parse(String(init?.body)).userQuestion); return Response.json({ success: true, data: { answerText: 'ok' } }); },
  }));
  let recognizer = recognitionHook.render(); assert.equal(recognizer.startListening(), true);
  const deviceA = recognitionDevices[recognitionDevices.length - 1];
  recognizer.stopAudio();
  assert.equal(recognizer.startListening(), true, 'restart after abort opens a fresh recognition session');
  const deviceB = recognitionDevices[recognitionDevices.length - 1];
  deviceA.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'OLD TURN' }, isFinal: true }] });
  deviceA.onend?.();
  assert.deepEqual(shown, [], 'aborted recognition result closure cannot update transcript');
  assert.deepEqual(submitted, [], 'aborted recognition end closure cannot submit QA');
  deviceB.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'CURRENT TURN' }, isFinal: true }] });
  deviceB.onend?.(); recognizer.stopListening();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(submitted, ['CURRENT TURN']);
  recognizer.stopAudio(); recognizer = recognitionHook.render(); failNextStart = true;
  assert.equal(recognizer.startListening(), false, 'failed recognition start is reported');
  const deviceFailed = recognitionDevices[recognitionDevices.length - 1];
  deviceFailed.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'FAILED SESSION' }, isFinal: true }] });
  deviceFailed.onend?.();
  deviceB.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'OLD AFTER FAILED START' }, isFinal: true }] });
  deviceB.onend?.();
  assert.deepEqual(shown, ['CURRENT TURN']);
  assert.deepEqual(submitted, ['CURRENT TURN'], 'failed start leaves no submit-capable turn');
  (globalThis as any).window = oldWindow;

  let delayedResolve!: (response: Response) => void; let delayedOptions: any;
  let delayedAnswers = 0; let delayedSpeech = 0;
  const delayedHook = hookHarness(() => useVoiceAssistant(delayedOptions));
  delayedOptions = { formCode: 'FORM', stepIndex: 1,
    fetcher: () => new Promise<Response>(resolve => { delayedResolve = resolve; }),
    onAnswerReceived: () => { delayedAnswers++; },
    speak: () => { delayedSpeech++; return () => {}; },
  };
  const delayedVoice = delayedHook.render();
  const pendingAnswer = delayedVoice.askQuestion('FORM', 1, 'old context');
  delayedOptions = { ...delayedOptions, stepIndex: 2 };
  delayedHook.render();
  delayedResolve(Response.json({ success: true, data: { answerText: 'stale answer' } }));
  await pendingAnswer;
  assert.equal(delayedAnswers, 0, 'delayed QA response after context change is ignored by the hook');
  assert.equal(delayedSpeech, 0, 'stale QA response cannot start playback');
  const duplex = new HalfDuplexController();
  duplex.onAudioPlaybackStart();
  assert.equal(duplex.onMicPress().shouldPauseSpeaker, true);
  assert.equal(duplex.isListening, true);
  duplex.onAudioPlaybackStart();
  assert.equal(duplex.isListening, false, 'speaker start locks the mic');
  duplex.onAudioPlaybackEnd();
  assert.equal(duplex.canSafelyListen(), false, '300ms release protects against echo');

  const transcript = new FinalTranscriptBuffer();
  transcript.update('interim text', false);
  assert.equal(transcript.take(), '', 'interim text is never submitted');
  transcript.update('first final', true); transcript.update('second final', true);
  assert.equal(transcript.take(), 'first final second final');
  assert.equal(transcript.take(), '', 'final transcript is consumed once');

  const lifecycle = new RecognitionSubmissionLifecycle();
  const rapid = lifecycle.begin()!;
  assert.deepEqual(lifecycle.release(rapid, { formCode: 'FORM', stepIndex: 1 }), { ready: false, question: '' }, 'release before async onstart is retained');
  lifecycle.result(rapid, 'late finalized question', true);
  assert.deepEqual(lifecycle.end(rapid), { ready: true, question: 'late finalized question', context: { formCode: 'FORM', stepIndex: 1 } });
  assert.deepEqual(lifecycle.end(rapid), { ready: false, question: '' }, 'one recognition turn submits at most once');
  const endedFirst = lifecycle.begin()!;
  lifecycle.result(endedFirst, 'ended before release', true);
  assert.deepEqual(lifecycle.end(endedFirst), { ready: false, question: '' }, 'natural end waits for release intent');
  assert.deepEqual(lifecycle.release(endedFirst, { formCode: 'FORM', stepIndex: 2 }), { ready: true, question: 'ended before release', context: { formCode: 'FORM', stepIndex: 2 } });

  let request: { url: RequestInfo | URL; init?: RequestInit } | undefined;
  const answer = await requestVoiceAnswer('Mẫu số: 01/LPTB', 1, 'question', {
    fetcher: async (url, init) => { request = { url, init }; return Response.json({ success: true, data: { answerText: 'Answer', audioUrl: '/answer.mp3' } }); },
  });
  assert.equal(request?.url, '/api/llm/qa');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { formCode: 'Mẫu số: 01/LPTB', stepIndex: 1, userQuestion: 'question' });
  assert.deepEqual(answer, { answerText: 'Answer', audioUrl: '/answer.mp3' });
  await assert.rejects(requestVoiceAnswer('code', 1, 'q', { fetcher: async () => Response.json({ success: false, error: { message_vi: 'Unavailable' } }, { status: 503 }) }), /Unavailable/);
  await assert.rejects(requestVoiceAnswer('code', 1, 'q', { timeoutMs: 1, fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) }), /QA_TIMEOUT/);
  const abort = new AbortController();
  const abortedRequest = requestVoiceAnswer('FORM', 1, 'q', { signal: abort.signal, fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
  abort.abort();
  await assert.rejects(abortedRequest, /QA_ABORTED/);
  const generation = new VoiceRequestGeneration();
  const oldRequest = generation.current(); generation.invalidate();
  assert.equal(generation.isCurrent(oldRequest), false, 'step navigation invalidates a delayed QA response');

  const playbackState: boolean[] = [];
  const duplexDuringSpeech = new HalfDuplexController();
  duplexDuringSpeech.onAudioPlaybackStart();
  let speechDone: (() => void) | undefined;
  const media = { play: async () => { throw new Error('rejected'); }, pause: () => {}, currentTime: 0, onended: null as (() => void) | null, onerror: null as (() => void) | null };
  const rejectionSession = startVoicePlayback('spoken fallback', '/broken.mp3', playing => {
    playbackState.push(playing);
    if (!playing) duplexDuringSpeech.onAudioPlaybackEnd();
  }, { createAudio: () => media, speak: (_text, done) => { speechDone = done; return () => {}; } });
  const assignedMediaError = media.onerror!;
  await Promise.resolve(); await Promise.resolve();
  assignedMediaError();
  assert.deepEqual(playbackState, [true], 'media rejection keeps the same playback session active');
  assert.equal(duplexDuringSpeech.isSpeaking, true, 'microphone stays locked during long browser synthesis');
  assert.equal(duplexDuringSpeech.canSafelyListen(), false);
  speechDone?.(); await rejectionSession.promise;
  assert.deepEqual(playbackState, [true, false]);

  let speechEnded!: () => void;
  let cancelMedia = 0;
  let replacedMedia: any;
  const superseded = startVoicePlayback('first', '/first.mp3', () => {}, {
    createAudio: () => (replacedMedia = { play: () => new Promise<void>(() => {}), pause: () => { cancelMedia++; }, currentTime: 0, onended: null, onerror: null }),
    speak: (_text, done) => { speechEnded = done; return () => {}; },
  });
  const staleEnd = replacedMedia.onended as () => void;
  const staleError = replacedMedia.onerror as () => void;
  superseded.cancel();
  await superseded.promise;
  assert.equal(cancelMedia, 1, 'explicit cancellation pauses the media and settles its promise');
  staleEnd(); staleError();
  speechEnded?.();

  const endedStates: boolean[] = []; let endedMedia: any;
  const endedSession = startVoicePlayback('ended', '/done.mp3', state => endedStates.push(state), {
    createAudio: () => (endedMedia = { play: () => Promise.resolve(), pause: () => {}, currentTime: 0, onended: null, onerror: null }),
  });
  const actualOnEnded = endedMedia.onended as () => void;
  actualOnEnded(); await endedSession.promise;
  assert.deepEqual(endedStates, [true, false], 'actual assigned onended settles media playback');
  actualOnEnded();
  assert.deepEqual(endedStates, [true, false], 'repeated stale onended callback cannot change settled state');

  const visited = new Set<string>();
  const inspect = (absolutePath: string) => {
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    assert.doesNotMatch(source, /@google\/genai|@prisma|from\s+['"]node:|voice-qa\.service/, `browser import graph remains safe: ${absolutePath}`);
    for (const match of Array.from(source.matchAll(/(?:from\s*|export\s*\{[^}]*\}\s*from\s*)['"](@\/[^'"]+)['"]/g))) {
      const local = resolve('src', `${match[1].slice(2)}.ts`);
      if (existsSync(local)) inspect(local);
    }
  };
  inspect(resolve('src/modules/voice-ai/client.ts'));
  assert.ok(visited.size >= 6, 'client boundary assertion walks transitive browser imports');
  console.log('voice client tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
