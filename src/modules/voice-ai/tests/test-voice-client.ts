import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { startVoicePlayback } from '@/modules/voice-ai/services/voice-playback.service';
import { requestVoiceAnswer, FinalTranscriptBuffer, RecognitionSubmissionLifecycle, VoiceRequestGeneration } from '@/modules/voice-ai/services/voice-qa.client';

async function run() {
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
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(playbackState, [true], 'media rejection keeps the same playback session active');
  assert.equal(duplexDuringSpeech.isSpeaking, true, 'microphone stays locked during long browser synthesis');
  assert.equal(duplexDuringSpeech.canSafelyListen(), false);
  speechDone?.(); await rejectionSession.promise;
  assert.deepEqual(playbackState, [true, false]);

  let mediaFailed!: () => void;
  let speechEnded!: () => void;
  let cancelMedia = 0;
  const superseded = startVoicePlayback('first', '/first.mp3', () => {}, {
    createAudio: () => ({ play: () => new Promise<void>(() => {}), pause: () => { cancelMedia++; }, currentTime: 0, onended: null, onerror: null }),
    speak: (_text, done) => { speechEnded = done; return () => {}; },
  });
  const priorMedia = (superseded as unknown as { audio?: { onerror: (() => void) | null } }).audio;
  void priorMedia;
  superseded.cancel();
  await superseded.promise;
  assert.equal(cancelMedia, 1, 'explicit cancellation pauses the media and settles its promise');
  speechEnded?.();

  let oldEnded: (() => void) | null = null;
  const staleEvents: boolean[] = [];
  const oldSession = startVoicePlayback('old', '/old.mp3', state => staleEvents.push(state), {
    createAudio: () => ({ play: () => new Promise<void>(() => {}), pause: () => {}, currentTime: 0, onended: null, onerror: null }),
  });
  oldEnded = (() => undefined);
  oldSession.cancel(); oldEnded?.(); await oldSession.promise;
  assert.deepEqual(staleEvents, [true, false], 'detached superseded callbacks cannot alter a newer session');

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
