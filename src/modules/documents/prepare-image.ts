import { runLineDetectionDebug, type DocumentMode } from '@/modules/opencv';
import { DOCUMENT_LIMITS } from './config';
import { imageQualityErrors } from './image-quality';

export async function encodeProcessedCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  if (!canvas.width || !canvas.height) throw new Error('Ảnh sau nắn không hợp lệ. Hãy chụp lại.');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể mã hóa ảnh.')), 'image/png'));
}
export async function prepareDocumentImage(file: File, mode: DocumentMode): Promise<{ blob: Blob; deskewApplied: boolean }> {
  if (!['image/jpeg','image/png'].includes(file.type) || file.size > DOCUMENT_LIMITS.fileBytes) throw new Error('Chọn ảnh JPEG/PNG tối đa 8 MB.');
  const url = URL.createObjectURL(file);
  const canvases = Array.from({ length: 9 }, () => document.createElement('canvas'));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload=()=>resolve(); img.onerror=()=>reject(new Error('Không đọc được ảnh.')); img.src=url; });
    const [input, deskewed, outline, gray, binary, horizontal, vertical, combined, overlay] = canvases;
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    input.width=Math.round(img.naturalWidth*scale); input.height=Math.round(img.naturalHeight*scale);
    const context = input.getContext('2d');
    if (!context) throw new Error('Không tạo được canvas.');
    context.drawImage(img,0,0,input.width,input.height);
    // Existing OpenCV coordinator owns every Mat and frees them in finally.
    // In camera mode its detection failure propagates; no original-file fallback.
    await runLineDetectionDebug({ mode, inputCanvas:input, deskewedCanvas:deskewed, documentOutlineCanvas:outline,
      grayscaleCanvas:gray, binaryCanvas:binary, horizontalCanvas:horizontal, verticalCanvas:vertical,
      combinedCanvas:combined, candidateOverlayCanvas:overlay });
    const processed = deskewed.getContext('2d');
    if (!processed) throw new Error('Không đọc được ảnh đã nắn.');
    const errors = imageQualityErrors(processed.getImageData(0,0,deskewed.width,deskewed.height));
    if (errors.length) throw new Error(errors.join(' '));
    const blob = await encodeProcessedCanvas(deskewed);
    if (blob.size > DOCUMENT_LIMITS.fileBytes) throw new Error('Ảnh sau nắn quá lớn. Hãy chọn ảnh nhỏ hơn.');
    return { blob, deskewApplied: mode === 'camera-photo' };
  } finally {
    URL.revokeObjectURL(url);
    canvases.forEach(canvas => { canvas.width=0; canvas.height=0; });
  }
}
