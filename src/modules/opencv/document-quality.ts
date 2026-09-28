import { documentQuadArea, quadPoints, validateDocumentQuad } from './corner-ordering';
import { resolveDocumentConfig, type DocumentDetectionConfig } from './document-config';
import { calculatePerspectiveGeometry } from './perspective-transform';
import type { DocumentQuad, DocumentQuality } from './document-types';
import type { ImageDimensions } from './types';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Pure camera quality gate. Score in [0,1] is heuristic, not probability.
 * Uses rotation-invariant rectangularity so rotated paper is not penalized as
 * though its axis-aligned bounding box were a page. Does not mutate the quad.
 */
export function evaluateDocumentQuality(quad: DocumentQuad, image: ImageDimensions, options: Partial<DocumentDetectionConfig> = {}, edgeSupport?: number): DocumentQuality {
  const c = resolveDocumentConfig(options);
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 2 || image.height < 2) throw new RangeError('Invalid image dimensions.');
  if (edgeSupport !== undefined && (!Number.isFinite(edgeSupport) || edgeSupport < 0 || edgeSupport > 1)) throw new RangeError('edgeSupport must be in [0,1].');
  const quality: DocumentQuality = { accepted: false, confidence: 0, areaRatio: 0, rectangularity: 0, borderMarginRatio: 0, rejectionReasons: [], ...(edgeSupport === undefined ? {} : { edgeSupport }) };
  try { validateDocumentQuad(quad); } catch { quality.rejectionReasons.push('DEGENERATE_QUAD'); return quality; }
  const p = quadPoints(quad);
  const area = documentQuadArea(quad);
  quality.areaRatio = area / (image.width * image.height);
  // Minimum area enclosing rectangle occurs at an edge direction of a convex hull.
  const enclosingArea = Math.min(...p.map((a, i) => {
    const b = p[(i + 1) % 4];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    const xs = p.map(v => v.x * ux + v.y * uy);
    const ys = p.map(v => -v.x * uy + v.y * ux);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }));
  quality.rectangularity = clamp(area / enclosingArea);
  const margin = Math.min(...p.flatMap(v => [v.x / image.width, v.y / image.height, (image.width - 1 - v.x) / image.width, (image.height - 1 - v.y) / image.height]));
  quality.borderMarginRatio = Math.max(0, margin);
  const reasons = quality.rejectionReasons;
  if (quality.areaRatio < c.minDocumentAreaRatio) reasons.push('AREA_TOO_SMALL');
  if (quality.areaRatio > c.maxDocumentAreaRatio) reasons.push('AREA_TOO_LARGE');
  if (margin < 0) reasons.push('QUAD_OUTSIDE_IMAGE');
  if (margin <= c.borderMarginRatio) reasons.push('BORDER_TOO_CLOSE');
  if (quality.rectangularity < c.minRectangularity) reasons.push('LOW_RECTANGULARITY');
  const edges = p.map((a, i) => Math.hypot(a.x - p[(i + 1) % 4].x, a.y - p[(i + 1) % 4].y));
  if (Math.min(...edges) < Math.max(2, Math.min(image.width, image.height) * 0.02)) reasons.push('DEGENERATE_QUAD');
  const ratio = Math.max(edges[0], edges[2]) / Math.max(edges[1], edges[3]);
  const ratioError = c.expectedAspectRatio === undefined ? 0 : Math.abs(ratio / c.expectedAspectRatio - 1);
  if (ratioError > c.aspectRatioTolerance) reasons.push('ASPECT_RATIO_OUT_OF_RANGE');
  try {
    const output = calculatePerspectiveGeometry(quad, c);
    // Check the shortest edges as well: stretching a tiny far edge does not add detail.
    if (output.width < c.minimumOutputWidth || output.height < c.minimumOutputHeight || Math.min(edges[0], edges[2]) < c.minimumOutputWidth || Math.min(edges[1], edges[3]) < c.minimumOutputHeight) reasons.push('OUTPUT_TOO_SMALL');
  } catch { reasons.push('OUTPUT_TOO_SMALL'); }
  const areaScore = clamp(quality.areaRatio / 0.6);
  const marginScore = clamp(margin / Math.max(0.03, c.borderMarginRatio * 2));
  const aspectScore = c.expectedAspectRatio === undefined ? 1 : clamp(1 - ratioError / Math.max(c.aspectRatioTolerance, 1e-6));
  // Convexity is a hard prerequisite. Edge evidence is only weighted if supplied.
  const base = 0.3 * areaScore + 0.35 * quality.rectangularity + 0.2 * marginScore + 0.15 * aspectScore;
  quality.confidence = clamp(edgeSupport === undefined ? base : 0.8 * base + 0.2 * edgeSupport);
  if (edgeSupport !== undefined && edgeSupport < 0.5) reasons.push('WEAK_EDGE_SUPPORT');
  if (quality.confidence < c.minimumConfidence) reasons.push('LOW_CONFIDENCE');
  quality.accepted = reasons.length === 0;
  return quality;
}
