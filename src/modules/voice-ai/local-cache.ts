import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
   * Chuẩn hóa đối tượng đệ quy với các khóa được sắp xếp theo thứ tự bảng chữ cái (A -> Z)
   * Đảm bảo tính nhất quán (Canonicalization): { a: 1, b: 2 } và { b: 2, a: 1 } luôn sinh ra cùng 1 mã băm
   */
  private canonicalize(val: any): any {
    if (val === null || typeof val !== 'object') {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(item => this.canonicalize(item));
    }
    const sortedKeys = Object.keys(val).sort();
    const result: Record<string, any> = {};
    for (const k of sortedKeys) {
      result[k] = this.canonicalize(val[k]);
    }
    return result;
  }

  /**
   * Tạo khóa băm SHA-256 (256-bit) chuẩn công nghiệp, triệt tiêu 100% rủi ro đụng độ (Collision-free)
   * Hoàn toàn tương thích và đồng bộ với kiến trúc trường cacheKey của bảng voice_cache trong Prisma PostgreSQL
   */
  public generateKey(input: any): string {
    const canonicalData = this.canonicalize(input);
    const serialized = typeof canonicalData === 'string' ? canonicalData : JSON.stringify(canonicalData);
    const hash = crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
    return `cache_${hash}`;
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
