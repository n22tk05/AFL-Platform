import {
  type LineDetectionConfig,
  type PreprocessConfig,
} from "./config";
import { detectLines, type LineDetectionResult } from "./line-detector";
import { detectContourCandidates } from "./contour-detector";
import { filterCandidates, mergeFormCandidates } from "./box-filter";
import {
  detectCheckboxCandidates,
  stampCheckboxesOnMask,
  type CheckboxDetectionConfig,
} from "./checkbox-detector";
import {
  detectFieldRowCandidates,
  type FieldRowDetectionConfig,
} from "./row-detector";
import { sortCandidatesGeometrically } from "./geometric-sort";
import { loadOpenCv } from "./loader";
import { preprocessToBinary } from "./preprocess";
import type { CvMat, CvRuntime } from "./types";
import type { ContourDetectionConfig, FieldCandidate } from "./field-types";
import { detectDocument } from './document-detector';
import { warpDocument } from './perspective-transform';
import { quadPoints } from './corner-ordering';
import { DocumentDetectionError, type DocumentMode, type DocumentQuad, type DocumentQuality } from './document-types';
import type { DocumentDetectionConfig } from './document-config';

interface CanvasCvRuntime extends CvRuntime {
  imread(canvas: HTMLCanvasElement): CvMat;
  imshow(canvas: HTMLCanvasElement, image: CvMat): void;
}

export interface DebugPipelineOptions {
  mode: DocumentMode;
  inputCanvas: HTMLCanvasElement;
  grayscaleCanvas: HTMLCanvasElement;
  binaryCanvas: HTMLCanvasElement;
  horizontalCanvas: HTMLCanvasElement;
  verticalCanvas: HTMLCanvasElement;
  combinedCanvas: HTMLCanvasElement;
  candidateOverlayCanvas: HTMLCanvasElement;
  documentOutlineCanvas: HTMLCanvasElement;
  deskewedCanvas: HTMLCanvasElement;
  documentConfig?: Partial<DocumentDetectionConfig>;
  preprocessConfig?: Partial<PreprocessConfig>;
  lineConfig?: Partial<LineDetectionConfig>;
  contourConfig?: Partial<ContourDetectionConfig>;
  checkboxConfig?: Partial<CheckboxDetectionConfig>;
  rowConfig?: Partial<FieldRowDetectionConfig>;
  /** Invoked immediately after the shared OpenCV runtime is ready. */
  onOpenCvReady?: () => void;
}

export interface DebugPipelineResult {
  mode: DocumentMode;
  sourceWidth: number;
  sourceHeight: number;
  detectedQuad: DocumentQuad | null;
  /** Null in explicit clean-scan mode: document detection/quality was bypassed. */
  quality: DocumentQuality | null;
  documentDetectionTimeMs: number;
  perspectiveTransformTimeMs: number;
  /** Processing-page dimensions; all masks and candidate rectangles use this frame. */
  width: number;
  height: number;
  /** Includes runtime loading and rendering; individual stages are also reported. */
  totalProcessingTimeMs: number;
  openCvLoadTimeMs: number;
  grayscaleTimeMs: number;
  binaryTimeMs: number;
  lineDetectionTimeMs: number;
  contourDetectionTimeMs: number;
  candidates: FieldCandidate[];
}

/**
 * Run the document/line/candidate debug pipeline and draw its intermediate results.
 * Camera mode must pass document detection and quality before any field processing.
 * Clean-scan mode explicitly bypasses detection; its quality and detectedQuad are null.
 * Input is read once from `inputCanvas`; output canvases receive grayscale, binary,
 * horizontal, vertical, combined masks, and a Canvas 2D candidate overlay. No Mat escapes this function: all Mats,
 * including source and algorithm outputs, are deleted before the promise resolves.
 * Configuration defaults are starting points and should be tuned using real forms.
 */
export async function runLineDetectionDebug(
  options: DebugPipelineOptions,
): Promise<DebugPipelineResult> {
  validateCanvases(options);

  const startedAt = performance.now();
  const cvLoadStartedAt = performance.now();
  // The loader package has broader declarations than the core boundary. This narrow
  // adapter documents exactly the browser-only methods this coordinator uses.
  const cv = (await loadOpenCv()) as unknown as CanvasCvRuntime;
  const openCvLoadTimeMs = elapsedSince(cvLoadStartedAt);
  options.onOpenCvReady?.();

  let source: CvMat | undefined;
  let deskewed: CvMat | undefined;
  let grayscale: CvMat | undefined;
  let binary: CvMat | undefined;
  let lines: LineDetectionResult | undefined;

  try {
    source = cv.imread(options.inputCanvas);
    if (source.cols <= 0 || source.rows <= 0) {
      throw new Error("OpenCV could not read a non-empty image from inputCanvas.");
    }

    let detectedQuad: DocumentQuad | null = null;
    let quality: DocumentQuality | null = null;
    let documentDetectionTimeMs = 0;
    let perspectiveTransformTimeMs = 0;
    if (options.mode === 'camera-photo') {
      const started = performance.now();
      try {
        const detected = detectDocument(cv, source, options.documentConfig);
        detectedQuad = detected.sourceQuad;
        quality = detected.quality;
      } catch (error) {
        if (error instanceof DocumentDetectionError) {
          error.documentDetectionTimeMs = elapsedSince(started);
          drawDocumentOutline(options.inputCanvas, options.documentOutlineCanvas, error.sourceQuad, false);
        }
        throw error; // Never fall back to full-frame processing in camera mode.
      }
      documentDetectionTimeMs = elapsedSince(started);
      drawDocumentOutline(options.inputCanvas, options.documentOutlineCanvas, detectedQuad, true);
      const warpStarted = performance.now();
      deskewed = warpDocument(cv, source, detectedQuad, options.documentConfig).deskewed;
      perspectiveTransformTimeMs = elapsedSince(warpStarted);
    } else {
      drawDocumentOutline(options.inputCanvas, options.documentOutlineCanvas, null, true);
    }
    const page = deskewed ?? source;
    cv.imshow(options.deskewedCanvas, page);

    const grayscaleStartedAt = performance.now();
    grayscale = new cv.Mat();
    cv.cvtColor(page, grayscale, cv.COLOR_RGBA2GRAY);
    cv.imshow(options.grayscaleCanvas, grayscale);
    const grayscaleTimeMs = elapsedSince(grayscaleStartedAt);

    const binaryStartedAt = performance.now();
    binary = preprocessToBinary(cv, page, options.preprocessConfig);
    cv.imshow(options.binaryCanvas, binary);
    const binaryTimeMs = elapsedSince(binaryStartedAt);

    const lineDetectionStartedAt = performance.now();
    // 1. Detect small checkboxes directly from binary before line erosion
    const checkboxCandidates = detectCheckboxCandidates(cv, binary, options.checkboxConfig);

    // 2. Extract long horizontal and vertical lines
    lines = detectLines(cv, binary, options.lineConfig);

    // 3. Stamp detected checkboxes onto lines.combined so they are visible on combinedCanvas
    if (checkboxCandidates.length > 0) {
      stampCheckboxesOnMask(cv, lines.combined, checkboxCandidates);
    }

    cv.imshow(options.horizontalCanvas, lines.horizontal);
    cv.imshow(options.verticalCanvas, lines.vertical);
    cv.imshow(options.combinedCanvas, lines.combined);
    const lineDetectionTimeMs = elapsedSince(lineDetectionStartedAt);

    const contourDetectionStartedAt = performance.now();
    // 4. Detect table cells & closed form boxes from line mask
    const lineCandidates = detectContourCandidates(cv, lines.combined, options.contourConfig);

    // 5. Detect form field rows, prompts, and fill-in lines from binary
    const fieldRowCandidates = detectFieldRowCandidates(cv, binary, options.rowConfig);

    // 6. Merge table cells, checkboxes, and standalone field rows
    const mergedCandidates = mergeFormCandidates(
      lineCandidates,
      checkboxCandidates,
      fieldRowCandidates,
      { width: page.cols, height: page.rows },
      options.contourConfig,
    );
    const candidates = sortCandidatesGeometrically(mergedCandidates);
    drawCandidateOverlay(options.deskewedCanvas, options.candidateOverlayCanvas, candidates);
    const contourDetectionTimeMs = elapsedSince(contourDetectionStartedAt);

    return {
      mode: options.mode,
      sourceWidth: source.cols,
      sourceHeight: source.rows,
      detectedQuad,
      quality,
      documentDetectionTimeMs,
      perspectiveTransformTimeMs,
      width: page.cols,
      height: page.rows,
      totalProcessingTimeMs: elapsedSince(startedAt),
      openCvLoadTimeMs,
      grayscaleTimeMs,
      binaryTimeMs,
      lineDetectionTimeMs,
      contourDetectionTimeMs,
      candidates,
    };
  } finally {
    lines?.horizontal.delete();
    lines?.vertical.delete();
    lines?.combined.delete();
    binary?.delete();
    grayscale?.delete();
    deskewed?.delete();
    source?.delete();
  }
}

function validateCanvases(options: DebugPipelineOptions): void {
  if (options.mode !== 'clean-scan' && options.mode !== 'camera-photo') throw new TypeError('An explicit document mode is required.');
  const canvases = [
    options.inputCanvas,
    options.grayscaleCanvas,
    options.binaryCanvas,
    options.horizontalCanvas,
    options.verticalCanvas,
    options.combinedCanvas,
    options.candidateOverlayCanvas,
    options.documentOutlineCanvas,
    options.deskewedCanvas,
  ];

  if (typeof HTMLCanvasElement === 'undefined' || canvases.some((canvas) => !(canvas instanceof HTMLCanvasElement)) || new Set(canvases).size !== canvases.length) {
    throw new TypeError("runLineDetectionDebug requires nine distinct browser canvases.");
  }
  if (options.inputCanvas.width <= 0 || options.inputCanvas.height <= 0) {
    throw new Error("inputCanvas dimensions must be greater than zero.");
  }
}

function drawDocumentOutline(source: HTMLCanvasElement, output: HTMLCanvasElement, quad: DocumentQuad | null, accepted: boolean): void {
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Document outline requires a 2D canvas.');
  context.drawImage(source, 0, 0);
  if (!quad) return;
  const points = quadPoints(quad);
  context.strokeStyle = accepted ? '#00a65a' : '#ef4444';
  context.fillStyle = context.strokeStyle;
  context.lineWidth = Math.max(2, source.width / 400);
  context.beginPath();
  points.forEach((p, i) => i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y));
  context.closePath();
  context.stroke();
  context.font = `${Math.max(12, source.width / 70)}px sans-serif`;
  points.forEach((p, i) => {
    context.beginPath();
    context.arc(p.x, p.y, Math.max(4, source.width / 200), 0, Math.PI * 2);
    context.fill();
    context.fillText(['TL', 'TR', 'BR', 'BL'][i], p.x + 8, Math.max(16, p.y - 8));
  });
}

function drawCandidateOverlay(source: HTMLCanvasElement, overlay: HTMLCanvasElement, candidates: readonly FieldCandidate[]): void {
  overlay.width = source.width;
  overlay.height = source.height;
  const context = overlay.getContext("2d");
  if (!context) throw new Error("candidateOverlayCanvas does not provide a 2D context.");
  context.drawImage(source, 0, 0);
  const baseLineWidth = Math.max(1, Math.round(Math.min(source.width, source.height) / 700));
  context.font = `${Math.max(10, Math.round(Math.min(source.width, source.height) / 75))}px sans-serif`;

  candidates.forEach((candidate, index) => {
    const { x, y, width, height } = candidate.rect;
    if (candidate.isContainer) {
      context.save();
      context.strokeStyle = "#2563eb"; // Blue for container
      context.fillStyle = "#2563eb";
      context.lineWidth = baseLineWidth + 1;
      context.setLineDash([6, 4]);
      context.strokeRect(x, y, width, height);
      if (index < 75) context.fillText(`${candidate.candidateId} [Khung]`, x + 3, Math.max(12, y - 3));
      context.restore();
    } else if (candidate.source === "checkbox") {
      context.save();
      context.strokeStyle = "#10b981"; // Green for checkbox
      context.fillStyle = "#10b981";
      context.lineWidth = baseLineWidth;
      context.strokeRect(x, y, width, height);
      if (index < 75) context.fillText(candidate.candidateId, x + 3, Math.max(12, y - 3));
      context.restore();
    } else if (candidate.source === "field_row") {
      context.save();
      context.strokeStyle = "#f59e0b"; // Amber for field row / fill-in line
      context.fillStyle = "#f59e0b";
      context.lineWidth = baseLineWidth;
      context.strokeRect(x, y, width, height);
      if (index < 75) context.fillText(candidate.candidateId, x + 3, Math.max(12, y - 3));
      context.restore();
    } else if (candidate.source === "phrase_cluster") {
      context.save();
      context.strokeStyle = "#8b5cf6"; // Purple for fine phrase cluster
      context.fillStyle = "#8b5cf6";
      context.lineWidth = baseLineWidth;
      context.strokeRect(x, y, width, height);
      if (index < 75) context.fillText(candidate.candidateId, x + 3, Math.max(12, y - 3));
      context.restore();
    } else {
      context.save();
      context.strokeStyle = "#ef4444"; // Red for regular table cell
      context.fillStyle = "#ef4444";
      context.lineWidth = baseLineWidth;
      context.strokeRect(x, y, width, height);
      if (index < 75) context.fillText(candidate.candidateId, x + 3, Math.max(12, y - 3));
      context.restore();
    }
  });
}

function elapsedSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
