import { resolveContourDetectionConfig, type ContourDetectionConfig, type FieldCandidate, type PixelRect } from "./field-types";

export interface ImageSize { width: number; height: number; }

export function calculateIou(left: PixelRect, right: PixelRect): number {
  if (!isValidRect(left) || !isValidRect(right)) return 0;
  const overlapWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const overlapHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = overlapWidth * overlapHeight;
  return intersection / (left.width * left.height + right.width * right.height - intersection);
}

/** Filter invalid/noisy contours and only suppress near-identical borders, never general containment. */
export function filterCandidates(
  candidates: readonly FieldCandidate[], image: ImageSize, overrides: Partial<ContourDetectionConfig> = {},
): FieldCandidate[] {
  const config = resolveContourDetectionConfig(overrides);
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
    throw new RangeError("Image dimensions must be positive.");
  }
  const eligible = candidates.filter((candidate) => passesGeometry(candidate, image, config)).map(copyCandidate);
  const ordered = [...eligible].sort(comparePreference);
  const retained: FieldCandidate[] = [];
  for (const candidate of ordered) {
    if (!retained.some((existing) => areNearDuplicate(existing, candidate, config))) retained.push(candidate);
  }
  return retained.sort(comparePosition);
}

export function passesGeometry(candidate: FieldCandidate, image: ImageSize, config: ContourDetectionConfig): boolean {
  const { rect } = candidate;
  if (!isValidRect(rect) || ![candidate.areaRatio, candidate.aspectRatio, candidate.contourArea, candidate.rectangularity].every(Number.isFinite)) return false;
  if (isNearlyWholePage(rect, image)) return false;

  const widthRatio = rect.width / image.width;
  const heightRatio = rect.height / image.height;

  // Source-adapted thresholds: allow fine-grained detail for phrase clusters, field rows, and checkboxes
  const isDetail = candidate.source === "phrase_cluster" || candidate.source === "field_row" || candidate.source === "checkbox";
  const minWidthRatio = isDetail ? Math.min(config.minWidthRatio, 0.005) : config.minWidthRatio;
  const minHeightRatio = isDetail ? Math.min(config.minHeightRatio, 0.003) : config.minHeightRatio;
  const minAreaRatio = isDetail ? Math.min(config.minAreaRatio, 0.00002) : config.minAreaRatio;
  const maxAspectRatio = isDetail ? Math.max(config.maxAspectRatio, 100) : config.maxAspectRatio;
  const minRectangularity = isDetail ? Math.min(config.minRectangularity, 0.2) : config.minRectangularity;

  if (widthRatio < minWidthRatio || widthRatio > config.maxWidthRatio) return false;
  if (heightRatio < minHeightRatio || heightRatio > config.maxHeightRatio) return false;
  if (candidate.areaRatio < minAreaRatio || candidate.areaRatio > config.maxAreaRatio) return false;
  if (candidate.aspectRatio < config.minAspectRatio || candidate.aspectRatio > maxAspectRatio) return false;
  if (candidate.rectangularity < minRectangularity || candidate.rectangularity > 1) return false;

  return true;
}

function areNearDuplicate(left: FieldCandidate, right: FieldCandidate, config: ContourDetectionConfig): boolean {
  const iou = calculateIou(left.rect, right.rect);
  if (iou >= config.duplicateIouThreshold && similarBounds(left.rect, right.rect)) return true;
  return isNearSameBorder(left.rect, right.rect);
}

function similarBounds(left: PixelRect, right: PixelRect): boolean {
  return relativeDifference(left.x, right.x, Math.max(left.width, right.width)) <= 0.06
    && relativeDifference(left.y, right.y, Math.max(left.height, right.height)) <= 0.06
    && relativeDifference(left.width, right.width, Math.max(left.width, right.width)) <= 0.1
    && relativeDifference(left.height, right.height, Math.max(left.height, right.height)) <= 0.1;
}

function isNearSameBorder(left: PixelRect, right: PixelRect): boolean {
  const smaller = left.width * left.height <= right.width * right.height ? left : right;
  const larger = smaller === left ? right : left;
  const overlap = calculateIou(smaller, larger);
  const smallerContained = intersectionArea(smaller, larger) / (smaller.width * smaller.height) >= 0.94;
  return overlap >= 0.8 && smallerContained && similarBounds(smaller, larger);
}

function isNearlyWholePage(rect: PixelRect, image: ImageSize): boolean {
  const marginX = image.width * 0.02;
  const marginY = image.height * 0.02;
  return rect.x <= marginX && rect.y <= marginY && rect.width >= image.width * 0.96 && rect.height >= image.height * 0.96;
}

function intersectionArea(left: PixelRect, right: PixelRect): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
}
function isValidRect(rect: PixelRect): boolean { return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0; }
function relativeDifference(left: number, right: number, scale: number): number { return Math.abs(left - right) / Math.max(scale, 1); }
function copyCandidate(candidate: FieldCandidate): FieldCandidate { return { ...candidate, rect: { ...candidate.rect } }; }
function comparePreference(left: FieldCandidate, right: FieldCandidate): number {
  return right.rectangularity - left.rectangularity || right.contourArea - left.contourArea || right.areaRatio - left.areaRatio || comparePosition(left, right);
}
function comparePosition(left: FieldCandidate, right: FieldCandidate): number { return left.rect.y - right.rect.y || left.rect.x - right.rect.x || left.rect.width - right.rect.width || left.rect.height - right.rect.height || left.parentIndex - right.parentIndex || left.childIndex - right.childIndex; }

/**
 * Merge table cells, checkboxes, and field rows into a unified, non-redundant candidate list.
 * Any field row that falls inside a detected table cell is suppressed so the table cell remains the primary field.
 * Standalone field rows (in forms without tables, or in non-table sections) are preserved as input candidates.
 */
export function mergeFormCandidates(
  lineCandidates: readonly FieldCandidate[],
  checkboxCandidates: readonly FieldCandidate[],
  fieldRowCandidates: readonly FieldCandidate[],
  image: ImageSize,
  configOverrides: Partial<ContourDetectionConfig> = {},
): FieldCandidate[] {
  const config = resolveContourDetectionConfig(configOverrides);

  // 1. Filter valid line candidates (tables and boxes)
  const validLineBoxes = filterCandidates(lineCandidates, image, config);

  // 2. Filter valid checkbox candidates
  const validCheckboxes = filterCandidates(checkboxCandidates, image, config);

  // 3. For field rows, only keep those that are NOT already contained inside a table cell
  const standaloneFieldRows: FieldCandidate[] = [];
  for (const row of fieldRowCandidates) {
    if (!passesGeometry(row, image, config)) continue;

    // Check if row is inside any table cell
    const isInsideTableCell = validLineBoxes.some((cell) => {
      const isContained =
        row.rect.x >= cell.rect.x - 4 &&
        row.rect.y >= cell.rect.y - 4 &&
        row.rect.x + row.rect.width <= cell.rect.x + cell.rect.width + 4 &&
        row.rect.y + row.rect.height <= cell.rect.y + cell.rect.height + 4;
      const cellArea = cell.rect.width * cell.rect.height;
      const rowArea = row.rect.width * row.rect.height;
      return !cell.isContainer && isContained && cellArea >= rowArea * 1.15;
    });

    // Check if row heavily overlaps with a checkbox (e.g. checkbox is part of the row or duplicated)
    const overlapsCheckbox = validCheckboxes.some((cb) => {
      const iou = calculateIou(cb.rect, row.rect);
      if (iou > 0.4) return true;
      const overlap = intersectionArea(cb.rect, row.rect);
      const rowArea = row.rect.width * row.rect.height;
      return rowArea > 0 && overlap / rowArea >= 0.65;
    });

    if (!isInsideTableCell && !overlapsCheckbox) {
      standaloneFieldRows.push(row);
    }
  }

  // 4. Combine all candidates and deduplicate
  const combined = [...validLineBoxes, ...validCheckboxes, ...standaloneFieldRows];
  return filterCandidates(combined, image, config);
}
