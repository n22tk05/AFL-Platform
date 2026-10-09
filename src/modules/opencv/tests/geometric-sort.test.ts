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

test("nested table container does not distort row grouping of its contained cells", () => {
  // Simulates the synthetic-nested fixture from the audit
  const container = candidate(85, 185, 980, 1040); // Large outer table boundary
  const fields = [
    // Row 1
    candidate(100, 200, 450, 130), candidate(600, 200, 450, 130),
    // Row 2
    candidate(100, 420, 450, 130), candidate(600, 420, 450, 130),
    // Row 3
    candidate(100, 640, 450, 130), candidate(600, 640, 450, 130),
    // Row 4
    candidate(100, 860, 450, 130), candidate(600, 860, 450, 130),
    // Row 5
    candidate(100, 1080, 450, 130), candidate(600, 1080, 450, 130),
  ];
  // Checkboxes outside the container
  const checkboxes = [
    candidate(100, 1400, 24, 24),
    candidate(240, 1400, 24, 24),
    candidate(380, 1400, 24, 24),
  ];

  // Feed in a deliberately scrambled order (e.g. Row 3 first, then container, then Row 1, etc.)
  const scrambled = [
    fields[4], container, fields[0], checkboxes[1], fields[9],
    fields[1], checkboxes[0], fields[3], fields[2], checkboxes[2],
    fields[5], fields[8], fields[6], fields[7],
  ];

  const sorted = sortCandidatesGeometrically(scrambled);
  assert.equal(sorted.length, 14);

  // 1. Container comes first
  assert.deepEqual([sorted[0].rect.x, sorted[0].rect.y], [85, 185]);
  assert.equal(sorted[0].isContainer, true);

  // 2. Row 1 cells: (100, 200) then (600, 200)
  assert.deepEqual([sorted[1].rect.x, sorted[1].rect.y], [100, 200]);
  assert.deepEqual([sorted[2].rect.x, sorted[2].rect.y], [600, 200]);

  // 3. Row 2 cells: (100, 420) then (600, 420)
  assert.deepEqual([sorted[3].rect.x, sorted[3].rect.y], [100, 420]);
  assert.deepEqual([sorted[4].rect.x, sorted[4].rect.y], [600, 420]);

  // 4. Row 3 cells: (100, 640) then (600, 640)
  assert.deepEqual([sorted[5].rect.x, sorted[5].rect.y], [100, 640]);
  assert.deepEqual([sorted[6].rect.x, sorted[6].rect.y], [600, 640]);

  // 5. Row 4 cells: (100, 860) then (600, 860)
  assert.deepEqual([sorted[7].rect.x, sorted[7].rect.y], [100, 860]);
  assert.deepEqual([sorted[8].rect.x, sorted[8].rect.y], [600, 860]);

  // 6. Row 5 cells: (100, 1080) then (600, 1080)
  assert.deepEqual([sorted[9].rect.x, sorted[9].rect.y], [100, 1080]);
  assert.deepEqual([sorted[10].rect.x, sorted[10].rect.y], [600, 1080]);

  // 7. Checkboxes: (100, 1400), (240, 1400), (380, 1400)
  assert.deepEqual([sorted[11].rect.x, sorted[11].rect.y], [100, 1400]);
  assert.deepEqual([sorted[12].rect.x, sorted[12].rect.y], [240, 1400]);
  assert.deepEqual([sorted[13].rect.x, sorted[13].rect.y], [380, 1400]);

  // Check candidate IDs are sequential
  assert.equal(sorted[0].candidateId, "candidate_001");
  assert.equal(sorted[13].candidateId, "candidate_014");
});

test("nested table inside another container (multi-level hierarchy) sorts correctly", () => {
  const outerDoc = candidate(50, 50, 900, 900);
  const innerTable = candidate(100, 100, 400, 400);
  const cell1 = candidate(120, 150, 150, 50);
  const cell2 = candidate(300, 150, 150, 50);
  const footerField = candidate(100, 600, 700, 60);

  const sorted = sortCandidatesGeometrically([cell2, outerDoc, footerField, cell1, innerTable]);
  assert.deepEqual(
    sorted.map((s) => [s.rect.x, s.rect.y]),
    [
      [50, 50],   // outerDoc
      [100, 100], // innerTable
      [120, 150], // cell1
      [300, 150], // cell2
      [100, 600], // footerField
    ],
  );
  assert.equal(sorted[0].isContainer, true);
  assert.equal(sorted[1].isContainer, true);
  assert.equal(sorted[2].isContainer, false);
});
