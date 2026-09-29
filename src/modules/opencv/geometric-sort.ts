import type { FieldCandidate } from "./field-types";

type Row = { candidates: FieldCandidate[]; top: number; bottom: number; centerY: number; };

/** Return copied candidates ordered top-to-bottom then left-to-right, with deterministic debug IDs. */
export function sortCandidatesGeometrically(candidates: readonly FieldCandidate[]): FieldCandidate[] {
  const pending = candidates.map((candidate) => ({ ...candidate, rect: { ...candidate.rect } })).sort(compareByVerticalCenter);
  const rows: Row[] = [];
  for (const candidate of pending) {
    const row = rows.find((existing) => belongsInRow(candidate, existing));
    if (row) addToRow(row, candidate);
    else rows.push(makeRow(candidate));
  }
  const sorted = rows.sort((left, right) => left.centerY - right.centerY || left.top - right.top)
    .flatMap((row) => row.candidates.sort(compareWithinRow));
  return sorted.map((candidate, index) => ({ ...candidate, candidateId: `candidate_${String(index + 1).padStart(3, "0")}` }));
}

function belongsInRow(candidate: FieldCandidate, row: Row): boolean {
  const top = candidate.rect.y;
  const bottom = top + candidate.rect.height;
  const overlap = Math.max(0, Math.min(bottom, row.bottom) - Math.max(top, row.top));
  const minHeight = Math.min(candidate.rect.height, row.bottom - row.top);
  const centerDistance = Math.abs(top + candidate.rect.height / 2 - row.centerY);
  return overlap / Math.max(minHeight, 1) >= 0.35 || centerDistance <= Math.max(candidate.rect.height, row.bottom - row.top) * 0.45;
}
function makeRow(candidate: FieldCandidate): Row { return { candidates: [candidate], top: candidate.rect.y, bottom: candidate.rect.y + candidate.rect.height, centerY: candidate.rect.y + candidate.rect.height / 2 }; }
function addToRow(row: Row, candidate: FieldCandidate): void {
  row.candidates.push(candidate); row.top = Math.min(row.top, candidate.rect.y); row.bottom = Math.max(row.bottom, candidate.rect.y + candidate.rect.height);
  row.centerY = row.candidates.reduce((sum, item) => sum + item.rect.y + item.rect.height / 2, 0) / row.candidates.length;
}
function compareByVerticalCenter(left: FieldCandidate, right: FieldCandidate): number { return left.rect.y + left.rect.height / 2 - (right.rect.y + right.rect.height / 2) || left.rect.x - right.rect.x || left.rect.width - right.rect.width; }
function compareWithinRow(left: FieldCandidate, right: FieldCandidate): number { return left.rect.x - right.rect.x || left.rect.y - right.rect.y || left.rect.width - right.rect.width || left.rect.height - right.rect.height; }
