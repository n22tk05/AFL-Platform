export type SpeechFallback = (text: string) => void;
export type AudioFactory = (url: string) => Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime' | 'onended' | 'onerror'>;
const browserAudioFactory: AudioFactory = url => new Audio(url);

/** Attempts media playback first; browser speech is used only when media is unavailable or fails. */
export async function playVoice(
  text: string,
  audioUrl: string | undefined,
  onPlaying: (playing: boolean) => void,
  fallback: SpeechFallback,
  createAudio: AudioFactory = browserAudioFactory,
): Promise<void> {
  if (audioUrl && (typeof Audio !== 'undefined' || createAudio !== browserAudioFactory)) {
    try {
      onPlaying(true);
      const audio = createAudio(audioUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('MEDIA_PLAYBACK_FAILED'));
        Promise.resolve(audio.play()).catch(reject);
      });
      onPlaying(false);
      return;
    } catch { onPlaying(false); }
  }
  fallback(text);
}

export function speakWithSynthesis(text: string, onPlaying: (playing: boolean) => void): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 0.9;
  utterance.onstart = () => onPlaying(true);
  utterance.onend = utterance.onerror = () => onPlaying(false);
  window.speechSynthesis.speak(utterance);
  return true;
}
