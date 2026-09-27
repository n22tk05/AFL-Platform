import type { ImageDimensions } from "./types";

export interface PreprocessConfig {
  adaptiveBlockSize: number;
  adaptiveC: number;
  blurKernelSize: number;
}

export interface LineDetectionConfig {
  horizontalKernelDivisor: number;
  verticalKernelDivisor: number;
  closeGapSize: number;
}

/**
 * Initial values only. Tune these against representative scanned forms before
 * treating them as production defaults.
 */
export const DEFAULT_PREPROCESS_CONFIG: Readonly<PreprocessConfig> = Object.freeze({
  adaptiveBlockSize: 31,
  adaptiveC: 7,
  blurKernelSize: 3,
});

/**
 * Initial values only. Tune these against representative scanned forms before
 * treating them as production defaults.
 */
export const DEFAULT_LINE_DETECTION_CONFIG: Readonly<LineDetectionConfig> = Object.freeze({
  horizontalKernelDivisor: 30,
  verticalKernelDivisor: 30,
  closeGapSize: 3,
});

/** Merge optional preprocessing overrides without mutating the shared defaults. */
export function resolvePreprocessConfig(overrides: Partial<PreprocessConfig> = {}): PreprocessConfig {
  const config = { ...DEFAULT_PREPROCESS_CONFIG, ...overrides };
  validatePreprocessConfig(config);
  return config;
}

/** Merge optional line-detection overrides without mutating the shared defaults. */
export function resolveLineDetectionConfig(
  overrides: Partial<LineDetectionConfig> = {},
): LineDetectionConfig {
  const config = { ...DEFAULT_LINE_DETECTION_CONFIG, ...overrides };
  validateLineDetectionConfig(config);
  return config;
}

/**
 * Validate preprocessing values, optionally against a concrete input image.
 * No invalid value is normalized or silently corrected.
 */
export function validatePreprocessConfig(
  config: PreprocessConfig,
  image?: ImageDimensions,
): void {
  if (!Number.isInteger(config.adaptiveBlockSize) || config.adaptiveBlockSize % 2 === 0) {
    throw new RangeError("adaptiveBlockSize must be an odd integer.");
  }
  if (config.adaptiveBlockSize <= 1) {
    throw new RangeError("adaptiveBlockSize must be greater than 1.");
  }
  if (!Number.isFinite(config.adaptiveC)) {
    throw new RangeError("adaptiveC must be a finite number.");
  }
  if (!Number.isInteger(config.blurKernelSize) || config.blurKernelSize <= 0 || config.blurKernelSize % 2 === 0) {
    throw new RangeError("blurKernelSize must be a positive odd integer.");
  }

  if (image) {
    validateImageDimensions(image);
    const smallestDimension = Math.min(image.width, image.height);
    if (config.adaptiveBlockSize > smallestDimension) {
      throw new RangeError("adaptiveBlockSize must not exceed the smallest image dimension.");
    }
    if (config.blurKernelSize > smallestDimension) {
      throw new RangeError("blurKernelSize must not exceed the smallest image dimension.");
    }
  }
}

/**
 * Validate line-detection values, optionally ensuring their calculated kernels
 * fit a concrete binary image.
 */
export function validateLineDetectionConfig(
  config: LineDetectionConfig,
  image?: ImageDimensions,
): void {
  validateDivisor(config.horizontalKernelDivisor, "horizontalKernelDivisor");
  validateDivisor(config.verticalKernelDivisor, "verticalKernelDivisor");
  if (!Number.isInteger(config.closeGapSize) || config.closeGapSize < 0) {
    throw new RangeError("closeGapSize must be a non-negative integer.");
  }

  if (image) {
    validateImageDimensions(image);
    const horizontalKernel = calculateLineKernelSize(image.width, config.horizontalKernelDivisor);
    const verticalKernel = calculateLineKernelSize(image.height, config.verticalKernelDivisor);
    if (horizontalKernel > image.width || verticalKernel > image.height) {
      throw new RangeError("Calculated line kernel must fit its image axis.");
    }
    if (config.closeGapSize > 0 && config.closeGapSize > Math.min(image.width, image.height)) {
      throw new RangeError("closeGapSize must not exceed the smallest image dimension.");
    }
  }
}

/**
 * Calculate a morphology-kernel length for one image axis. The minimum is one,
 * which keeps very small images from producing an invalid zero-sized kernel.
 */
export function calculateLineKernelSize(axisLength: number, divisor: number): number {
  if (!Number.isInteger(axisLength) || axisLength <= 0) {
    throw new RangeError("Image axis length must be a positive integer.");
  }
  validateDivisor(divisor, "divisor");
  return Math.max(1, Math.floor(axisLength / divisor));
}

function validateDivisor(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0.`);
  }
}

function validateImageDimensions(image: ImageDimensions): void {
  if (!Number.isInteger(image.width) || image.width <= 0 || !Number.isInteger(image.height) || image.height <= 0) {
    throw new RangeError("Image dimensions must be positive integers.");
  }
}
