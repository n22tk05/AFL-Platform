import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { DocumentJsonExport, ExportBox } from '@/shared/document-export.types';
import type { FormGeometricManifest, NormalizedBoundingBox } from '@/shared/contracts';
import { validCoords, validateManifest } from './form-validation.service';
import { recognizeFormRegions, type RecognitionEvidence, type TableHeaderContext } from './form-region-recognition';

export function xyxyToYxyx(box: ExportBox): NormalizedBoundingBox {
  const converted: NormalizedBoundingBox = [box[1], box[0], box[3], box[2]];
  if (!validCoords(converted)) throw new Error('INVALID_OCR_GEOMETRY');
  return converted;
}

export interface ManifestReviewDraft {
  manifest: FormGeometricManifest;
  evidence: { boxId: string; pageNumber?: number; sourceBlockIds: string[]; reason: string }[];
  regions?: RecognitionEvidence[];
  candidates?: FieldCandidate[];
  summary?: { detectedFields: number; labeledFields: number; needsReview: number; excludedRegions: number };
  pageReviews?: { pageNumber: number; summary: NonNullable<ManifestReviewDraft['summary']>;
    regions: NonNullable<ManifestReviewDraft['regions']> }[];
  continuationHeader?: TableHeaderContext;
}

export function assembleFormManifest(input: {
  formId: string; formCode: string; formTitle: string; width: number; height: number;
  candidates: FieldCandidate[]; document: DocumentJsonExport; previousTableHeader?: TableHeaderContext;
}): ManifestReviewDraft {
  const document = input.document;
  if (document.status === 'failed' || document.source.frame !== 'processed-primary' || document.source.pageCount !== 1
    || document.pages.length !== 1 || document.pages[0].page !== 1 || document.pages[0].coordinateSystem !== 'normalized-xyxy'
    || document.blocks.some(block => block.page !== 1)
    || document.pages[0].width !== input.width || document.pages[0].height !== input.height) throw new Error('OCR_FRAME_MISMATCH');
  if (input.candidates.length > 1500) throw new Error('TOO_MANY_FORM_BOXES');
  for (const block of document.blocks) if (block.bbox) xyxyToYxyx(block.bbox);
  for (const candidate of input.candidates) {
    const { x, y, width, height } = candidate.rect;
    const normalizedCoords: NormalizedBoundingBox = [y / input.height, x / input.width, (y + height) / input.height, (x + width) / input.width];
    if (!validCoords(normalizedCoords)) throw new Error('INVALID_INPUT_GEOMETRY');
  }
  const result = recognizeFormRegions(input);
  if (result.boxes.length > 200) throw new Error('TOO_MANY_FORM_BOXES');
  const evidence = result.boxes.map(box => ({ boxId: box.boxId, sourceBlockIds: box.recognition?.sourceBlockIds ?? [],
    reason: box.recognition?.status === 'needs_review' ? `Cần đối soát: ${box.recognition.reviewReasons.join(', ')}` : `Đã ghép nhãn/vùng: ${box.recognition?.reviewReasons.join(', ')}` }));
  return { manifest: { formId: input.formId, formCode: input.formCode, formTitle: input.formTitle,
    imageDimensions: { width: input.width, height: input.height }, boxes: result.boxes }, evidence, regions: result.regions,
    candidates: input.candidates, summary: result.summary, continuationHeader: result.continuationHeader };
}

export function confirmManifest(draft: FormGeometricManifest, confirmed: boolean): FormGeometricManifest {
  if (!confirmed) throw new Error('MANIFEST_REVIEW_REQUIRED');
  return validateManifest({ ...draft, boxes: draft.boxes.map(box => ({ ...box,
    ...(box.recognition ? { recognition: { ...box.recognition, status: 'confirmed' as const } } : {}) })) });
}
