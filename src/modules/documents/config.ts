export const DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 8 * 1024 * 1024, requestBytes: 12 * 1024 * 1024,
  ocrCharacters: 120_000, ocrLines: 4000, timeoutMs: 30_000,
  acceptanceThreshold: 0.95, sessionTtlMs: 15 * 60 * 1000,
});
export function acceptanceThreshold(env = process.env): number {
  const value = Number(env.DOCUMENT_ACCEPTANCE_THRESHOLD ?? DOCUMENT_LIMITS.acceptanceThreshold);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('INVALID_DOCUMENT_CONFIG');
  return value;
}
