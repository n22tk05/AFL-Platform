import { detectDocument } from '@/modules/opencv/document-detector';
import { warpDocument } from '@/modules/opencv/perspective-transform';
import { loadOpenCv } from '@/modules/opencv/loader';
import { DocumentDetectionError } from '@/modules/opencv/document-types';
import type { CvMat } from '@/modules/opencv/types';
import { DOCUMENT_LIMITS, ADAPTIVE_IMAGE_CONFIG } from './config';
import { analyzeImageQuality, validateImageDimensions, type ImageQualityAnalysis } from './image-quality';
import { enhanceDocumentCanvas, type EnhancementRuntime } from './adaptive-preprocessing';

export type PreparationMode = 'upload-photo' | 'camera-photo' | 'clean-scan';
export class FullImageConsentRequired extends Error {
  constructor() { super('Không xác định được bốn góc giấy đáng tin cậy. Có thể thử đọc toàn ảnh và kiểm tra kết quả.'); }
}
export interface PreparedDocumentImage {
  blob: Blob; deskewApplied: boolean; documentDetectionFailed: boolean; quality: ImageQualityAnalysis;
  width: number; height: number;
  enhancements: (ReturnType<typeof enhanceDocumentCanvas> & { blob: Blob })[];
}
export async function encodeProcessedCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  validateImageDimensions(canvas.width, canvas.height);
  const encode = (mime: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể mã hóa ảnh.')), mime, quality));
  let blob = await encode('image/png');
  if (blob.size > DOCUMENT_LIMITS.fileBytes) blob = await encode('image/jpeg', ADAPTIVE_IMAGE_CONFIG.jpegQuality);
  if (blob.size > DOCUMENT_LIMITS.fileBytes) throw new Error('Ảnh xử lý vượt giới hạn 8 MB.');
  return blob;
}
export async function prepareDocumentImage(file: File, mode: PreparationMode, options: { allowFullImage?: boolean; signal?: AbortSignal } = {}): Promise<PreparedDocumentImage> {
  if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > DOCUMENT_LIMITS.fileBytes) throw new Error('Chọn ảnh JPEG/PNG hợp lệ, tối đa 8 MB.');
  const checkCancelled = () => { if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý.', 'AbortError'); };
  const url = URL.createObjectURL(file);
  const input = document.createElement('canvas'), primary = document.createElement('canvas'), enhanced = document.createElement('canvas');
  let source: CvMat | undefined, warped: CvMat | undefined;
  try {
    checkCancelled();
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Không giải mã được ảnh.')); img.src = url; });
    checkCancelled(); validateImageDimensions(img.naturalWidth, img.naturalHeight);
    // Detection resizes internally, using independent X/Y scales. OCR retains
    // native pixels; only warp's explicit safety caps can downscale.
    input.width = img.naturalWidth; input.height = img.naturalHeight;
    const context = input.getContext('2d'); if (!context) throw new Error('Không tạo được canvas.');
    context.drawImage(img, 0, 0);
    const cv = await loadOpenCv() as unknown as EnhancementRuntime & { imread(canvas: HTMLCanvasElement): CvMat };
    checkCancelled(); source = cv.imread(input); validateImageDimensions(source.cols, source.rows);
    let deskewApplied = false, documentDetectionFailed = false;
    if (mode !== 'clean-scan') {
      let quad;
      try {
        if (source.cols < 2 || source.rows < 2) throw new DocumentDetectionError('DOCUMENT_NOT_FOUND', {
          accepted: false, confidence: 0, areaRatio: 0, rectangularity: 0, borderMarginRatio: 0, rejectionReasons: ['IMAGE_TOO_SMALL_FOR_DETECTION'],
        });
        quad = detectDocument(cv, source).sourceQuad;
      }
      catch (error) {
        if (!(error instanceof DocumentDetectionError)) throw error;
        documentDetectionFailed = true;
        if (mode === 'camera-photo' && !options.allowFullImage) throw new FullImageConsentRequired();
      }
      // Rejected quads never crop the image. Warp errors never become soft warnings.
      if (quad) { warped = warpDocument(cv, source, quad, ADAPTIVE_IMAGE_CONFIG).deskewed; deskewApplied = true; }
    }
    const page = warped ?? source; cv.imshow(primary, page);
    const processed = primary.getContext('2d'); if (!processed) throw new Error('Không đọc được ảnh xử lý.');
    const quality = analyzeImageQuality(processed.getImageData(0, 0, primary.width, primary.height));
    if (documentDetectionFailed) quality.warnings.push('DOCUMENT_DETECTION_FAILED');
    const blob = await encodeProcessedCanvas(primary); checkCancelled();
    const variants: ('contrast' | 'lighting')[] = [];
    if (quality.warnings.some(w => w === 'UNEVEN_LIGHTING' || w === 'POSSIBLE_GLARE')) variants.push('lighting');
    if (quality.warnings.some(w => ['BLUR_POSSIBLE', 'LOW_CONTRAST', 'LOW_RESOLUTION'].includes(w))) variants.push('contrast');
    const enhancements: PreparedDocumentImage['enhancements'] = [];
    for (const variant of variants.slice(0, ADAPTIVE_IMAGE_CONFIG.maxEnhancedVariants)) {
      checkCancelled();
      try {
        const metadata = enhanceDocumentCanvas(cv, page, variant, enhanced);
        enhancements.push({ ...metadata, blob: await encodeProcessedCanvas(enhanced) });
      } catch {
        if (!quality.warnings.includes('ENHANCEMENT_UNAVAILABLE')) quality.warnings.push('ENHANCEMENT_UNAVAILABLE');
      }
    }
    checkCancelled();
    return { blob, deskewApplied, documentDetectionFailed, quality, width: primary.width, height: primary.height, enhancements };
  } finally {
    warped?.delete(); source?.delete(); URL.revokeObjectURL(url);
    for (const canvas of [input, primary, enhanced]) { canvas.width = 0; canvas.height = 0; }
  }
}
