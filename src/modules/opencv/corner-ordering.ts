import type { DocumentQuad, Point2D } from './document-types';

const cross = (a: Point2D, b: Point2D, c: Point2D) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Order an unordered set of four points using its convex hull; never mutate input.
 * Clockwise in image coordinates. TL is the hull vertex nearest the upper-left
 * direction (min x+y, then y/x to break ties). This cannot infer text orientation.
 */
export function orderDocumentCorners(points: readonly Point2D[]): DocumentQuad {
  if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new RangeError('Four finite corners are required.');
  const sorted = points.map(p => ({ ...p })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.some((p, i) => i > 0 && Math.hypot(p.x - sorted[i - 1].x, p.y - sorted[i - 1].y) < 1e-6)) throw new RangeError('Duplicate corners.');
  const half = (list: Point2D[]) => {
    const hull: Point2D[] = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 1e-8) hull.pop();
      hull.push(p);
    }
    return hull.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  if (hull.length !== 4) throw new RangeError('Degenerate or non-convex quadrilateral.');
  let start = 0;
  for (let i = 1; i < 4; i++) {
    const a = hull[i], b = hull[start];
    if (a.x + a.y < b.x + b.y || (a.x + a.y === b.x + b.y && a.y < b.y)) start = i;
  }
  const ordered = Array.from({ length: 4 }, (_, i) => hull[(start + i) % 4]);
  const quad = { topLeft: ordered[0], topRight: ordered[1], bottomRight: ordered[2], bottomLeft: ordered[3] };
  validateDocumentQuad(quad);
  return quad;
}

/** Return corners in TL/TR/BR/BL order; references are read-only by convention. */
export function quadPoints(quad: DocumentQuad): Point2D[] {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
}

/** Validate named corner order, convex winding and non-crossing edges before warp. */
export function validateDocumentQuad(quad: DocumentQuad): void {
  const points = quadPoints(quad);
  if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new RangeError('Non-finite quad.');
  const extent = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  const epsilon = Math.max(1e-8, extent * extent * 1e-8);
  // Strict same-sign turns imply a simple convex quad; crossed and collinear quads fail.
  for (let i = 0; i < 4; i++) {
    if (cross(points[i], points[(i + 1) % 4], points[(i + 2) % 4]) <= epsilon) throw new RangeError('Degenerate, crossed or incorrectly wound quad.');
  }
}

/** Shoelace area; callers validate ordering before using it. */
export function documentQuadArea(quad: DocumentQuad): number {
  const p = quadPoints(quad);
  return Math.abs(p.reduce((sum, a, i) => sum + a.x * p[(i + 1) % 4].y - a.y * p[(i + 1) % 4].x, 0)) / 2;
}
