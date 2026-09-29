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
  const widthRatio = rect.width / image.width;
  const heightRatio = rect.height / image.height;
  if (widthRatio < config.minWidthRatio || widthRatio > config.maxWidthRatio || heightRatio < config.minHeightRatio || heightRatio > config.maxHeightRatio) return false;
  if (candidate.areaRatio < config.minAreaRatio || candidate.areaRatio > config.maxAreaRatio) return false;
  if (candidate.aspectRatio < config.minAspectRatio || candidate.aspectRatio > config.maxAspectRatio) return false;
  if (candidate.rectangularity < config.minRectangularity || candidate.rectangularity > 1) return false;
  return !isNearlyWholePage(rect, image);
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
