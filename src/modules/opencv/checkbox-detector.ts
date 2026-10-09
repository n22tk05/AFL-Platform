import type { FieldCandidate, PixelRect } from "./field-types";
import type { CvMat, CvRuntime } from "./types";

export interface CheckboxDetectionConfig {
  /** Minimum pixel width/height for a checkbox (default 12px) */
  minDimension: number;
  /** Maximum pixel width/height for a checkbox (default 80px) */
  maxDimension: number;
  /** Minimum aspect ratio width/height (default 0.75) */
  minAspectRatio: number;
  /** Maximum aspect ratio width/height (default 1.33) */
  maxAspectRatio: number;
  /** Minimum enclosed contour area relative to bounding box (default 0.60) */
  minRectangularity: number;
  /** Epsilon factor for approxPolyDP polygon simplification (default 0.04) */
  approxPolygonEpsilonRatio: number;
}

export const DEFAULT_CHECKBOX_DETECTION_CONFIG: Readonly<CheckboxDetectionConfig> = Object.freeze({
  minDimension: 12,
  maxDimension: 80,
  minAspectRatio: 0.75,
  maxAspectRatio: 1.33,
  minRectangularity: 0.60,
  approxPolygonEpsilonRatio: 0.04,
});

export function resolveCheckboxDetectionConfig(
  overrides: Partial<CheckboxDetectionConfig> = {},
): CheckboxDetectionConfig {
  return { ...DEFAULT_CHECKBOX_DETECTION_CONFIG, ...overrides };
}

interface CvMatVector {
  size(): number;
  get(index: number): CvMat;
  delete(): void;
}

interface HierarchyMat extends CvMat {
  intPtr(row: number, column: number): ArrayLike<number>;
}

interface CheckboxCvRuntime extends CvRuntime {
  MatVector: new () => CvMatVector;
  RETR_TREE: number;
  CHAIN_APPROX_SIMPLE: number;
  findContours(image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void;
  boundingRect(contour: CvMat): PixelRect;
  contourArea(contour: CvMat): number;
  arcLength(contour: CvMat, closed: boolean): number;
  approxPolyDP(curve: CvMat, approxCurve: CvMat, epsilon: number, closed: boolean): void;
  isContourConvex(contour: CvMat): boolean;
  rectangle(img: CvMat, pt1: { x: number; y: number }, pt2: { x: number; y: number }, color: unknown, thickness?: number): void;
  Scalar: new (...args: number[]) => unknown;
}

/**
 * Detect small rectangular checkboxes directly from a binary image before long morphological line filtering.
 * Uses contour geometry, 4-vertex polygonal approximation, convexity, and inner-hole suppression.
 * `binary` remains owned by caller and is not mutated.
 */
export function detectCheckboxCandidates(
  cv: CvRuntime,
  binary: CvMat,
  overrides: Partial<CheckboxDetectionConfig> = {},
): FieldCandidate[] {
  const runtime = cv as CheckboxCvRuntime;
  const config = resolveCheckboxDetectionConfig(overrides);

  let working: CvMat | undefined;
  let contours: CvMatVector | undefined;
  let hierarchy: HierarchyMat | undefined;

  try {
    working = new runtime.Mat();
    binary.copyTo(working);
    contours = new runtime.MatVector();
    hierarchy = new runtime.Mat() as HierarchyMat;

    runtime.findContours(working, contours, hierarchy, runtime.RETR_TREE, runtime.CHAIN_APPROX_SIMPLE);
    const rawCandidates: FieldCandidate[] = [];
    const count = contours.size();
    const imageArea = Math.max(binary.cols * binary.rows, 1);

    for (let index = 0; index < count; index += 1) {
      let contour: CvMat | undefined;
      let polygon: CvMat | undefined;
      try {
        contour = contours.get(index);
        const rect = runtime.boundingRect(contour);

        // 1. Dimensions check
        if (
          rect.width < config.minDimension ||
          rect.width > config.maxDimension ||
          rect.height < config.minDimension ||
          rect.height > config.maxDimension
        ) {
          continue;
        }

        // 2. Aspect ratio check (near-square)
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio < config.minAspectRatio || aspectRatio > config.maxAspectRatio) {
          continue;
        }

        // 3. Rectangularity check
        const contourArea = Math.abs(runtime.contourArea(contour));
        const rectArea = rect.width * rect.height;
        const rectangularity = rectArea > 0 ? contourArea / rectArea : 0;
        if (rectangularity < config.minRectangularity) {
          continue;
        }

        // 4. Polygon approximation (must have 4-5 vertices and be convex)
        polygon = new runtime.Mat();
        const perimeter = runtime.arcLength(contour, true);
        runtime.approxPolyDP(contour, polygon, config.approxPolygonEpsilonRatio * perimeter, true);
        const vertexCount = (polygon.rows ?? 0) * (polygon.cols ?? 0);
        if (vertexCount < 4 || vertexCount > 5 || !runtime.isContourConvex(polygon)) {
          continue;
        }

        const relation = readHierarchy(hierarchy, index);
        rawCandidates.push({
          candidateId: `checkbox_${index}`,
          rect,
          areaRatio: rectArea / imageArea,
          aspectRatio,
          contourArea,
          rectangularity,
          parentIndex: relation.parent,
          childIndex: relation.firstChild,
          source: "checkbox",
          isContainer: false,
        });
      } finally {
        polygon?.delete();
        contour?.delete();
      }
    }

    // Suppress inner stroke holes: sort by area descending, keep outer boxes
    const ordered = [...rawCandidates].sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    const retained: FieldCandidate[] = [];

    for (const candidate of ordered) {
      const isInnerHole = retained.some((existing) => isEnclosedInnerBox(candidate.rect, existing.rect));
      if (!isInnerHole) {
        retained.push(candidate);
      }
    }

    return retained;
  } finally {
    hierarchy?.delete();
    contours?.delete();
    working?.delete();
  }
}

/**
 * Stamp detected checkbox outlines into a target mask (e.g. lines.combined)
 * so that checkboxes appear visibly on downstream debug canvases.
 */
export function stampCheckboxesOnMask(
  cv: CvRuntime,
  mask: CvMat,
  checkboxes: readonly FieldCandidate[],
): void {
  const runtime = cv as CheckboxCvRuntime;
  const white = new runtime.Scalar(255, 255, 255, 255);
  for (const cb of checkboxes) {
    const pt1 = { x: cb.rect.x, y: cb.rect.y };
    const pt2 = { x: cb.rect.x + cb.rect.width, y: cb.rect.y + cb.rect.height };
    runtime.rectangle(mask, pt1, pt2, white, 2);
  }
}

function readHierarchy(hierarchy: HierarchyMat, index: number): { firstChild: number; parent: number } {
  try {
    const values = hierarchy.intPtr(0, index);
    return { firstChild: values[2] ?? -1, parent: values[3] ?? -1 };
  } catch {
    return { firstChild: -1, parent: -1 };
  }
}

function isEnclosedInnerBox(inner: PixelRect, outer: PixelRect): boolean {
  // If inner is completely contained within outer and has significant overlap
  const contained =
    inner.x >= outer.x - 2 &&
    inner.y >= outer.y - 2 &&
    inner.x + inner.width <= outer.x + outer.width + 2 &&
    inner.y + inner.height <= outer.y + outer.height + 2;

  if (!contained) return false;
  const innerArea = inner.width * inner.height;
  const outerArea = outer.width * outer.height;
  return innerArea <= outerArea * 0.95;
}
