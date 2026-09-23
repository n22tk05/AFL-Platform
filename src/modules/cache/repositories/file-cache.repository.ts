import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CacheRepository } from '@/modules/cache/repositories/cache.repository';

export class FileCacheRepository implements CacheRepository {
  private readonly cacheFilePath: string;
  private readonly isEnabled: boolean;
  private readonly memoryCache = new Map<string, unknown>();
  private isLoaded = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isPersisting = false;

  constructor(
    cacheFileName = 'gemini-cache.json',
    cacheDirectory = path.join(process.cwd(), 'src', 'modules', 'cache')
  ) {
    this.cacheFilePath = path.join(cacheDirectory, cacheFileName);
    this.isEnabled = process.env.VOICE_CACHE_ENABLED !== 'false';
    this.ensureLoaded();
  }

  public generateKey(input: unknown): string {
    const canonicalData = this.canonicalize(input);
    const serialized = typeof canonicalData === 'string'
      ? canonicalData
      : JSON.stringify(canonicalData);
    const hash = crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
    return `cache_${hash}`;
  }

  public get<T>(input: unknown): T | null {
    if (!this.isEnabled) return null;
    this.ensureLoaded();
    const value = this.memoryCache.get(this.generateKey(input));
    return value !== undefined ? value as T : null;
  }

  public set(input: unknown, data: unknown): void {
    if (!this.isEnabled) return;
    this.ensureLoaded();
    this.memoryCache.set(this.generateKey(input), data);
    this.schedulePersist();
  }

  public flushSync(): void {
    try {
      const directory = path.dirname(this.cacheFilePath);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(Object.fromEntries(this.memoryCache), null, 2),
        'utf-8'
      );
    } catch (error) {
      console.warn('[FileCacheRepository] Failed to flush cache:', error);
    }
  }

  private canonicalize(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => this.canonicalize(item));

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = this.canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  private ensureLoaded(): void {
    if (this.isLoaded) return;
    this.isLoaded = true;
    if (!fs.existsSync(this.cacheFilePath)) return;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          this.memoryCache.set(key, value);
        }
      }
    } catch (error) {
      console.warn('[FileCacheRepository] Failed to load cache:', error);
    }
  }

  private schedulePersist(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.persistToDisk();
    }, 200);
  }

  private async persistToDisk(): Promise<void> {
    if (this.isPersisting) return;
    this.isPersisting = true;
    try {
      await fs.promises.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
      await fs.promises.writeFile(
        this.cacheFilePath,
        JSON.stringify(Object.fromEntries(this.memoryCache), null, 2),
        'utf-8'
      );
    } catch (error) {
      console.warn('[FileCacheRepository] Failed to persist cache:', error);
    } finally {
      this.isPersisting = false;
    }
  }
}
