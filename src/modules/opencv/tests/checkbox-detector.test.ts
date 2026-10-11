import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCheckboxCandidates,
  resolveCheckboxDetectionConfig,
  DEFAULT_CHECKBOX_DETECTION_CONFIG,
} from "../checkbox-detector";
import type { CvMat } from "../types";

test("checkbox config resolves overrides without mutating defaults", () => {
  const custom = resolveCheckboxDetectionConfig({ minDimension: 16, maxDimension: 60 });
  assert.equal(custom.minDimension, 16);
  assert.equal(custom.maxDimension, 60);
  assert.equal(custom.minAspectRatio, DEFAULT_CHECKBOX_DETECTION_CONFIG.minAspectRatio);

  assert.equal(DEFAULT_CHECKBOX_DETECTION_CONFIG.minDimension, 12);
  assert.equal(Object.isFrozen(DEFAULT_CHECKBOX_DETECTION_CONFIG), true);
});

test("checkbox detector filters invalid shapes and retains true square checkboxes", () => {
  // Create mock runtime with controlled contours
  type MockContour = {
    rect: { x: number; y: number; width: number; height: number };
    area: number;
    perimeter: number;
    vertices: number;
    convex: boolean;
    parent: number;
    firstChild: number;
  };

  const mockContours: MockContour[] = [
    // 0: Valid 24x24 checkbox
    { rect: { x: 100, y: 1400, width: 24, height: 24 }, area: 576, perimeter: 96, vertices: 4, convex: true, parent: -1, firstChild: 1 },
    // 1: Inner hole of the 24x24 checkbox (stroke 3px: 18x18)
    { rect: { x: 103, y: 1403, width: 18, height: 18 }, area: 324, perimeter: 72, vertices: 4, convex: true, parent: 0, firstChild: -1 },
    // 2: Valid second checkbox 24x24
    { rect: { x: 240, y: 1400, width: 24, height: 24 }, area: 576, perimeter: 96, vertices: 4, convex: true, parent: -1, firstChild: -1 },
    // 3: Giant table boundary (980x1040) -> dimension too large
    { rect: { x: 85, y: 185, width: 980, height: 1040 }, area: 1019200, perimeter: 4040, vertices: 4, convex: true, parent: -1, firstChild: -1 },
    // 4: Tiny speckle (6x6) -> dimension too small
    { rect: { x: 50, y: 50, width: 6, height: 6 }, area: 36, perimeter: 24, vertices: 4, convex: true, parent: -1, firstChild: -1 },
    // 5: Long text line / cell (450x130) -> aspect ratio 3.46 too large
    { rect: { x: 100, y: 200, width: 450, height: 130 }, area: 58500, perimeter: 1160, vertices: 4, convex: true, parent: -1, firstChild: -1 },
    // 6: Circular character 'O' (20x20) -> 8 vertices (not a square)
    { rect: { x: 100, y: 100, width: 20, height: 20 }, area: 314, perimeter: 62, vertices: 8, convex: true, parent: -1, firstChild: -1 },
    // 7: Non-convex polygon (24x24) -> not convex
    { rect: { x: 500, y: 500, width: 24, height: 24 }, area: 400, perimeter: 96, vertices: 4, convex: false, parent: -1, firstChild: -1 },
    { rect: { x: 600, y: 1400, width: 38, height: 26 }, area: 920, perimeter: 128, vertices: 4, convex: true, parent: -1, firstChild: -1 },
    { rect: { x: 700, y: 1400, width: 26, height: 18 }, area: 430, perimeter: 88, vertices: 4, convex: true, parent: -1, firstChild: -1 },
  ];

  let clonedMatDeleted = false;
  let hierarchyDeleted = false;
  let vectorDeleted = false;
  let deletedContoursCount = 0;

  class MockMatVector {
    size() { return mockContours.length; }
    get(i: number) {
      return {
        _index: i,
        delete: () => { deletedContoursCount += 1; },
      } as unknown as CvMat;
    }
    delete() { vectorDeleted = true; }
  }

  class MockMat {
    cols = 1200;
    rows = 1600;
    intPtr(_r: number, col: number) {
      const c = mockContours[col];
      return [col + 1, col - 1, c ? c.firstChild : -1, c ? c.parent : -1];
    }
    delete() { hierarchyDeleted = true; }
  }

  const pixelData = new Uint8Array(1200 * 1600);
  for (let vertical = 1404; vertical < 1414; vertical++) for (let horizontal = 704; horizontal < 722; horizontal++) {
    pixelData[vertical * 1200 + horizontal] = 255;
  }
  const mockBinaryMat = {
    cols: 1200,
    rows: 1600,
    data: pixelData,
    clone: () => ({
      cols: 1200,
      rows: 1600,
      delete: () => { clonedMatDeleted = true; },
    } as unknown as CvMat),
  } as unknown as CvMat;

  const mockCv = {
    MatVector: MockMatVector,
    Mat: MockMat,
    RETR_TREE: 3,
    CHAIN_APPROX_SIMPLE: 2,
    findContours(_img: unknown, _contours: unknown, _hierarchy: unknown) {},
    boundingRect(contour: unknown) {
      const idx = (contour as { _index: number })._index;
      return mockContours[idx].rect;
    },
    contourArea(contour: unknown) {
      const idx = (contour as { _index: number })._index;
      return mockContours[idx].area;
    },
    arcLength(contour: unknown) {
      const idx = (contour as { _index: number })._index;
      return mockContours[idx].perimeter;
    },
    approxPolyDP(contour: unknown, approx: unknown) {
      const idx = (contour as { _index: number })._index;
      const v = mockContours[idx].vertices;
      (approx as { rows: number; cols: number; _index: number }).rows = v;
      (approx as { rows: number; cols: number; _index: number }).cols = 1;
      (approx as { rows: number; cols: number; _index: number })._index = idx;
      (approx as { delete: () => void }).delete = () => {};
    },
    isContourConvex(polygon: unknown) {
      const idx = (polygon as { _index: number })._index;
      return mockContours[idx].convex;
    },
    rectangle() {},
    Scalar: class {},
  };

  const results = detectCheckboxCandidates(mockCv as unknown as Parameters<typeof detectCheckboxCandidates>[0], mockBinaryMat);

  // Exactly 3 checkboxes should be retained (two square and one wider outline)
  // Inner hole (18x18) must be suppressed!
  assert.equal(results.length, 3);
  assert.deepEqual(results.map(result => result.rect).sort((first, second) => first.x - second.x), [
    { x: 100, y: 1400, width: 24, height: 24 },
    { x: 240, y: 1400, width: 24, height: 24 },
    { x: 600, y: 1400, width: 38, height: 26 },
  ]);
  assert.equal(results[0].source, "checkbox");
  assert.equal(results[1].source, "checkbox");
  // Check memory management: all cloned Mats, vectors, and contours must be deleted
  assert.equal(clonedMatDeleted, true);
  assert.equal(hierarchyDeleted, true);
  assert.equal(vectorDeleted, true);
  assert.equal(deletedContoursCount, mockContours.length);
  const withoutPixels = { ...mockBinaryMat, data: undefined } as unknown as CvMat;
  assert.equal(detectCheckboxCandidates(mockCv as unknown as Parameters<typeof detectCheckboxCandidates>[0], withoutPixels)
    .some(result => result.rect.x === 600), false);
});
