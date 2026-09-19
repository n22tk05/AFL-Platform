import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { localCache } from './local-cache';

try {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
} catch {}

export type VietnameseVoiceRegion = 'NORTH' | 'SOUTH';

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  audioUrl: string;
  wordTimestamps: WordTimestamp[];
}

export class TTSService {
  private client: TextToSpeechClient | null = null;
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'public', 'audio');
    if (!fs.existsSync(this.outputDir)) {
      try {
        fs.mkdirSync(this.outputDir, { recursive: true });
      } catch (err) {
        console.warn('[TTSService] Không thể tạo thư mục public/audio:', err);
      }
    }

    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.client = new TextToSpeechClient();
      }
    } catch {
      this.client = null;
    }
  }

  /**
   * Tính toán mốc thời gian ước tính cho từng từ (tốc độ đọc 0.9x ~ 320ms/từ)
   */
  private calculateTimestamps(text: string): WordTimestamp[] {
    const words = text.split(/\s+/);
    let currentMs = 0;
    return words.map(w => {
      const startMs = currentMs;
      const duration = Math.max(260, w.length * 75);
      currentMs += duration;
      return {
        word: w.toUpperCase(),
        startMs,
        endMs: currentMs
      };
    });
  }

  /**
   * Tổng hợp giọng nói tiếng Việt tốc độ 0.9x và trích xuất Word Timestamps (FR-3)
   */
  public async synthesizeSpeech(
    text: string,
    stepIndex: number,
    region: VietnameseVoiceRegion = 'NORTH'
  ): Promise<SynthesisResult> {
    const fileName = `step_${String(stepIndex).padStart(2, '0')}.mp3`;
    const filePath = path.join(this.outputDir, fileName);
    const audioUrl = `/audio/${fileName}`;

    // 1. Kiểm tra cache cục bộ
    const cacheKey = { text, stepIndex, region };
    const cached = localCache.get<SynthesisResult>(cacheKey);
    if (cached && fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      return {
        ...cached,
        audioBuffer: fs.readFileSync(filePath)
      };
    }

    // 2. Chọn mã voice Neural2 theo vùng miền
    const voiceName = region === 'NORTH' ? 'vi-VN-Neural2-A' : 'vi-VN-Neural2-D';
    const apiKey = process.env.GOOGLE_TTS_API_KEY;

    // 3. Phương thức 1: Gọi qua REST API nếu có GOOGLE_TTS_API_KEY (Nhanh, nhẹ < 500ms)
    if (apiKey) {
      try {
        const synthUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
        const payload = {
          input: { text },
          voice: {
            languageCode: 'vi-VN',
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 0.9 // Tốc độ 0.9x chuẩn PRD
          }
        };

        const response = await fetch(synthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.audioContent) {
          const audioBuffer = Buffer.from(data.audioContent, 'base64');
          fs.writeFileSync(filePath, audioBuffer);

          const wordTimestamps = this.calculateTimestamps(text);
          const result: SynthesisResult = {
            audioBuffer,
            audioUrl,
            wordTimestamps
          };

          localCache.set(cacheKey, { audioUrl, wordTimestamps });
          return result;
        } else if (data.error) {
          console.warn('[TTSService] Lỗi Google TTS API:', data.error.message);
        }
      } catch (error) {
        console.warn('[TTSService] Lỗi gọi REST TTS API, thử tiếp phương thức SDK:', error);
      }
    }

    // 4. Phương thức 2: Gọi qua Google Cloud SDK nếu có client
    if (this.client) {
      try {
        const request = {
          input: { text },
          voice: {
            languageCode: 'vi-VN',
            name: voiceName,
          },
          audioConfig: {
            audioEncoding: 'MP3' as const,
            speakingRate: 0.9,
          },
          enableTimepointing: ['WORD' as const],
        };

        const [response] = await this.client.synthesizeSpeech(request);
        const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
        fs.writeFileSync(filePath, audioBuffer);

        const wordTimestamps: WordTimestamp[] = [];
        const timepoints = (response as any).timepoints || [];
        const words = text.split(/\s+/);

        for (let i = 0; i < timepoints.length; i++) {
          const tp = timepoints[i];
          const nextTp = timepoints[i + 1];
          const startMs = Math.round((tp.timeSeconds || 0) * 1000);
          const endMs = nextTp ? Math.round((nextTp.timeSeconds || 0) * 1000) : startMs + 300;

          wordTimestamps.push({
            word: tp.markName || words[i] || '',
            startMs,
            endMs
          });
        }

        const result: SynthesisResult = {
          audioBuffer,
          audioUrl,
          wordTimestamps: wordTimestamps.length > 0 ? wordTimestamps : this.calculateTimestamps(text)
        };

        localCache.set(cacheKey, { audioUrl, wordTimestamps });
        return result;
      } catch (error) {
        console.warn('[TTSService] Lỗi khi gọi SDK TTS:', error);
      }
    }

    // 5. Phương thức 3: Fallback mô phỏng ngoại tuyến nếu không có mạng/key
    return this.simulateSynthesis(text, stepIndex, audioUrl, filePath, cacheKey);
  }

  /**
   * Mô phỏng tạo âm thanh ngoại tuyến
   */
  private simulateSynthesis(
    text: string,
    stepIndex: number,
    audioUrl: string,
    filePath: string,
    cacheKey: any
  ): SynthesisResult {
    if (!fs.existsSync(filePath)) {
      try {
        fs.writeFileSync(filePath, Buffer.from('MOCK_MP3_AUDIO_CONTENT'));
      } catch {
        // bỏ qua
      }
    }

    const wordTimestamps = this.calculateTimestamps(text);
    const result: SynthesisResult = {
      audioBuffer: Buffer.from('MOCK_MP3_AUDIO_CONTENT'),
      audioUrl,
      wordTimestamps
    };

    localCache.set(cacheKey, { audioUrl, wordTimestamps });
    return result;
  }
}

export const ttsService = new TTSService();
