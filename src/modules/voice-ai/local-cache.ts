import fs from 'fs';
import path from 'path';

/**
 * Local Cache Service - Quota & Rate Limit Vaccine
 * Cơ chế lưu trữ đệm cục bộ phục vụ kiểm thử ngoại tuyến, bảo vệ Quota API và thẻ tín dụng.
 */
export class LocalCacheService {
  private cacheFilePath: string;
  private isEnabled: boolean;

  constructor(cacheFileName: string = 'gemini-cache.json') {
    this.cacheFilePath = path.join(process.cwd(), 'src', 'modules', 'voice-ai', cacheFileName);
    this.isEnabled = process.env.VOICE_CACHE_ENABLED !== 'false';
  }

  /**
   * Tạo khóa hash đơn giản từ đầu vào
   */
  private generateKey(input: any): string {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < serialized.length; i++) {
      const char = serialized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `key_${Math.abs(hash)}`;
  }

  /**
   * Đọc toàn bộ bộ nhớ đệm
   */
  private readCache(): Record<string, any> {
    if (!fs.existsSync(this.cacheFilePath)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.cacheFilePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Lấy dữ liệu từ cache theo input
   */
  public get<T>(input: any): T | null {
    if (!this.isEnabled) return null;
    const cache = this.readCache();
    const key = this.generateKey(input);
    return (cache[key] as T) || null;
  }

  /**
   * Lưu dữ liệu vào cache
   */
  public set(input: any, data: any): void {
    if (!this.isEnabled) return;
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const cache = this.readCache();
      const key = this.generateKey(input);
      cache[key] = data;
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[LocalCacheService] Không thể ghi file cache:', err);
    }
  }
}

export const localCache = new LocalCacheService();
