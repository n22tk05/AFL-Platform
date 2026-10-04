import type { PixelRect } from '@/modules/opencv/field-types';
import { normalizeOcrTextToMarkdown, escapeOcrText } from './markdown-normalizer';

export interface RecognizedCandidate {
  candidateId: string;
  rect: PixelRect;
  source: 'closed_contour' | 'checkbox' | 'field_row' | 'phrase_cluster';
  isContainer?: boolean;
  text: string;
  confidence?: number | null;
}

export interface CandidateAssemblyResult {
  markdown: string;
  rawText: string;
  warnings: string[];
}

interface VisualRow {
  top: number;
  bottom: number;
  centerY: number;
  height: number;
  items: RecognizedCandidate[];
}

/**
 * Cluster candidates into horizontal visual rows based on vertical overlap.
 */
function clusterIntoVisualRows(candidates: readonly RecognizedCandidate[]): VisualRow[] {
  if (candidates.length === 0) return [];

  // Sort by Y-center first
  const sorted = [...candidates].sort((a, b) => {
    const aCenter = a.rect.y + a.rect.height / 2;
    const bCenter = b.rect.y + b.rect.height / 2;
    return aCenter - bCenter || a.rect.x - b.rect.x;
  });

  const rows: VisualRow[] = [];

  for (const item of sorted) {
    const itemTop = item.rect.y;
    const itemBottom = item.rect.y + item.rect.height;
    const itemCenter = itemTop + item.rect.height / 2;
    const itemHeight = Math.max(1, item.rect.height);

    let matchedRow: VisualRow | null = null;
    let maxOverlap = 0;

    for (const row of rows) {
      const overlap = Math.max(0, Math.min(itemBottom, row.bottom) - Math.max(itemTop, row.top));
      const minH = Math.min(itemHeight, row.height);
      const overlapRatio = overlap / minH;

      if (overlapRatio >= 0.35 && overlapRatio > maxOverlap) {
        maxOverlap = overlapRatio;
        matchedRow = row;
      }
    }

    if (matchedRow) {
      matchedRow.items.push(item);
      matchedRow.top = Math.min(matchedRow.top, itemTop);
      matchedRow.bottom = Math.max(matchedRow.bottom, itemBottom);
      matchedRow.height = matchedRow.bottom - matchedRow.top;
      matchedRow.centerY = (matchedRow.top + matchedRow.bottom) / 2;
    } else {
      rows.push({
        top: itemTop,
        bottom: itemBottom,
        centerY: itemCenter,
        height: itemHeight,
        items: [item],
      });
    }
  }

  // Sort rows top-to-bottom and items within each row left-to-right
  rows.sort((a, b) => a.centerY - b.centerY);
  for (const row of rows) {
    row.items.sort((a, b) => a.rect.x - b.rect.x);
  }

  return rows;
}

/**
 * Check if a visual row consists solely of table cells (closed_contour)
 */
function isTableRow(row: VisualRow): boolean {
  return row.items.length >= 2 && row.items.every((it) => it.source === 'closed_contour');
}

/**
 * Assemble recognized candidates into structured Markdown matching the original document layout.
 */
export function assembleCandidatesToMarkdown(
  candidates: readonly RecognizedCandidate[],
  imageSize: { width: number; height: number },
): CandidateAssemblyResult {
  const warnings: string[] = [];

  // Filter out outer containers (isContainer: true) and empty items
  const validItems = candidates.filter((c) => !c.isContainer && c.text.trim().length > 0);

  if (validItems.length === 0) {
    return {
      markdown: '',
      rawText: '',
      warnings: ['Không có nội dung nhận diện từ các candidates.'],
    };
  }

  const rows = clusterIntoVisualRows(validItems);
  const rawTextLines: string[] = [];
  const assembledLines: string[] = [];

  let rowIndex = 0;
  while (rowIndex < rows.length) {
    const row = rows[rowIndex];

    // Check if this row starts a Markdown Table (consecutive table rows with same or similar column counts)
    if (isTableRow(row)) {
      const tableRows: VisualRow[] = [];
      let nextRowIdx = rowIndex;

      while (nextRowIdx < rows.length && isTableRow(rows[nextRowIdx])) {
        tableRows.push(rows[nextRowIdx]);
        nextRowIdx++;
      }

      if (tableRows.length >= 2) {
        // Find max column count
        const colCount = Math.max(...tableRows.map((r) => r.items.length));
        const markdownTableLines: string[] = [];

        // Header row
        const headerCells = tableRows[0].items.map((it) => escapeOcrText(it.text.trim()));
        while (headerCells.length < colCount) headerCells.push('');
        markdownTableLines.push(`| ${headerCells.join(' | ')} |`);
        markdownTableLines.push(`| ${Array(colCount).fill(':---').join(' | ')} |`);

        // Data rows
        for (let r = 1; r < tableRows.length; r++) {
          const cells = tableRows[r].items.map((it) => escapeOcrText(it.text.trim()));
          while (cells.length < colCount) cells.push('');
          markdownTableLines.push(`| ${cells.join(' | ')} |`);
        }

        const tableText = '\n' + markdownTableLines.join('\n') + '\n';
        assembledLines.push(tableText);
        rawTextLines.push(...tableRows.map((r) => r.items.map((it) => it.text.trim()).join('  ')));
        rowIndex = nextRowIdx;
        continue;
      }
    }

    // Normal non-table visual row: align fields matching original image
    const rowRawText = row.items.map((it) => it.text.trim()).join('  ');
    rawTextLines.push(rowRawText);

    if (row.items.length === 1) {
      assembledLines.push(row.items[0].text.trim());
    } else {
      // Multiple items on the same line (e.g. "Ngày sinh: ..." and "Giới tính: ...")
      // Check if items include checkboxes and labels
      const formattedSegments: string[] = [];
      let i = 0;

      while (i < row.items.length) {
        const item = row.items[i];
        const nextItem = row.items[i + 1];

        // If item is checkbox and followed closely by label text
        if (item.source === 'checkbox' && nextItem && nextItem.source !== 'checkbox') {
          const distance = nextItem.rect.x - (item.rect.x + item.rect.width);
          if (distance <= 40) {
            formattedSegments.push(`${item.text.trim()} ${nextItem.text.trim()}`);
            i += 2;
            continue;
          }
        }

        formattedSegments.push(item.text.trim());
        i++;
      }

      // Join multi-field inline row with non-breaking spaced separator to preserve visual columns
      assembledLines.push(formattedSegments.join(' &nbsp;&nbsp;&nbsp;&nbsp; '));
    }

    rowIndex++;
  }

  const rawText = rawTextLines.join('\n');
  const preMarkdown = assembledLines.join('\n');

  // Normalize through administrative document standard normalizer (Nghị định 30/2020/NĐ-CP)
  const normalizedMarkdown = normalizeOcrTextToMarkdown(preMarkdown);

  return {
    markdown: normalizedMarkdown,
    rawText,
    warnings,
  };
}
