/**
 * Minimal OpenCV.js boundary used by the image-processing pipeline.
 *
 * The package's declarations do not consistently model every WebAssembly
 * overload used here, so this local interface documents only the runtime API
 * this module needs. Keeping it here avoids leaking untyped OpenCV values into
 * the algorithm itself.
 */
export interface CvMat {
  readonly cols: number;
  readonly rows: number;
  channels(): number;
  clone(): CvMat;
  copyTo(destination: CvMat): void;
  delete(): void;
}

export interface CvSize {
  readonly width: number;
  readonly height: number;
}

export interface CvRuntime {
  Mat: new () => CvMat;
  Size: new (width: number, height: number) => CvSize;
  COLOR_RGB2GRAY: number;
  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY_INV: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  cvtColor(source: CvMat, destination: CvMat, code: number): void;
  GaussianBlur(
    source: CvMat,
    destination: CvMat,
    kernelSize: CvSize,
    sigmaX: number,
    sigmaY?: number,
  ): void;
  adaptiveThreshold(
    source: CvMat,
    destination: CvMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    c: number,
  ): void;
  getStructuringElement(shape: number, kernelSize: CvSize): CvMat;
  erode(source: CvMat, destination: CvMat, kernel: CvMat): void;
  dilate(source: CvMat, destination: CvMat, kernel: CvMat): void;
  bitwise_or(left: CvMat, right: CvMat, destination: CvMat): void;
  morphologyEx(source: CvMat, destination: CvMat, operation: number, kernel: CvMat): void;
}

export interface ImageDimensions {
  width: number;
  height: number;
}
