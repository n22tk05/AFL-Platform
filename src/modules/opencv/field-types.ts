export type PixelRect = { x: number; y: number; width: number; height: number };

export type ContourHierarchy = {
  next: number;
  previous: number;
  firstChild: number;
  parent: number;
};

/** Debug-only geometric candidate. This is not a shared-contract box or a field manifest. */
export type FieldCandidate = {
  candidateId: string;
  rect: PixelRect;
  areaRatio: number;
  aspectRatio: number;
  contourArea: number;
  rectangularity: number;
  parentIndex: number;
  childIndex: number;
  source: "closed_contour" | "checkbox" | "field_row" | "phrase_cluster";
  isContainer?: boolean;
};

export interface ContourDetectionConfig {
  minWidthRatio: number;
  minHeightRatio: number;
  maxWidthRatio: number;
  maxHeightRatio: number;
  minAreaRatio: number;
  maxAreaRatio: number;
  minAspectRatio: number;
  maxAspectRatio: number;
  minRectangularity: number;
  duplicateIouThreshold: number;
}

/** Starting values only; tune against representative form scans. */
export const DEFAULT_CONTOUR_DETECTION_CONFIG: Readonly<ContourDetectionConfig> = Object.freeze({
  minWidthRatio: 0.006,
  minHeightRatio: 0.004,
  maxWidthRatio: 0.98,
  maxHeightRatio: 0.98,
  minAreaRatio: 0.00003,
  maxAreaRatio: 0.9,
  minAspectRatio: 0.05,
  maxAspectRatio: 100,
  minRectangularity: 0.25,
  duplicateIouThreshold: 0.88,
});

export function resolveContourDetectionConfig(
  overrides: Partial<ContourDetectionConfig> = {},
): ContourDetectionConfig {
  const config = { ...DEFAULT_CONTOUR_DETECTION_CONFIG, ...overrides };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value)) throw new RangeError(`${key} must be finite.`);
  }
  if (config.minWidthRatio < 0 || config.minHeightRatio < 0 || config.minAreaRatio < 0) {
    throw new RangeError("Minimum ratios must not be negative.");
  }
  if (config.maxWidthRatio <= 0 || config.maxHeightRatio <= 0 || config.maxAreaRatio <= 0) {
    throw new RangeError("Maximum ratios must be greater than zero.");
  }
  if (config.minAspectRatio <= 0 || config.maxAspectRatio < config.minAspectRatio) {
    throw new RangeError("Aspect-ratio bounds are invalid.");
  }
  if (config.minRectangularity < 0 || config.minRectangularity > 1 || config.duplicateIouThreshold < 0 || config.duplicateIouThreshold > 1) {
    throw new RangeError("Rectangularity and duplicate IoU thresholds must be between 0 and 1.");
  }
  return config;
}
