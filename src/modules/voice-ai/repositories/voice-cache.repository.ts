export interface VoiceCacheEntry {
  cacheKey: string;
  rawText: string;
  audioUrl: string;
  voiceName?: string;
  speakingRate?: number;
}

export interface VoiceCacheRepository {
  getByCacheKey(cacheKey: string): Promise<{ audioUrl: string } | null>;
  save(entry: VoiceCacheEntry): Promise<void>;
}
