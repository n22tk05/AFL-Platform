import type { NormalizedBoundingBox } from '@/shared/document-extraction.types';
import { DOCUMENT_LIMITS } from './config';
/** Starting values require calibration on consented real photos. */
export const IMAGE_QUALITY_CONFIG = Object.freeze({
  minSide: 600, minLaplacianVariance: 35, minContrast: 45, samplePixels: 250_000,
  tileSize: 32, clippedBrightness: 252, clippedFraction: 0.85, glareContrast: 35,
  flatGradient: 3, nearbyGradient: 6, minGlareArea: 0.0005, maxGlareArea: 0.3,
  shadowContrast: 55, blankContrast: 6, maxRegions: 12,
});
export interface ImageQualityAnalysis {
  warnings: string[]; possibleGlare: boolean; possibleGlareRegions: NormalizedBoundingBox[];
  blurVariance: number; contrast: number; possibleBlank: boolean;
}
export function validateImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    throw new RangeError('Kích thước ảnh không hợp lệ.');
  if (width * height > DOCUMENT_LIMITS.imagePixels || Math.max(width, height) > DOCUMENT_LIMITS.imageMaxDimension)
    throw new RangeError('Ảnh vượt giới hạn pixel hoặc kích thước xử lý.');
}
/** Pixel analysis produces warnings, never a verdict that text was lost. */
export function analyzeImageQuality(image: { width: number; height: number; data: Uint8ClampedArray }): ImageQualityAnalysis {
  const { width, height, data } = image;
  validateImageDimensions(width, height);
  if (data.length !== width * height * 4) throw new RangeError('Dữ liệu ảnh không hợp lệ.');
  const c = IMAGE_QUALITY_CONFIG;
  const gray = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const step = Math.max(1, Math.ceil(Math.sqrt(width * height / c.samplePixels)));
  const histogram = new Uint32Array(256);
  let sum = 0, squares = 0, count = 0;
  for (let y = 1; y < height - 1; y += step) for (let x = 1; x < width - 1; x += step) {
    const value = gray(x, y); histogram[Math.round(value)]++;
    const v = gray(x - 1, y) + gray(x + 1, y) + gray(x, y - 1) + gray(x, y + 1) - 4 * value;
    sum += v; squares += v * v; count++;
  }
  const percentile = (fraction: number) => {
    let total = 0;
    for (let i = 0; i < 256; i++) { total += histogram[i]; if (total > count * fraction) return i; }
    return 255;
  };
  const contrast = count ? percentile(0.995) - percentile(0.005) : 0;
  const blurVariance = count ? Math.max(0, squares / count - (sum / count) ** 2) : 0;
  const warnings: string[] = [];
  if (Math.min(width, height) < c.minSide) warnings.push('LOW_RESOLUTION');
  if (blurVariance < c.minLaplacianVariance) warnings.push('BLUR_POSSIBLE');
  if (contrast < c.minContrast) warnings.push('LOW_CONTRAST');
  const columns = Math.ceil(width / c.tileSize), rows = Math.ceil(height / c.tileSize);
  const tiles: { mean: number; gradient: number; clipped: number }[] = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
    let total = 0, gradient = 0, clipped = 0, n = 0;
    for (let y = ty * c.tileSize; y < Math.min(height - 1, (ty + 1) * c.tileSize); y += 4)
      for (let x = tx * c.tileSize; x < Math.min(width - 1, (tx + 1) * c.tileSize); x += 4) {
        const v = gray(x, y); total += v; gradient += Math.abs(v - gray(Math.min(width - 1, x + 4), y)) + Math.abs(v - gray(x, Math.min(height - 1, y + 4)));
        if (v >= c.clippedBrightness) clipped++; n++;
      }
    tiles.push({ mean: n ? total / n : 0, gradient: n ? gradient / n : 0, clipped: n ? clipped / n : 0 });
  }
  const means = tiles.map(t => t.mean).sort((a, b) => a - b);
  if (means.length && means[Math.floor(means.length * 0.9)] - means[Math.floor(means.length * 0.1)] > c.shadowContrast) warnings.push('UNEVEN_LIGHTING');
  const candidates = new Set<number>();
  for (let ty = 1; ty < rows - 1; ty++) for (let tx = 1; tx < columns - 1; tx++) {
    const index = ty * columns + tx, tile = tiles[index];
    const neighbours = [-columns, columns, -1, 1].map(offset => tiles[index + offset]);
    const surround = neighbours.reduce((n, t) => n + t.mean, 0) / neighbours.length;
    // White paper alone does not qualify. An intentional white space near text
    // can still qualify; this is suspicion, never proof that text was erased.
    if (tile.clipped >= c.clippedFraction && tile.gradient <= c.flatGradient
      && tile.mean - surround > c.glareContrast && neighbours.some(t => t.gradient >= c.nearbyGradient)) candidates.add(index);
  }
  const possibleGlareRegions: NormalizedBoundingBox[] = [];
  while (candidates.size && possibleGlareRegions.length < c.maxRegions) {
    const first = candidates.values().next().value as number, queue = [first]; candidates.delete(first);
    let minX = columns, minY = rows, maxX = 0, maxY = 0;
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i], x = index % columns, y = Math.floor(index / columns);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const neighbour of [index - columns, index + columns, ...(x > 0 ? [index - 1] : []), ...(x < columns - 1 ? [index + 1] : [])])
        if (candidates.delete(neighbour)) queue.push(neighbour);
    }
    const area = queue.length * c.tileSize ** 2 / (width * height);
    if (area >= c.minGlareArea && area <= c.maxGlareArea) possibleGlareRegions.push([
      minY * c.tileSize / height, minX * c.tileSize / width,
      Math.min(1, (maxY + 1) * c.tileSize / height), Math.min(1, (maxX + 1) * c.tileSize / width),
    ]);
  }
  if (possibleGlareRegions.length) warnings.push('POSSIBLE_GLARE');
  const possibleBlank = contrast < c.blankContrast;
  if (possibleBlank) warnings.push('POSSIBLE_BLANK');
  return { warnings, possibleGlare: possibleGlareRegions.length > 0, possibleGlareRegions, blurVariance, contrast, possibleBlank };
}
export const IMAGE_WARNING_MESSAGES: Record<string, string> = {
  LOW_RESOLUTION: 'Ảnh nhỏ; phóng lớn chỉ hỗ trợ đọc, không khôi phục chi tiết đã mất.',
  BLUR_POSSIBLE: 'Ảnh có dấu hiệu mờ; cần đối chiếu chữ và số sau khi đọc.',
  LOW_CONTRAST: 'Ảnh có độ tương phản thấp.', UNEVEN_LIGHTING: 'Ánh sáng không đều hoặc có bóng.',
  POSSIBLE_GLARE: 'Có vùng sáng nghi lóa; chưa đủ bằng chứng để kết luận chữ bị mất.',
  POSSIBLE_BLANK: 'Ảnh có thể trống hoặc quá ít chi tiết; cần kiểm tra kết quả đọc.',
  DOCUMENT_DETECTION_FAILED: 'Không xác định được vùng giấy đáng tin cậy; đã đọc toàn ảnh, chưa nắn phối cảnh.',
  ENHANCEMENT_UNAVAILABLE: 'Không tạo được bản tăng cường; vẫn thử đọc ảnh màu.',
};
/** Compatibility helper: messages are soft warnings. */
export function imageQualityErrors(image: Parameters<typeof analyzeImageQuality>[0]): string[] {
  return analyzeImageQuality(image).warnings.map(code => IMAGE_WARNING_MESSAGES[code]);
}
