import { FileCacheRepository } from '@/modules/cache/repositories/file-cache.repository';
import { LocalCacheService } from '@/modules/cache/services/cache.service';

const fileCacheRepository = new FileCacheRepository();

export const localCache = new LocalCacheService('gemini-cache.json', fileCacheRepository);

export { FileCacheRepository, LocalCacheService };
export type { CacheRepository } from '@/modules/cache/repositories/cache.repository';
