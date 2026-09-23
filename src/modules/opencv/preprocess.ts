import {
  resolvePreprocessConfig,
  validatePreprocessConfig,
  type PreprocessConfig,
} from "./config";
import type { CvMat, CvRuntime } from "./types";

/**
 * Convert an RGB, RGBA, or grayscale source Mat into an ink-foreground binary Mat.
 * The source remains owned by the caller and is never changed or deleted. The caller
 * owns the returned Mat and must call `delete()` on it. Defaults are a starting point
 * only and require tuning with real form images.
 */
export function preprocessToBinary(
  cv: CvRuntime,
  source: CvMat,
  overrides: Partial<PreprocessConfig> = {},
): CvMat {
  const config = resolvePreprocessConfig(overrides);
  validatePreprocessConfig(config, { width: source.cols, height: source.rows });

  let grayscale: CvMat | undefined;
  let blurred: CvMat | undefined;
  let binary: CvMat | undefined;

  try {
    grayscale = new cv.Mat();
    convertToGrayscale(cv, source, grayscale);

    const thresholdInput = config.blurKernelSize > 1
      ? (() => {
          blurred = new cv.Mat();
          cv.GaussianBlur(
            grayscale,
            blurred,
            new cv.Size(config.blurKernelSize, config.blurKernelSize),
            0,
            0,
          );
          return blurred;
        })()
      : grayscale;

    binary = new cv.Mat();
    // THRESH_BINARY_INV makes dark ink white (foreground), as morphology expects.
    cv.adaptiveThreshold(
      thresholdInput,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      config.adaptiveBlockSize,
      config.adaptiveC,
    );

    const result = binary;
    binary = undefined;
    return result;
  } finally {
    binary?.delete();
    blurred?.delete();
    grayscale?.delete();
  }
}

function convertToGrayscale(cv: CvRuntime, source: CvMat, destination: CvMat): void {
  switch (source.channels()) {
    case 1:
      source.copyTo(destination);
      return;
    case 3:
      cv.cvtColor(source, destination, cv.COLOR_RGB2GRAY);
      return;
    case 4:
      cv.cvtColor(source, destination, cv.COLOR_RGBA2GRAY);
      return;
    default:
      throw new TypeError("source must have 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.");
  }
}
