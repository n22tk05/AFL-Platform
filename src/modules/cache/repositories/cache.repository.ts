export interface CacheRepository {
  generateKey(input: unknown): string;
  get<T>(input: unknown): T | null;
  set(input: unknown, data: unknown): void;
  flushSync(): void;
}
