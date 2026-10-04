import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VietOcrAdapter,
  calculateVietOcrDimensions,
} from '../vietocr-adapter';

test('calculateVietOcrDimensions normalizes height to 32px preserving aspect ratio', () => {
  // Original: 200x50 -> Aspect ratio 4.0 -> New width: 32 * 4 = 128
  const dim1 = calculateVietOcrDimensions(200, 50, 32);
  assert.equal(dim1.height, 32);
  assert.equal(dim1.width, 128);

  // Original: 300x100 -> Aspect ratio 3.0 -> New width: 32 * 3 = 96
  const dim2 = calculateVietOcrDimensions(300, 100, 32);
  assert.equal(dim2.height, 32);
  assert.equal(dim2.width, 96);

  // Zero or invalid dimensions safe guard
  const dim3 = calculateVietOcrDimensions(0, 0, 32);
  assert.equal(dim3.height, 32);
  assert.equal(dim3.width, 32);
});

test('VietOcrAdapter returns empty array on empty input lines', async () => {
  const adapter = new VietOcrAdapter({ allowOfflineFallback: true });
  const result = await adapter.recognizeLines([]);
  assert.deepEqual(result, []);
});

test('VietOcrAdapter offline fallback generates sorted DetectedLineText with valid coordinates', async () => {
  const adapter = new VietOcrAdapter({
    endpoint: 'http://localhost:9999/unreachable', // Deliberately unreachable
    allowOfflineFallback: true,
  });

  const lines = [
    {
      lineId: 'line_001',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      coordinates: [0.05, 0.1, 0.09, 0.9] as [number, number, number, number],
      originalWidth: 400,
      originalHeight: 25,
    },
    {
      lineId: 'line_002',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      coordinates: [0.12, 0.1, 0.16, 0.85] as [number, number, number, number],
      originalWidth: 350,
      originalHeight: 22,
    },
  ];

  const results = await adapter.recognizeLines(lines);

  assert.equal(results.length, 2);
  assert.equal(results[0].lineId, 'line_001');
  assert.deepEqual(results[0].coordinates, [0.05, 0.1, 0.09, 0.9]);
  assert.equal(typeof results[0].rawText, 'string');
  assert.equal(results[0].rawText.length > 0, true);
  assert.equal(typeof results[0].confidence, 'number');
  assert.equal(results[0].confidence !== null && results[0].confidence >= 0 && results[0].confidence <= 1, true);

  assert.equal(results[1].lineId, 'line_002');
  assert.deepEqual(results[1].coordinates, [0.12, 0.1, 0.16, 0.85]);
});
