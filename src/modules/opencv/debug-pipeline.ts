import {
  type LineDetectionConfig,
  type PreprocessConfig,
} from "./config";
import { detectLines, type LineDetectionResult } from "./line-detector";
import { detectContourCandidates } from "./contour-detector";
import { sortCandidatesGeometrically } from "./geometric-sort";
import { loadOpenCv } from "./loader";
import { preprocessToBinary } from "./preprocess";
import type { CvMat, CvRuntime } from "./types";
import type { ContourDetectionConfig, FieldCandidate } from "./field-types";

interface CanvasCvRuntime extends CvRuntime {
  imread(canvas: HTMLCanvasElement): CvMat;
  imshow(canvas: HTMLCanvasElement, image: CvMat): void;
}

export interface DebugPipelineOptions {
  inputCanvas: HTMLCanvasElement;
  grayscaleCanvas: HTMLCanvasElement;
  binaryCanvas: HTMLCanvasElement;
  horizontalCanvas: HTMLCanvasElement;
  verticalCanvas: HTMLCanvasElement;
  combinedCanvas: HTMLCanvasElement;
  candidateOverlayCanvas: HTMLCanvasElement;
  preprocessConfig?: Partial<PreprocessConfig>;
  lineConfig?: Partial<LineDetectionConfig>;
  contourConfig?: Partial<ContourDetectionConfig>;
  /** Invoked immediately after the shared OpenCV runtime is ready. */
  onOpenCvReady?: () => void;
}

export interface DebugPipelineResult {
  width: number;
  height: number;
  totalProcessingTimeMs: number;
  openCvLoadTimeMs: number;
  grayscaleTimeMs: number;
  binaryTimeMs: number;
  lineDetectionTimeMs: number;
  contourDetectionTimeMs: number;
  candidates: FieldCandidate[];
}

/**
 * Run the Phase 1/2 image-debug pipeline and draw its intermediate results.
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
  let grayscale: CvMat | undefined;
  let binary: CvMat | undefined;
  let lines: LineDetectionResult | undefined;

  try {
    source = cv.imread(options.inputCanvas);
    if (source.cols <= 0 || source.rows <= 0) {
      throw new Error("OpenCV could not read a non-empty image from inputCanvas.");
    }

    const grayscaleStartedAt = performance.now();
    grayscale = new cv.Mat();
    cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
    cv.imshow(options.grayscaleCanvas, grayscale);
    const grayscaleTimeMs = elapsedSince(grayscaleStartedAt);

    const binaryStartedAt = performance.now();
    binary = preprocessToBinary(cv, source, options.preprocessConfig);
    cv.imshow(options.binaryCanvas, binary);
    const binaryTimeMs = elapsedSince(binaryStartedAt);

    const lineDetectionStartedAt = performance.now();
    lines = detectLines(cv, binary, options.lineConfig);
    cv.imshow(options.horizontalCanvas, lines.horizontal);
    cv.imshow(options.verticalCanvas, lines.vertical);
    cv.imshow(options.combinedCanvas, lines.combined);
    const lineDetectionTimeMs = elapsedSince(lineDetectionStartedAt);
    const contourDetectionStartedAt = performance.now();
    const candidates = sortCandidatesGeometrically(detectContourCandidates(cv, lines.combined, options.contourConfig));
    drawCandidateOverlay(options.inputCanvas, options.candidateOverlayCanvas, candidates);
    const contourDetectionTimeMs = elapsedSince(contourDetectionStartedAt);

    return {
      width: source.cols,
      height: source.rows,
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
    source?.delete();
  }
}

function validateCanvases(options: DebugPipelineOptions): void {
  const canvases = [
    options.inputCanvas,
    options.grayscaleCanvas,
    options.binaryCanvas,
    options.horizontalCanvas,
    options.verticalCanvas,
    options.combinedCanvas,
    options.candidateOverlayCanvas,
  ];

  if (canvases.some((canvas) => !(canvas instanceof HTMLCanvasElement))) {
    throw new TypeError("runLineDetectionDebug requires six valid HTMLCanvasElement instances.");
  }
  if (options.inputCanvas.width <= 0 || options.inputCanvas.height <= 0) {
    throw new Error("inputCanvas dimensions must be greater than zero.");
  }
}

function drawCandidateOverlay(source: HTMLCanvasElement, overlay: HTMLCanvasElement, candidates: readonly FieldCandidate[]): void {
  overlay.width = source.width;
  overlay.height = source.height;
  const context = overlay.getContext("2d");
  if (!context) throw new Error("candidateOverlayCanvas does not provide a 2D context.");
  context.drawImage(source, 0, 0);
  context.strokeStyle = "#ef4444";
  context.fillStyle = "#ef4444";
  context.lineWidth = Math.max(1, Math.round(Math.min(source.width, source.height) / 700));
  context.font = `${Math.max(10, Math.round(Math.min(source.width, source.height) / 75))}px sans-serif`;
  candidates.forEach((candidate, index) => {
    const { x, y, width, height } = candidate.rect;
    context.strokeRect(x, y, width, height);
    // Limit labels, not rectangles, so dense images remain readable.
    if (index < 75) context.fillText(candidate.candidateId, x + 3, Math.max(12, y - 3));
  });
}

function elapsedSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
