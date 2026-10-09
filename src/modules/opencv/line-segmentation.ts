import type { NormalizedBoundingBox } from '@/shared/contracts';
import type { CvMat, CvRuntime, ImageDimensions } from './types';
import { removeDocumentRules } from './remove-rules';

export interface LineSegmentConfig {
  /** Width of the horizontal dilation kernel in pixels (default: 25) */
  kernelWidth: number;
  /** Height of the horizontal dilation kernel in pixels (default: 3) */
  kernelHeight: number;
  /** Vertical padding added to each cropped line in pixels (default: 3) */
  paddingY: number;
  /** Horizontal padding added to each cropped line in pixels (default: 4) */
  paddingX: number;
  /** Minimum line height in pixels to filter noise (default: 6) */
  minHeight: number;
  /** Maximum line height as a fraction of image height (default: 0.25) */
  maxHeightRatio: number;
  /** Minimum line width in pixels to filter specks/dots (default: 12) */
  minWidth: number;
  /** Minimum line bounding box area in pixels (default: 80) */
  minArea: number;
}

export const DEFAULT_LINE_SEGMENT_CONFIG: Readonly<LineSegmentConfig> = Object.freeze({
  kernelWidth: 25,
  kernelHeight: 3,
  paddingY: 3,
  paddingX: 4,
  minHeight: 6,
  maxHeightRatio: 0.25,
  minWidth: 12,
  minArea: 80,
});

export interface SegmentedLine {
  id: string;
  /** Bounding rectangle in pixels after padding and clamping */
  rect: { x: number; y: number; width: number; height: number };
  /** Normalized coordinates [ymin, xmin, ymax, xmax] in [0.0, 1.0] */
  coordinates: NormalizedBoundingBox;
}

export interface LineSegmentationResult {
  lines: SegmentedLine[];
  imageDimensions: ImageDimensions;
  processingTimeMs: number;
}

interface CvMatVector {
  size(): number;
  get(index: number): CvMat;
  delete(): void;
}

interface LineSegmentCvRuntime extends CvRuntime {
  MatVector: new () => CvMatVector;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  THRESH_OTSU?: number;
  threshold?(source: CvMat, destination: CvMat, thresh: number, maxval: number, type: number): number;
  findContours(image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void;
  boundingRect(contour: CvMat): { x: number; y: number; width: number; height: number };
}

/**
 * Line Detection & Segmentation - Method 2
 * Uses horizontal morphological dilation (MORPH_RECT 25x3) on inverted binary image
 * to fuse Vietnamese characters and diacritics into continuous horizontal line masks,
 * followed by contour extraction, noise filtering, and geometric sorting.
 */
export function segmentLines(
  cv: CvRuntime,
  source: CvMat,
  overrides: Partial<LineSegmentConfig> = {},
): LineSegmentationResult {
  const startedAt = performance.now();
  const config = { ...DEFAULT_LINE_SEGMENT_CONFIG, ...overrides };
  const runtime = cv as LineSegmentCvRuntime;

  const width = source.cols;
  const height = source.rows;
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions for line segmentation.');
  }

  let gray: CvMat | undefined;
  let binaryInv: CvMat | undefined;
  let kernel: CvMat | undefined;
  let dilated: CvMat | undefined;
  let contours: CvMatVector | undefined;
  let hierarchy: CvMat | undefined;
  let textMask: CvMat | undefined;

  try {
    // 1. Grayscale conversion
    gray = new runtime.Mat();
    if (source.channels() === 4) {
      runtime.cvtColor(source, gray, runtime.COLOR_RGBA2GRAY);
    } else if (source.channels() === 3) {
      runtime.cvtColor(source, gray, runtime.COLOR_RGB2GRAY);
    } else {
      source.copyTo(gray);
    }

    // 2. Binarization & Inversion (White characters on black background)
    binaryInv = new runtime.Mat();
    if (typeof runtime.adaptiveThreshold === 'function') {
      runtime.adaptiveThreshold(gray, binaryInv, 255, runtime.ADAPTIVE_THRESH_GAUSSIAN_C, runtime.THRESH_BINARY_INV, 51, 8);
    } else if (typeof runtime.threshold === 'function') {
      const otsuFlag = runtime.THRESH_OTSU ?? 8;
      runtime.threshold(gray, binaryInv, 0, 255, runtime.THRESH_BINARY_INV + otsuFlag);
    } else {
      runtime.adaptiveThreshold(
        gray,
        binaryInv,
        255,
        runtime.ADAPTIVE_THRESH_GAUSSIAN_C,
        runtime.THRESH_BINARY_INV,
        15,
        8,
      );
    }

    // 3. Horizontal Morphological Dilation
    // Merges horizontal letters/diacritics into continuous line bands without merging adjacent vertical lines
    textMask = removeDocumentRules(cv, binaryInv);
    kernel = runtime.getStructuringElement(
      runtime.MORPH_RECT,
      new runtime.Size(config.kernelWidth, config.kernelHeight),
    );
    dilated = new runtime.Mat();
    runtime.dilate(textMask, dilated, kernel);

    // 4. Contour extraction
    contours = new runtime.MatVector();
    hierarchy = new runtime.Mat();
    runtime.findContours(
      dilated,
      contours,
      hierarchy,
      runtime.RETR_EXTERNAL ?? 0,
      runtime.CHAIN_APPROX_SIMPLE ?? 2,
    );

    // 5. Extract bounding boxes and filter noise
    const rawBoxes: { x: number; y: number; width: number; height: number }[] = [];
    const contourCount = contours.size();
    const maxHeight = Math.round(height * config.maxHeightRatio);

    for (let i = 0; i < contourCount; i++) {
      let contour: CvMat | undefined;
      try {
        contour = contours.get(i);
        const rect = runtime.boundingRect(contour);
        const area = rect.width * rect.height;

        // Filter specks, dust, scan lines, or overly tall page-spanning blocks
        if (
          rect.height >= config.minHeight &&
          rect.height <= maxHeight &&
          rect.width >= config.minWidth &&
          area >= config.minArea
        ) {
          rawBoxes.push(rect);
        }
      } finally {
        contour?.delete();
      }
    }

    // 6. Geometric Sort (Top-to-Bottom, Left-to-Right)
    const sortedBoxes = sortLineBoxesGeometrically(rawBoxes);

    // 7. Apply safety padding & clamp to image dimensions
    const lines: SegmentedLine[] = sortedBoxes.map((box, index) => {
      const x = Math.max(0, box.x - config.paddingX);
      const y = Math.max(0, box.y - config.paddingY);
      const right = Math.min(width, box.x + box.width + config.paddingX);
      const bottom = Math.min(height, box.y + box.height + config.paddingY);
      const paddedWidth = right - x;
      const paddedHeight = bottom - y;

      const ymin = Math.max(0, Math.min(1, y / height));
      const xmin = Math.max(0, Math.min(1, x / width));
      const ymax = Math.max(0, Math.min(1, bottom / height));
      const xmax = Math.max(0, Math.min(1, right / width));

      return {
        id: `line_${String(index + 1).padStart(3, '0')}`,
        rect: { x, y, width: paddedWidth, height: paddedHeight },
        coordinates: [ymin, xmin, ymax, xmax],
      };
    });

    return {
      lines,
      imageDimensions: { width, height },
      processingTimeMs: performance.now() - startedAt,
    };
  } finally {
    hierarchy?.delete();
    contours?.delete();
    dilated?.delete();
    kernel?.delete();
    binaryInv?.delete();
    textMask?.delete();
    gray?.delete();
  }
}

/**
 * Geometric sort for document line boxes:
 * Groups boxes with overlapping vertical bands into the same line row,
 * then sorts rows from top to bottom, and boxes within rows from left to right.
 */
function sortLineBoxesGeometrically(
  boxes: readonly { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number }[] {
  type LineRow = {
    boxes: { x: number; y: number; width: number; height: number }[];
    top: number;
    bottom: number;
    centerY: number;
  };

  const pending = [...boxes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const rows: LineRow[] = [];

  for (const box of pending) {
    const matchingRow = rows.find(r => {
      const top = box.y;
      const bottom = box.y + box.height;
      const overlap = Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top));
      const minH = Math.min(box.height, r.bottom - r.top);
      return overlap / Math.max(minH, 1) >= 0.4;
    });

    if (matchingRow) {
      matchingRow.boxes.push(box);
      matchingRow.top = Math.min(matchingRow.top, box.y);
      matchingRow.bottom = Math.max(matchingRow.bottom, box.y + box.height);
      matchingRow.centerY =
        matchingRow.boxes.reduce((sum, b) => sum + b.y + b.height / 2, 0) / matchingRow.boxes.length;
    } else {
      rows.push({
        boxes: [box],
        top: box.y,
        bottom: box.y + box.height,
        centerY: box.y + box.height / 2,
      });
    }
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY || a.top - b.top)
    .flatMap(row => row.boxes.sort((a, b) => a.x - b.x || a.y - b.y));
}

/**
 * Helper to crop a line rectangle from an HTML Canvas element
 */
export function cropLineFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = Math.max(1, rect.width);
  lineCanvas.height = Math.max(1, rect.height);
  const ctx = lineCanvas.getContext('2d');
  if (ctx && rect.width > 0 && rect.height > 0) {
    ctx.drawImage(
      sourceCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
  }
  return lineCanvas;
}
