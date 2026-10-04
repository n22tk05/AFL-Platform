import type { FieldCandidate, PixelRect } from "./field-types";
import type { CvMat, CvRuntime } from "./types";

export interface FieldRowDetectionConfig {
  /** Width of the horizontal dilation kernel in pixels (default: 14) */
  kernelWidth: number;
  /** Height of the horizontal dilation kernel in pixels (default: 3) */
  kernelHeight: number;
  /** Minimum field row height in pixels (default: 8) */
  minHeight: number;
  /** Maximum field row height as fraction of image height (default: 0.15) */
  maxHeightRatio: number;
  /** Minimum field row width in pixels (default: 14) */
  minWidth: number;
  /** Minimum field row bounding box area in pixels (default: 90) */
  minArea: number;
}

export const DEFAULT_FIELD_ROW_DETECTION_CONFIG: Readonly<FieldRowDetectionConfig> = Object.freeze({
  kernelWidth: 14,
  kernelHeight: 3,
  minHeight: 8,
  maxHeightRatio: 0.15,
  minWidth: 14,
  minArea: 90,
});

export function resolveFieldRowDetectionConfig(
  overrides: Partial<FieldRowDetectionConfig> = {},
): FieldRowDetectionConfig {
  return { ...DEFAULT_FIELD_ROW_DETECTION_CONFIG, ...overrides };
}

interface CvMatVector {
  size(): number;
  get(index: number): CvMat;
  delete(): void;
}

interface RowDetectorCvRuntime extends CvRuntime {
  MatVector: new () => CvMatVector;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  getStructuringElement(shape: number, size: { width: number; height: number }): CvMat;
  dilate(src: CvMat, dst: CvMat, kernel: CvMat): void;
  findContours(image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void;
  boundingRect(contour: CvMat): PixelRect;
  contourArea(contour: CvMat): number;
}

/**
 * Detect horizontal form field rows, prompts, underlines, and dotted fill-in lines.
 * Uses horizontal morphological dilation to bridge characters, dots, and lines horizontally
 * into continuous entry candidate bands, while keeping vertically separated lines distinct.
 * `binary` remains owned by caller and is not mutated.
 */
export function detectFieldRowCandidates(
  cv: CvRuntime,
  binary: CvMat,
  overrides: Partial<FieldRowDetectionConfig> = {},
): FieldCandidate[] {
  const runtime = cv as RowDetectorCvRuntime;
  const config = resolveFieldRowDetectionConfig(overrides);

  const width = binary.cols;
  const height = binary.rows;
  if (width <= 0 || height <= 0) return [];

  let kernel: CvMat | undefined;
  let dilated: CvMat | undefined;
  let contours: CvMatVector | undefined;
  let hierarchy: CvMat | undefined;

  try {
    kernel = runtime.getStructuringElement(
      runtime.MORPH_RECT,
      new runtime.Size(config.kernelWidth, config.kernelHeight),
    );
    dilated = new runtime.Mat();
    runtime.dilate(binary, dilated, kernel);

    contours = new runtime.MatVector();
    hierarchy = new runtime.Mat();
    runtime.findContours(
      dilated,
      contours,
      hierarchy,
      runtime.RETR_EXTERNAL ?? 0,
      runtime.CHAIN_APPROX_SIMPLE ?? 2,
    );

    const candidates: FieldCandidate[] = [];
    const count = contours.size();
    const maxHeight = Math.round(height * config.maxHeightRatio);
    const imageArea = Math.max(width * height, 1);

    for (let index = 0; index < count; index += 1) {
      let contour: CvMat | undefined;
      try {
        contour = contours.get(index);
        const rect = runtime.boundingRect(contour);
        const area = rect.width * rect.height;

        // Filter noise, specks, and full-page blocks
        if (
          rect.height < config.minHeight ||
          rect.height > maxHeight ||
          rect.width < config.minWidth ||
          area < config.minArea
        ) {
          continue;
        }

        // Avoid whole-page or header boundary lines
        if (rect.width >= width * 0.98 && rect.height >= height * 0.9) {
          continue;
        }

        const paddedX = Math.max(0, rect.x - 2);
        const paddedY = Math.max(0, rect.y - 2);
        const paddedWidth = Math.min(width - paddedX, rect.width + 4);
        const paddedHeight = Math.min(height - paddedY, rect.height + 4);

        // Major lines spanning >= 35% of page width are field rows;
        // localized/inline phrases (< 35% of page width) are fine phrase clusters.
        const isMajorRow = paddedWidth >= width * 0.35;
        const source = isMajorRow ? "field_row" : "phrase_cluster";
        const candidatePrefix = isMajorRow ? "row" : "phrase";

        candidates.push({
          candidateId: `${candidatePrefix}_${index}`,
          rect: { x: paddedX, y: paddedY, width: paddedWidth, height: paddedHeight },
          areaRatio: (paddedWidth * paddedHeight) / imageArea,
          aspectRatio: paddedWidth / Math.max(paddedHeight, 1),
          contourArea: Math.abs(runtime.contourArea(contour)),
          rectangularity: 0.85,
          parentIndex: -1,
          childIndex: -1,
          source,
          isContainer: false,
        });
      } finally {
        contour?.delete();
      }
    }

    return candidates;
  } finally {
    hierarchy?.delete();
    contours?.delete();
    dilated?.delete();
    kernel?.delete();
  }
}
