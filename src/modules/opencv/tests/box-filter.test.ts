import assert from "node:assert/strict";
import test from "node:test";
import { calculateIou, filterCandidates, mergeFormCandidates } from "../box-filter";
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

test("mergeFormCandidates preserves standalone field rows and suppresses rows inside table cells", () => {
  // A table cell (300x80)
  const tableCell = candidate(100, 100, 300, 80, { source: "closed_contour" });
  // A text line inside the table cell (200x25) -> should be suppressed
  const innerRow = candidate(120, 125, 200, 25, { source: "field_row" });
  // A standalone form field row (dotted line: "Họ và tên: ...") -> should be retained!
  const standaloneRow = candidate(100, 300, 700, 30, { source: "field_row" });
  // A checkbox -> should be retained!
  const checkbox = candidate(100, 400, 24, 24, { source: "checkbox" });

  const merged = mergeFormCandidates(
    [tableCell],
    [checkbox],
    [innerRow, standaloneRow],
    image,
  );

  assert.equal(merged.length, 3);
  const sources = merged.map((m) => m.source);
  assert.ok(sources.includes("closed_contour"));
  assert.ok(sources.includes("checkbox"));
  assert.ok(sources.includes("field_row"));

  // The retained field row is the standalone one, not the inner one!
  const retainedRow = merged.find((m) => m.source === "field_row");
  assert.deepEqual(retainedRow?.rect, standaloneRow.rect);
});

test("mergeFormCandidates preserves fine-grained phrase clusters and wide field rows with high aspect ratio", () => {
  // A fine phrase cluster ("Giới tính: Nam")
  const phrase = candidate(100, 500, 150, 22, { source: "phrase_cluster" });
  // A wide dotted line field row with aspect ratio > 40 ("Nơi sinh: ....................")
  const wideDottedRow = candidate(50, 600, 900, 18, {
    source: "field_row",
    aspectRatio: 900 / 18, // 50
    areaRatio: (900 * 18) / 1_000_000,
  });
  // A checkbox
  const checkbox = candidate(100, 700, 20, 20, { source: "checkbox" });
  // A duplicate dilated box around the checkbox
  const duplicateCheckboxRow = candidate(98, 698, 24, 24, { source: "phrase_cluster" });

  const merged = mergeFormCandidates(
    [],
    [checkbox],
    [phrase, wideDottedRow, duplicateCheckboxRow],
    image,
  );

  assert.equal(merged.length, 3);
  const sources = merged.map((m) => m.source);
  assert.ok(sources.includes("checkbox"));
  assert.ok(sources.includes("phrase_cluster"));
  assert.ok(sources.includes("field_row"));
  // Duplicate checkbox row is suppressed, checkbox is kept
  assert.equal(merged.some((m) => m.source === "checkbox"), true);
  assert.equal(merged.some((m) => m.rect.y === 600), true);
});
