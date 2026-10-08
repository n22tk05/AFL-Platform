import assert from 'node:assert/strict';
import test from 'node:test';
import { startVoicePlayback, type AudioFactory, type PlaybackSession } from '../services/voice-playback.service';

function fakeAudio(): ReturnType<AudioFactory> {
  return { play: async () => {}, pause: () => {}, currentTime: 0, onended: null, onerror: null };
}

test('a synchronous speech failure releases playback instead of throwing or leaving it active', async () => {
  const playing: boolean[] = [];
  let session!: PlaybackSession;
  assert.doesNotThrow(() => {
    session = startVoicePlayback('Bác ghi tên mình.', undefined, value => playing.push(value), {
      speak: () => { throw new Error('Speech engine unavailable'); },
    });
  });
  await session.promise;
  assert.deepEqual(playing, [true, false]);
});

test('media failure stops the audio before starting speech and remains active until speech ends', async () => {
  const playing: boolean[] = [];
  const events: string[] = [];
  const audio = fakeAudio();
  audio.pause = () => { events.push('pause'); };
  let finishSpeech!: () => void;
  const session = startVoicePlayback('Bước hiện tại.', '/audio/demo.mp3', value => playing.push(value), {
    createAudio: () => audio,
    speak: (_text, done) => { events.push('speech'); finishSpeech = done; return () => {}; },
  });
  audio.onerror?.(new Event('error'));
  assert.deepEqual(events, ['pause', 'speech']);
  assert.deepEqual(playing, [true]);
  finishSpeech();
  await session.promise;
  assert.deepEqual(playing, [true, false]);
});

test('a rejected audio play and failing speech engine do not leave an unhandled rejection', async () => {
  const playing: boolean[] = [];
  const audio = fakeAudio();
  audio.play = async () => { throw new Error('Autoplay blocked'); };
  const session = startVoicePlayback('Đúng nội dung.', '/audio/demo.mp3', value => playing.push(value), {
    createAudio: () => audio,
    speak: () => { throw new Error('Speech failed'); },
  });
  await Promise.race([session.promise, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Playback did not settle')), 200);
    session.promise.finally(() => clearTimeout(timer));
  })]);
  assert.deepEqual(playing, [true, false]);
});

test('cancellation settles even when media pause and currentTime reset both throw', async () => {
  const playing: boolean[] = [];
  const audio = fakeAudio();
  audio.pause = () => { throw new Error('Detached media'); };
  Object.defineProperty(audio, 'currentTime', { get: () => 0, set: () => { throw new Error('Media not seekable'); } });
  const session = startVoicePlayback('Đổi bước.', '/audio/demo.mp3', value => playing.push(value), { createAudio: () => audio });
  assert.doesNotThrow(() => session.cancel());
  await session.promise;
  session.cancel();
  assert.deepEqual(playing, [true, false]);
  assert.equal(audio.onended, null);
  assert.equal(audio.onerror, null);
});

test('cancellation settles even when the speech engine cannot cancel', async () => {
  const playing: boolean[] = [];
  const session = startVoicePlayback('Đổi biểu mẫu.', undefined, value => playing.push(value), {
    speak: () => () => { throw new Error('Speech engine disconnected'); },
  });
  assert.doesNotThrow(() => session.cancel());
  await session.promise;
  assert.deepEqual(playing, [true, false]);
});

test('cancelled playback never starts a fallback after a late audio rejection', async () => {
  const playing: boolean[] = [];
  let rejectPlay!: (reason: Error) => void;
  let speechCalls = 0;
  const audio = fakeAudio();
  audio.play = () => new Promise((_, reject) => { rejectPlay = reject; });
  const session = startVoicePlayback('Nội dung cũ.', '/audio/demo.mp3', value => playing.push(value), {
    createAudio: () => audio, speak: () => { speechCalls++; return null; },
  });
  session.cancel();
  rejectPlay(new Error('Late media failure'));
  await session.promise;
  await Promise.resolve();
  assert.equal(speechCalls, 0);
  assert.deepEqual(playing, [true, false]);
});

test('unavailable speech reports an actionable error and releases the half-duplex state', async () => {
  const errors: string[] = [];
  const playing: boolean[] = [];
  const session = startVoicePlayback('Chữ trên màn hình.', undefined, value => playing.push(value), {
    speak: () => null, onError: message => errors.push(message),
  });
  await session.promise;
  assert.deepEqual(playing, [true, false]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /xem chữ trên màn hình/);
});

test('speech error is reported once and late completion cannot change playback again', async () => {
  const errors: string[] = [];
  const playing: boolean[] = [];
  let finishSpeech!: (errorMessage?: string) => void;
  const session = startVoicePlayback('Nội dung đúng.', undefined, value => playing.push(value), {
    speak: (_text, done) => { finishSpeech = done; return () => {}; }, onError: message => errors.push(message),
  });
  finishSpeech('Không phát được tiếng Việt.');
  finishSpeech();
  await session.promise;
  session.cancel();
  assert.deepEqual(errors, ['Không phát được tiếng Việt.']);
  assert.deepEqual(playing, [true, false]);
});

test('media error and play rejection start only one fallback', async () => {
  const audio = fakeAudio();
  let rejectPlay!: (reason: Error) => void;
  let speechCalls = 0;
  audio.play = () => new Promise((_, reject) => { rejectPlay = reject; });
  const session = startVoicePlayback('Một lần đọc.', '/audio/demo.mp3', () => {}, {
    createAudio: () => audio, speak: () => { speechCalls++; return () => {}; },
  });
  audio.onerror?.(new Event('error'));
  rejectPlay(new Error('Repeated media failure'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(speechCalls, 1);
  session.cancel();
  await session.promise;
});
