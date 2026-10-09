import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { analyzeImageQuality, validateImageDimensions } from '../image-quality';
async function fixture(kind: string) {
  const { data, info } = await sharp(`tests/fixtures/documents/${kind}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
test('clear white paper with synthetic strokes does not imply glare or blankness', async () => {
  const result = analyzeImageQuality(await fixture('clear'));
  assert.deepEqual(result.warnings, []); assert.equal(result.possibleGlare, false); assert.equal(result.possibleBlank, false);
});
for (const [kind, warning] of [['low-contrast', 'LOW_CONTRAST'], ['small', 'LOW_RESOLUTION'], ['shadow', 'UNEVEN_LIGHTING'], ['blank', 'POSSIBLE_BLANK']] as const)
  test(`${kind} produces soft analysis without throwing`, async () => {
    assert.ok(analyzeImageQuality(await fixture(kind)).warnings.includes(warning));
  });
test('localized clipping near texture is suspicion, while white blank paper is not glare', async () => {
  const clipped = analyzeImageQuality(await fixture('clipped'));
  assert.equal(clipped.possibleGlare, true); assert.ok(clipped.possibleGlareRegions.length > 0);
  assert.equal(analyzeImageQuality(await fixture('blank')).possibleGlare, false);
  assert.ok(!('unreadable' in clipped));
});
test('zero, unsupported buffers and unsafe dimensions are hard errors', () => {
  for (const [width, height] of [[0, 800], [1, 0], [Infinity, 1], [4000, 4000], [8193, 2]]) assert.throws(() => validateImageDimensions(width, height));
  assert.throws(() => analyzeImageQuality({ width: 2, height: 2, data: new Uint8ClampedArray(3) }));
});
