import { checkDatabaseConnection, prisma } from '@/lib/prisma';
import {
  VoiceCacheEntry,
  VoiceCacheRepository,
} from '@/modules/voice-ai/repositories/voice-cache.repository';

export class PrismaVoiceCacheRepository implements VoiceCacheRepository {
  public async getByCacheKey(cacheKey: string): Promise<{ audioUrl: string } | null> {
    if (!await checkDatabaseConnection()) return null;

    try {
      const record = await prisma.voiceCache.findUnique({ where: { cacheKey } });
      return record ? { audioUrl: record.audioUrl } : null;
    } catch {
      return null;
    }
  }

  public async save(entry: VoiceCacheEntry): Promise<void> {
    if (!await checkDatabaseConnection()) return;

    try {
      await prisma.voiceCache.upsert({
        where: { cacheKey: entry.cacheKey },
        update: {
          audioUrl: entry.audioUrl,
          rawText: entry.rawText,
        },
        create: {
          cacheKey: entry.cacheKey,
          rawText: entry.rawText,
          audioUrl: entry.audioUrl,
          voiceName: entry.voiceName || 'vi-VN-Neural2-A',
          speakingRate: entry.speakingRate || 0.9,
        },
      });
    } catch (error) {
      console.warn('[PrismaVoiceCacheRepository] Không thể ghi bảng voice_cache:', error);
    }
  }
}
