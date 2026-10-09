import type { PixelRect } from '@/modules/opencv/field-types';
import { assembleJson } from './json-assembler';
import type { DocumentJsonExport } from '@/shared/document-export.types';
export interface RecognizedCandidate {
  candidateId: string; rect: PixelRect; source: 'closed_contour' | 'checkbox' | 'field_row' | 'phrase_cluster';
  isContainer?: boolean; text: string; confidence?: number | null;
  checkboxState?: 'checked' | 'unchecked' | 'unknown';
}
export function assembleCandidatesToJson(candidates: readonly RecognizedCandidate[], imageSize: { width: number; height: number }): DocumentJsonExport {
  const ordered = [...candidates].sort((a,b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const draft = assembleJson({
    provider: 'vietocr', readingOrder: 'geometric-heuristic', fullText: ordered.map(c => c.text).join('\n'),
    lines: ordered.map(c => ({ id: c.candidateId, text: c.text, page: 1, tokenIds: [], confidence: c.confidence ?? null,
      boundingBox: [c.rect.y / imageSize.height, c.rect.x / imageSize.width, (c.rect.y+c.rect.height) / imageSize.height, (c.rect.x+c.rect.width) / imageSize.width] })),
    tokens: [], pageCount: 1, warnings: ['CANDIDATE_OCR_NOT_FULL_PAGE', 'GEOMETRIC_CANDIDATES_ARE_NOT_VERIFIED_TABLES'],
  }, { documentId: crypto.randomUUID(), mimeType: 'image/png', imageDimensions: imageSize });
  if(draft.status !== 'failed') draft.status = 'partial';
  for (const c of ordered.filter(c => c.source === 'checkbox')) {
    const block = draft.blocks.find(b => b.providerId === c.candidateId);
    const node = draft.nodes.find(n => block && n.sourceBlockIds.includes(block.id));
    if(!node) continue;
    node.type = 'checkbox_item'; node.evidence = { method: 'pixel_heuristic', rule: 'dark-pixel-ratio', verified: false };
    draft.structure.checkboxes.push({ id: 'checkbox-' + node.id, nodeId: node.id, label: '', state: c.checkboxState ?? 'unknown',
      sourceLineIds: [...node.sourceLineIds], sourceBlockIds: [...node.sourceBlockIds], evidence: { ...node.evidence },
      status: 'needs_review', reviewReasons: ['PIXEL_HEURISTIC_REQUIRES_REVIEW', 'CHECKBOX_LABEL_NOT_ASSOCIATED'] });
    draft.structure.freeText = draft.structure.freeText.filter(id => id !== node.id);
  }
  return draft;
}
