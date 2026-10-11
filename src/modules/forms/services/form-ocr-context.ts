import type { DocumentJsonExport, ExportBox } from '@/shared/document-export.types';
import type { FormGeometricManifest } from '@/shared/contracts';

export interface FormOcrContext {
  schemaVersion: '1.0.0';
  pages: {
    pageNumber: number;
    coordinateSystem: 'normalized-xyxy';
    rawText: string;
    blocks: { id: string; order: number; text: string; bbox: ExportBox | null; confidence: number | null }[];
  }[];
}

const MAX_CONTEXT_BYTES = 192 * 1024;
const MAX_TOTAL_TEXT = 100_000;
const MAX_BLOCKS = 1500;

export function buildFormOcrContext(documents: DocumentJsonExport[]): FormOcrContext {
  const context: FormOcrContext = { schemaVersion: '1.0.0', pages: documents.map((document, index) => ({
    pageNumber: index + 1,
    coordinateSystem: 'normalized-xyxy',
    rawText: document.rawText,
    blocks: document.blocks.map(block => ({ id: block.id, order: block.order, text: block.text,
      bbox: block.bbox, confidence: block.confidence })),
  })) };
  return validateFormOcrContext(context, documents.length);
}

export function validateFormOcrContext(value: unknown, expectedPages: number): FormOcrContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_OCR_CONTEXT');
  const context = value as FormOcrContext;
  if (context.schemaVersion !== '1.0.0' || !Array.isArray(context.pages)
    || context.pages.length !== expectedPages || expectedPages < 1 || expectedPages > 20
    || new TextEncoder().encode(JSON.stringify(context)).byteLength > MAX_CONTEXT_BYTES) throw new Error('INVALID_OCR_CONTEXT');
  let textLength = 0;
  let blockCount = 0;
  for (const [index, page] of context.pages.entries()) {
    if (!page || page.pageNumber !== index + 1 || page.coordinateSystem !== 'normalized-xyxy' || typeof page.rawText !== 'string'
      || page.rawText.length > 12_000 || /\u0000/.test(page.rawText)
      || !Array.isArray(page.blocks)) throw new Error('INVALID_OCR_CONTEXT');
    textLength += page.rawText.length;
    const ids = new Set<string>();
    let previousOrder = -1;
    for (const block of page.blocks) {
      if (!block || typeof block.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(block.id)
        || ids.has(block.id) || !Number.isSafeInteger(block.order) || block.order <= previousOrder
        || typeof block.text !== 'string' || block.text.length > 1000 || /\u0000/.test(block.text)
        || (block.bbox !== null && (!Array.isArray(block.bbox) || block.bbox.length !== 4
          || block.bbox.some(coord => typeof coord !== 'number' || !Number.isFinite(coord) || coord < 0 || coord > 1)
          || block.bbox[0] >= block.bbox[2] || block.bbox[1] >= block.bbox[3]))
        || (block.confidence !== null && (typeof block.confidence !== 'number'
          || !Number.isFinite(block.confidence) || block.confidence < 0 || block.confidence > 1))) throw new Error('INVALID_OCR_CONTEXT');
      ids.add(block.id);
      previousOrder = block.order;
      textLength += block.text.length;
      blockCount++;
    }
  }
  if (textLength > MAX_TOTAL_TEXT || blockCount > MAX_BLOCKS) throw new Error('INVALID_OCR_CONTEXT');
  return { schemaVersion: '1.0.0', pages: context.pages.map(page => ({
    pageNumber: page.pageNumber, coordinateSystem: 'normalized-xyxy', rawText: page.rawText,
    blocks: page.blocks.map(block => ({ id: block.id, order: block.order, text: block.text,
      bbox: block.bbox === null ? null : [...block.bbox] as ExportBox, confidence: block.confidence })),
  })) };
}

export function validateOcrContextForManifest(value: unknown, manifest: FormGeometricManifest): FormOcrContext {
  return validateFormOcrContext(value, manifest.pages?.length ?? 1);
}
