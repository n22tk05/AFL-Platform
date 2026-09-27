import assert from "node:assert/strict";
import test from "node:test";
import { calculateIou, filterCandidates } from "../box-filter";
import type { FieldCandidate } from "../field-types";

const image = { width: 1000, height: 1000 };
function candidate(x: number, y: number, width: number, height: number, extra: Partial<FieldCandidate> = {}): FieldCandidate {
  return { candidateId: "raw", rect: { x, y, width, height }, areaRatio: width * height / 1_000_000, aspectRatio: width / height, contourArea: width * height * 0.9, rectangularity: 0.9, parentIndex: -1, childIndex: -1, source: "closed_contour", ...extra };
}

test("IoU is one for matching boxes and zero for disjoint boxes", () => {
  assert.equal(calculateIou(candidate(10, 10, 100, 50).rect, candidate(10, 10, 100, 50).rect), 1);
  assert.equal(calculateIou(candidate(10, 10, 100, 50).rect, candidate(200, 200, 100, 50).rect), 0);
});
test("invalid and whole-page boxes are filtered", () => {
  const result = filterCandidates([candidate(10, 10, 0, 40), candidate(0, 0, 990, 990)], image);
  assert.equal(result.length, 0);
});
test("near-identical borders retain one deterministic candidate", () => {
  const result = filterCandidates([candidate(100, 100, 300, 100), candidate(102, 101, 299, 101, { rectangularity: 0.95 })], image);
  assert.equal(result.length, 1);
  assert.equal(result[0].rectangularity, 0.95);
});
test("a valid table child is not removed merely for containment", () => {
  const parent = candidate(100, 100, 700, 500, { childIndex: 2 });
  const child = candidate(130, 140, 200, 80, { parentIndex: 0 });
  const result = filterCandidates([parent, child], image);
  assert.equal(result.length, 2);
});
test("filtering does not mutate input candidates", () => {
  const input = [candidate(100, 100, 300, 100)];
  const before = structuredClone(input);
  filterCandidates(input, image);
  assert.deepEqual(input, before);
});
