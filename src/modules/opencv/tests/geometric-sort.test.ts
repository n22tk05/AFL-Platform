import assert from "node:assert/strict";
import test from "node:test";
import { sortCandidatesGeometrically } from "../geometric-sort";
import type { FieldCandidate } from "../field-types";

function candidate(x: number, y: number, width = 100, height = 40): FieldCandidate {
  return { candidateId: "raw", rect: { x, y, width, height }, areaRatio: 0.01, aspectRatio: width / height, contourArea: width * height, rectangularity: 1, parentIndex: -1, childIndex: -1, source: "closed_contour" };
}
test("rows sort top-to-bottom and cells within rows sort left-to-right", () => {
  const result = sortCandidatesGeometrically([candidate(300, 200), candidate(400, 50), candidate(100, 52), candidate(50, 200)]);
  assert.deepEqual(result.map((item) => [item.rect.x, item.rect.y]), [[100, 52], [400, 50], [50, 200], [300, 200]]);
});
test("different heights remain in one row when their vertical overlap is meaningful", () => {
  const result = sortCandidatesGeometrically([candidate(250, 110, 80, 80), candidate(20, 100, 100, 40)]);
  assert.deepEqual(result.map((item) => item.rect.x), [20, 250]);
});
test("sorting does not mutate input and IDs are deterministic across runs", () => {
  const input = [candidate(200, 20), candidate(20, 20), candidate(30, 150)];
  const before = structuredClone(input);
  const first = sortCandidatesGeometrically(input);
  const second = sortCandidatesGeometrically(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.candidateId), ["candidate_001", "candidate_002", "candidate_003"]);
});
