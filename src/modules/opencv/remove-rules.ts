import type { CvMat, CvRuntime } from './types';

interface PixelMat extends CvMat { data: Uint8Array }
interface RuleRuntime extends CvRuntime {
  MORPH_OPEN?: number;
  MatVector: new () => { size(): number; get(index: number): CvMat; delete(): void };
  findContours(src: CvMat, contours: unknown, hierarchy: CvMat, mode: number, method: number): void;
  boundingRect(contour: CvMat): { x: number; y: number; width: number; height: number };
}

/** Return a caller-owned copy with only long, thin rules removed. Preserve input. */
export function removeDocumentRules(cv: CvRuntime, binary: CvMat): CvMat {
  const runtime = cv as RuleRuntime;
  // Embind's clone() in the installed OpenCV 5 build clones the JS handle.
  // copyTo(new Mat) is the explicit deep pixel copy needed before mutation.
  const clean = new runtime.Mat() as PixelMat;
  try {
    binary.copyTo(clean);
    if (!(clean.data instanceof Uint8Array)) return clean;
    for (const horizontal of [true, false]) {
      let kernel: CvMat | undefined, opened: PixelMat | undefined, hierarchy: CvMat | undefined;
      let contours: InstanceType<RuleRuntime['MatVector']> | undefined;
      try {
        kernel = runtime.getStructuringElement(runtime.MORPH_RECT, new runtime.Size(
          horizontal ? Math.max(40, Math.floor(binary.cols / 20)) : 1,
          horizontal ? 1 : Math.max(40, Math.floor(binary.rows / 25)),
        ));
        opened = new runtime.Mat() as PixelMat;
        runtime.morphologyEx(binary, opened, runtime.MORPH_OPEN ?? 2, kernel);
        hierarchy = new runtime.Mat(); contours = new runtime.MatVector();
        runtime.findContours(opened, contours, hierarchy, 0, 2);
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          try {
            const box = runtime.boundingRect(contour);
            const length = horizontal ? box.width : box.height, thickness = horizontal ? box.height : box.width;
            if (thickness > 6 || length / Math.max(1, thickness) < 15) continue;
            for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
              const offset = y * binary.cols + x;
              if (opened.data[offset]) clean.data[offset] = 0;
            }
          } finally { contour.delete(); }
        }
      } finally { contours?.delete(); hierarchy?.delete(); opened?.delete(); kernel?.delete(); }
    }
    return clean;
  } catch (error) { clean.delete(); throw error; }
}
