import type { FieldCandidate, PixelRect } from "./field-types";

type Row = {
  candidates: FieldCandidate[];
  top: number;
  bottom: number;
  centerY: number;
  avgHeight: number;
};

type VisualBlock =
  | { type: "row"; row: Row; top: number; centerY: number; left: number }
  | { type: "container"; container: FieldCandidate; top: number; centerY: number; left: number };

/**
 * Check if outer rectangle spatially encloses inner rectangle with optional tolerance.
 */
export function containsRect(outer: PixelRect, inner: PixelRect, tolerance = 6): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * Return copied candidates ordered top-to-bottom then left-to-right, with deterministic debug IDs.
 * Correctly distinguishes table containers from table cells so large outer frames never
 * engulf subsequent rows or distort 2D reading order.
 */
export function sortCandidatesGeometrically(candidates: readonly FieldCandidate[]): FieldCandidate[] {
  if (candidates.length === 0) return [];

  // Deep-copy candidates to ensure input immutability
  const cloned: FieldCandidate[] = candidates.map((c) => ({
    ...c,
    rect: { ...c.rect },
  }));

  // Identify container candidates (candidates that enclose other candidates with significantly smaller area)
  const containers: FieldCandidate[] = [];
  for (const candidate of cloned) {
    const isCont = cloned.some(
      (other) =>
        other !== candidate &&
        candidate.rect.width * candidate.rect.height >= other.rect.width * other.rect.height * 1.3 &&
        containsRect(candidate.rect, other.rect),
    );
    if (isCont) {
      candidate.isContainer = true;
      containers.push(candidate);
    } else {
      candidate.isContainer = false;
    }
  }

  // Build parent-child hierarchy map
  // Each child belongs to its innermost enclosing direct parent container
  const childrenMap = new Map<FieldCandidate | null, FieldCandidate[]>();
  childrenMap.set(null, []); // Root level items
  for (const container of containers) {
    childrenMap.set(container, []);
  }

  for (const item of cloned) {
    const directParent = findDirectParent(item, containers);
    const siblings = childrenMap.get(directParent) ?? [];
    siblings.push(item);
    childrenMap.set(directParent, siblings);
  }

  // Recursively sort items starting from root level
  const sorted: FieldCandidate[] = [];
  sortLevel(null, childrenMap, sorted);

  // Assign deterministic, sequential IDs
  return sorted.map((candidate, index) => ({
    ...candidate,
    candidateId: `candidate_${String(index + 1).padStart(3, "0")}`,
  }));
}

function findDirectParent(child: FieldCandidate, containers: readonly FieldCandidate[]): FieldCandidate | null {
  let directParent: FieldCandidate | null = null;
  let minArea = Infinity;
  const childArea = child.rect.width * child.rect.height;

  for (const container of containers) {
    if (container === child) continue;
    const containerArea = container.rect.width * container.rect.height;
    if (containerArea >= childArea * 1.3 && containsRect(container.rect, child.rect)) {
      if (containerArea < minArea) {
        minArea = containerArea;
        directParent = container;
      }
    }
  }
  return directParent;
}

function sortLevel(
  parent: FieldCandidate | null,
  childrenMap: Map<FieldCandidate | null, FieldCandidate[]>,
  result: FieldCandidate[],
): void {
  const items = childrenMap.get(parent) ?? [];
  if (items.length === 0) return;

  const subContainers = items.filter((item) => item.isContainer);
  const leafItems = items.filter((item) => !item.isContainer);

  // Cluster leaf items into horizontal rows
  const rows = clusterIntoRows(leafItems);

  // Combine rows and subContainers into visual blocks
  const blocks: VisualBlock[] = [];

  for (const row of rows) {
    blocks.push({
      type: "row",
      row,
      top: row.top,
      centerY: row.centerY,
      left: Math.min(...row.candidates.map((c) => c.rect.x)),
    });
  }

  for (const container of subContainers) {
    blocks.push({
      type: "container",
      container,
      top: container.rect.y,
      centerY: container.rect.y + container.rect.height / 2,
      left: container.rect.x,
    });
  }

  // Sort blocks top-to-bottom then left-to-right
  blocks.sort((a, b) => a.top - b.top || a.centerY - b.centerY || a.left - b.left);

  // Traverse sorted blocks
  for (const block of blocks) {
    if (block.type === "row") {
      const sortedRowCandidates = [...block.row.candidates].sort(compareWithinRow);
      result.push(...sortedRowCandidates);
    } else {
      // For a container: output container first, then recursively its children
      result.push(block.container);
      sortLevel(block.container, childrenMap, result);
    }
  }
}

function clusterIntoRows(candidates: readonly FieldCandidate[]): Row[] {
  const pending = [...candidates].sort(compareByVerticalCenter);
  const rows: Row[] = [];

  for (const candidate of pending) {
    const matchingRow = rows.find((existing) => belongsInRow(candidate, existing));
    if (matchingRow) {
      addToRow(matchingRow, candidate);
    } else {
      rows.push(makeRow(candidate));
    }
  }

  return rows;
}

function belongsInRow(candidate: FieldCandidate, row: Row): boolean {
  const candHeight = candidate.rect.height;
  const rowHeight = row.avgHeight;

  // Reject if heights are wildly disparate (e.g. one candidate is 3x taller)
  const heightRatio = Math.max(candHeight, rowHeight) / Math.max(Math.min(candHeight, rowHeight), 1);
  if (heightRatio > 2.8) return false;

  const top = candidate.rect.y;
  const bottom = top + candHeight;
  const overlap = Math.max(0, Math.min(bottom, row.bottom) - Math.max(top, row.top));
  const minHeight = Math.min(candHeight, rowHeight);
  const maxHeight = Math.max(candHeight, rowHeight);
  const overlapMinRatio = overlap / Math.max(minHeight, 1);
  const overlapMaxRatio = overlap / Math.max(maxHeight, 1);

  const centerDistance = Math.abs(top + candHeight / 2 - row.centerY);
  const centerLimit = Math.min(candHeight, rowHeight) * 0.75;

  return (
    (overlapMinRatio >= 0.45 && overlapMaxRatio >= 0.25) ||
    (centerDistance <= centerLimit && overlapMinRatio >= 0.3)
  );
}

function makeRow(candidate: FieldCandidate): Row {
  return {
    candidates: [candidate],
    top: candidate.rect.y,
    bottom: candidate.rect.y + candidate.rect.height,
    centerY: candidate.rect.y + candidate.rect.height / 2,
    avgHeight: candidate.rect.height,
  };
}

function addToRow(row: Row, candidate: FieldCandidate): void {
  row.candidates.push(candidate);
  row.top = Math.min(row.top, candidate.rect.y);
  row.bottom = Math.max(row.bottom, candidate.rect.y + candidate.rect.height);
  row.centerY =
    row.candidates.reduce((sum, item) => sum + item.rect.y + item.rect.height / 2, 0) /
    row.candidates.length;
  row.avgHeight =
    row.candidates.reduce((sum, item) => sum + item.rect.height, 0) /
    row.candidates.length;
}

function compareByVerticalCenter(left: FieldCandidate, right: FieldCandidate): number {
  return (
    left.rect.y + left.rect.height / 2 - (right.rect.y + right.rect.height / 2) ||
    left.rect.x - right.rect.x ||
    left.rect.width - right.rect.width
  );
}

function compareWithinRow(left: FieldCandidate, right: FieldCandidate): number {
  return (
    left.rect.x - right.rect.x ||
    left.rect.y - right.rect.y ||
    left.rect.width - right.rect.width ||
    left.rect.height - right.rect.height
  );
}
