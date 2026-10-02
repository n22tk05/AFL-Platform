import assert from 'node:assert/strict';
import test from 'node:test';
import {
  segmentLines,
  DEFAULT_LINE_SEGMENT_CONFIG,
  type SegmentedLine,
} from '../line-segmentation';
import type { CvMat, CvRuntime } from '../types';

interface MockMat extends CvMat {
  deleted: boolean;
  type?: string;
}

function createMockMat(cols = 800, rows = 1000, channels = 4): MockMat {
  return {
    cols,
    rows,
    channels: () => channels,
    clone: function () {
      return createMockMat(this.cols, this.rows, channels);
    },
    copyTo: function () {},
    delete: function () {
      this.deleted = true;
    },
    deleted: false,
  };
}

function createMockRuntime(contoursToReturn: { x: number; y: number; width: number; height: number }[]) {
  const createdMats: MockMat[] = [];

  class MockMatVector {
    deleted = false;
    size() {
      return contoursToReturn.length;
    }
    get(index: number) {
      const mat = createMockMat();
      (mat as unknown as { rect: typeof contoursToReturn[0] }).rect = contoursToReturn[index];
      return mat;
    }
    delete() {
      this.deleted = true;
    }
  }

  const cv: CvRuntime & {
    MatVector: typeof MockMatVector;
    RETR_EXTERNAL: number;
    CHAIN_APPROX_SIMPLE: number;
    THRESH_OTSU: number;
    threshold: (source: CvMat, destination: CvMat, thresh: number, maxval: number, type: number) => number;
    findContours: (image: CvMat, contours: unknown, hierarchy: CvMat, mode: number, method: number) => void;
    boundingRect: (contour: unknown) => { x: number; y: number; width: number; height: number };
    createdMats: MockMat[];
  } = {
    Mat: class {
      deleted = false;
      cols = 800;
      rows = 1000;
      channels() {
        return 1;
      }
      clone() {
        return this;
      }
      copyTo() {}
      delete() {
        this.deleted = true;
      }
      constructor() {
        createdMats.push(this as unknown as MockMat);
      }
    } as unknown as new () => CvMat,
    Size: class {
      constructor(public width: number, public height: number) {}
    } as unknown as CvRuntime['Size'],
    COLOR_RGB2GRAY: 6,
    COLOR_RGBA2GRAY: 11,
    ADAPTIVE_THRESH_GAUSSIAN_C: 1,
    THRESH_BINARY_INV: 1,
    THRESH_OTSU: 8,
    MORPH_RECT: 0,
    MORPH_CLOSE: 3,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 2,
    MatVector: MockMatVector,
    cvtColor() {},
    GaussianBlur() {},
    adaptiveThreshold() {},
    getStructuringElement(_shape: number, size: { width: number; height: number }) {
      const mat = createMockMat(size.width, size.height, 1);
      createdMats.push(mat);
      return mat;
    },
    erode() {},
    dilate() {},
    bitwise_or() {},
    morphologyEx() {},
    threshold() {
      return 128;
    },
    findContours() {},
    boundingRect(contour: unknown) {
      return (contour as { rect: typeof contoursToReturn[0] }).rect;
    },
    createdMats,
  };

  return cv;
}

test('segmentLines extracts and geometrically sorts text lines top-to-bottom', () => {
  const dummyContours = [
    { x: 50, y: 300, width: 200, height: 20 },
    { x: 50, y: 100, width: 350, height: 25 },
    { x: 50, y: 200, width: 150, height: 18 },
  ];

  const cv = createMockRuntime(dummyContours);
  const source = createMockMat(800, 1000);

  const result = segmentLines(cv, source);

  assert.equal(result.lines.length, 3);
  // Line 1 should be the topmost (y: 100)
  assert.equal(result.lines[0].rect.y <= result.lines[1].rect.y, true);
  assert.equal(result.lines[1].rect.y <= result.lines[2].rect.y, true);
  assert.equal(result.lines[0].id, 'line_001');
  assert.equal(result.lines[1].id, 'line_002');
  assert.equal(result.lines[2].id, 'line_003');
});

test('segmentLines filters noise and specks smaller than minWidth/minHeight', () => {
  const dummyContours = [
    { x: 10, y: 10, width: 3, height: 3 }, // Speck
    { x: 20, y: 20, width: 10, height: 4 }, // Too short
    { x: 50, y: 100, width: 200, height: 24 }, // Valid line
  ];

  const cv = createMockRuntime(dummyContours);
  const source = createMockMat(800, 1000);

  const result = segmentLines(cv, source);

  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].id, 'line_001');
  assert.equal(result.lines[0].rect.width >= 200, true);
});

test('segmentLines applies padding and clamps normalized coordinates into [0.0, 1.0]', () => {
  const dummyContours = [
    { x: 2, y: 1, width: 100, height: 30 }, // Very close to border
  ];

  const cv = createMockRuntime(dummyContours);
  const source = createMockMat(800, 1000);

  const result = segmentLines(cv, source, { paddingX: 5, paddingY: 5 });

  assert.equal(result.lines.length, 1);
  const line = result.lines[0];
  // Clamped at 0
  assert.equal(line.rect.x, 0);
  assert.equal(line.rect.y, 0);
  // Normalized coords in [0, 1]
  const [ymin, xmin, ymax, xmax] = line.coordinates;
  assert.equal(ymin >= 0 && ymin <= 1, true);
  assert.equal(xmin >= 0 && xmin <= 1, true);
  assert.equal(ymax >= 0 && ymax <= 1, true);
  assert.equal(xmax >= 0 && xmax <= 1, true);
});

test('segmentLines cleans up all allocated OpenCV Mats in finally', () => {
  const dummyContours = [{ x: 50, y: 100, width: 200, height: 25 }];
  const cv = createMockRuntime(dummyContours);
  const source = createMockMat(800, 1000);

  segmentLines(cv, source);

  assert.equal(cv.createdMats.length > 0, true);
  for (const mat of cv.createdMats) {
    assert.equal(mat.deleted, true, 'All created Mats must be deleted after execution');
  }
});
