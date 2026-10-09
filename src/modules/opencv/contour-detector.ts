import { filterCandidates } from "./box-filter";
import { resolveContourDetectionConfig, type ContourDetectionConfig, type ContourHierarchy, type FieldCandidate, type PixelRect } from "./field-types";
import type { CvMat, CvRuntime } from "./types";

interface CvMatVector { size(): number; get(index: number): CvMat; delete(): void; }
interface HierarchyMat extends CvMat { intPtr(row: number, column: number): ArrayLike<number>; }
interface ContourCvRuntime extends CvRuntime {
  MatVector: new () => CvMatVector;
  RETR_TREE: number;
  CHAIN_APPROX_SIMPLE: number;
  findContours(image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void;
  boundingRect(contour: CvMat): PixelRect;
  contourArea(contour: CvMat): number;
}

/** Extract JSON-only rectangular candidates from a combined line mask. Caller retains combinedMask ownership. */
export function detectContourCandidates(cv: CvRuntime, combinedMask: CvMat, overrides: Partial<ContourDetectionConfig> = {}): FieldCandidate[] {
  const runtime = cv as ContourCvRuntime;
  const config = resolveContourDetectionConfig(overrides);
  let mask: CvMat | undefined;
  let contours: CvMatVector | undefined;
  let hierarchy: HierarchyMat | undefined;
  try {
    mask = new runtime.Mat();
    combinedMask.copyTo(mask);
    contours = new runtime.MatVector();
    hierarchy = new runtime.Mat() as HierarchyMat;
    runtime.findContours(mask, contours, hierarchy, runtime.RETR_TREE, runtime.CHAIN_APPROX_SIMPLE);
    const candidates: FieldCandidate[] = [];
    for (let index = 0; index < contours.size(); index += 1) {
      let contour: CvMat | undefined;
      try {
        contour = contours.get(index);
        const rect = runtime.boundingRect(contour);
        const contourArea = Math.abs(runtime.contourArea(contour));
        const rectangleArea = rect.width * rect.height;
        const relation = readHierarchy(hierarchy, index);
        candidates.push({ candidateId: `contour_${index}`, rect, areaRatio: rectangleArea / (combinedMask.cols * combinedMask.rows), aspectRatio: rect.width / rect.height, contourArea, rectangularity: rectangleArea > 0 ? contourArea / rectangleArea : 0, parentIndex: relation.parent, childIndex: relation.firstChild, source: "closed_contour" });
      } finally { contour?.delete(); }
    }
    return filterCandidates(candidates, { width: combinedMask.cols, height: combinedMask.rows }, config);
  } finally {
    hierarchy?.delete(); contours?.delete(); mask?.delete();
  }
}

function readHierarchy(hierarchy: HierarchyMat, index: number): ContourHierarchy {
  const values = hierarchy.intPtr(0, index);
  return { next: values[0] ?? -1, previous: values[1] ?? -1, firstChild: values[2] ?? -1, parent: values[3] ?? -1 };
}
