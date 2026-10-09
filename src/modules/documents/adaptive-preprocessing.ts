import type { CvMat, CvRuntime, CvSize } from '@/modules/opencv/types';
import type { OcrVariant } from '@/shared/document-extraction.types';
import { ADAPTIVE_IMAGE_CONFIG as CONFIG } from './config';

interface PixelMat extends CvMat { data: Uint8Array }
interface Clahe { apply(src: CvMat, dst: CvMat): void; delete(): void }
export interface EnhancementRuntime extends CvRuntime {
  Mat: new () => PixelMat;
  CLAHE?: new (clipLimit: number, size: CvSize) => Clahe;
  createCLAHE?: (clipLimit: number, size: CvSize) => Clahe;
  bilateralFilter?: (src: CvMat, dst: CvMat, diameter: number, color: number, space: number) => void;
  resize(src: CvMat, dst: CvMat, size: CvSize, fx: number, fy: number, interpolation: number): void;
  INTER_CUBIC: number;
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void;
}
export function preprocessingCapabilities(cv: Partial<EnhancementRuntime>) {
  return { clahe: typeof cv.CLAHE === 'function' || typeof cv.createCLAHE === 'function', bilateralFilter: typeof cv.bilateralFilter === 'function' };
}
export function enhancedDimensions(width: number, height: number) {
  const scale = Math.max(1, Math.min(CONFIG.maxUpscale, CONFIG.upscaleTargetSide / Math.min(width, height),
    CONFIG.maximumEnhancedDimension / Math.max(width, height), Math.sqrt(CONFIG.maximumOutputPixels / (width * height))));
  const outputWidth = Math.floor(width * scale), outputHeight = Math.floor(height * scale);
  return { width: outputWidth, height: outputHeight, scaleX: outputWidth / width, scaleY: outputHeight / height };
}
/** Floating point arithmetic, floor on denominator and saturating uint8 conversion.
 * Caller owns buffers; no integer division, wraparound or in-place CV operation. */
export function normalizeLighting(gray: Uint8Array, background: Uint8Array, output: Uint8Array): void {
  if (gray.length !== background.length || gray.length !== output.length) throw new RangeError('Mismatched lighting buffers.');
  for (let i = 0; i < gray.length; i++) {
    const normalized = CONFIG.lightingTarget * gray[i] / Math.max(CONFIG.backgroundFloor, background[i]);
    output[i] = Math.round(Math.max(0, Math.min(255, CONFIG.lightingTarget + (normalized - CONFIG.lightingTarget) * CONFIG.contrastGain)));
  }
}
/** Source belongs to caller; all Mats/CLAHE allocated here are freed in finally.
 * Only canvas pixels/metadata escape. No morphology or generated text. */
export function enhanceDocumentCanvas(cv: EnhancementRuntime, source: CvMat, variant: Exclude<OcrVariant, 'primary'>, canvas: HTMLCanvasElement) {
  const mats: PixelMat[] = [];
  const make = () => { const mat = new cv.Mat(); mats.push(mat); return mat; };
  let clahe: Clahe | undefined;
  const filters: string[] = ['grayscale'];
  try {
    const gray = make();
    if (source.channels() === 1) source.copyTo(gray);
    else cv.cvtColor(source, gray, source.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY);
    let current = gray;
    if (variant === 'contrast') {
      const denoised = make();
      if (preprocessingCapabilities(cv).bilateralFilter) {
        cv.bilateralFilter!(gray, denoised, CONFIG.denoiseKernel, CONFIG.bilateralColor, CONFIG.bilateralSpace); filters.push('bilateral');
      } else {
        cv.GaussianBlur(gray, denoised, new cv.Size(CONFIG.denoiseKernel, CONFIG.denoiseKernel), CONFIG.denoiseSigma); filters.push('gaussian-fallback');
      }
      const contrast = make();
      if (preprocessingCapabilities(cv).clahe) {
        const grid = new cv.Size(CONFIG.claheGridSize, CONFIG.claheGridSize);
        clahe = typeof cv.CLAHE === 'function' ? new cv.CLAHE(CONFIG.claheClipLimit, grid) : cv.createCLAHE!(CONFIG.claheClipLimit, grid);
        clahe.apply(denoised, contrast); filters.push('clahe');
      } else {
        denoised.copyTo(contrast);
        for (let i = 0; i < contrast.data.length; i++) contrast.data[i] = Math.round(Math.max(0, Math.min(255, CONFIG.contrastCenter + (denoised.data[i] - CONFIG.contrastCenter) * CONFIG.contrastGain)));
        filters.push('linear-contrast-fallback');
      }
      const smooth = make();
      cv.GaussianBlur(contrast, smooth, new cv.Size(CONFIG.denoiseKernel, CONFIG.denoiseKernel), CONFIG.unsharpSigma);
      const sharpened = make(); contrast.copyTo(sharpened);
      for (let i = 0; i < contrast.data.length; i++) sharpened.data[i] = Math.round(Math.max(0, Math.min(255,
        contrast.data[i] + CONFIG.unsharpAmount * (contrast.data[i] - smooth.data[i]))));
      current = sharpened; filters.push('mild-unsharp');
    } else {
      const background = make(); cv.GaussianBlur(gray, background, new cv.Size(CONFIG.backgroundKernel, CONFIG.backgroundKernel), 0);
      const normalized = make(); gray.copyTo(normalized);
      normalizeLighting(gray.data, background.data, normalized.data);
      current = normalized; filters.push('background-normalization', 'mild-contrast');
    }
    const dimensions = enhancedDimensions(source.cols, source.rows);
    if (dimensions.width !== source.cols || dimensions.height !== source.rows) {
      const resized = make(); cv.resize(current, resized, new cv.Size(dimensions.width, dimensions.height), 0, 0, cv.INTER_CUBIC);
      current = resized; filters.push('bounded-upscale');
    }
    cv.imshow(canvas, current);
    return { ...dimensions, variant, filters, capabilities: preprocessingCapabilities(cv) };
  } finally {
    clahe?.delete(); for (const mat of mats.reverse()) mat.delete();
  }
}
