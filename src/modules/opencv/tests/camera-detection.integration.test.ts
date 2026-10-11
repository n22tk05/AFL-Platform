import assert from 'node:assert/strict';
import test from 'node:test';
import rawCv from '@techstark/opencv-js';
import { detectCameraDocument, detectDocument } from '../document-detector';
import type { CvRuntime } from '../types';

test('real WASM camera sweep recovers low-contrast paper while preserving source pixels', async () => {
  const cv = await rawCv;
  const width = 900, height = 1100;
  const pixels = new Uint8Array(width * height).fill(140);
  for (let y = 80; y < 1020; y++) for (let x = 80; x < 820; x++) pixels[y * width + x] = 164;
  const source = cv.matFromArray(height, width, cv.CV_8UC1, pixels);
  try {
    assert.throws(() => detectDocument(cv as unknown as CvRuntime, source));
    const result = detectCameraDocument(cv as unknown as CvRuntime, source);
    assert.equal(result.quality.accepted, true);
    assert.ok(Math.abs(result.sourceQuad.topLeft.x - 80) < 5);
    assert.ok(Math.abs(result.sourceQuad.bottomRight.y - 1020) < 5);
    assert.deepEqual(source.data, pixels);
  } finally { source.delete(); }
});

test('real WASM camera sweep still rejects an image frame without paper evidence', async () => {
  const cv = await rawCv;
  const source = cv.matFromArray(900, 700, cv.CV_8UC1, new Uint8Array(900 * 700).fill(60));
  try { assert.throws(() => detectCameraDocument(cv as unknown as CvRuntime, source)); }
  finally { source.delete(); }
});
