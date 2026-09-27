import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDocumentCorners } from '../corner-ordering';
import { evaluateDocumentQuality } from '../document-quality';
import { DEFAULT_DOCUMENT_DETECTION_CONFIG, resolveDocumentConfig } from '../document-config';

const image = { width: 1000, height: 1000 };
const rectangle = (x: number, y: number, w: number, h: number) => orderDocumentCorners([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);

test('reasonable inset document is accepted with bounded heuristic confidence', () => {
  const q = evaluateDocumentQuality(rectangle(150,100,600,800), image);
  assert.equal(q.accepted, true);
  assert.equal(q.rectangularity, 1);
  assert.equal(q.areaRatio, 0.48);
  assert.ok(q.confidence >= 0 && q.confidence <= 1);
});
test('tiny document is rejected for area and resolution', () => {
  const q = evaluateDocumentQuality(rectangle(300,300,50,70), image);
  assert.equal(q.accepted, false);
  assert.ok(q.rejectionReasons.includes('AREA_TOO_SMALL'));
  assert.ok(q.rejectionReasons.includes('OUTPUT_TOO_SMALL'));
});
test('near full image boundary is rejected even with relaxed maximum area', () => {
  const q = evaluateDocumentQuality(rectangle(0,0,999,999), image, { maxDocumentAreaRatio: 1 });
  assert.equal(q.accepted, false);
  assert.ok(q.rejectionReasons.includes('BORDER_TOO_CLOSE'));
});
test('expected ratio rejects an incompatible page', () => {
  const q = evaluateDocumentQuality(rectangle(100,100,800,300), image, { expectedAspectRatio: 0.707 });
  assert.ok(q.rejectionReasons.includes('ASPECT_RATIO_OUT_OF_RANGE'));
});
test('minimum output is tested independently of document area', () => {
  const q = evaluateDocumentQuality(rectangle(10,10,180,260), {width:200,height:300});
  assert.ok(q.rejectionReasons.includes('OUTPUT_TOO_SMALL'));
});
test('severely shortened far edge is rejected despite a large near edge', () => {
  const quad = orderDocumentCorners([{x:450,y:100},{x:550,y:100},{x:900,y:900},{x:100,y:900}]);
  assert.ok(evaluateDocumentQuality(quad, image).rejectionReasons.includes('OUTPUT_TOO_SMALL'));
});
test('confidence and reasons are deterministic and input remains unchanged', () => {
  const quad = rectangle(0,0,100,100), before = structuredClone(quad);
  const first = evaluateDocumentQuality(quad, image);
  assert.deepEqual(first, evaluateDocumentQuality(quad, image));
  assert.deepEqual(quad, before);
  assert.ok(first.confidence >= 0 && first.confidence <= 1);
});
test('weak edge evidence cannot pass just because geometry looks rectangular', () => {
  const q = evaluateDocumentQuality(rectangle(150,100,600,800), image, {}, 0.1);
  assert.equal(q.accepted, false);
  assert.ok(q.rejectionReasons.includes('WEAK_EDGE_SUPPORT'));
});
test('invalid named quad and out-of-image points produce rejection reasons', () => {
  const quad = rectangle(150,100,600,800);
  assert.deepEqual(evaluateDocumentQuality({...quad, topLeft: quad.bottomRight}, image).rejectionReasons, ['DEGENERATE_QUAD']);
  assert.ok(evaluateDocumentQuality(rectangle(-10,100,600,800), image).rejectionReasons.includes('QUAD_OUTSIDE_IMAGE'));
});
test('document config validates bounds, finite numbers and safety limits', () => {
  assert.doesNotThrow(() => resolveDocumentConfig());
  for (const key of Object.keys(DEFAULT_DOCUMENT_DETECTION_CONFIG)) {
    assert.throws(() => resolveDocumentConfig({ [key]: NaN }));
    assert.throws(() => resolveDocumentConfig({ [key]: Infinity }));
  }
  for (const input of [{blurKernelSize: 2},{blurKernelSize: 0},{cannyLowThreshold: 150},{cannyHighThreshold: 256},{minDocumentAreaRatio: 0.99},{polygonApproximationRatio:0},{aspectRatioTolerance:-1},{minimumOutputWidth:0},{borderMarginRatio:0.5},{expectedAspectRatio:NaN},{maximumOutputDimension:5000}]) assert.throws(() => resolveDocumentConfig(input));
  const c = resolveDocumentConfig({ minimumConfidence: 0.8 });
  c.minimumConfidence = 0.9;
  assert.equal(DEFAULT_DOCUMENT_DETECTION_CONFIG.minimumConfidence, 0.68);
});
