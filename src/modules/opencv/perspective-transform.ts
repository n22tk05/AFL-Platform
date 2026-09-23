import { quadPoints, validateDocumentQuad } from './corner-ordering';
import { resolveDocumentConfig, type DocumentDetectionConfig } from './document-config';
import type { DocumentCvRuntime, DocumentQuad } from './document-types';
import type { CvMat, CvRuntime } from './types';

/** Pure geometry: maximum opposite edge lengths, optionally constrained to a known ratio.
 * Safety caps only downscale; they never enlarge the image to pass a quality gate.
 */
export function calculatePerspectiveGeometry(quad: DocumentQuad, options: Partial<DocumentDetectionConfig> = {}): { width: number; height: number } {
  validateDocumentQuad(quad);
  const c = resolveDocumentConfig(options);
  const p = quadPoints(quad);
  const edges = p.map((a, i) => Math.hypot(a.x - p[(i + 1) % 4].x, a.y - p[(i + 1) % 4].y));
  let width = Math.max(edges[0], edges[2]);
  let height = Math.max(edges[1], edges[3]);
  if (!Number.isFinite(width * height) || Math.min(...edges) < 2) throw new RangeError('Quad edges are too short or non-finite.');
  if (c.expectedAspectRatio !== undefined) {
    // Fit inside native edge dimensions, avoiding artificial upscaling.
    width = Math.min(width, height * c.expectedAspectRatio);
    height = width / c.expectedAspectRatio;
  }
  const scale = Math.min(1, c.maximumOutputDimension / Math.max(width, height), Math.sqrt(c.maximumOutputPixels / (width * height)));
  width = Math.floor(width * scale + 1e-9);
  height = Math.floor(height * scale + 1e-9);
  if (width < 2 || height < 2) throw new RangeError('Perspective output must have at least two pixels on each axis.');
  return { width, height };
}

/** Warp caller-owned source into a new Mat. Caller must delete deskewed; all
 * point/transform Mats are freed on both success and failure. Source is unchanged.
 */
export function warpDocument(cv: CvRuntime, source: CvMat, quad: DocumentQuad, options: Partial<DocumentDetectionConfig> = {}): { deskewed: CvMat; width: number; height: number } {
  const { width, height } = calculatePerspectiveGeometry(quad, options);
  const points = quadPoints(quad);
  if (points.some(p => p.x < 0 || p.y < 0 || p.x > source.cols - 1 || p.y > source.rows - 1)) throw new RangeError('Quad is outside the source image.');
  const runtime = cv as DocumentCvRuntime;
  let sourcePoints: CvMat | undefined;
  let destinationPoints: CvMat | undefined;
  let transform: CvMat | undefined;
  let output: CvMat | undefined;
  try {
    sourcePoints = runtime.matFromArray(4, 1, runtime.CV_32FC2, points.flatMap(p => [p.x, p.y]));
    destinationPoints = runtime.matFromArray(4, 1, runtime.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
    transform = runtime.getPerspectiveTransform(sourcePoints, destinationPoints);
    output = new runtime.Mat();
    runtime.warpPerspective(source, output, transform, new runtime.Size(width, height), runtime.INTER_LINEAR, runtime.BORDER_REPLICATE);
    const deskewed = output;
    output = undefined;
    return { deskewed, width, height };
  } finally {
    output?.delete();
    transform?.delete();
    destinationPoints?.delete();
    sourcePoints?.delete();
  }
}
