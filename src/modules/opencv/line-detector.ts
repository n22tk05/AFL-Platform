import {
  calculateLineKernelSize,
  resolveLineDetectionConfig,
  validateLineDetectionConfig,
  type LineDetectionConfig,
} from "./config";
import type { CvMat, CvRuntime } from "./types";

export interface LineDetectionResult {
  horizontal: CvMat;
  vertical: CvMat;
  combined: CvMat;
}

/**
 * Extract horizontal and vertical line masks from a binary image, then combine them.
 * `binary` is assumed to have white foreground pixels (as `preprocessToBinary` emits),
 * remains owned by the caller, and is neither changed nor deleted. The caller owns and
 * must delete all three returned Mats. Defaults are starting values that need tuning on
 * real forms.
 */
export function detectLines(
  cv: CvRuntime,
  binary: CvMat,
  overrides: Partial<LineDetectionConfig> = {},
): LineDetectionResult {
  const config = resolveLineDetectionConfig(overrides);
  const image = { width: binary.cols, height: binary.rows };
  validateLineDetectionConfig(config, image);

  const horizontalLength = calculateLineKernelSize(image.width, config.horizontalKernelDivisor);
  const verticalLength = calculateLineKernelSize(image.height, config.verticalKernelDivisor);

  let horizontal: CvMat | undefined;
  let vertical: CvMat | undefined;
  let combined: CvMat | undefined;
  let horizontalScratch: CvMat | undefined;
  let verticalScratch: CvMat | undefined;
  let horizontalKernel: CvMat | undefined;
  let verticalKernel: CvMat | undefined;
  let closingKernel: CvMat | undefined;
  let closedCombined: CvMat | undefined;

  try {
    horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(horizontalLength, 1));
    verticalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, verticalLength));

    horizontalScratch = new cv.Mat();
    horizontal = new cv.Mat();
    cv.erode(binary, horizontalScratch, horizontalKernel);
    cv.dilate(horizontalScratch, horizontal, horizontalKernel);

    verticalScratch = new cv.Mat();
    vertical = new cv.Mat();
    cv.erode(binary, verticalScratch, verticalKernel);
    cv.dilate(verticalScratch, vertical, verticalKernel);

    combined = new cv.Mat();
    cv.bitwise_or(horizontal, vertical, combined);

    if (config.closeGapSize > 0) {
      closingKernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(config.closeGapSize, config.closeGapSize),
      );
      closedCombined = new cv.Mat();
      cv.morphologyEx(combined, closedCombined, cv.MORPH_CLOSE, closingKernel);
      combined.delete();
      combined = closedCombined;
      closedCombined = undefined;
    }

    const result = { horizontal, vertical, combined };
    horizontal = undefined;
    vertical = undefined;
    combined = undefined;
    return result;
  } finally {
    horizontal?.delete();
    vertical?.delete();
    combined?.delete();
    horizontalScratch?.delete();
    verticalScratch?.delete();
    horizontalKernel?.delete();
    verticalKernel?.delete();
    closingKernel?.delete();
    closedCombined?.delete();
  }
}
