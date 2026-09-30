const CONTENT_ADDRESSED_AUDIO_URL = /^\/audio\/[a-f0-9]{64}\.mp3$/;

export function isContentAddressedAudioUrl(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_ADDRESSED_AUDIO_URL.test(value);
}

export function contentAddressedAudioUrlOrEmpty(value: unknown): string {
  return isContentAddressedAudioUrl(value) ? value : '';
}
