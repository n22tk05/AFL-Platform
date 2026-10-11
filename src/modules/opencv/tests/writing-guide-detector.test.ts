import assert from 'node:assert/strict';
import test from 'node:test';
import { detectWritingGuideCandidates } from '../writing-guide-detector';
import { mergeFormCandidates } from '../box-filter';

function image(width = 800, height = 1000) {
  const data = new Uint8Array(width * height);
  const rectangle = (left: number, top: number, rectWidth: number, rectHeight: number) => {
    for (let vertical = top; vertical < top + rectHeight; vertical++) {
      for (let horizontal = left; horizontal < left + rectWidth; horizontal++) data[vertical * width + horizontal] = 255;
    }
  };
  return { data, width, height, rectangle };
}

test('detects actual dotted writing areas independently from the printed label and at two scales', () => {
  for (const factor of [1, 2]) {
    const source = image(800 * factor, 1000 * factor);
    for (let horizontal = 220 * factor; horizontal < 700 * factor; horizontal += 8 * factor) source.rectangle(horizontal, 200 * factor, 2 * factor, 2 * factor);
    source.rectangle(60 * factor, 180 * factor, 110 * factor, 16 * factor);
    const result = detectWritingGuideCandidates(source.data, source.width, source.height);
    assert.equal(result.length, 1);
    assert.equal(result[0].guideStyle, 'dotted');
    assert.equal(result[0].rect.x, 220 * factor);
    assert.ok(result[0].rect.y < 200 * factor);
    assert.ok(result[0].rect.x > 170 * factor);
    const merged = mergeFormCandidates([], [], result, { width: source.width, height: source.height });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].source, 'writing_guide');
  }
});

test('keeps independent dotted spans on one row and two continuation rows separate geometrically', () => {
  const source = image();
  for (const [start, end, baseline] of [[150, 350, 200], [470, 710, 200], [60, 710, 240]]) {
    for (let horizontal = start; horizontal < end; horizontal += 8) source.rectangle(horizontal, baseline, 2, 2);
  }
  assert.equal(detectWritingGuideCandidates(source.data, source.width, source.height).length, 3);
});

test('detects short date blanks without treating sparse marks as writing guides', () => {
  const source = image();
  for (const start of [190, 350, 520]) {
    for (let horizontal = start; horizontal < start + 45; horizontal += 9) source.rectangle(horizontal, 200, 2, 2);
  }
  for (const horizontal of [90, 108, 132, 141, 170, 180]) source.rectangle(horizontal, 300, 2, 2);
  const result = detectWritingGuideCandidates(source.data, source.width, source.height);
  assert.deepEqual(result.map(candidate => candidate.rect.x), [190, 350, 520]);
  assert.ok(result.every(candidate => candidate.shortGuide));
});

test('keeps three evenly spaced date dots while excluding an adjacent punctuation outlier', () => {
  const source = image(1238, 1744);
  for (const horizontal of [688, 704, 714, 723, 490, 498, 505, 520]) {
    source.rectangle(horizontal, horizontal > 600 ? 224 : 258, 5, 5);
  }
  const result = detectWritingGuideCandidates(source.data, source.width, source.height);
  assert.deepEqual(result.map(item => item.rect.x), [704, 490]);
  assert.ok(result.every(item => item.shortGuide && item.guideStyle === 'dotted'));
});

test('one wider printing gap inside six short dots keeps one candidate', () => {
  const source = image(1238, 1744);
  for (const horizontal of [627, 636, 646, 663, 672, 682]) source.rectangle(horizontal, 863, 5, 5);
  const result = detectWritingGuideCandidates(source.data, source.width, source.height);
  assert.equal(result.length, 1);
  assert.equal(result[0].rect.x, 627);
  assert.equal(result[0].rect.width, 60);
  assert.equal(result[0].shortGuide, true);
});

test('solid underline is detected, but glyph-like blocks, scattered dots and empty paper are not guides', () => {
  const source = image();
  source.rectangle(200, 200, 350, 2);
  for (let horizontal = 30; horizontal < 550; horizontal += 25) source.rectangle(horizontal, 300, 8, 16);
  for (const horizontal of [10, 30, 70, 150, 300, 550, 600, 750]) source.rectangle(horizontal, 400, 2, 2);
  const result = detectWritingGuideCandidates(source.data, source.width, source.height);
  assert.equal(result.length, 1);
  assert.equal(result[0].guideStyle, 'underline');
  assert.equal(detectWritingGuideCandidates(new Uint8Array(100), 10, 10).length, 0);
  assert.throws(() => detectWritingGuideCandidates(source.data, 0, 1000), /FRAME/);
});
