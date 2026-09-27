import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { LocalCacheService } from '@/modules/cache';
import type { VoiceCacheRepository } from '@/modules/voice-ai/repositories/voice-cache.repository';
import { SynthesisResult, VietnameseVoiceRegion, WordTimestamp } from '@/modules/voice-ai/types/voice-ai.types';

const SPEAKING_RATE = 0.9;

export function isValidMp3(buffer: Buffer): boolean {
  if (buffer.length <= 1000) return false;
  let offset = 0;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    if (buffer.length < 10 || buffer.subarray(6, 10).some(byte => byte & 0x80)) return false;
    offset = 10 + ((buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9]);
    if (buffer[5] & 0x10) offset += 10;
  }
  const frameLength = (position: number): number | null => {
    if (position + 4 > buffer.length) return null;
    const second = buffer[position + 1];
    const third = buffer[position + 2];
    const version = (second >> 3) & 3;
    const layer = (second >> 1) & 3;
    const bitrateIndex = (third >> 4) & 15;
    const rateIndex = (third >> 2) & 3;
    if (buffer[position] !== 0xff || (second & 0xe0) !== 0xe0 || version === 1 || layer !== 1 ||
        bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
    const bitrates = version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const sampleRate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    return Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex] / sampleRate) + ((third >> 1) & 1);
  };
  const firstLength = frameLength(offset);
  return firstLength !== null && frameLength(offset + firstLength) !== null &&
    offset + firstLength + frameLength(offset + firstLength)! <= buffer.length;
}

export function audioIdentity(text: string, stepIndex: number, region: VietnameseVoiceRegion) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 ||
      !Number.isSafeInteger(stepIndex) || stepIndex < 1 || stepIndex > 1000 ||
      !['NORTH', 'SOUTH'].includes(region)) throw new Error('INVALID_TTS_REQUEST');
  const voiceName = region === 'NORTH' ? 'vi-VN-Neural2-A' : 'vi-VN-Neural2-D';
  const cacheKey = { text, stepIndex, region, voiceName, speakingRate: SPEAKING_RATE, engine: 'google_ssml_v3' };
  const hashKey = createHash('sha256').update(JSON.stringify(cacheKey)).digest('hex');
  return { voiceName, cacheKey, hashKey, fileName: `${hashKey}.mp3` };
}

export class TTSService {
  private readonly client: TextToSpeechClient | null;
  private readonly outputDir = path.join(process.cwd(), 'public', 'audio');
  private static readonly inFlightRequests = new Map<string, Promise<SynthesisResult>>();

  constructor(
    private readonly cache: LocalCacheService,
    private readonly voiceCacheRepository: VoiceCacheRepository
  ) {
    this.client = process.env.GOOGLE_APPLICATION_CREDENTIALS ? new TextToSpeechClient() : null;
  }

  public formatSSMLWithMarks(text: string): { ssml: string; words: string[] } {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    return { ssml: `<speak>${words.map((word, index) => `<mark name="w_${index}"/>${escapeXml(word)}`).join(' ')}</speak>`, words };
  }

  private calculateTimestamps(text: string): WordTimestamp[] {
    let currentMs = 0;
    return text.trim().split(/\s+/).map(word => {
      const startMs = currentMs;
      currentMs += Math.max(260, word.length * 75);
      return { word: word.toUpperCase(), startMs, endMs: currentMs };
    });
  }

  public async synthesizeSpeech(text: string, stepIndex: number, region: VietnameseVoiceRegion = 'NORTH'): Promise<SynthesisResult> {
    const { voiceName, cacheKey, hashKey, fileName } = audioIdentity(text, stepIndex, region);
    const filePath = path.join(this.outputDir, fileName);
    const timestampPath = path.join(this.outputDir, `${hashKey}.timestamps.json`);
    const audioUrl = `/audio/${fileName}`;

    if (fs.existsSync(filePath)) {
      const audioBuffer = fs.readFileSync(filePath);
      if (isValidMp3(audioBuffer)) {
        let wordTimestamps = this.calculateTimestamps(text);
        if (fs.existsSync(timestampPath)) {
          try {
            const stored = JSON.parse(fs.readFileSync(timestampPath, 'utf8'));
            if (Array.isArray(stored)) wordTimestamps = stored;
          } catch {}
        }
        return { audioUrl, audioBuffer, wordTimestamps };
      }
    }

    const pending = TTSService.inFlightRequests.get(hashKey);
    if (pending) return pending;
    const task = this.generate(text, voiceName, hashKey, filePath, timestampPath, audioUrl, cacheKey);
    TTSService.inFlightRequests.set(hashKey, task);
    try {
      return await task;
    } finally {
      TTSService.inFlightRequests.delete(hashKey);
    }
  }

  private async generate(
    text: string, voiceName: string, hashKey: string, filePath: string,
    timestampPath: string, audioUrl: string, cacheKey: object
  ): Promise<SynthesisResult> {
    let audioBuffer: Buffer | null = null;
    let wordTimestamps = this.calculateTimestamps(text);
    const apiKey = process.env.GOOGLE_TTS_API_KEY;

    if (apiKey) {
      try {
        const { ssml, words } = this.formatSSMLWithMarks(text);
        const response = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { ssml }, voice: { languageCode: 'vi-VN', name: voiceName },
            audioConfig: { audioEncoding: 'MP3', speakingRate: SPEAKING_RATE }, enableTimePointing: ['SSML_MARK'] }),
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) {
          const data = await response.json();
          if (typeof data.audioContent === 'string') {
            const candidate = Buffer.from(data.audioContent, 'base64');
            if (isValidMp3(candidate)) {
              audioBuffer = candidate;
              if (Array.isArray(data.timepoints) && data.timepoints.length === words.length) {
                wordTimestamps = data.timepoints.map((point: { timeSeconds: number }, index: number) => {
                  const startMs = Math.round(point.timeSeconds * 1000);
                  const next = data.timepoints[index + 1];
                  return { word: words[index].toUpperCase(), startMs, endMs: next ? Math.round(next.timeSeconds * 1000) : startMs + 350 };
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn('[TTSService] REST TTS thất bại:', error);
      }
    }

    if (!audioBuffer && this.client) {
      try {
        const [response] = await this.client.synthesizeSpeech({
          input: { text }, voice: { languageCode: 'vi-VN', name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: SPEAKING_RATE },
        }, { timeout: 8000 });
        const candidate = Buffer.from(response.audioContent as Uint8Array);
        if (isValidMp3(candidate)) audioBuffer = candidate;
      } catch (error) {
        console.warn('[TTSService] SDK TTS thất bại:', error);
      }
    }
    if (!audioBuffer) throw new Error('TTS_UNAVAILABLE');

    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(filePath, audioBuffer);
    fs.writeFileSync(timestampPath, JSON.stringify(wordTimestamps));
    this.cache.set(cacheKey, { audioUrl, wordTimestamps });
    await this.voiceCacheRepository.save({ cacheKey: hashKey, rawText: text, audioUrl, voiceName, speakingRate: SPEAKING_RATE }).catch(() => {});
    return { audioBuffer, audioUrl, wordTimestamps };
  }
}
