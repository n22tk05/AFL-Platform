import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDocumentCorners, validateDocumentQuad } from '../corner-ordering';

const points = [{ x: 10, y: 20 }, { x: 410, y: 20 }, { x: 410, y: 620 }, { x: 10, y: 620 }];
const expected = { topLeft: points[0], topRight: points[1], bottomRight: points[2], bottomLeft: points[3] };

test('shuffled corners are ordered TL/TR/BR/BL without mutation', () => {
  const input = [points[2], points[0], points[3], points[1]];
  const before = structuredClone(input);
  assert.deepEqual(orderDocumentCorners(input), expected);
  assert.deepEqual(input, before);
  assert.notEqual(orderDocumentCorners(input).topLeft, input[1]);
});
test('all 24 permutations produce the same corners', () => {
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
    if (new Set([a,b,c,d]).size === 4) assert.deepEqual(orderDocumentCorners([points[a],points[b],points[c],points[d]]), expected);
  }
});
test('wrong count and duplicate points are rejected', () => {
  assert.throws(() => orderDocumentCorners(points.slice(1)));
  assert.throws(() => orderDocumentCorners([points[0], points[0], points[2], points[3]]));
});
test('NaN and Infinity are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => orderDocumentCorners([{ x: value, y: 0 }, ...points.slice(1)]));
});
test('collinear, concave and near-zero-area polygons are rejected', () => {
  assert.throws(() => orderDocumentCorners([0,1,2,3].map(x => ({ x, y: x }))));
  assert.throws(() => orderDocumentCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 75, y: 25 } ]));
  assert.throws(() => orderDocumentCorners([{x:0,y:0},{x:100,y:0},{x:100,y:1e-9},{x:0,y:1e-9}]));
});
test('rotated rectangle keeps adjacent edges and correct winding', () => {
  const angle = Math.PI / 6;
  const rotate = (p: {x:number; y:number}) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle) + 400, y: p.x * Math.sin(angle) + p.y * Math.cos(angle) + 100 });
  const rotated = points.map(rotate);
  assert.deepEqual(orderDocumentCorners([rotated[3],rotated[1],rotated[0],rotated[2]]), { topLeft: rotated[0], topRight: rotated[1], bottomRight: rotated[2], bottomLeft: rotated[3] });
});
test('diamond sum ties cannot select the same vertex twice', () => {
  const quad = orderDocumentCorners([{x:100,y:0},{x:200,y:100},{x:100,y:200},{x:0,y:100}]);
  assert.equal(new Set(Object.values(quad).map(p => `${p.x},${p.y}`)).size, 4);
  assert.deepEqual(quad.topLeft, { x:100,y:0 });
});
test('named crossed or reversed quad is refused before perspective warp', () => {
  assert.throws(() => validateDocumentQuad({ ...expected, topRight: points[3], bottomLeft: points[1] }));
  assert.throws(() => validateDocumentQuad({ ...expected, topRight: points[2], bottomRight: points[1] }));
});
