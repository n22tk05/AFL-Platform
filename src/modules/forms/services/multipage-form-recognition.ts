import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import type { FormGeometricBox } from '@/shared/contracts';
import { assembleFormManifest, type ManifestReviewDraft } from './form-manifest-assembler';
import type { TableHeaderContext } from './form-region-recognition';

export interface FormRecognitionPageInput {
  pageNumber: number;
  width: number;
  height: number;
  candidates: FieldCandidate[];
  document: DocumentJsonExport;
}

export interface MultipageReviewDraft extends ManifestReviewDraft {
  pageReviews: { pageNumber: number; summary: NonNullable<ManifestReviewDraft['summary']>;
    regions: NonNullable<ManifestReviewDraft['regions']>; continuationHeader?: TableHeaderContext }[];
}

export function assembleMultipageReviewDraft(input: {
  formId: string;
  formCode: string;
  formTitle: string;
  pages: FormRecognitionPageInput[];
}): MultipageReviewDraft {
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 20
    || input.pages.some((page, index) => !page || page.pageNumber !== index + 1
      || !Number.isSafeInteger(page.width) || page.width < 1
      || !Number.isSafeInteger(page.height) || page.height < 1)) throw new Error('INVALID_RECOGNITION_PAGES');

  const boxes: FormGeometricBox[] = [];
  const evidence: ManifestReviewDraft['evidence'] = [];
  const pageReviews: MultipageReviewDraft['pageReviews'] = [];
  const summary = { detectedFields: 0, labeledFields: 0, needsReview: 0, excludedRegions: 0 };
  let previousTableHeader: TableHeaderContext | undefined;

  for (const page of input.pages) {
    const draft = assembleFormManifest({ formId: input.formId, formCode: input.formCode,
      formTitle: input.formTitle, width: page.width, height: page.height,
      candidates: page.candidates, document: page.document, previousTableHeader });
    previousTableHeader = draft.continuationHeader;
    const prefix = `p${page.pageNumber}_`;
    const qualifiedBlockId = (blockId: string) => `${prefix}${blockId}`;
    const qualifiedCandidateId = (candidateId: string) => `${prefix}${candidateId}`;
    for (const box of draft.manifest.boxes) {
      const boxId = `${prefix}${box.boxId}`;
      boxes.push({ ...box, boxId, pageNumber: page.pageNumber,
        inputRegions: box.inputRegions?.map(region => ({ ...region, regionId: `${prefix}${region.regionId}`, pageNumber: page.pageNumber })),
        recognition: box.recognition && { ...box.recognition,
          sourceCandidateIds: box.recognition.sourceCandidateIds.map(qualifiedCandidateId),
          sourceBlockIds: box.recognition.sourceBlockIds.map(qualifiedBlockId) } });
    }
    evidence.push(...draft.evidence.map(item => ({ ...item, boxId: `${prefix}${item.boxId}`, pageNumber: page.pageNumber,
      sourceBlockIds: item.sourceBlockIds.map(qualifiedBlockId) })));
    const regions = (draft.regions ?? []).map(region => ({ ...region, candidateId: qualifiedCandidateId(region.candidateId),
      pageNumber: page.pageNumber }));
    pageReviews.push({ pageNumber: page.pageNumber, regions, summary: draft.summary!, continuationHeader: draft.continuationHeader });
    for (const key of Object.keys(summary) as (keyof typeof summary)[]) summary[key] += draft.summary![key];
    if (boxes.length > 200) throw new Error('TOO_MANY_FORM_BOXES');
  }

  return { manifest: { formId: input.formId, formCode: input.formCode, formTitle: input.formTitle,
    imageDimensions: { width: input.pages[0].width, height: input.pages[0].height }, boxes },
    evidence, regions: pageReviews.flatMap(page => page.regions), summary, pageReviews };
}
