import type { CvMat, CvRuntime, CvSize } from './types';

export type Point2D = { x: number; y: number };
export type DocumentQuad = {
  topLeft: Point2D;
  topRight: Point2D;
  bottomRight: Point2D;
  bottomLeft: Point2D;
};
export type DocumentMode = 'clean-scan' | 'camera-photo';
export type DocumentQuality = {
  accepted: boolean;
  /** Heuristic score in [0, 1], NOT a calibrated probability of finding paper. */
  confidence: number;
  areaRatio: number;
  /** Quad area / minimum enclosing rotated rectangle area. */
  rectangularity: number;
  borderMarginRatio: number;
  edgeSupport?: number;
  rejectionReasons: string[];
};
export type DetectedDocument = { sourceQuad: DocumentQuad; quality: DocumentQuality };
export type DeskewResult = DetectedDocument & {
  /** Caller owns this Mat and must delete it. */
  deskewed: CvMat;
  outputWidth: number;
  outputHeight: number;
};

export class DocumentDetectionError extends Error {
  documentDetectionTimeMs = 0;
  perspectiveTransformTimeMs = 0;
  constructor(
    public readonly code: 'DOCUMENT_NOT_FOUND' | 'DOCUMENT_QUALITY_LOW',
    public readonly quality: DocumentQuality,
    public readonly sourceQuad: DocumentQuad | null = null,
  ) {
    super(code === 'DOCUMENT_NOT_FOUND'
      ? 'Không tìm thấy đủ bốn góc tờ giấy. Hãy chụp trọn tờ giấy trên nền tương phản.'
      : 'Vùng tài liệu chưa đạt chất lượng. Hãy chụp gần hơn, đủ bốn góc và chừa khoảng nền quanh giấy.');
    this.name = 'DocumentDetectionError';
  }
}

// Local WASM boundary: typed-array access and MatVector wrappers missing from
// the intentionally small Phase 2 interface. No changes to package declarations.
export interface DocumentMat extends CvMat {
  readonly data: Uint8Array;
  readonly data32S: Int32Array;
}
export interface DocumentMatVector {
  size(): number;
  get(index: number): DocumentMat;
  delete(): void;
}
export interface DocumentCvRuntime extends CvRuntime {
  Mat: new () => DocumentMat;
  MatVector: new () => DocumentMatVector;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  BORDER_REPLICATE: number;
  CV_32FC2: number;
  resize(src: CvMat, dst: CvMat, size: CvSize, fx: number, fy: number, interpolation: number): void;
  Canny(src: CvMat, dst: CvMat, low: number, high: number): void;
  findContours(src: CvMat, contours: DocumentMatVector, hierarchy: CvMat, mode: number, method: number): void;
  arcLength(contour: CvMat, closed: boolean): number;
  approxPolyDP(src: CvMat, dst: CvMat, epsilon: number, closed: boolean): void;
  isContourConvex(contour: CvMat): boolean;
  matFromArray(rows: number, cols: number, type: number, data: number[]): CvMat;
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat;
  warpPerspective(src: CvMat, dst: CvMat, transform: CvMat, size: CvSize, interpolation: number, border: number): void;
}
