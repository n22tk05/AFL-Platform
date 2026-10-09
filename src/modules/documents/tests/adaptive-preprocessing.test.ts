import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import sharp from 'sharp';
import { enhanceDocumentCanvas, enhancedDimensions, normalizeLighting, preprocessingCapabilities, type EnhancementRuntime } from '../adaptive-preprocessing';
import { validatePerspectiveMatrix } from '@/modules/opencv/perspective-transform';
import { detectDocument } from '@/modules/opencv/document-detector';
import { DocumentDetectionError } from '@/modules/opencv/document-types';
import type { CvMat } from '@/modules/opencv/types';
function fakeRuntime(fail = false, capabilities = false) {
  const live = new Set<Mat>(); let claheObjects = 0;
  class Mat {
    cols = 8; rows = 8; data = new Uint8Array(64).fill(150);
    constructor() { live.add(this); }
    channels() { return 1; } clone() { const m = new Mat(); this.copyTo(m); return m; }
    copyTo(m: Mat) { m.cols = this.cols; m.rows = this.rows; m.data = new Uint8Array(this.data); }
    delete() { assert.ok(live.delete(this), 'delete exactly once'); }
  }
  const cv = { Mat, Size: class { constructor(public width: number, public height: number) {} },
    GaussianBlur: (src: Mat, dst: Mat) => { if (fail) throw Error('filter failure'); src.copyTo(dst); },
    resize: (src: Mat, dst: Mat) => src.copyTo(dst), imshow: () => {},
    ...(capabilities ? { bilateralFilter: (src: Mat, dst: Mat) => src.copyTo(dst), CLAHE: class {
      constructor() { claheObjects++; } apply(src: Mat, dst: Mat) { src.copyTo(dst); }
      delete() { claheObjects--; }
    } } : {}),
  } as unknown as EnhancementRuntime;
  return { cv, source: new Mat(), live, claheObjects: () => claheObjects };
}
test('missing optional capabilities use supported fallbacks and clean up on success', () => {
  const r = fakeRuntime(); const before = new Uint8Array(r.source.data);
  const result = enhanceDocumentCanvas(r.cv, r.source, 'contrast', {} as HTMLCanvasElement);
  assert.deepEqual(result.capabilities, { clahe: false, bilateralFilter: false });
  assert.ok(result.filters.includes('linear-contrast-fallback')); assert.ok(result.filters.includes('gaussian-fallback'));
  assert.deepEqual(r.source.data, before); assert.equal(r.live.size, 1); r.source.delete();
});
test('filter exception frees every owned Mat, preserving caller source', () => {
  const r = fakeRuntime(true); assert.throws(() => enhanceDocumentCanvas(r.cv, r.source, 'lighting', {} as HTMLCanvasElement), /filter failure/);
  assert.equal(r.live.size, 1); r.source.delete();
});
test('CLAHE object and all intermediates are freed when later unsharp step throws', () => {
  const r = fakeRuntime(true, true); assert.throws(() => enhanceDocumentCanvas(r.cv, r.source, 'contrast', {} as HTMLCanvasElement));
  assert.equal(r.claheObjects(), 0); assert.equal(r.live.size, 1); r.source.delete();
});
test('lighting normalization is finite with zero background and cannot wrap uint8 values', () => {
  const output = new Uint8Array(4);
  normalizeLighting(new Uint8Array([0, 255, 20, 100]), new Uint8Array([0, 0, 20, 200]), output);
  assert.deepEqual(Array.from(output), [0, 255, 220, 97]);
});
test('upscale is bounded to 2x with independent rounded X/Y scales and a pixel cap', () => {
  const small = enhancedDimensions(123, 161); assert.equal(small.scaleX, 2); assert.equal(small.scaleY, 2);
  const rounded = enhancedDimensions(733, 1101); assert.equal(rounded.scaleX, rounded.width / 733); assert.equal(rounded.scaleY, rounded.height / 1101);
  const large = enhancedDimensions(3000, 4000); assert.equal(large.width * large.height, 12_000_000);
});
test('non-finite, singular and horizon-crossing homographies remain hard errors', () => {
  const quad = { topLeft: { x: 0, y: 0 }, topRight: { x: 100, y: 0 }, bottomRight: { x: 100, y: 100 }, bottomLeft: { x: 0, y: 100 } };
  for (const matrix of [[1,0,0,0,1,0,0,0,NaN], [0,0,0,0,0,0,0,0,0], [1,0,0,0,1,0,-0.02,0,1]]) assert.throws(() => validatePerspectiveMatrix(matrix, quad));
  assert.doesNotThrow(() => validatePerspectiveMatrix([1,0,0,0,1,0,0,0,1], quad));
});
test('real installed OpenCV WASM runs both variants on synthetic pixels, preserving source', async () => {
  const actual = await Promise.resolve(cvModule) as unknown as EnhancementRuntime & { CV_8UC4: number; matFromArray(rows: number, cols: number, type: number, data: number[]): CvMat & { data: Uint8Array } };
  const { data, info } = await sharp('tests/fixtures/documents/small.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = actual.matFromArray(info.height, info.width, actual.CV_8UC4, Array.from(data));
  const before = new Uint8Array(source.data);
  const captures: number[][] = [];
  const runtime = { ...actual, imshow: (_: HTMLCanvasElement, mat: CvMat) => { captures.push([mat.cols, mat.rows]); } };
  try {
    assert.deepEqual(preprocessingCapabilities(actual), { clahe: true, bilateralFilter: true });
    for (const variant of ['contrast', 'lighting'] as const) {
      const output = enhanceDocumentCanvas(runtime, source, variant, {} as HTMLCanvasElement);
      assert.equal(output.scaleX, 2); assert.equal(output.scaleY, 2);
      if (variant === 'contrast') assert.ok(output.filters.includes('clahe'));
    }
    assert.deepEqual(captures, [[246, 322], [246, 322]]); assert.deepEqual(source.data, before);
    const uniform = source.clone() as CvMat & { data: Uint8Array };
    try {
      uniform.data.fill(110);
      assert.throws(() => detectDocument(actual, uniform), error => error instanceof DocumentDetectionError && error.code === 'DOCUMENT_NOT_FOUND');
    } finally { uniform.delete(); }
  } finally { source.delete(); }
});
