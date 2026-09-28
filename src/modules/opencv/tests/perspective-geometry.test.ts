import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDocumentCorners } from '../corner-ordering';
import { calculatePerspectiveGeometry } from '../perspective-transform';

const rectangle = (width: number, height: number) => orderDocumentCorners([{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}]);
test('output uses width and height of rectangular quad', () => {
  assert.deepEqual(calculatePerspectiveGeometry(rectangle(600,800)), {width:600,height:800});
});
test('perspective geometry uses maximum opposite edge lengths', () => {
  const quad = orderDocumentCorners([{x:100,y:0},{x:500,y:0},{x:600,y:800},{x:0,y:800}]);
  assert.deepEqual(calculatePerspectiveGeometry(quad), {width:600,height:Math.floor(Math.hypot(100,800))});
});
test('zero, negative limits, degenerate geometry and subpixel edges fail', () => {
  assert.throws(() => calculatePerspectiveGeometry(rectangle(600,800), { maximumOutputDimension: 0 }));
  assert.throws(() => calculatePerspectiveGeometry(rectangle(600,800), { maximumOutputPixels: -1 }));
  assert.throws(() => calculatePerspectiveGeometry({ topLeft:{x:0,y:0},topRight:{x:0,y:0},bottomRight:{x:0,y:0},bottomLeft:{x:0,y:0} }));
  assert.throws(() => calculatePerspectiveGeometry(rectangle(0.5,0.5)));
});
test('output fits both dimension and pixel safety caps', () => {
  const output = calculatePerspectiveGeometry(rectangle(8000,12000));
  assert.ok(output.width <= 2400 && output.height <= 2400);
  assert.ok(output.width * output.height <= 4_000_000);
  assert.ok(Math.abs(output.width / output.height - 2/3) < 0.001);
  const square = calculatePerspectiveGeometry(rectangle(10000,10000));
  assert.deepEqual(square, {width:2000,height:2000});
});
test('expected aspect ratio is fitted without artificial enlargement', () => {
  assert.deepEqual(calculatePerspectiveGeometry(rectangle(600,800), { expectedAspectRatio:0.5 }), {width:400,height:800});
});
test('calculating output does not mutate quad or options', () => {
  const quad = rectangle(600,800), options = {expectedAspectRatio:0.75};
  const before = structuredClone({quad,options});
  calculatePerspectiveGeometry(quad, options);
  assert.deepEqual({quad,options}, before);
});
