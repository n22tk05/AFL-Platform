import type { DocumentOcrResult, OcrTable } from '@/shared/document-extraction.types';
import { normalizeOcrTextToMarkdown, escapeOcrText } from './markdown-normalizer';

export { escapeOcrText };

function plainMarkdown(text: string, ocr?: DocumentOcrResult): string {
  return normalizeOcrTextToMarkdown(text, ocr?.lines);
}

type TableRegion = { start: number; end: number; markdown: string };
function tableRegion(table: OcrTable, chars: string[]): TableRegion | null {
  const width = table.rows[0]?.length ?? 0;
  if (table.page !== 1 || table.headerRowCount !== 1 || table.rows.length < 2 || width < 2 || width > 30) return null;
  let first = -1, last = -1;
  const rows: string[][] = [];
  for (const row of table.rows) {
    if (row.length !== width) return null;
    const cells: string[] = [];
    for (const cell of row) {
      if (cell.rowSpan !== 1 || cell.columnSpan !== 1 || cell.sourceRanges.length !== 1) return null;
      const { start, end } = cell.sourceRanges[0];
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > chars.length || start < last) return null;
      if (chars.slice(start, end).join('') !== cell.text) return null;
      // Text between cells must be whitespace only. Never swallow an unassigned word.
      if (last >= 0 && chars.slice(last, start).join('').trim()) return null;
      if (first < 0) first = start;
      last = end;
      cells.push(escapeOcrText(cell.text.trim()).replace(/\r\n?|\n/g, '<br>'));
    }
    rows.push(cells);
  }
  if (first < 0) return null;
  // Only replace a complete block; don't move inline source text into a table.
  const before = chars.slice(0, first).join('');
  const after = chars.slice(last).join('');
  if (before.slice(before.lastIndexOf('\n') + 1).trim() || (last > 0 && chars[last - 1] !== '\n' && after.split('\n')[0].trim())) return null;
  const render = (row: string[]) => `| ${row.join(' | ')} |`;
  return { start: first, end: last, markdown: '\n\n' + [render(rows[0]), render(Array(width).fill('---')), ...rows.slice(1).map(render)].join('\n') + '\n\n' };
}

/** All words come from fullText. Ambiguous layout falls back to full source order. */
export function assembleMarkdown(ocr: DocumentOcrResult): { markdown: string; warnings: string[] } {
  if (!ocr.tables?.length) {
    return { markdown: plainMarkdown(ocr.fullText, ocr), warnings: [] };
  }

  const chars = Array.from(ocr.fullText);
  const warnings: string[] = [];
  const regions: TableRegion[] = [];
  for (const table of ocr.tables) {
    const region = tableRegion(table, chars);
    if (region) regions.push(region);
    else warnings.push('Bảng có cấu trúc chưa chắc chắn; đã giữ nguyên văn bản OCR để đối chiếu, không tự suy đoán ô.');
  }
  regions.sort((a, b) => a.start - b.start);
  // Conflicting source ranges invalidate all table transformations.
  if (regions.some((region, i) => i > 0 && region.start < regions[i - 1].end)) {
    return { markdown: plainMarkdown(ocr.fullText, ocr), warnings: [...warnings, 'Vùng bảng chồng lấn; đã giữ nguyên toàn văn OCR.'] };
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const region of regions) {
    parts.push(plainMarkdown(chars.slice(cursor, region.start).join(''), ocr), region.markdown);
    cursor = region.end;
  }
  parts.push(plainMarkdown(chars.slice(cursor).join(''), ocr));
  return { markdown: parts.join(''), warnings: Array.from(new Set(warnings)) };
}
