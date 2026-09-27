/** Heuristics only; these thresholds need calibration on consented real photos. */
export const IMAGE_QUALITY_CONFIG = Object.freeze({ minSide: 600, minLaplacianVariance: 35, glareTileSize: 32, glareBrightness: 252, glareContrast: 35 });
export function imageQualityErrors(image: { width: number; height: number; data: Uint8ClampedArray }): string[] {
  const { width, height, data } = image;
  const errors: string[] = [];
  if (Math.min(width, height) < IMAGE_QUALITY_CONFIG.minSide) errors.push('Độ phân giải thấp. Hãy chụp gần hơn và giữ đủ bốn góc giấy.');
  const gray = (x: number, y: number) => { const i = (y * width + x) * 4; return 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]; };
  let sum = 0, squares = 0, count = 0;
  for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
    const v = gray(x-1,y) + gray(x+1,y) + gray(x,y-1) + gray(x,y+1) - 4 * gray(x,y);
    sum += v; squares += v*v; count++;
  }
  if (!count || squares/count - (sum/count)**2 < IMAGE_QUALITY_CONFIG.minLaplacianVariance) errors.push('Ảnh mờ hoặc thiếu nét chữ. Hãy giữ máy yên và lấy nét lại.');
  // A clipped bright tile surrounded by darker paper is a possible specular hotspot.
  const size = IMAGE_QUALITY_CONFIG.glareTileSize;
  function mean(x: number, y: number) { let total = 0; for (let dy=0;dy<size;dy+=4) for(let dx=0;dx<size;dx+=4) total+=gray(x+dx,y+dy); return total / ((size/4)**2); }
  let glare = false;
  for (let y=size; y+2*size<height && !glare; y+=size/4) for(let x=size;x+2*size<width;x+=size/4) {
    const center = mean(x,y), surround = (mean(x-size,y)+mean(x+size,y)+mean(x,y-size)+mean(x,y+size))/4;
    if (center >= IMAGE_QUALITY_CONFIG.glareBrightness && center-surround > IMAGE_QUALITY_CONFIG.glareContrast) { glare=true; break; }
  }
  if (glare) errors.push('Có vùng nghi lóa che chữ. Hãy đổi góc chiếu sáng rồi chụp lại.');
  return errors;
}
