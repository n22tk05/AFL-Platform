import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleJson } from '@/modules/documents/json-assembler';
import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { NormalizedBoundingBox } from '@/shared/contracts';
import { assembleMultipageReviewDraft, type FormRecognitionPageInput } from '../services/multipage-form-recognition';

function candidate(candidateId: string, coords: NormalizedBoundingBox, source: FieldCandidate['source'] = 'writing_guide'): FieldCandidate {
  const rect = { x: coords[1] * 1000, y: coords[0] * 1000, width: (coords[3] - coords[1]) * 1000, height: (coords[2] - coords[0]) * 1000 };
  return { candidateId, source, rect, aspectRatio: rect.width / rect.height, areaRatio: rect.width * rect.height / 1_000_000,
    contourArea: rect.width * rect.height, rectangularity: 1, parentIndex: -1, childIndex: -1 };
}

function page(pageNumber: number, lines: { text: string; coords: NormalizedBoundingBox }[], candidates: FieldCandidate[]): FormRecognitionPageInput {
  const document = assembleJson({ provider: 'vietocr', fullText: lines.map(line => line.text).join('\n'),
    lines: lines.map((line, index) => ({ id: `line_${index}`, text: line.text, boundingBox: line.coords,
      confidence: 0.95, page: 1, tokenIds: [] })), tokens: [], pageCount: 1, warnings: [] },
  { documentId: `page-${pageNumber}`, mimeType: 'image/png', imageDimensions: { width: 1000, height: 1000 } });
  return { pageNumber, width: 1000, height: 1000, document, candidates };
}

const form = { formId: 'FORM_TEST', formCode: 'FORM-TEST', formTitle: 'Biểu mẫu thử' };

test('same local OCR and geometry IDs on separate pages remain unique and page-bound', () => {
  const pages = [page(1, [{ text: 'Họ và tên: ........', coords: [0.2, 0.1, 0.22, 0.8] }],
    [candidate('guide', [0.2, 0.36, 0.225, 0.8])]),
  page(2, [{ text: 'Địa chỉ: ........', coords: [0.2, 0.1, 0.22, 0.8] }],
    [candidate('guide', [0.2, 0.32, 0.225, 0.8])])];
  const draft = assembleMultipageReviewDraft({ ...form, pages });
  assert.deepEqual(draft.manifest.boxes.map(box => box.boxId), ['p1_box_001', 'p2_box_001']);
  assert.deepEqual(draft.manifest.boxes.map(box => box.pageNumber), [1, 2]);
  assert.deepEqual(draft.manifest.boxes.map(box => box.inputRegions?.[0].pageNumber), [1, 2]);
  assert.deepEqual(draft.manifest.boxes.map(box => box.recognition?.sourceCandidateIds), [['p1_guide'], ['p2_guide']]);
  assert.deepEqual(draft.evidence.map(item => item.pageNumber), [1, 2]);
  assert.deepEqual(draft.pageReviews.map(item => item.regions[0]?.candidateId), ['p1_guide', 'p2_guide']);
  assert.equal(draft.summary?.detectedFields, 2);
});

test('notes-only page is retained for review without generating a ghost field', () => {
  const noteLines = [{ text: 'Ghi chú:', coords: [0.05, 0.1, 0.075, 0.3] as NormalizedBoundingBox },
    ...Array.from({ length: 8 }, (_, index) => ({ text: 'Nội dung hướng dẫn chỉ để đọc, không phải trường cần kê khai.',
      coords: [0.1 + index * 0.06, 0.1, 0.125 + index * 0.06, 0.9] as NormalizedBoundingBox }))];
  const draft = assembleMultipageReviewDraft({ ...form, pages: [
    page(1, [{ text: 'Họ và tên: ........', coords: [0.2, 0.1, 0.22, 0.8] }], [candidate('guide', [0.2, 0.36, 0.225, 0.8])]),
    page(2, noteLines, noteLines.slice(1).map((line, index) => candidate(`paragraph_${index}`, line.coords, 'field_row'))),
  ] });
  assert.equal(draft.manifest.boxes.length, 1);
  assert.equal(draft.pageReviews[1].summary.detectedFields, 0);
  assert.equal(draft.pageReviews[1].regions.length, 8);
  assert.ok(draft.pageReviews[1].regions.every(region => region.pageNumber === 2 && region.reason === 'NOTES_ONLY_PAGE_REVIEW_REQUIRED'));
});

function matrixPage(pageNumber: number, withHeader: boolean, shift = 0,
  openTopText?: string | { ordinal: string; description: string }): FormRecognitionPageInput {
  const columns = [[0.05, 0.12], [0.12, 0.65], [0.65, 0.78], [0.78, 0.9]];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  const candidates: FieldCandidate[] = [];
  const count = withHeader ? 9 : 3;
  for (let row = 0; row < count; row++) for (let column = 0; column < 4; column++) {
    const top = withHeader ? 0.2 + row * 0.075 : 0.1 + row * 0.08;
    const left = columns[column][0] + shift, right = columns[column][1] + shift;
    candidates.push(candidate(`matrix_${row}_${column}`, [top, left, top + (withHeader ? 0.075 : 0.08), right], 'closed_contour'));
    const text = withHeader && row === 0 ? ['STT', 'Các dạng khuyết tật', 'Có', 'Không'][column]
      : column === 1 ? `Tình trạng ${pageNumber}-${row}` : '';
    if (text) lines.push({ text, coords: [top + 0.01, left + 0.005, top + 0.04, right - 0.005] });
  }
  if (typeof openTopText === 'string') lines.push({ text: openTopText, coords: [0.055, 0.06, 0.095, 0.65] });
  else if (openTopText) lines.push({ text: openTopText.ordinal, coords: [0.055, 0.06, 0.08, 0.115] },
    { text: openTopText.description, coords: [0.055, 0.125, 0.095, 0.65] });
  return page(pageNumber, lines, candidates);
}

test('a continued yes/no matrix carries column meaning across pages but still requires review', () => {
  const draft = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), matrixPage(2, false)] });
  const secondPage = draft.manifest.boxes.filter(box => box.pageNumber === 2);
  assert.deepEqual(secondPage.map(box => box.rawText), [
    'Tình trạng 2-0 — Có', 'Tình trạng 2-0 — Không',
    'Tình trạng 2-1 — Có', 'Tình trạng 2-1 — Không',
    'Tình trạng 2-2 — Có', 'Tình trạng 2-2 — Không',
  ]);
  assert.ok(secondPage.every(box => box.inputKind === 'checkbox' && box.recognition?.status === 'needs_review'
    && box.recognition.reviewReasons.includes('TABLE_HEADER_CARRIED')));
  assert.ok(draft.pageReviews[0].continuationHeader);
});

test('a changed grid or intervening notes page cannot inherit an old table header', () => {
  const changed = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), matrixPage(2, false, 0.06)] });
  assert.ok(changed.manifest.boxes.filter(box => box.pageNumber === 2)
    .every(box => !box.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED')));
  const noteLines = [{ text: 'Ghi chú:', coords: [0.05, 0.1, 0.075, 0.3] as NormalizedBoundingBox },
    ...Array.from({ length: 8 }, (_, index) => ({ text: 'Nội dung hướng dẫn chỉ để đọc, không phải trường cần kê khai.',
      coords: [0.1 + index * 0.06, 0.1, 0.125 + index * 0.06, 0.9] as NormalizedBoundingBox }))];
  const notes = page(2, noteLines, noteLines.slice(1).map((line, index) => candidate(`paragraph_${index}`, line.coords, 'field_row')));
  const separated = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), notes, matrixPage(3, false)] });
  assert.ok(separated.manifest.boxes.filter(box => box.pageNumber === 3)
    .every(box => !box.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED')));
});

test('a later table header does not erase earlier carried rows with broken description contours', () => {
  const columns = [[0.05, 0.12], [0.12, 0.65], [0.65, 0.78], [0.78, 0.9]];
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
    const top = 0.1 + row * 0.08;
    const cell = candidate(`continued_${row}_${column}`, [top, columns[column][0], top + 0.08, columns[column][1]], 'closed_contour');
    candidates.push(row < 2 && column === 1 ? { ...cell, isContainer: true } : cell);
    if (column === 1) lines.push({ text: `Tình trạng ${row}`, coords: [top + 0.01, 0.13, top + 0.04, 0.6] });
  }
  for (let column = 0; column < 3; column++) {
    const boundaries = [[0.05, 0.2], [0.2, 0.55], [0.55, 0.9]];
    candidates.push(candidate(`new_header_${column}`, [0.6, boundaries[column][0], 0.68, boundaries[column][1]], 'closed_contour'));
    lines.push({ text: ['STT', 'Họ và tên', 'Mối quan hệ'][column],
      coords: [0.61, boundaries[column][0] + 0.01, 0.65, boundaries[column][1] - 0.01] });
  }
  const draft = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), page(2, lines, candidates)] });
  const carried = draft.manifest.boxes.filter(box => box.pageNumber === 2 && box.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED'));
  assert.deepEqual(carried.map(box => box.rawText), [
    'Tình trạng 0 — Có', 'Tình trạng 0 — Không',
    'Tình trạng 1 — Có', 'Tình trạng 1 — Không',
    'Tình trạng 2 — Có', 'Tình trạng 2 — Không',
  ]);
  assert.ok(carried.every(box => box.recognition?.status === 'needs_review'));
});

test('a framed open-top continuation row is proposed from OCR and marked as inferred', () => {
  const continuation = matrixPage(2, false, 0, '34 Tình trạng mở đầu');
  const frame = { ...candidate('frame', [0.05, 0.05, 0.9, 0.92], 'closed_contour'), isContainer: true };
  const draft = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), { ...continuation,
    candidates: [frame, ...continuation.candidates] }] });
  const inferred = draft.manifest.boxes.filter(box => box.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED'));
  assert.deepEqual(inferred.map(box => box.rawText), ['34 Tình trạng mở đầu — Có', '34 Tình trạng mở đầu — Không']);
  assert.ok(inferred.every(box => box.pageNumber === 2 && box.recognition?.status === 'needs_review'));
  const split = matrixPage(2, false, 0, { ordinal: '3.4', description: 'Tình trạng mở đầu' });
  const splitDraft = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), { ...split,
    candidates: [frame, ...split.candidates] }] });
  assert.deepEqual(splitDraft.manifest.boxes.filter(box => box.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED'))
    .map(box => box.rawText), ['3.4 Tình trạng mở đầu — Có', '3.4 Tình trạng mở đầu — Không']);
  const heading = matrixPage(2, false, 0, 'Thông tin hướng dẫn');
  const rejected = assembleMultipageReviewDraft({ ...form, pages: [matrixPage(1, true), { ...heading,
    candidates: [frame, ...heading.candidates] }] });
  assert.equal(rejected.manifest.boxes.filter(box => box.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED')).length, 0);
});

test('page order and per-page OCR frame must be exact', () => {
  const first = page(1, [], []);
  assert.throws(() => assembleMultipageReviewDraft({ ...form, pages: [first, { ...first, pageNumber: 3 }] }), /INVALID_RECOGNITION_PAGES/);
  assert.throws(() => assembleMultipageReviewDraft({ ...form, pages: [first, { ...first, pageNumber: 1 }] }), /INVALID_RECOGNITION_PAGES/);
  assert.throws(() => assembleMultipageReviewDraft({ ...form, pages: [{ ...first, width: 999 }] }), /OCR_FRAME_MISMATCH/);
  assert.throws(() => assembleMultipageReviewDraft({ ...form, pages: [{ ...first,
    document: { ...first.document, pages: [{ ...first.document.pages[0], page: 2 }] } }] }), /OCR_FRAME_MISMATCH/);
  assert.throws(() => assembleMultipageReviewDraft({ ...form, pages: [] }), /INVALID_RECOGNITION_PAGES/);
});
