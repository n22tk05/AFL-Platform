import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startVoicePlayback } from '@/modules/voice-ai/services/voice-playback.service';
import { contentAddressedAudioUrlOrEmpty } from '@/modules/voice-ai/services/audio-url.service';
import { RecognitionSubmissionLifecycle, VoiceRequestGeneration, requestVoiceAnswer } from '@/modules/voice-ai/services/voice-qa.client';

test('audio failure reads this step text rather than a shared sample', async () => {
  const spoken: string[] = [];
  const playing: boolean[] = [];
  const session = startVoicePlayback('FORM B CURRENT STEP', '/audio/' + 'b'.repeat(64) + '.mp3', value => playing.push(value), {
    createAudio: () => ({ play: () => Promise.reject(Error('missing')), pause: () => {}, currentTime: 0, onended: null, onerror: null }),
    speak: (text, done) => { spoken.push(text); done(); return () => {}; },
  });
  await session.promise;
  assert.deepEqual(spoken, ['FORM B CURRENT STEP']); assert.deepEqual(playing, [true, false]);
  assert.equal(contentAddressedAudioUrlOrEmpty('/assets/audio/default.mp3'), '');
});

test('cancel settles playback and ignores subsequent media events', async () => {
  let ended: (() => void) | null = null;
  let pauses = 0;
  const audio = { play: async () => {}, pause: () => { pauses++; }, currentTime: 2,
    get onended() { return ended; }, set onended(value: (() => void) | null) { ended = value; }, onerror: null };
  const session = startVoicePlayback('A', '/audio/' + 'a'.repeat(64) + '.mp3', () => {}, { createAudio: () => audio });
  const lateEnd = ended as (() => void) | null;
  session.cancel(); await session.promise; lateEnd?.();
  assert.equal(pauses, 1); assert.equal(audio.currentTime, 0);
});

test('a mic final result and release/end submit only once with its original context', () => {
  for (const endFirst of [true, false]) {
    const lifecycle = new RecognitionSubmissionLifecycle();
    const turn = lifecycle.begin()!;
    lifecycle.result(turn, 'Câu hỏi thật', true);
    const context = { formCode: 'FORM A', stepIndex: 2 };
    const first = endFirst ? lifecycle.end(turn) : lifecycle.release(turn, context);
    assert.equal(first.ready, false);
    const result = endFirst ? lifecycle.release(turn, context) : lifecycle.end(turn);
    assert.equal(result.ready, true); assert.equal(result.question, 'Câu hỏi thật');
    assert.deepEqual(result.context, context);
    assert.equal(lifecycle.end(turn).ready, false); assert.equal(lifecycle.release(turn, context).ready, false);
  }
});

test('a previous form response and transcript become invalid after context changes', () => {
  const generation = new VoiceRequestGeneration(); const old = generation.current();
  generation.invalidate(); assert.equal(generation.isCurrent(old), false);
  const lifecycle = new RecognitionSubmissionLifecycle(); const oldTurn = lifecycle.begin()!;
  lifecycle.reset(); const newTurn = lifecycle.begin()!;
  assert.equal(lifecycle.result(oldTurn, 'OLD QUESTION', true), false);
  lifecycle.result(newTurn, 'NEW QUESTION', true); lifecycle.end(newTurn);
  assert.equal(lifecycle.release(newTurn, { formCode: 'B', stepIndex: 1 }).question, 'NEW QUESTION');
});

test('Q&A sends form identity and index, parses the envelope and rejects API errors', async () => {
  const answer = await requestVoiceAnswer('B', 2, 'Question', { fetcher: async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { formCode: 'B', stepIndex: 2, userQuestion: 'Question' });
    return Response.json({ success: true, data: { answerText: 'Answer B' } });
  } });
  assert.equal(answer.answerText, 'Answer B');
  await assert.rejects(requestVoiceAnswer('B', 2, 'Question', { fetcher: async () => Response.json({ success: false }, { status: 503 }) }));
});

test('mounted hook and panel use the tested cancellation/playback and submission owners', () => {
  const hook = fs.readFileSync('src/modules/voice-ai/hooks/use-voice-assistant.ts', 'utf8');
  const panel = fs.readFileSync('src/components/citizen/VoiceAssistantPanel.tsx', 'utf8');
  assert.ok(hook.includes('RecognitionSubmissionLifecycle')); assert.ok(hook.includes('VoiceRequestGeneration'));
  assert.ok(hook.includes('startVoicePlayback')); assert.ok(hook.includes('requestVoiceAnswer'));
  assert.ok(!hook.includes("services/voice-qa.service"));
  assert.ok(panel.includes('playGuidance(voiceGuidance, audioUrl)')); assert.ok(!panel.includes('micReleaseTimer'));
});

test('Q&A enforces a client deadline and caller cancellation', async () => {
  const blockedFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
    if (init?.signal?.aborted) reject(new Error('aborted'));
    else init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(requestVoiceAnswer('A', 1, 'Question', { timeoutMs: 5, fetcher: blockedFetch }), /QA_TIMEOUT/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestVoiceAnswer('A', 1, 'Question', { signal: controller.signal, fetcher: blockedFetch }), /QA_ABORTED/);
});
