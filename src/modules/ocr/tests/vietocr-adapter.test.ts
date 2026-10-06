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

test('VietOcrAdapter explicit test fallback generates sorted DetectedLineText with valid coordinates', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const adapter = new VietOcrAdapter({
    endpoint: 'http://fake-vietocr/predict',
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

const sourceImage = 'data:image/png;base64,synthetic-test-input';

test('VietOcrAdapter preserves empty full-document OCR instead of synthesizing text', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions: [] }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  assert.deepEqual(await adapter.recognizeDocument(sourceImage), []);
  assert.equal(fetch.mock.callCount(), 1);
});

test('VietOcrAdapter preserves empty cropped-line OCR even with explicit mock fallback', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions: [] }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict', allowOfflineFallback: true });
  assert.deepEqual(await adapter.recognizeLines([
    { lineId: 'line_001', image: sourceImage, coordinates: [0.1, 0.1, 0.2, 0.9] },
  ]), []);
});

test('VietOcrAdapter keeps missing confidence null, zero genuine and invalid scores unknown', async t => {
  const confidences = [undefined, null, 0, 0.7, -1, 1.1];
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    predictions: confidences.map((confidence, idx) => ({
      lineId: `line_${idx}`, text: 'Synthetic text', confidence,
      coordinates: [0.1, 0.1, 0.2, 0.9],
    })),
  }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  const results = await adapter.recognizeDocument(sourceImage);
  assert.deepEqual(results.map(line => line.confidence), [null, null, 0, 0.7, null, null]);
});

test('VietOcrAdapter rejects an offline service by default without fabricated content', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  await assert.rejects(() => adapter.recognizeDocument(sourceImage), /VietOCR service unavailable/);
});

test('VietOcrAdapter rejects malformed successful responses without a mock fallback', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'not OCR predictions' }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  await assert.rejects(() => adapter.recognizeDocument(sourceImage), /Invalid response structure/);
});

test('VietOcrAdapter rejects a missing endpoint without fetching or synthesizing', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  const adapter = new VietOcrAdapter({ endpoint: '' });
  await assert.rejects(() => adapter.recognizeDocument(sourceImage), /endpoint is not configured/);
  assert.equal(fetch.mock.callCount(), 0);
});

const croppedLines = [
  { lineId: 'line_A', image: sourceImage, coordinates: [0.1, 0.1, 0.2, 0.9] as [number, number, number, number] },
  { lineId: 'line_B', image: sourceImage, coordinates: [0.3, 0.2, 0.4, 0.8] as [number, number, number, number] },
];

test('VietOcrAdapter preserves IDs and boxes when the service skips a blank crop', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    predictions: [{ lineId: 'line_B', text: 'Text from B', confidence: 0.8, coordinates: croppedLines[1].coordinates }],
  }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  assert.deepEqual(await adapter.recognizeLines(croppedLines), [
    { lineId: 'line_A', rawText: '', confidence: null, coordinates: croppedLines[0].coordinates },
    { lineId: 'line_B', rawText: 'Text from B', confidence: 0.8, coordinates: croppedLines[1].coordinates },
  ]);
});

test('VietOcrAdapter aligns reordered cropped OCR results by ID', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions: [
    { lineId: 'line_B', text: 'B', confidence: 0 },
    { lineId: 'line_A', text: 'A', confidence: null },
  ] }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  const result = await adapter.recognizeLines(croppedLines);
  assert.deepEqual(result.map(line => [line.lineId, line.rawText, line.confidence]), [
    ['line_A', 'A', null], ['line_B', 'B', 0],
  ]);
  assert.deepEqual(result.map(line => line.coordinates), croppedLines.map(line => line.coordinates));
});

test('VietOcrAdapter accepts legacy positional responses only with equal counts and no IDs', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions: [
    { text: 'A', confidence: null }, { text: 'B', confidence: 0 },
  ] }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  const result = await adapter.recognizeLines(croppedLines);
  assert.deepEqual(result.map(line => [line.lineId, line.rawText]), [['line_A', 'A'], ['line_B', 'B']]);
});

test('VietOcrAdapter rejects unsafe cropped-response alignment even when a mock was explicitly allowed', async t => {
  const cases = [
    [{ lineId: 'unknown', text: 'Unknown' }],
    [{ lineId: 'line_A', text: 'A' }, { lineId: 'line_A', text: 'Duplicated A' }],
    [{ lineId: 'line_A', text: 'A' }, { text: 'Missing ID' }],
    [{ text: 'Missing prediction' }],
  ];
  let predictions: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict', allowOfflineFallback: true });
  for (const candidate of cases) {
    predictions = candidate;
    await assert.rejects(() => adapter.recognizeLines(croppedLines), /reliable.*alignment/);
  }
});

test('full document source remains verbatim with missing bbox and malformed IDs are rejected', async t => {
  let predictions: unknown[] = [{ lineId: 'source', text: ' 00100\n原文 ', confidence: null }];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ predictions }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict' });
  const result = await adapter.recognizeDocument(sourceImage);
  assert.equal(result[0].rawText,' 00100\n原文 '); assert.equal(result[0].coordinates,null);
  for (const invalid of [[null], [{ text: 123 }], [{ lineId: 'same', text: 'A' }, { lineId: 'same', text: 'B' }]]) {
    predictions = invalid;
    await assert.rejects(() => adapter.recognizeDocument(sourceImage), /Invalid|Duplicate/);
  }
});
test('adapter timeout is a service error rather than image quality', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => new Promise((_resolve,reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted','AbortError')), { once: true });
  }));
  const adapter = new VietOcrAdapter({ endpoint: 'http://fake-vietocr/predict', timeoutMs: 10 });
  await assert.rejects(() => adapter.recognizeDocument(sourceImage), /timed out/);
});
