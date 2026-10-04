export const DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 8 * 1024 * 1024, requestBytes: 26 * 1024 * 1024,
  imagePixels: 12_000_000, imageMaxDimension: 8192,
  ocrCharacters: 120_000, ocrLines: 4000,
  timeoutMs: Number(process.env.DOCUMENT_OCR_TIMEOUT_MS || 60_000),
  acceptanceThreshold: 0.95, sessionTtlMs: 15 * 60 * 1000,
});
export function acceptanceThreshold(env = process.env): number {
  const value = Number(env.DOCUMENT_ACCEPTANCE_THRESHOLD ?? DOCUMENT_LIMITS.acceptanceThreshold);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('INVALID_DOCUMENT_CONFIG');
  return value;
}
/** Initial heuristics, not calibrated accuracy or a promise to recover detail. */
export const ADAPTIVE_IMAGE_CONFIG = Object.freeze({
  maximumOutputDimension: 4096, maximumOutputPixels: DOCUMENT_LIMITS.imagePixels,
  maximumEnhancedDimension: DOCUMENT_LIMITS.imageMaxDimension,
  maxUpscale: 2, upscaleTargetSide: 1200, maxEnhancedVariants: 2,
  jpegQuality: 0.95,
  denoiseKernel: 3, denoiseSigma: 0.5, bilateralColor: 10, bilateralSpace: 2,
  contrastCenter: 128, unsharpSigma: 1, unsharpAmount: 0.3,
  claheClipLimit: 2, claheGridSize: 8, contrastGain: 1.12,
  backgroundKernel: 61, backgroundFloor: 16, lightingTarget: 220,
  maxAttempts: 2, retryConfidence: 0.8, lowConfidenceFraction: 0.2,
  alignmentIou: 0.65,
});
