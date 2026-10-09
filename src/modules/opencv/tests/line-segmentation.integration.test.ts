import assert from 'node:assert/strict';
import test from 'node:test';
import rawCv from '@techstark/opencv-js';
import sharp from 'sharp';
import { segmentLines } from '../line-segmentation';
import { removeDocumentRules } from '../remove-rules';
import type { CvRuntime } from '../types';

test('real WASM finds table text after removing rules and preserves caller pixels', async () => {
  const cv = await rawCv;
  const { data, info } = await sharp('tests/fixtures/ocr-json/tc04_table_empty_cells.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = cv.matFromArray(info.height, info.width, cv.CV_8UC4, data);
  try {
    const before = new Uint8Array(source.data);
    const result = segmentLines(cv as unknown as CvRuntime, source);
    assert.ok(result.lines.length >= 20, `table text missing: ${result.lines.length} regions`);
    assert.ok(result.lines.some(line => line.coordinates[0] > 0.27));
    assert.deepEqual(source.data, before);
    assert.ok(result.lines.every(line => line.coordinates.every(n => n >= 0 && n <= 1)));
  } finally { source.delete(); }
});

test('real WASM rule removal preserves thick strokes and deletes only thin grid pixels', async () => {
  const cv = await rawCv;
  const pixels = new Uint8Array(200 * 200);
  for (let x = 10; x < 190; x++) pixels[20 * 200 + x] = 255;
  for (let y = 80; y < 100; y++) for (let x = 20; x < 180; x++) pixels[y * 200 + x] = 255;
  const binary = cv.matFromArray(200, 200, cv.CV_8UC1, pixels);
  const clean = removeDocumentRules(cv as unknown as CvRuntime, binary) as typeof binary;
  try {
    assert.equal(clean.data[20 * 200 + 100], 0);
    assert.equal(clean.data[90 * 200 + 100], 255);
    assert.deepEqual(binary.data, pixels);
  } finally { clean.delete(); binary.delete(); }
});
