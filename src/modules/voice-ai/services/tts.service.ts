import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import type { LocalCacheService } from '@/modules/cache';
import type { VoiceCacheRepository } from '@/modules/voice-ai/repositories/voice-cache.repository';
import {
  SynthesisResult,
  VietnameseVoiceRegion,
  WordTimestamp,
} from '@/modules/voice-ai/types/voice-ai.types';

export class TTSService {
  private client: TextToSpeechClient | null = null;
  private outputDir: string;

  constructor(
    private readonly cache: LocalCacheService,
    private readonly voiceCacheRepository: VoiceCacheRepository
  ) {
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
   * Thoát ký tự đặc biệt theo chuẩn XML/SSML
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Bọc văn bản bằng thẻ đánh dấu SSML Marks (<mark name="w_i"/>) trước từng từ
   * Giúp Google Cloud TTS Neural2 trả về mốc thời gian phát âm chính xác tuyệt đối (Timepoints)
   */
  public formatSSMLWithMarks(text: string): { ssml: string; words: string[] } {
    const rawWords = text.trim().split(/\s+/).filter(Boolean);
    const ssmlMarks = rawWords
      .map((word, index) => `<mark name="w_${index}"/>${this.escapeXml(word)}`)
      .join(' ');
    return {
      ssml: `<speak>${ssmlMarks}</speak>`,
      words: rawWords
    };
  }

  /**
   * Tính toán mốc thời gian ước tính dự phòng khi offline / lỗi mạng (Fallback Heuristic)
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

  // Singleflight Pattern: Bảng băm khử trùng lặp các yêu cầu TTS đang chạy đồng thời (Thundering Herd Protection)
  private static inFlightRequests = new Map<string, Promise<SynthesisResult>>();

  /**
   * Tổng hợp giọng nói tiếng Việt tốc độ 0.9x và trích xuất Word Timestamps chuẩn xác từng mili-giây (FR-3)
   */
  public async synthesizeSpeech(
    text: string,
    stepIndex: number,
    region: VietnameseVoiceRegion = 'NORTH'
  ): Promise<SynthesisResult> {
    const fileName = `step_${String(stepIndex).padStart(2, '0')}.mp3`;
    const filePath = path.join(this.outputDir, fileName);
    const audioUrl = `/audio/${fileName}`;

    // 1. Kiểm tra cache L1 cục bộ (phân biệt engine v2_ssml mốc mili-giây chuẩn xác)
    const cacheKey = { text, stepIndex, region, engine: 'google_ssml_v2' };
    const cached = this.cache.get<SynthesisResult>(cacheKey);
    if (cached && fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      return {
        ...cached,
        audioBuffer: fs.readFileSync(filePath)
      };
    }

    const hashKey = this.cache.generateKey(cacheKey);

    // Singleflight Pattern: Tái sử dụng Promise nếu cùng một câu thoại đang được tổng hợp song song
    if (TTSService.inFlightRequests.has(hashKey)) {
      return await TTSService.inFlightRequests.get(hashKey)!;
    }

    const synthesisTask = this.executeSynthesisPipeline(
      text,
      stepIndex,
      region,
      filePath,
      audioUrl,
      cacheKey,
      hashKey
    );

    // Bọc Timeout bảo vệ 10s ngăn chặn deadlock vĩnh viễn (QA-BUG-05)
    const timeoutPromise = new Promise<SynthesisResult>((_, reject) => {
      setTimeout(() => reject(new Error('TTS_SYNTHESIS_TIMEOUT')), 10000);
    });

    const guardedTask = Promise.race([synthesisTask, timeoutPromise]).catch((err) => {
      console.warn(`[TTSService] Timeout hoặc lỗi xử lý, tự động chuyển sang mô phỏng ngoại tuyến:`, err.message);
      return this.simulateSynthesis(text, stepIndex, audioUrl, filePath, cacheKey, hashKey);
    });

    TTSService.inFlightRequests.set(hashKey, guardedTask);

    try {
      return await guardedTask;
    } finally {
      TTSService.inFlightRequests.delete(hashKey);
    }
  }

  /**
   * Đường ống tổng hợp âm thanh thực thi qua L2 CSDL -> L3 Cloud TTS -> Mock Fallback
   */
  private async executeSynthesisPipeline(
    text: string,
    stepIndex: number,
    region: VietnameseVoiceRegion,
    filePath: string,
    audioUrl: string,
    cacheKey: any,
    hashKey: string
  ): Promise<SynthesisResult> {
    // 1b. Kiểm tra cache L2 CSDL PostgreSQL qua Prisma (Chống cháy Quota đa người dùng)
    const dbCached = await this.voiceCacheRepository.getByCacheKey(hashKey);
    if (dbCached && fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      const timestamps = this.loadStoredTimestamps(stepIndex, text);
      const result: SynthesisResult = {
        audioUrl: dbCached.audioUrl,
        audioBuffer: fs.readFileSync(filePath),
        wordTimestamps: timestamps
      };
      // Tự động làm ấm (warm) L1 cache
      this.cache.set(cacheKey, { audioUrl: dbCached.audioUrl, wordTimestamps: timestamps });
      return result;
    }

    // 2. Chọn mã voice Neural2 theo vùng miền
    const voiceName = region === 'NORTH' ? 'vi-VN-Neural2-A' : 'vi-VN-Neural2-D';
    const apiKey = process.env.GOOGLE_TTS_API_KEY;

    // 3. Phương thức 1: Gọi qua Google Cloud TTS REST API v1beta1 với SSML_MARK timepointing
    if (apiKey) {
      try {
        const synthUrl = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`;
        const { ssml, words } = this.formatSSMLWithMarks(text);
        const payload = {
          input: { ssml },
          voice: {
            languageCode: 'vi-VN',
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 0.9 // Tốc độ 0.9x chuẩn PRD
          },
          enableTimePointing: ['SSML_MARK']
        };

        const response = await fetch(synthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000) // 8 giây timeout bảo vệ chống treo socket (QA-BUG-05)
        });

        const data = await response.json();
        if (data.audioContent) {
          const audioBuffer = Buffer.from(data.audioContent, 'base64');
          fs.writeFileSync(filePath, audioBuffer);

          let wordTimestamps: WordTimestamp[] = [];

          // Trích xuất Timepoints mili-giây chuẩn xác do Neural2 sinh ra
          if (data.timepoints && Array.isArray(data.timepoints) && data.timepoints.length > 0) {
            const timepoints: Array<{ markName: string; timeSeconds: number }> = data.timepoints;

            for (let i = 0; i < timepoints.length; i++) {
              const tp = timepoints[i];
              const nextTp = timepoints[i + 1];
              const startMs = Math.round((tp.timeSeconds || 0) * 1000);
              const endMs = nextTp ? Math.round((nextTp.timeSeconds || 0) * 1000) : startMs + 350;
              const wordText = (words[i] || tp.markName || '').toUpperCase();

              wordTimestamps.push({
                word: wordText,
                startMs,
                endMs
              });
            }
          } else {
            // Dự phòng Fallback Heuristic nếu API không trả về timepoints
            wordTimestamps = this.calculateTimestamps(text);
          }

          const result: SynthesisResult = {
            audioBuffer,
            audioUrl,
            wordTimestamps
          };

          this.cache.set(cacheKey, { audioUrl, wordTimestamps });
          // Đồng bộ vào L2 CSDL PostgreSQL
          this.voiceCacheRepository.save({
            cacheKey: hashKey,
            rawText: text,
            audioUrl,
            voiceName,
            speakingRate: 0.9
          }).catch(() => {});

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

        this.cache.set(cacheKey, { audioUrl, wordTimestamps });
        // Đồng bộ vào L2 CSDL PostgreSQL
        this.voiceCacheRepository.save({
          cacheKey: hashKey,
          rawText: text,
          audioUrl,
          voiceName,
          speakingRate: 0.9
        }).catch(() => {});

        return result;
      } catch (error) {
        console.warn('[TTSService] Lỗi khi gọi SDK TTS:', error);
      }
    }

    // 5. Phương thức 3: Fallback mô phỏng ngoại tuyến nếu không có mạng/key
    return this.simulateSynthesis(text, stepIndex, audioUrl, filePath, cacheKey, hashKey);
  }

  /**
   * Đọc mốc thời gian từ tệp timestamps.json nếu có sẵn
   */
  private loadStoredTimestamps(stepIndex: number, text: string): WordTimestamp[] {
    try {
      const timestampsFile = path.join(this.outputDir, 'timestamps.json');
      if (fs.existsSync(timestampsFile)) {
        const content = JSON.parse(fs.readFileSync(timestampsFile, 'utf-8'));
        const stepKey = `step_${String(stepIndex).padStart(2, '0')}`;
        if (content[stepKey] && Array.isArray(content[stepKey])) {
          return content[stepKey];
        }
      }
    } catch {
      // bỏ qua
    }
    return this.calculateTimestamps(text);
  }

  /**
   * Mô phỏng tạo âm thanh ngoại tuyến
   */
  private simulateSynthesis(
    text: string,
    stepIndex: number,
    audioUrl: string,
    filePath: string,
    cacheKey: any,
    hashKey?: string
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

    this.cache.set(cacheKey, { audioUrl, wordTimestamps });
    if (hashKey) {
      this.voiceCacheRepository.save({
        cacheKey: hashKey,
        rawText: text,
        audioUrl,
        speakingRate: 0.9
      }).catch(() => {});
    }
    return result;
  }
}
