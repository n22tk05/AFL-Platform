import type { PixelRect } from '@/modules/opencv/field-types';

/** Map detection pixels to native OCR pixels with independent rounded X/Y scales. */
export function mapCandidateRect(rect: PixelRect, from: {width: number; height: number}, to: {width: number; height: number}): PixelRect {
  if ([from.width, from.height, to.width, to.height, rect.width, rect.height].some(n => !Number.isFinite(n) || n <= 0)
    || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)) throw new RangeError('INVALID_CANDIDATE_FRAME');
  const left = Math.max(0, Math.floor(rect.x * to.width / from.width));
  const top = Math.max(0, Math.floor(rect.y * to.height / from.height));
  const right = Math.min(to.width, Math.ceil((rect.x + rect.width) * to.width / from.width));
  const bottom = Math.min(to.height, Math.ceil((rect.y + rect.height) * to.height / from.height));
  if (right <= left || bottom <= top) throw new RangeError('INVALID_CANDIDATE_FRAME');
  return { x: left, y: top, width: right - left, height: bottom - top };
}
