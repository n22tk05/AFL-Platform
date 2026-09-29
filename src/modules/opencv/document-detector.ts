import { orderDocumentCorners, quadPoints } from './corner-ordering';
import { resolveDocumentConfig, type DocumentDetectionConfig } from './document-config';
import { evaluateDocumentQuality } from './document-quality';
import { DocumentDetectionError, type DetectedDocument, type DocumentCvRuntime, type DocumentMat, type DocumentMatVector, type DocumentQuad } from './document-types';
import type { CvMat, CvRuntime } from './types';

/** Find a trustworthy page quad from an 8-bit gray/RGB/RGBA source. Source remains
 * caller-owned and unchanged; result is JSON only. Reject instead of using the
 * image boundary. All resized/edge/contour Mats and wrappers are freed in finally.
 */
export function detectDocument(cv: CvRuntime, source: CvMat, overrides: Partial<DocumentDetectionConfig> = {}): DetectedDocument {
  const c = resolveDocumentConfig(overrides);
  if (source.cols < 2 || source.rows < 2) throw new RangeError('Source image is empty.');
  const runtime = cv as DocumentCvRuntime;
  const mats: CvMat[] = [];
  const makeMat = () => { const mat = new runtime.Mat(); mats.push(mat); return mat; };
  let contours: DocumentMatVector | undefined;
  try {
    const scale = Math.min(1, c.detectionMaxDimension / Math.max(source.cols, source.rows));
    const width = Math.max(2, Math.round(source.cols * scale));
    const height = Math.max(2, Math.round(source.rows * scale));
    const small = makeMat();
    runtime.resize(source, small, new runtime.Size(width, height), 0, 0, runtime.INTER_AREA);
    const gray = makeMat();
    if (source.channels() === 1) small.copyTo(gray);
    else if (source.channels() === 3 || source.channels() === 4) runtime.cvtColor(small, gray, source.channels() === 4 ? runtime.COLOR_RGBA2GRAY : runtime.COLOR_RGB2GRAY);
    else throw new TypeError('Expected grayscale, RGB or RGBA source.');
    const blurred = makeMat();
    runtime.GaussianBlur(gray, blurred, new runtime.Size(c.blurKernelSize, c.blurKernelSize), 0);
    const edges = makeMat();
    runtime.Canny(blurred, edges, c.cannyLowThreshold, c.cannyHighThreshold);
    const closed = makeMat();
    // Small detection-scale closing only; no source-resolution-specific dilation.
    const kernel = runtime.getStructuringElement(runtime.MORPH_RECT, new runtime.Size(3, 3));
    mats.push(kernel);
    runtime.morphologyEx(edges, closed, runtime.MORPH_CLOSE, kernel);
    const hierarchy = makeMat();
    contours = new runtime.MatVector();
    // LIST includes nested page edges (e.g. paper photographed inside a monitor).
    runtime.findContours(closed, contours, hierarchy, runtime.RETR_LIST, runtime.CHAIN_APPROX_SIMPLE);
    let best: DetectedDocument | undefined;
    const scaleX = source.cols / width, scaleY = source.rows / height;
    for (let i = 0; i < contours.size(); i++) {
      let contour: DocumentMat | undefined;
      let polygon: DocumentMat | undefined;
      try {
        contour = contours.get(i); // Embind wrapper owns a Mat header; delete separately from vector.
        polygon = new runtime.Mat();
        runtime.approxPolyDP(contour, polygon, c.polygonApproximationRatio * runtime.arcLength(contour, true), true);
        if (polygon.rows * polygon.cols !== 4 || !runtime.isContourConvex(polygon)) continue;
        const points = Array.from({ length: 4 }, (_, j) => ({ x: polygon!.data32S[j * 2], y: polygon!.data32S[j * 2 + 1] }));
        let smallQuad: DocumentQuad;
        let sourceQuad: DocumentQuad;
        try {
          smallQuad = orderDocumentCorners(points);
          sourceQuad = orderDocumentCorners(quadPoints(smallQuad).map(p => ({
            // Resize's half-pixel sampling convention; use independent rounded axis scales.
            x: Math.min(source.cols - 1, Math.max(0, (p.x + 0.5) * scaleX - 0.5)),
            y: Math.min(source.rows - 1, Math.max(0, (p.y + 0.5) * scaleY - 0.5)),
          })));
        } catch { continue; }
        const quality = evaluateDocumentQuality(sourceQuad, { width: source.cols, height: source.rows }, c, measureEdgeSupport(edges, smallQuad));
        const candidate = { sourceQuad, quality };
        // Accepted candidates always beat rejected ones; ties use score, area, then
        // contour enumeration order (deterministic for identical pixels/runtime).
        if (!best || Number(quality.accepted) > Number(best.quality.accepted) || (quality.accepted === best.quality.accepted && (quality.confidence > best.quality.confidence || (quality.confidence === best.quality.confidence && quality.areaRatio > best.quality.areaRatio)))) best = candidate;
      } finally { polygon?.delete(); contour?.delete(); }
    }
    if (!best) throw new DocumentDetectionError('DOCUMENT_NOT_FOUND', { accepted: false, confidence: 0, areaRatio: 0, rectangularity: 0, borderMarginRatio: 0, rejectionReasons: ['NO_QUADRILATERAL'] });
    if (!best.quality.accepted) throw new DocumentDetectionError('DOCUMENT_QUALITY_LOW', best.quality, best.sourceQuad);
    return best;
  } finally {
    contours?.delete();
    for (const mat of mats.reverse()) mat.delete();
  }
}

function measureEdgeSupport(edges: DocumentMat, quad: DocumentQuad): number {
  const p = quadPoints(quad);
  // Minimum per-side support prevents one strong border from hiding missing sides.
  return Math.min(...p.map((a, side) => {
    const b = p[(side + 1) % 4];
    let hits = 0;
    for (let i = 0; i < 64; i++) {
      const t = (i + 0.5) / 64;
      const x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
      let found = false;
      for (let dy = -2; dy <= 2 && !found; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < edges.cols && yy < edges.rows && edges.data[yy * edges.cols + xx] > 0) { found = true; break; }
      }
      if (found) hits++;
    }
    return hits / 64;
  }));
}
