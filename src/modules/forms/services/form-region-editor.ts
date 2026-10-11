import type { FormGeometricBox, FormInputKind, FormInputRegion, NormalizedBoundingBox } from '@/shared/contracts';
import { slugifyBoxId } from './form-field-metadata';

export function regionsForBox(box: FormGeometricBox): FormInputRegion[] {
  const safeBoxId = slugifyBoxId(box.boxId);
  return box.inputRegions ?? [{ regionId: `${safeBoxId}_region_1`, pageNumber: box.pageNumber ?? 1, normalizedCoords: box.normalizedCoords }];
}

export function editBoxRegions(box: FormGeometricBox, regions: FormInputRegion[], kind: FormInputKind = box.inputKind ?? 'single_line_text'): FormGeometricBox {
  if (!regions.length) throw new Error('EMPTY_FIELD_REGIONS');
  const safeBoxId = slugifyBoxId(box.boxId);
  return { ...box, boxId: safeBoxId, pageNumber: regions[0].pageNumber, inputKind: kind, inputRegions: regions, normalizedCoords: regions[0].normalizedCoords,
    estimatedWidthRatio: regions[0].normalizedCoords[3] - regions[0].normalizedCoords[1],
    boxType: kind === 'checkbox' ? 'checkbox' : kind === 'table_cell' ? 'table_cell' : 'text',
    recognition: { status: 'needs_review', sourceCandidateIds: box.recognition?.sourceCandidateIds ?? [],
      sourceBlockIds: box.recognition?.sourceBlockIds ?? [], reviewReasons: ['MANUAL_REGION_EDIT'] } };
}

export function editBoxRegion(box: FormGeometricBox, index: number, coords: NormalizedBoundingBox): FormGeometricBox {
  return editBoxRegions(box, regionsForBox(box).map((region, regionIndex) => regionIndex === index ? { ...region, normalizedCoords: coords } : region));
}

export function mergeTextFields(first: FormGeometricBox, second: FormGeometricBox): FormGeometricBox {
  if (first.boxType !== 'text' || second.boxType !== 'text') throw new Error('ONLY_TEXT_FIELDS_CAN_MERGE');
  const safeFirstId = slugifyBoxId(first.boxId);
  const regions = [...regionsForBox(first), ...regionsForBox(second)].map((region, index) => ({ ...region, regionId: `${safeFirstId}_region_${index + 1}` }));
  if (regions.length > 64) throw new Error('TOO_MANY_FIELD_REGIONS');
  return editBoxRegions({ ...first, boxId: safeFirstId }, regions, 'multiline_text');
}

export function splitTextField(box: FormGeometricBox, newIds: string[]): FormGeometricBox[] {
  const regions = regionsForBox(box);
  if (box.boxType !== 'text' || newIds.length !== regions.length - 1) throw new Error('INVALID_FIELD_SPLIT');
  const baseId = slugifyBoxId(box.boxId);
  return regions.map((region, index) => {
    const rawBoxId = index === 0 ? baseId : newIds[index - 1];
    const boxId = slugifyBoxId(rawBoxId, `split_${index + 1}`);
    return editBoxRegions({ ...box, boxId, rawText: index === 0 ? box.rawText : '' },
      [{ ...region, regionId: `${boxId}_region_1` }], 'single_line_text');
  });
}
