import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { DocumentJsonExport, ExportBox } from '@/shared/document-export.types';
import type { FormGeometricManifest, NormalizedBoundingBox } from '@/shared/contracts';
import { validCoords, validateManifest } from './form-validation.service';

export function xyxyToYxyx(box: ExportBox): NormalizedBoundingBox {
  const converted: NormalizedBoundingBox = [box[1], box[0], box[3], box[2]];
  if (!validCoords(converted)) throw new Error('INVALID_OCR_GEOMETRY');
  return converted;
}

export interface ManifestReviewDraft {
  manifest: FormGeometricManifest;
  evidence: { boxId: string; sourceBlockIds: string[]; reason: string }[];
}

export function assembleFormManifest(input: {
  formId: string; formCode: string; formTitle: string; width: number; height: number;
  candidates: FieldCandidate[]; document: DocumentJsonExport;
}): ManifestReviewDraft {
  const document = input.document;
  if (document.status === 'failed' || document.source.frame !== 'processed-primary' || document.source.pageCount !== 1
    || document.pages.length !== 1 || document.pages[0].coordinateSystem !== 'normalized-xyxy'
    || document.pages[0].width !== input.width || document.pages[0].height !== input.height) throw new Error('OCR_FRAME_MISMATCH');
  const candidates = input.candidates.filter(candidate => !candidate.isContainer && candidate.source !== 'phrase_cluster');
  if (candidates.length > 200) throw new Error('TOO_MANY_FORM_BOXES');
  const labels = [...document.structure.fields, ...document.structure.checkboxes].map(field => ({
    label: field.label, sourceBlockIds: field.sourceBlockIds,
    regions: document.blocks.filter(block => field.sourceBlockIds.includes(block.id) && block.page === 1 && block.bbox)
      .map(block => xyxyToYxyx(block.bbox!)),
  }));
  const evidence: ManifestReviewDraft['evidence'] = [];
  const chosen = new Map<string, string>();
  const boxes = candidates.map((candidate, index) => {
    const { x, y, width, height } = candidate.rect;
    const normalizedCoords: NormalizedBoundingBox = [y / input.height, x / input.width, (y + height) / input.height, (x + width) / input.width];
    if (!validCoords(normalizedCoords)) throw new Error('INVALID_INPUT_GEOMETRY');
    const matches = labels.flatMap(label => label.regions.map(region => {
      const verticalGap = Math.max(region[0] - normalizedCoords[2], normalizedCoords[0] - region[2], 0);
      const horizontalGap = Math.max(region[1] - normalizedCoords[3], normalizedCoords[1] - region[3], 0);
      return { ...label, score: verticalGap * 4 + horizontalGap, verticalGap, horizontalGap };
    })).filter(match => match.verticalGap <= 0.05 && match.horizontalGap <= 0.18)
      .sort((first, second) => first.score - second.score);
    const first = matches[0];
    const ambiguous = matches.some(match => match.label !== first?.label && match.score <= first.score + 0.02);
    const boxId = `box_${String(index + 1).padStart(3, '0')}`;
    const rawText = first && !ambiguous ? first.label : '';
    if (rawText) chosen.set(boxId, first.sourceBlockIds.join('|') + ':' + rawText);
    evidence.push({ boxId, sourceBlockIds: first?.sourceBlockIds ?? [], reason: rawText ? 'Đối soát nhãn OCR và vùng cần điền.' : 'Nhãn thiếu hoặc có nhiều cách ghép; cần chọn/sửa thủ công.' });
    return { boxId, normalizedCoords, rawText, boxType: candidate.source === 'checkbox' ? 'checkbox' as const : 'text' as const,
      estimatedWidthRatio: width / input.width };
  });
  for (const box of boxes) {
    const key = chosen.get(box.boxId);
    if (key && [...chosen.values()].filter(value => value === key).length > 1) {
      box.rawText = '';
      evidence.find(item => item.boxId === box.boxId)!.reason = 'Một nhãn được ghép với nhiều ô; cần tách nhãn và vùng nhập.';
    }
  }
  return { manifest: { formId: input.formId, formCode: input.formCode, formTitle: input.formTitle,
    imageDimensions: { width: input.width, height: input.height }, boxes }, evidence };
}

export function confirmManifest(draft: FormGeometricManifest, confirmed: boolean): FormGeometricManifest {
  if (!confirmed) throw new Error('MANIFEST_REVIEW_REQUIRED');
  return validateManifest(draft);
}
