export type AudioFactory = (url: string) => Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime' | 'onended' | 'onerror'>;
export type CancelSpeech = () => void;
export type SpeechDriver = (text: string, onDone: () => void) => CancelSpeech | null;
export interface PlaybackSession { promise: Promise<void>; cancel: () => void }

const browserAudioFactory: AudioFactory = url => new Audio(url);
const browserSpeechDriver: SpeechDriver = (text, onDone) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 0.9;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
};

/** Media failure transitions into speech without ending the half-duplex session. */
export function startVoicePlayback(
  text: string,
  audioUrl: string | undefined,
  onPlaying: (playing: boolean) => void,
  options: { createAudio?: AudioFactory; speak?: SpeechDriver } = {},
): PlaybackSession {
  const createAudio = options.createAudio ?? browserAudioFactory;
  const speak = options.speak ?? browserSpeechDriver;
  let audio: ReturnType<AudioFactory> | null = null;
  let cancelSpeech: CancelSpeech | null = null;
  let settled = false;
  let resolvePromise!: () => void;
  const promise = new Promise<void>(resolve => { resolvePromise = resolve; });
  const detachAudio = () => {
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
  };
  const settle = () => {
    if (settled) return;
    settled = true;
    detachAudio();
    onPlaying(false);
    resolvePromise();
  };
  const fallback = () => {
    if (settled || cancelSpeech) return;
    detachAudio();
    cancelSpeech = speak(text, settle);
    if (!cancelSpeech) settle();
  };
  onPlaying(true);
  if (audioUrl && (typeof Audio !== 'undefined' || options.createAudio)) {
    try {
      audio = createAudio(audioUrl);
      audio.onended = settle;
      audio.onerror = fallback;
      Promise.resolve(audio.play()).catch(fallback);
    } catch { fallback(); }
  } else fallback();

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      detachAudio();
      try { audio?.pause(); } catch { /* ignore media teardown errors */ }
      if (audio) audio.currentTime = 0;
      cancelSpeech?.();
      onPlaying(false);
      resolvePromise();
    },
  };
}

/** Compatibility wrapper for callers that do not need explicit cancellation. */
export async function playVoice(
  text: string,
  audioUrl: string | undefined,
  onPlaying: (playing: boolean) => void,
  fallback: (text: string) => void,
  createAudio: AudioFactory = browserAudioFactory,
): Promise<void> {
  const session = startVoicePlayback(text, audioUrl, onPlaying, {
    createAudio,
    speak: (value, done) => { fallback(value); done(); return () => {}; },
  });
  await session.promise;
}

export function speakWithSynthesis(text: string, onPlaying: (playing: boolean) => void): boolean {
  let completed = false;
  const done = () => { if (completed) return; completed = true; onPlaying(false); };
  const cancel = browserSpeechDriver(text, done);
  if (!cancel) return false;
  onPlaying(true);
  return true;
}