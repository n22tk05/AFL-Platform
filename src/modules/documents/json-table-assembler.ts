import type { DocumentOcrResult } from '@/shared/document-extraction.types';
import type { DocumentJsonExport, SourceLine, SourceBlock } from '@/shared/document-export.types';
import { DocumentPipelineError } from './errors';
/** No text grouping fallback. Convert provider Unicode code-point offsets to
 * export UTF-16 offsets without changing source text, spans or values. */
export function assembleTablesFromOcr(ocr: DocumentOcrResult, lines: SourceLine[], blocks: SourceBlock[]): DocumentJsonExport['structure']['tables'] {
  const codePoints = Array.from(ocr.fullText), offsets = [0];
  for (const char of codePoints) offsets.push(offsets[offsets.length-1] + char.length);
  return (ocr.tables ?? []).map(table => {
    const occupied = new Set<string>();
    return {
      id: table.id, page: table.page, headerRowCount: table.headerRowCount,
      evidence: { method: 'provider_layout', rule: null, verified: false }, status: 'needs_review',
      rows: table.rows.map((row, rowIndex) => {
        let columnIndex = 0;
        return row.map(cell => {
          if (!Number.isInteger(cell.rowSpan) || cell.rowSpan < 1 || rowIndex + cell.rowSpan > table.rows.length
            || !Number.isInteger(cell.columnSpan) || cell.columnSpan < 1 || cell.columnSpan > 1000) throw new DocumentPipelineError('OCR_INVALID_RESPONSE');
          while(occupied.has(rowIndex + ':' + columnIndex)) columnIndex++;
          const sourceRanges = cell.sourceRanges.map(r => ({ start: offsets[r.start] ?? -1, end: offsets[r.end] ?? -1 }));
          const result = { rowIndex, columnIndex, rowSpan: cell.rowSpan, columnSpan: cell.columnSpan,
            rawValue: cell.text, normalizedValue: cell.text, sourceRanges,
            sourceLineIds: lines.filter(line => sourceRanges.some(r => line.start < r.end && line.end > r.start)).map(line => line.id),
            sourceBlockIds: blocks.filter(b => b.kind === 'line' && b.page === table.page && cell.sourceLineIds?.includes(b.providerId)).map(b => b.id) };
          for(let r=rowIndex; r<rowIndex+cell.rowSpan; r++) for(let c=columnIndex; c<columnIndex+cell.columnSpan; c++) occupied.add(r + ':' + c);
          columnIndex += cell.columnSpan; return result;
        });
      }),
    };
  });
}
