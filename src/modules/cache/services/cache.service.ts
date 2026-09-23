import type { CacheRepository } from '@/modules/cache/repositories/cache.repository';
import { FileCacheRepository } from '@/modules/cache/repositories/file-cache.repository';

export class LocalCacheService {
  private readonly repository: CacheRepository;

  constructor(cacheFileName = 'gemini-cache.json', repository?: CacheRepository) {
    this.repository = repository ?? new FileCacheRepository(cacheFileName);
  }

  public generateKey(input: unknown): string {
    return this.repository.generateKey(input);
  }

  public get<T>(input: unknown): T | null {
    return this.repository.get<T>(input);
  }

  public set(input: unknown, data: unknown): void {
    this.repository.set(input, data);
  }

  public flushSync(): void {
    this.repository.flushSync();
  }
}
