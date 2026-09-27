import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { playVoice } from '@/modules/voice-ai/services/voice-playback.service';
import { requestVoiceAnswer, FinalTranscriptBuffer } from '@/modules/voice-ai/services/voice-qa.client';

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
  transcript.update(' finalized question ', true);
  assert.equal(transcript.take(), 'finalized question');
  assert.equal(transcript.take(), '', 'final transcript is consumed once');

  let request: { url: RequestInfo | URL; init?: RequestInit } | undefined;
  const answer = await requestVoiceAnswer('Mẫu số: 01/LPTB', 1, 'question', {
    fetcher: async (url, init) => { request = { url, init }; return Response.json({ success: true, data: { answerText: 'Answer', audioUrl: '/answer.mp3' } }); },
  });
  assert.equal(request?.url, '/api/llm/qa');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { formCode: 'Mẫu số: 01/LPTB', stepIndex: 1, userQuestion: 'question' });
  assert.deepEqual(answer, { answerText: 'Answer', audioUrl: '/answer.mp3' });
  await assert.rejects(requestVoiceAnswer('code', 1, 'q', { fetcher: async () => Response.json({ success: false, error: { message_vi: 'Unavailable' } }, { status: 503 }) }), /Unavailable/);
  await assert.rejects(requestVoiceAnswer('code', 1, 'q', { timeoutMs: 1, fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) }), /QA_TIMEOUT/);

  let fallbackCalled = false;
  let ended: (() => void) | null = null;
  const fakeAudio = {
    play: async () => { setTimeout(() => ended?.(), 0); }, pause: () => {}, currentTime: 0,
    onended: null as (() => void) | null, onerror: null as (() => void) | null,
  };
  const mediaFlags: boolean[] = [];
  await playVoice('spoken', '/voice.mp3', flag => mediaFlags.push(flag), () => { fallbackCalled = true; }, () => {
    ended = () => fakeAudio.onended?.();
    return fakeAudio;
  });
  assert.deepEqual(mediaFlags, [true, false]);
  assert.equal(fallbackCalled, false, 'successful media suppresses browser speech fallback');
  await playVoice('fallback', '/broken.mp3', () => {}, () => { fallbackCalled = true; }, () => ({
    play: async () => { throw new Error('media rejected'); }, pause: () => {}, currentTime: 0, onended: null, onerror: null,
  }));
  assert.equal(fallbackCalled, true, 'media rejection uses speech fallback');

  const entry = readFileSync('src/modules/voice-ai/client.ts', 'utf8');
  const hook = readFileSync('src/modules/voice-ai/hooks/use-voice-assistant.ts', 'utf8');
  assert.doesNotMatch(entry + hook, /voice-qa\.service|@google\/genai|@prisma|node:/, 'browser client entry and hook have no server dependencies');
  console.log('voice client tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
