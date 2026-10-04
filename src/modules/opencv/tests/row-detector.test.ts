import assert from "node:assert/strict";
import test from "node:test";
import {
  detectFieldRowCandidates,
  resolveFieldRowDetectionConfig,
  DEFAULT_FIELD_ROW_DETECTION_CONFIG,
} from "../row-detector";
import type { CvMat } from "../types";

test("field row config resolves overrides without mutating defaults", () => {
  const custom = resolveFieldRowDetectionConfig({ kernelWidth: 32, minHeight: 12 });
  assert.equal(custom.kernelWidth, 32);
  assert.equal(custom.minHeight, 12);
  assert.equal(custom.kernelHeight, DEFAULT_FIELD_ROW_DETECTION_CONFIG.kernelHeight);

  assert.equal(DEFAULT_FIELD_ROW_DETECTION_CONFIG.kernelWidth, 14);
  assert.equal(Object.isFrozen(DEFAULT_FIELD_ROW_DETECTION_CONFIG), true);
});

test("detectFieldRowCandidates detects form field rows, phrase clusters, and filters specks and whole page", () => {
  type MockRowContour = {
    rect: { x: number; y: number; width: number; height: number };
    area: number;
  };

  const mockContours: MockRowContour[] = [
    // 0: Valid major form field row ("Họ và tên: NGUYỄN VĂN A")
    { rect: { x: 100, y: 200, width: 600, height: 28 }, area: 16800 },
    // 1: Valid major dotted line row ("Nơi cư trú: ....................")
    { rect: { x: 100, y: 260, width: 800, height: 26 }, area: 20800 },
    // 2: Valid inline phrase cluster ("Giới tính: Nam")
    { rect: { x: 100, y: 320, width: 180, height: 22 }, area: 3960 },
    // 3: Valid fine detail token ("Kinh")
    { rect: { x: 300, y: 320, width: 30, height: 12 }, area: 360 },
    // 4: Tiny speckle / punctuation dot (5x5) -> too small (< 90 area)
    { rect: { x: 50, y: 50, width: 5, height: 5 }, area: 25 },
    // 5: Overly tall whole-page border (1180x1550 on 1200x1600) -> whole page rejected
    { rect: { x: 10, y: 10, width: 1180, height: 1550 }, area: 1829000 },
  ];

  let kernelDeleted = false;
  let dilatedDeleted = false;
  let contoursDeleted = false;
  let hierarchyDeleted = false;
  let deletedContourCount = 0;

  class MockMatVector {
    size() { return mockContours.length; }
    get(i: number) {
      return {
        _index: i,
        delete: () => { deletedContourCount += 1; },
      } as unknown as CvMat;
    }
    delete() { contoursDeleted = true; }
  }

  class MockMat {
    delete() { hierarchyDeleted = true; }
  }

  const mockBinary = {
    cols: 1200,
    rows: 1600,
  } as unknown as CvMat;

  const mockCv = {
    MatVector: MockMatVector,
    Mat: MockMat,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 2,
    MORPH_RECT: 0,
    Size: class {
      constructor(public width: number, public height: number) {}
    },
    getStructuringElement() {
      return {
        delete: () => { kernelDeleted = true; },
      } as unknown as CvMat;
    },
    dilate(_src: unknown, _dst: unknown, _kernel: unknown) {
      // simulate dilation
    },
    findContours(_img: unknown, _contours: unknown, _hierarchy: unknown) {},
    boundingRect(contour: unknown) {
      const idx = (contour as { _index: number })._index;
      return mockContours[idx].rect;
    },
    contourArea(contour: unknown) {
      const idx = (contour as { _index: number })._index;
      return mockContours[idx].area;
    },
  };

  // Track dilated delete
  const origMat = mockCv.Mat;
  mockCv.Mat = class extends origMat {
    delete() {
      dilatedDeleted = true;
      super.delete();
    }
  };

  const results = detectFieldRowCandidates(mockCv as unknown as Parameters<typeof detectFieldRowCandidates>[0], mockBinary);

  // Exactly 4 valid candidates: 2 field rows + 2 phrase clusters
  assert.equal(results.length, 4);
  assert.equal(results[0].source, "field_row");
  assert.equal(results[0].candidateId, "row_0");
  assert.equal(results[1].source, "field_row");
  assert.equal(results[1].candidateId, "row_1");
  assert.equal(results[2].source, "phrase_cluster");
  assert.equal(results[2].candidateId, "phrase_2");
  assert.equal(results[3].source, "phrase_cluster");
  assert.equal(results[3].candidateId, "phrase_3");
  assert.equal(results[0].rect.y, 198); // padded (200 - 2)
  assert.equal(results[1].rect.y, 258); // padded (260 - 2)
  assert.equal(results[2].rect.y, 318); // padded (320 - 2)
  assert.equal(results[3].rect.y, 318); // padded (320 - 2)

  // Memory cleanup verified
  assert.equal(kernelDeleted, true);
  assert.equal(dilatedDeleted, true);
  assert.equal(contoursDeleted, true);
  assert.equal(deletedContourCount, mockContours.length);
});
