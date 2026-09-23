export interface DocumentDetectionConfig {
  detectionMaxDimension: number;
  blurKernelSize: number;
  cannyLowThreshold: number;
  cannyHighThreshold: number;
  polygonApproximationRatio: number;
  minDocumentAreaRatio: number;
  maxDocumentAreaRatio: number;
  minRectangularity: number;
  minimumOutputWidth: number;
  minimumOutputHeight: number;
  /** Width / height in the ordered quad's orientation, not semantic page orientation. */
  expectedAspectRatio?: number;
  aspectRatioTolerance: number;
  borderMarginRatio: number;
  minimumConfidence: number;
  maximumOutputDimension: number;
  maximumOutputPixels: number;
}

/** Initial heuristics; require tuning and validation against real camera photos. */
export const DEFAULT_DOCUMENT_DETECTION_CONFIG: Readonly<DocumentDetectionConfig> = Object.freeze({
  detectionMaxDimension: 1000,
  blurKernelSize: 5,
  cannyLowThreshold: 50,
  cannyHighThreshold: 150,
  polygonApproximationRatio: 0.02,
  minDocumentAreaRatio: 0.15,
  maxDocumentAreaRatio: 0.95,
  minRectangularity: 0.65,
  minimumOutputWidth: 200,
  minimumOutputHeight: 200,
  aspectRatioTolerance: 0.3,
  borderMarginRatio: 0.005,
  minimumConfidence: 0.68,
  maximumOutputDimension: 2400,
  maximumOutputPixels: 4_000_000,
});

/** Return a fresh validated config. Invalid overrides throw rather than being corrected. */
export function resolveDocumentConfig(overrides: Partial<DocumentDetectionConfig> = {}): DocumentDetectionConfig {
  const c = { ...DEFAULT_DOCUMENT_DETECTION_CONFIG, ...overrides };
  for (const key of Object.keys(DEFAULT_DOCUMENT_DETECTION_CONFIG) as (keyof DocumentDetectionConfig)[]) {
    if (!Number.isFinite(c[key])) throw new RangeError(`${key} must be finite.`);
  }
  for (const key of ['detectionMaxDimension', 'blurKernelSize', 'minimumOutputWidth', 'minimumOutputHeight', 'maximumOutputDimension', 'maximumOutputPixels'] as const) {
    if (!Number.isSafeInteger(c[key]) || c[key] <= 0) throw new RangeError(`${key} must be a positive integer.`);
  }
  if (c.detectionMaxDimension < 32 || c.detectionMaxDimension > 2000 || c.blurKernelSize % 2 !== 1 || c.blurKernelSize > 31) throw new RangeError('Invalid detection resolution or blur kernel.');
  if (c.cannyLowThreshold < 0 || c.cannyLowThreshold >= c.cannyHighThreshold || c.cannyHighThreshold > 255) throw new RangeError('Canny thresholds must satisfy 0 <= low < high <= 255.');
  if (c.polygonApproximationRatio <= 0 || c.polygonApproximationRatio > 0.1) throw new RangeError('polygonApproximationRatio must be in (0, 0.1].');
  for (const key of ['minDocumentAreaRatio', 'maxDocumentAreaRatio', 'minRectangularity', 'minimumConfidence'] as const) {
    if (c[key] <= 0 || c[key] > 1) throw new RangeError(`${key} must be in (0, 1].`);
  }
  if (c.minDocumentAreaRatio >= c.maxDocumentAreaRatio) throw new RangeError('Minimum document area must be smaller than maximum.');
  if (c.borderMarginRatio < 0 || c.borderMarginRatio >= 0.25 || c.aspectRatioTolerance < 0 || c.aspectRatioTolerance > 1) throw new RangeError('Invalid border margin or aspect ratio tolerance.');
  if (c.expectedAspectRatio !== undefined && (!Number.isFinite(c.expectedAspectRatio) || c.expectedAspectRatio <= 0)) throw new RangeError('expectedAspectRatio must be positive and finite.');
  if (c.maximumOutputDimension < 2 || c.maximumOutputDimension > 4096 || c.maximumOutputPixels < 4 || c.maximumOutputPixels > 16_000_000) throw new RangeError('Unsafe output limits.');
  if (c.minimumOutputWidth > c.maximumOutputDimension || c.minimumOutputHeight > c.maximumOutputDimension || c.minimumOutputWidth * c.minimumOutputHeight > c.maximumOutputPixels) throw new RangeError('Minimum output exceeds safety limits.');
  return c;
}
