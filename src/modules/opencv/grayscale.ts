import { loadOpenCv } from './loader';
import type { Mat } from './loader';

/**
 * Converts a color image rendered on an HTMLCanvasElement to grayscale using OpenCV WASM.
 *
 * @param inputCanvas - Source canvas containing the color image (RGBA).
 * @param outputCanvas - Target canvas where the grayscale image will be rendered.
 * @returns Promise that resolves when conversion and rendering are complete.
 */
export async function convertToGrayscale(
  inputCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('convertToGrayscale can only be executed in a browser environment.');
  }

  if (!inputCanvas || !(inputCanvas instanceof HTMLCanvasElement)) {
    throw new TypeError('inputCanvas must be a valid HTMLCanvasElement.');
  }

  if (!outputCanvas || !(outputCanvas instanceof HTMLCanvasElement)) {
    throw new TypeError('outputCanvas must be a valid HTMLCanvasElement.');
  }

  if (inputCanvas.width === 0 || inputCanvas.height === 0) {
    throw new Error('inputCanvas dimensions must be greater than zero.');
  }

  const cv = await loadOpenCv();

  let srcMat: Mat | undefined;
  let dstMat: Mat | undefined;

  try {
    // cv.imread reads RGBA pixel data from the canvas
    srcMat = cv.imread(inputCanvas);
    dstMat = new cv.Mat();

    // Convert RGBA to Grayscale
    cv.cvtColor(srcMat, dstMat, cv.COLOR_RGBA2GRAY);

    // Render grayscale Mat to the output canvas
    cv.imshow(outputCanvas, dstMat);
  } finally {
    // Always free WASM memory
    srcMat?.delete();
    dstMat?.delete();
  }
}
