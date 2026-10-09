import type { DocumentJsonExport, GroundedNode } from '@/shared/document-export.types';
import { extractFieldPairs } from './json-content-classifier';
export function extractFields(nodes: GroundedNode[]): DocumentJsonExport['structure']['fields'] {
  return nodes.flatMap(node => {
    if (!['field_label_value', 'field_label'].includes(node.type)) return [];
    const pairs = node.type === 'field_label' ? [{ label: node.text, rawValue: null, valueState: 'blank' as const }] : extractFieldPairs(node.text);
    return pairs.map((pair, i) => ({
      id: `field-${node.id}-${i}`, nodeId: node.id, ...pair,
      normalizedValue: pair.rawValue && /(?:\s*[._…]){2,}\s*$/u.test(pair.rawValue) ? pair.rawValue.replace(/(?:\s*[._…]){2,}\s*$/u, '').trim() : pair.rawValue,
      status: 'needs_review' as const, evidence: { ...node.evidence },
      reviewReasons: ['TEXT_PATTERN_NOT_VISUAL_VERIFICATION', ...(pair.rawValue && /(?:\s*[._…]){2,}\s*$/u.test(pair.rawValue) ? ['DOTTED_PADDING_REMOVED'] : [])],
      sourceLineIds: [...node.sourceLineIds], sourceBlockIds: [...node.sourceBlockIds],
    }));
  });
}
