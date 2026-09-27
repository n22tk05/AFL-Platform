import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LINE_DETECTION_CONFIG,
  DEFAULT_PREPROCESS_CONFIG,
  calculateLineKernelSize,
  resolveLineDetectionConfig,
  resolvePreprocessConfig,
  validateLineDetectionConfig,
  validatePreprocessConfig,
} from "../config";

test("default configs are valid for a representative document image", () => {
  assert.doesNotThrow(() => validatePreprocessConfig(DEFAULT_PREPROCESS_CONFIG, { width: 2480, height: 3508 }));
  assert.doesNotThrow(() => validateLineDetectionConfig(DEFAULT_LINE_DETECTION_CONFIG, { width: 2480, height: 3508 }));
});

test("preprocessing rejects an even or too-small adaptive block size", () => {
  assert.throws(
    () => resolvePreprocessConfig({ adaptiveBlockSize: 30 }),
    /adaptiveBlockSize must be an odd integer/,
  );
  assert.throws(
    () => resolvePreprocessConfig({ adaptiveBlockSize: 1 }),
    /adaptiveBlockSize must be greater than 1/,
  );
});

test("preprocessing rejects invalid blur kernels", () => {
  assert.throws(() => resolvePreprocessConfig({ blurKernelSize: 2 }), /positive odd integer/);
  assert.throws(() => resolvePreprocessConfig({ blurKernelSize: 0 }), /positive odd integer/);
});

test("preprocessing validates image-compatible kernel sizes", () => {
  assert.throws(
    () => validatePreprocessConfig({ ...DEFAULT_PREPROCESS_CONFIG }, { width: 20, height: 40 }),
    /adaptiveBlockSize must not exceed/,
  );
});

test("line detection rejects zero and negative divisors", () => {
  assert.throws(() => resolveLineDetectionConfig({ horizontalKernelDivisor: 0 }), /greater than 0/);
  assert.throws(() => resolveLineDetectionConfig({ verticalKernelDivisor: -1 }), /greater than 0/);
});

test("line detection rejects a calculated kernel that exceeds its image axis", () => {
  assert.throws(
    () => validateLineDetectionConfig({ ...DEFAULT_LINE_DETECTION_CONFIG, horizontalKernelDivisor: 0.5 }, { width: 20, height: 40 }),
    /Calculated line kernel must fit/,
  );
});

test("calculated line kernels never become zero for small images", () => {
  assert.equal(calculateLineKernelSize(1, 30), 1);
  assert.equal(calculateLineKernelSize(12, 30), 1);
});

test("kernel calculation scales with at least two image dimensions", () => {
  assert.equal(calculateLineKernelSize(300, 30), 10);
  assert.equal(calculateLineKernelSize(1200, 30), 40);
});

test("resolved config objects do not mutate shared defaults", () => {
  const preprocess = resolvePreprocessConfig({ adaptiveC: 11 });
  const lines = resolveLineDetectionConfig({ closeGapSize: 5 });
  preprocess.adaptiveC = 13;
  lines.closeGapSize = 7;

  assert.equal(DEFAULT_PREPROCESS_CONFIG.adaptiveC, 7);
  assert.equal(DEFAULT_LINE_DETECTION_CONFIG.closeGapSize, 3);
  assert.equal(Object.isFrozen(DEFAULT_PREPROCESS_CONFIG), true);
  assert.equal(Object.isFrozen(DEFAULT_LINE_DETECTION_CONFIG), true);
});
