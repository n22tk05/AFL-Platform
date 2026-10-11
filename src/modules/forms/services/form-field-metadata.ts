import type { FormInputKind, FormInputRegion, NormalizedBoundingBox, WorkflowStep } from '@/shared/contracts';

export const INPUT_KINDS: readonly FormInputKind[] = ['single_line_text', 'multiline_text', 'checkbox', 'character_slots', 'table_cell'];
export const REGION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COORDINATE_PERSISTENCE_TOLERANCE = 1e-12;

/**
 * Chuyển đổi tên nhãn hoặc chuỗi nhập tùy ý thành boxId / regionId hợp lệ [A-Za-z0-9_-]{1,64}.
 * Loại bỏ dấu tiếng Việt, ký tự đặc biệt, gạch dưới/nối kép và cắt ngắn tối đa 64 ký tự.
 */
export function slugifyBoxId(input: string, fallbackPrefix = 'box'): string {
  if (!input || typeof input !== 'string') {
    return `${fallbackPrefix}_1`;
  }
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (match) => (match === 'đ' ? 'd' : 'D'));

  let slug = normalized
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  if (!slug) {
    return `${fallbackPrefix}_1`;
  }
  if (slug.length > 64) {
    slug = slug.slice(0, 64).replace(/[-_]+$/, '');
  }
  return slug || `${fallbackPrefix}_1`;
}

export function validRegionCoords(value: unknown): value is NormalizedBoundingBox {
  return Array.isArray(value) && value.length === 4 && value.every(coord => typeof coord === 'number' && Number.isFinite(coord) && coord >= 0 && coord <= 1)
    && value[0] < value[2] && value[1] < value[3];
}

export function validFieldMetadata(kind: unknown, regions: unknown, primary: NormalizedBoundingBox, pageNumber = 1, pageCount = 1): boolean {
  if (kind === undefined && regions === undefined) return true;
  if (!validRegionCoords(primary)) return false;
  if (!INPUT_KINDS.includes(kind as FormInputKind) || !Array.isArray(regions) || regions.length < 1 || regions.length > 64
    || !Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount || regions[0]?.pageNumber !== pageNumber) return false;
  const ids = new Set<string>();
  for (const region of regions as FormInputRegion[]) {
    if (!region || typeof region.regionId !== 'string' || !REGION_ID.test(region.regionId) || ids.has(region.regionId)
      || !Number.isSafeInteger(region.pageNumber) || region.pageNumber < 1 || region.pageNumber > pageCount
      || !validRegionCoords(region.normalizedCoords)) return false;
    ids.add(region.regionId);
  }
  return regions[0].normalizedCoords.every((coord: number, index: number) =>
    Math.abs(coord - primary[index]) <= COORDINATE_PERSISTENCE_TOLERANCE);
}

export function sameFieldRegions(first?: FormInputRegion[], second?: FormInputRegion[]): boolean {
  if (!first || !second) return first === second;
  return first.length === second.length && first.every((region, index) => region.regionId === second[index].regionId
    && region.pageNumber === second[index].pageNumber && region.normalizedCoords.every((coord, coordIndex) => coord === second[index].normalizedCoords[coordIndex]));
}

export interface FieldDisplayMetadata {
  boxId: string;
  pageNumber?: number;
  inputKind: FormInputKind;
  highlightRegions: FormInputRegion[];
}

export function fieldMetadataFromSteps(steps: WorkflowStep[], pageCount = 1): FieldDisplayMetadata[] {
  return steps.flatMap(step => {
    if (!validFieldMetadata(step.inputKind, step.highlightRegions, step.highlightCoords, step.pageNumber ?? 1, pageCount)) throw new Error('INVALID_WORKFLOW');
    return step.inputKind && step.highlightRegions ? [{ boxId: step.boxId, pageNumber: step.pageNumber ?? 1,
      inputKind: step.inputKind, highlightRegions: step.highlightRegions }] : [];
  });
}

export function bindFieldMetadata(steps: WorkflowStep[], fields?: FieldDisplayMetadata[], pageCount = 1): WorkflowStep[] {
  if (!fields) return steps;
  const stepIds = new Set(steps.map(step => step.boxId));
  if (fields.length > 200 || pageCount > 1 && fields.length !== steps.length
    || new Set(fields.map(field => field.boxId)).size !== fields.length
    || fields.some(field => !stepIds.has(field.boxId) || !field.inputKind || !Array.isArray(field.highlightRegions))) throw new Error('FORM_ASSET_UNAVAILABLE');
  return steps.map(step => {
    const field = fields.find(metadata => metadata.boxId === step.boxId);
    if (!field) return step;
    const pageNumber = field.pageNumber ?? 1;
    if (!validFieldMetadata(field.inputKind, field.highlightRegions, step.highlightCoords, pageNumber, pageCount)) throw new Error('FORM_ASSET_UNAVAILABLE');
    return { ...step, pageNumber, inputKind: field.inputKind, highlightRegions: field.highlightRegions };
  });
}
