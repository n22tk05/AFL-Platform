import {
  type LineDetectionConfig,
  type PreprocessConfig,
} from "./config";
import { detectLines, type LineDetectionResult } from "./line-detector";
import { loadOpenCv } from "./loader";
import { preprocessToBinary } from "./preprocess";
import type { CvMat, CvRuntime } from "./types";

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
  preprocessConfig?: Partial<PreprocessConfig>;
  lineConfig?: Partial<LineDetectionConfig>;
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
}

/**
 * Run the Phase 1/2 image-debug pipeline and draw its intermediate results.
 * Input is read once from `inputCanvas`; output canvases receive grayscale, binary,
 * horizontal, vertical, and combined masks. No Mat escapes this function: all Mats,
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

    return {
      width: source.cols,
      height: source.rows,
      totalProcessingTimeMs: elapsedSince(startedAt),
      openCvLoadTimeMs,
      grayscaleTimeMs,
      binaryTimeMs,
      lineDetectionTimeMs,
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
  ];

  if (canvases.some((canvas) => !(canvas instanceof HTMLCanvasElement))) {
    throw new TypeError("runLineDetectionDebug requires six valid HTMLCanvasElement instances.");
  }
  if (options.inputCanvas.width <= 0 || options.inputCanvas.height <= 0) {
    throw new Error("inputCanvas dimensions must be greater than zero.");
  }
}

function elapsedSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
