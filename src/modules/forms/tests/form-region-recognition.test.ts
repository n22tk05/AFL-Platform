import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleJson } from '@/modules/documents/json-assembler';
import { assembleFormManifest } from '../services/form-manifest-assembler';
import { nextPriorityReviewIndex, prioritizedReviewReasons } from '../services/form-region-recognition';
import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { NormalizedBoundingBox } from '@/shared/contracts';

function candidate(candidateId: string, coords: NormalizedBoundingBox, source: FieldCandidate['source'] = 'writing_guide'): FieldCandidate {
  const rect = { x: coords[1] * 1000, y: coords[0] * 1000, width: (coords[3] - coords[1]) * 1000, height: (coords[2] - coords[0]) * 1000 };
  return { candidateId, source, rect, aspectRatio: rect.width / rect.height, areaRatio: rect.width * rect.height / 1_000_000,
    contourArea: rect.width * rect.height, rectangularity: 1, parentIndex: -1, childIndex: -1 };
}
function recognize(lines: { text: string; coords: NormalizedBoundingBox }[], candidates: FieldCandidate[], confidence = 0.95) {
  const document = assembleJson({ provider: 'vietocr', fullText: lines.map(line => line.text).join('\n'),
    lines: lines.map((line, index) => ({ id: `line_${index}`, text: line.text, boundingBox: line.coords, confidence, page: 1, tokenIds: [] })),
    tokens: [], pageCount: 1, warnings: [] }, { documentId: 'synthetic-form', mimeType: 'image/png', imageDimensions: { width: 1000, height: 1000 } });
  return assembleFormManifest({ formId: 'FORM_TEST', formCode: 'FORM-TEST', formTitle: 'Biểu mẫu thử', width: 1000, height: 1000, document, candidates });
}

test('printed recipient line is static text, not a writable input region', () => {
  const result = recognize(
    [{ text: 'Kính gửi: Chủ tịch Ủy ban nhân dân xã (phường, đặc khu)', coords: [0.18, 0.18, 0.2, 0.77] }],
    [candidate('recipient_tail', [0.187, 0.76, 0.199, 0.897])],
  );
  assert.equal(result.manifest.boxes.length, 0);
  assert.deepEqual((result.regions ?? []).map(region => [region.role, region.reason]), [['static_text', 'STATIC_RECIPIENT_LINE']]);
});

test('a parenthetical recipient placeholder followed by a dotted guide remains a reviewable input', () => {
  const result = recognize(
    [{ text: 'Kính gửi: (Cơ quan đăng ký kinh doanh cấp tỉnh)', coords: [0.2752, 0.1869, 0.298, 0.6761] }],
    [{ ...candidate('recipient_placeholder', [0.2815, 0.6656, 0.2946, 0.7985]), guideStyle: 'dotted' }],
  );
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Cơ quan đăng ký kinh doanh cấp tỉnh');
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
  assert.ok(result.manifest.boxes[0].recognition?.reviewReasons.includes('LABEL_POSITION_ESTIMATED'));
  assert.notEqual(result.manifest.boxes[0].recognition?.status, 'approved');
});

test('a dotted suffix after the printed local construction authority stays editable', () => {
  const result = recognize(
    [{ text: 'Kính gửi: Sở Xây dựng.', coords: [0.194, 0.351, 0.213, 0.596] }],
    [candidate('local_authority_suffix', [0.195, 0.586, 0.209, 0.676])],
  );
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Sở Xây dựng (địa phương)');
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
});

test('leading dotted OCR artifacts are removed from labels without changing the input geometry', () => {
  const result = recognize(
    [{ text: '. Tên đơn vị:', coords: [0.25, 0.1, 0.27, 0.32] }],
    [candidate('organization_name', [0.251, 0.315, 0.269, 0.88])],
  );
  assert.equal(result.manifest.boxes[0].rawText, 'Tên đơn vị');
  assert.deepEqual(result.manifest.boxes[0].normalizedCoords, [0.251, 0.315, 0.269, 0.88]);
});

test('a tiny contour just before a prose line is not misclassified as a checkbox', () => {
  const prose = { text: 'cho ông (bà)...... có địa chỉ tại Việt Nam........ số điện thoại',
    coords: [0.625, 0.176, 0.646, 0.915] as NormalizedBoundingBox };
  const result = recognize([prose], [candidate('prose_glyph', [0.634, 0.164, 0.643, 0.175], 'checkbox')]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'prose_glyph'
    && region.reason === 'PROSE_ADJACENT_GLYPH_NOT_CHECKBOX'));
});

test('small checkbox candidates beside option text survive when grouped under a numbered choice question', () => {
  const result = recognize([
    { text: '[02]. Đối tượng tham gia được hỗ trợ:', coords: [0.28, 0.1, 0.30, 0.8] },
    { text: 'O Người thuộc hộ gia đình cận nghèo', coords: [0.32, 0.131, 0.34, 0.5] },
    { text: 'Người thuộc hộ gia đình nghèo đa chiều', coords: [0.35, 0.131, 0.37, 0.55] },
    { text: 'Ở Người thuộc hộ gia đình làm nông nghiệp, lâm nghiệp, ngư nghiệp và diêm nghiệp', coords: [0.38, 0.131, 0.398, 0.941] },
    { text: 'có mức sống trung bình', coords: [0.397, 0.13, 0.416, 0.376] },
  ], [
    candidate('near_poor', [0.323, 0.143, 0.336, 0.157], 'checkbox'),
    candidate('multidimensional_poverty', [0.353, 0.143, 0.366, 0.157], 'checkbox'),
    candidate('farmer_household', [0.383, 0.143, 0.396, 0.157], 'checkbox'),
  ]);
  assert.equal(result.manifest.boxes.length, 3, JSON.stringify({ boxes: result.manifest.boxes, regions: result.regions }));
  assert.ok(result.manifest.boxes.every(box => box.inputKind === 'checkbox' && box.role === 'checkbox'));
  assert.match(result.manifest.boxes[0].rawText, /cận nghèo/u);
  assert.match(result.manifest.boxes[1].rawText, /nghèo đa chiều/u);
  assert.match(result.manifest.boxes[2].rawText, /làm nông nghiệp.*có mức sống trung bình/u);
});

test('recipient label followed only by a numbered footnote keeps its blank guide as an input', () => {
  const result = recognize(
    [{ text: 'Kính gửi: (1)', coords: [0.18, 0.18, 0.2, 0.33] }],
    [candidate('blank_recipient', [0.189, 0.325, 0.2, 0.78])],
  );
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Kính gửi');
  assert.equal(result.manifest.boxes[0].role, 'input');
});

test('repeating table rows remain distinct and ordinal cells never become input instructions', () => {
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  const columns = [[0.05, 0.15], [0.15, 0.55], [0.55, 0.9]];
  const headings = ['STT', 'Họ và tên', 'Mối quan hệ'];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const top = 0.2 + row * 0.06, bottom = top + 0.06;
    candidates.push(candidate(`table_${row}_${column}`, [top, columns[column][0], bottom, columns[column][1]], 'closed_contour'));
    if (row === 0) lines.push({ text: headings[column], coords: [top + 0.006, columns[column][0] + 0.006, top + 0.03, columns[column][1] - 0.006] });
  }
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 4);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Họ và tên — dòng 1', 'Mối quan hệ — dòng 1', 'Họ và tên — dòng 2', 'Mối quan hệ — dòng 2']);
  assert.ok(result.manifest.boxes.every(box => box.inputRegions?.length === 1));
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'suggested'
    && box.recognition.reviewReasons.includes('TABLE_ROW_COLUMN_GROUNDED')));
});

test('a single table data row remains prioritized because repeated-column evidence is insufficient', () => {
  const candidates: FieldCandidate[] = [];
  const columns = [[0.05, 0.15], [0.15, 0.55], [0.55, 0.9]];
  for (let row = 0; row < 2; row++) for (let column = 0; column < columns.length; column++) {
    const top = 0.2 + row * 0.06, bottom = top + 0.06;
    candidates.push(candidate(`single_row_${row}_${column}`, [top, columns[column][0], bottom, columns[column][1]], 'closed_contour'));
  }
  const lines = [
    { text: 'STT', coords: [0.206, 0.056, 0.23, 0.144] as NormalizedBoundingBox },
    { text: 'Họ và tên', coords: [0.206, 0.156, 0.23, 0.544] as NormalizedBoundingBox },
    { text: 'Mối quan hệ', coords: [0.206, 0.556, 0.23, 0.894] as NormalizedBoundingBox },
  ];
  const result = recognize(lines, candidates);
  assert.ok(result.manifest.boxes.length > 0);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'
    && box.recognition.reviewReasons.includes('TABLE_ROW_COLUMN_GROUNDING')));
});

test('table headers omit explanatory parentheticals and trailing footnote markers from field labels', () => {
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  const columns = [[0.05, 0.15], [0.15, 0.4], [0.4, 0.65], [0.65, 0.9]];
  const headings = ['STT', 'Họ và tên (Trường hợp nhận trợ cấp tuất tháng qua tài khoản ATM',
    'Mã số BHXH/số CMND/số căn cước công dân/ hộ chiếu (3)', 'Loại trọ cấp'];
  for (let row = 0; row < 3; row++) for (let column = 0; column < columns.length; column++) {
    const top = 0.2 + row * 0.06, bottom = top + 0.06;
    candidates.push(candidate(`annotated_table_${row}_${column}`, [top, columns[column][0], bottom, columns[column][1]], 'closed_contour'));
    if (row === 0) lines.push({ text: headings[column], coords: [top + 0.006, columns[column][0] + 0.006, top + 0.03, columns[column][1] - 0.006] });
  }
  lines.push({ text: 'ghi bổ sung số tài khoản)', coords: [0.232, 0.2, 0.248, 0.4] });
  const result = recognize(lines, candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Họ và tên — dòng 1', 'Mã số BHXH/số CMND/số căn cước công dân/hộ chiếu — dòng 1', 'Loại trợ cấp — dòng 1',
    'Họ và tên — dòng 2', 'Mã số BHXH/số CMND/số căn cước công dân/hộ chiếu — dòng 2', 'Loại trợ cấp — dòng 2',
  ]);
});

test('nested birth-date subheaders distinguish adjacent data cells', () => {
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (const [id, left, right, title] of [
    ['ordinal', 0.05, 0.12, 'STT'], ['name', 0.12, 0.42, 'Họ và tên'],
    ['address', 0.7, 0.88, 'Địa chỉ'],
  ] as const) {
    candidates.push({ ...candidate(`header_${id}`, [0.2, left, 0.4, right], 'closed_contour'), isContainer: id === 'address' });
    lines.push({ text: title, coords: [0.22, left + 0.01, 0.245, right - 0.01] });
  }
  candidates.push(candidate('address_letter_artifact', [0.25, 0.77, 0.266, 0.785], 'checkbox'));
  candidates.push(candidate('birth_parent', [0.2, 0.42, 0.28, 0.7], 'closed_contour'));
  lines.push({ text: 'Ngày, tháng, năm sinh', coords: [0.215, 0.44, 0.245, 0.68] });
  for (const [id, left, right, title] of [
    ['male', 0.42, 0.56, 'Nam'], ['female', 0.56, 0.7, 'Nữ'],
  ] as const) {
    candidates.push(candidate(`subheader_${id}`, [0.28, left, 0.4, right], 'closed_contour'));
    lines.push({ text: title, coords: [0.31, left + 0.025, 0.34, right - 0.025] });
  }
  const columns = [[0.05, 0.12], [0.12, 0.42], [0.42, 0.56], [0.56, 0.7], [0.7, 0.88]];
  for (let row = 0; row < 2; row++) for (let column = 0; column < columns.length; column++) {
    const top = 0.4 + row * 0.06;
    candidates.push(candidate(`data_${row}_${column}`, [top, columns[column][0], top + 0.06, columns[column][1]], 'closed_contour'));
  }
  const result = recognize(lines, candidates);
  const labels = result.manifest.boxes.filter(box => box.inputKind === 'table_cell').map(box => box.rawText);
  assert.ok(labels.includes('Ngày, tháng, năm sinh — Nam — dòng 1'));
  assert.ok(labels.includes('Ngày, tháng, năm sinh — Nữ — dòng 1'));
  assert.ok(labels.includes('Ngày, tháng, năm sinh — Nam — dòng 2'));
  assert.ok(labels.includes('Ngày, tháng, năm sinh — Nữ — dòng 2'));
  assert.ok(labels.includes('Địa chỉ — dòng 1'));
  assert.ok(labels.includes('Địa chỉ — dòng 2'));
});

test('yes/no matrix grounds checkbox instructions in both row and column labels', () => {
  const columns = [[0.05, 0.6], [0.6, 0.75], [0.75, 0.9]];
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) {
    const top = 0.2 + row * 0.08, bottom = top + 0.08;
    candidates.push(candidate(`choice_${row}_${column}`, [top, columns[column][0], bottom, columns[column][1]], 'closed_contour'));
    const text = row === 0 ? ['Thông tin', 'Có', 'Không'][column] : column === 0 ? 'Tự thực hiện hoạt động' : '';
    if (text) lines.push({ text, coords: [top + 0.01, columns[column][0] + 0.006, top + 0.04, columns[column][1] - 0.006] });
  }
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 2);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Tự thực hiện hoạt động — Có', 'Tự thực hiện hoạt động — Không']);
  assert.ok(result.manifest.boxes.every(box => box.inputKind === 'checkbox'));
});

test('a numbered open-bottom choice row is inferred for review without printed-label glyph fields', () => {
  const columns = [[0.1, 0.45], [0.45, 0.56], [0.56, 0.69], [0.69, 0.8], [0.8, 0.92]];
  const titles = ['Các hoạt động', 'Thực hiện được', 'Thực hiện được nhưng cần trợ giúp', 'Không thực hiện được', 'Không xác định được'];
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (let column = 0; column < columns.length; column++) {
    candidates.push(candidate(`header_${column}`, [0.4, columns[column][0], 0.5, columns[column][1]], 'closed_contour'));
    lines.push({ text: titles[column], coords: [0.42, columns[column][0] + 0.005, 0.46, columns[column][1] - 0.005] });
  }
  for (let row = 0; row < 7; row++) for (let column = 0; column < columns.length; column++) {
    const top = 0.5 + row * 0.045;
    candidates.push(candidate(`row_${row}_${column}`, [top, columns[column][0], top + 0.045, columns[column][1]], 'closed_contour'));
    if (column === 0) lines.push({ text: `${row + 1}. Hoạt động ${row + 1}`,
      coords: [top + 0.008, columns[column][0] + 0.005, top + 0.033, columns[column][1] - 0.005] });
  }
  candidates.push(candidate('printed_glyph', [0.74, 0.2, 0.75, 0.215], 'checkbox'));
  candidates.push(candidate('page_edge', [0.985, 0.15, 1, 0.21], 'writing_guide'));
  lines.push({ text: 'B. Làm việc gia đình', coords: [0.83, 0.12, 0.85, 0.43] });
  lines.push({ text: 'và lao động phù hợp', coords: [0.86, 0.12, 0.88, 0.43] });
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 32);
  const inferred = result.manifest.boxes.filter(box => box.recognition?.reviewReasons.includes('OPEN_BOTTOM_ROW_INFERRED'));
  assert.deepEqual(inferred.map(box => box.rawText), titles.slice(1).map(title =>
    `8. Làm việc gia đình và lao động phù hợp — ${title}`));
  assert.ok(inferred.every(box => box.recognition?.status === 'needs_review'
    && box.recognition.reviewReasons.includes('OCR_ORDINAL_INFERRED')),
  JSON.stringify(inferred.map(box => box.recognition)));
  assert.ok(!result.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('printed_glyph')));
  assert.ok(!result.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('page_edge')));
  const rejected = recognize(lines.map(line => line.text.startsWith('B.') ? { ...line, text: '12. Làm việc gia đình' } : line), candidates);
  assert.equal(rejected.manifest.boxes.filter(box => box.recognition?.reviewReasons.includes('OPEN_BOTTOM_ROW_INFERRED')).length, 0);
});

test('numbered yes/no matrix treats the description column as a label, not an input', () => {
  const columns = [[0.05, 0.12], [0.12, 0.65], [0.65, 0.78], [0.78, 0.9]];
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
    const top = 0.2 + row * 0.08, bottom = top + 0.08;
    const cellCoords: NormalizedBoundingBox = row === 2 && column === 1
      ? [top + 0.01, columns[column][0] + 0.03, top + 0.05, columns[column][0] + 0.05]
      : [top, columns[column][0], bottom, columns[column][1]];
    candidates.push(candidate(`matrix_${row}_${column}`, cellCoords, 'closed_contour'));
    const text = row === 0 ? ['STT', 'Các dạng khuyết tật', 'Có', 'Không'][column]
      : column === 0 ? String(row) : column === 1 ? `Mô tả tình trạng ${row}` : '';
    if (text) lines.push({ text, coords: [top + 0.01, columns[column][0] + 0.006, top + 0.045, columns[column][1] - 0.006] });
  }
  const result = recognize(lines, candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    '1 Mô tả tình trạng 1 — Có', '1 Mô tả tình trạng 1 — Không',
    '2 Mô tả tình trạng 2 — Có', '2 Mô tả tình trạng 2 — Không',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.inputKind === 'checkbox'));
  assert.ok(result.regions?.filter(region => region.reason === 'TABLE_ROW_LABEL').length === 4);
});

test('numbered matrix does not repeat an ordinal already included in a spanning OCR line', () => {
  const columns = [[0.05, 0.12], [0.12, 0.65], [0.65, 0.78], [0.78, 0.9]];
  const candidates = columns.flatMap(([left, right], column) => [0, 1].map(row =>
    candidate(`spanning_${row}_${column}`, [0.2 + row * 0.08, left, 0.28 + row * 0.08, right], 'closed_contour')));
  const result = recognize([
    ...['STT', 'Các dạng khuyết tật', 'Có', 'Không'].map((text, column) =>
      ({ text, coords: [0.21, columns[column][0] + 0.006, 0.25, columns[column][1] - 0.006] as NormalizedBoundingBox })),
    { text: '1.5 Tình trạng cần đánh dấu', coords: [0.29, 0.075, 0.33, 0.62] },
  ], candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText),
    ['1.5 Tình trạng cần đánh dấu — Có', '1.5 Tình trạng cần đánh dấu — Không']);
});

test('ordinal alone cannot make a missing matrix description look grounded', () => {
  const columns = [[0.05, 0.12], [0.12, 0.65], [0.65, 0.78], [0.78, 0.9]];
  const candidates = columns.flatMap(([left, right], column) => [0, 1].map(row =>
    candidate(`missing_${row}_${column}`, [0.2 + row * 0.08, left, 0.28 + row * 0.08, right], 'closed_contour')));
  const result = recognize([
    ...['STT', 'Các dạng khuyết tật', 'Có', 'Không'].map((text, column) =>
      ({ text, coords: [0.21, columns[column][0] + 0.006, 0.25, columns[column][1] - 0.006] as NormalizedBoundingBox })),
    { text: '1.5', coords: [0.29, 0.06, 0.33, 0.11] },
  ], candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['', '']);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('TABLE_LABEL_MISSING')));
});

test('precise writing guides replace text-wide rows; heading, motto, description and signature do not become inputs', () => {
  const lines = [
    { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', coords: [0.05, 0.15, 0.07, 0.85] as NormalizedBoundingBox },
    { text: 'Độc lập - Tự do - Hạnh phúc', coords: [0.09, 0.2, 0.11, 0.8] as NormalizedBoundingBox },
    { text: 'Họ và tên: ................................', coords: [0.2, 0.1, 0.22, 0.9] as NormalizedBoundingBox },
    { text: 'Đây là đoạn mô tả in sẵn, không phải chỗ viết.', coords: [0.3, 0.1, 0.32, 0.9] as NormalizedBoundingBox },
    { text: 'NGƯỜI LÀM ĐƠN', coords: [0.8, 0.5, 0.82, 0.9] as NormalizedBoundingBox },
  ];
  const result = recognize(lines, [...lines.map((line, index) => candidate(`row_${index}`, line.coords, 'field_row')), candidate('guide', [0.2, 0.4, 0.225, 0.9])]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Họ và tên');
  assert.deepEqual(result.manifest.boxes[0].normalizedCoords, [0.2, 0.4, 0.225, 0.9]);
  assert.equal(result.summary?.excludedRegions, 5);
});

test('a writing guide below an explicit signature instruction is excluded from citizen inputs', () => {
  const instruction = { text: '(Ký, ghi rõ họ, chữ đệm, tên)', coords: [0.766, 0.545, 0.783, 0.801] as NormalizedBoundingBox };
  const result = recognize([instruction], [candidate('signature_line', [0.838, 0.547, 0.849, 0.798], 'writing_guide')]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'signature_line'
    && region.role === 'static_text' && region.reason === 'SIGNATURE_GUIDE_NOT_CITIZEN_INPUT'));
});

test('writing guides near ordinary text remain reviewable inputs', () => {
  const label = { text: 'Nơi cư trú', coords: [0.766, 0.545, 0.783, 0.65] as NormalizedBoundingBox };
  const result = recognize([label], [candidate('address_line', [0.8, 0.545, 0.811, 0.798], 'writing_guide')]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Nơi cư trú');
});

test('tiny letter contours inside a printed heading or mark instruction are not checkboxes', () => {
  const result = recognize([
    { text: 'III. Thông tin về tình trạng khuyết tật', coords: [0.08, 0.1, 0.105, 0.7] },
    { text: '1. Thông tin về dạng khuyết tật (Đánh dấu x vào ô tương ứng)', coords: [0.11, 0.1, 0.135, 0.8] },
  ], [candidate('heading_glyph', [0.085, 0.2, 0.094, 0.212], 'checkbox'),
    candidate('instruction_glyph', [0.115, 0.3, 0.124, 0.312], 'checkbox')]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.every(region => region.reason === 'PRINTED_STRUCTURE_ARTIFACT'));
});

test('tiny square-shaped glyphs inside ordinary printed prose are not citizen checkboxes', () => {
  const result = recognize([{ text: 'Tôi xin trân trọng cảm ơn người tiếp nhận', coords: [0.2, 0.1, 0.23, 0.8] }],
    [candidate('printed_glyph', [0.205, 0.35, 0.218, 0.365], 'checkbox'),
      candidate('large_printed_glyph', [0.205, 0.45, 0.219, 0.469], 'checkbox'),
      candidate('actual_choice', [0.27, 0.12, 0.29, 0.14], 'checkbox')]);
  assert.ok(!result.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('printed_glyph')));
  assert.ok(!result.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('large_printed_glyph')));
  assert.ok(result.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('actual_choice')));
  assert.ok(result.regions?.some(region => region.candidateId === 'printed_glyph' && region.reason === 'PRINTED_STRUCTURE_ARTIFACT'));
});

test('a motto underline and a prose-wide row do not become writing fields', () => {
  const result = recognize([
    { text: 'Độc lập - Tự do - Hạnh phúc', coords: [0.145, 0.3, 0.167, 0.7] },
    { text: 'Tôi đề nghị được xem xét và giải quyết theo quy định.', coords: [0.45, 0.16, 0.475, 0.87] },
  ], [candidate('motto_underline', [0.16, 0.37, 0.174, 0.61], 'closed_contour'),
    candidate('motto_guide', [0.16, 0.37, 0.174, 0.61], 'writing_guide'),
    candidate('printed_sentence', [0.45, 0.17, 0.475, 0.86], 'field_row')]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'motto_underline' && region.reason === 'PRINTED_HEADING_UNDERLINE'));
  assert.ok(result.regions?.some(region => region.candidateId === 'motto_guide' && region.reason === 'PRINTED_HEADING_UNDERLINE'));
  assert.ok(result.regions?.some(region => region.candidateId === 'printed_sentence' && region.reason === 'PRINTED_TEXT_WITHOUT_WRITING_AREA'));
});

test('one label owns consecutive writing lines but keeps separate regions rather than a broad union box', () => {
  const result = recognize([{ text: 'Nội dung: ................................', coords: [0.2, 0.1, 0.22, 0.9] }],
    [candidate('first', [0.2, 0.3, 0.225, 0.9]), candidate('second', [0.25, 0.1, 0.275, 0.9]), candidate('third', [0.3, 0.1, 0.325, 0.9])]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].inputKind, 'multiline_text');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 3);
  assert.equal(result.manifest.boxes[0].inputRegions?.[0].normalizedCoords[1], 0.3);
  assert.equal(result.manifest.boxes[0].inputRegions?.[1].normalizedCoords[1], 0.1);
});

test('prose immediately before dotted guides grounds one reviewable multiline field', () => {
  const result = recognize([{ text: 'Gửi kèm theo đơn này các tài liệu', coords: [0.2, 0.1, 0.225, 0.62] }],
    [candidate('first_dots', [0.2, 0.61, 0.225, 0.9], 'writing_guide'),
      candidate('continued_dots', [0.25, 0.1, 0.275, 0.9], 'writing_guide')]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Gửi kèm theo đơn này các tài liệu');
  assert.equal(result.manifest.boxes[0].inputKind, 'multiline_text');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
});

test('footnoted birth-year labels do not borrow the adjacent ethnicity label across repeated people', () => {
  const lines = [
    { text: 'Họ, chữ đệm, tên người mẹ:', coords: [0.20, 0.1, 0.225, 0.42] as NormalizedBoundingBox },
    { text: 'Năm sinh:(5)', coords: [0.25, 0.1, 0.275, 0.57] as NormalizedBoundingBox },
    { text: 'Dân tộc', coords: [0.25, 0.51, 0.275, 0.60] as NormalizedBoundingBox },
    { text: '- Quốc tịch', coords: [0.25, 0.71, 0.275, 0.79] as NormalizedBoundingBox },
    { text: 'Họ, chữ đệm, tên người cha:', coords: [0.42, 0.1, 0.445, 0.42] as NormalizedBoundingBox },
    { text: 'Năm sinh (5)', coords: [0.47, 0.1, 0.495, 0.57] as NormalizedBoundingBox },
    { text: 'Dân tộc', coords: [0.47, 0.51, 0.495, 0.60] as NormalizedBoundingBox },
    { text: '- Quốc tịch:', coords: [0.47, 0.71, 0.495, 0.79] as NormalizedBoundingBox },
  ];
  const candidates = [0.25, 0.47].flatMap((top, row) => [
    candidate(`year_${row}`, [top, 0.24, top + 0.025, 0.52]),
    candidate(`ethnicity_${row}`, [top, 0.59, top + 0.025, 0.69]),
    candidate(`nationality_${row}`, [top, 0.8, top + 0.025, 0.91]),
  ]);
  const result = recognize(lines, candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Năm sinh người mẹ', 'Dân tộc người mẹ', 'Quốc tịch người mẹ',
    'Năm sinh người cha', 'Dân tộc người cha', 'Quốc tịch người cha',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'suggested'));
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED')));
  assert.ok(result.manifest.boxes.every(box => !box.recognition?.reviewReasons.includes('ACTOR_SCOPE_INFERRED')));
});

test('checkbox option OCR does not read the square border as a trailing letter', () => {
  const result = recognize([{ text: 'có L', coords: [0.3, 0.1, 0.325, 0.25] }],
    [candidate('choice_square', [0.3, 0.27, 0.33, 0.3], 'checkbox')]);
  assert.equal(result.manifest.boxes[0].rawText, 'Có');
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
});

test('adjacent choice squares retain their shared OCR question without trusting the inferred scope', () => {
  const result = recognize([
    { text: 'Đề nghị cấp bản sao(6): có L', coords: [0.3, 0.1, 0.325, 0.47] },
    { text: 'Không', coords: [0.3, 0.54, 0.325, 0.62] },
  ], [candidate('copy_yes', [0.3, 0.48, 0.325, 0.51], 'checkbox'),
    candidate('copy_no', [0.3, 0.63, 0.325, 0.66], 'checkbox')]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Đề nghị cấp bản sao — Có', 'Đề nghị cấp bản sao — Không',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'));
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('CHECKBOX_QUESTION_SCOPE_INFERRED')));
  assert.equal(result.manifest.boxes[1].recognition?.sourceBlockIds.length, 2);
});

test('OCR-truncated copy request labels both choices while unrelated neighboring options stay unscoped', () => {
  const lines = [
    { text: 'mình đề nghị cấp bản sao(% Có', coords: [0.774, 0.094, 0.794, 0.379] as NormalizedBoundingBox },
    { text: 'Không', coords: [0.798, 0.094, 0.815, 0.174] as NormalizedBoundingBox },
  ];
  const result = recognize(lines, [candidate('copy_yes', [0.774, 0.371, 0.789, 0.393], 'checkbox'),
    candidate('copy_no', [0.793, 0.169, 0.809, 0.190], 'checkbox')]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Đề nghị cấp bản sao — Có', 'Đề nghị cấp bản sao — Không',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('CHECKBOX_QUESTION_SCOPE_INFERRED')));

  const unrelated = recognize([
    { text: 'Có', coords: [0.774, 0.094, 0.794, 0.379] },
    { text: 'Không', coords: [0.798, 0.094, 0.815, 0.174] },
  ], [candidate('yes_without_question', [0.774, 0.371, 0.789, 0.393], 'checkbox'),
    candidate('no_without_question', [0.793, 0.169, 0.809, 0.190], 'checkbox')]);
  assert.deepEqual(unrelated.manifest.boxes.map(box => box.rawText), ['Có', 'Không']);
  assert.ok(unrelated.manifest.boxes.every(box => !box.recognition?.reviewReasons.includes('CHECKBOX_QUESTION_SCOPE_INFERRED')));
});

test('three signing-date guides receive reviewed labels only with aligned date text and location', () => {
  const lines = [
    { text: 'Làm tại:', coords: [0.3, 0.1, 0.325, 0.25] as NormalizedBoundingBox },
    { text: '- ngày....', coords: [0.3, 0.41, 0.325, 0.5] as NormalizedBoundingBox },
    { text: 'tháng', coords: [0.3, 0.57, 0.325, 0.66] as NormalizedBoundingBox },
    { text: 'năm', coords: [0.3, 0.73, 0.325, 0.81] as NormalizedBoundingBox },
  ];
  const candidates = [candidate('day', [0.3, 0.49, 0.325, 0.54]),
    candidate('month', [0.3, 0.65, 0.325, 0.7]), candidate('year', [0.3, 0.8, 0.325, 0.86])];
  const result = recognize(lines, candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Ngày ký', 'Tháng ký', 'Năm ký']);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('DATE_PART_SCOPE_INFERRED')));
  const withoutLocation = recognize(lines.slice(1), candidates);
  assert.ok(withoutLocation.manifest.boxes.every(box => box.rawText === ''));
});

test('a birth-registration section scopes child fields without turning its heading into an input', () => {
  const result = recognize([
    { text: 'Đề nghị cơ quan đăng ký khai sinh cho người dưới đây:', coords: [0.2, 0.1, 0.225, 0.8] },
    { text: 'Họ, chữ đệm, tên:', coords: [0.27, 0.1, 0.295, 0.31] },
    { text: 'Ngày, tháng, năm sinh:', coords: [0.33, 0.1, 0.355, 0.35] },
  ], [candidate('child_name', [0.27, 0.32, 0.295, 0.85]), candidate('child_date', [0.33, 0.36, 0.355, 0.85])]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Họ, chữ đệm, tên người được khai sinh', 'Ngày, tháng, năm sinh người được khai sinh',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'suggested'));
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED')));
});

test('two-column actor headings ground names and repeated labels without borrowing a section instruction', () => {
  const lines = [
    { text: 'Đề nghị cơ quan ghi vào sổ việc kết hôn sau đây:', coords: [0.2, 0.1, 0.225, 0.8] as NormalizedBoundingBox },
    { text: 'Họ, chữ đệm, tên bên nữ', coords: [0.26, 0.1, 0.28, 0.33] as NormalizedBoundingBox },
    { text: 'Họ, chữ đệm, tên bên nam', coords: [0.26, 0.51, 0.28, 0.74] as NormalizedBoundingBox },
    { text: 'Nơi cư trú:', coords: [0.36, 0.1, 0.38, 0.22] as NormalizedBoundingBox },
    { text: 'Nơi cư trú:', coords: [0.36, 0.51, 0.38, 0.63] as NormalizedBoundingBox },
  ];
  const candidates = [candidate('female_name', [0.26, 0.34, 0.28, 0.47]),
    candidate('male_name', [0.26, 0.75, 0.28, 0.9]),
    candidate('female_name_continued', [0.3, 0.1, 0.32, 0.47]),
    candidate('male_name_continued', [0.3, 0.51, 0.32, 0.9]),
    candidate('female_residence', [0.36, 0.23, 0.38, 0.47]),
    candidate('male_residence', [0.36, 0.64, 0.38, 0.9])];
  const result = recognize(lines, candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Họ, chữ đệm, tên bên nữ', 'Họ, chữ đệm, tên bên nam', 'Nơi cư trú bên nữ', 'Nơi cư trú bên nam',
  ]);
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
  assert.equal(result.manifest.boxes[1].inputRegions?.length, 2);
  assert.ok(result.manifest.boxes.slice(2).every(box => box.recognition?.status === 'suggested'
    && box.recognition.reviewReasons.includes('COLUMN_ACTOR_SCOPE_GROUNDED')));
  const oneHeader = recognize([lines[1], lines[3]], [candidates[0], candidates[4]]);
  assert.equal(oneHeader.manifest.boxes.find(box => box.rawText === 'Nơi cư trú')?.recognition?.status, 'suggested');
  const unpaired = recognize([lines[1], lines[2], lines[3]], [candidates[0], candidates[4]]);
  const unpairedScope = unpaired.manifest.boxes.find(box => box.rawText === 'Nơi cư trú bên nữ');
  assert.equal(unpairedScope?.recognition?.status, 'needs_review');
  assert.ok(unpairedScope?.recognition?.reviewReasons.includes('COLUMN_ACTOR_SCOPE_INFERRED'));
});

test('death-registration heading resets requester scope for the deceased person name', () => {
  for (const heading of [
    'Đề nghị cơ quan đăng ký lại khai tử cho người có tên dưới đây:',
    'Đề nghị cơ quan ghi vào Sổ hộ tịch việc khai tử cho người có tên dưới đây:',
  ]) {
    const result = recognize([
      { text: 'Họ, chữ đệm, tên người yêu cầu:', coords: [0.18, 0.1, 0.2, 0.42] },
      { text: heading, coords: [0.29, 0.1, 0.31, 0.7] },
      { text: 'Họ, chữ đệm, tên:', coords: [0.31, 0.1, 0.33, 0.4] },
    ], [candidate('requester_name', [0.2, 0.24, 0.22, 0.52]), candidate('deceased_name', [0.33, 0.24, 0.35, 0.52])]);
    assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
      'Họ, chữ đệm, tên người yêu cầu', 'Họ, chữ đệm, tên người đã chết',
    ]);
    assert.equal(result.manifest.boxes[1].recognition?.status, 'suggested');
    assert.ok(result.manifest.boxes[1].recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
    assert.ok(!result.manifest.boxes[1].recognition?.reviewReasons.includes('ACTOR_SCOPE_INFERRED'));
  }
});

test('actor scope matching ignores OCR prefix and trailing punctuation without clearing geometry review', () => {
  const result = recognize([
    { text: 'Đề nghị cơ quan ghi vào Sổ hộ tịch việc khai tử cho người có tên dưới đây:', coords: [0.2, 0.1, 0.22, 0.7] },
    { text: '- Dân tộc.', coords: [0.23, 0.1, 0.25, 0.22] },
  ], [candidate('ethnicity', [0.25, 0.2, 0.27, 0.52])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Dân tộc người đã chết');
  assert.ok(result.manifest.boxes[0].recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
  assert.equal(result.manifest.boxes[0].recognition?.status, 'suggested');
});

test('fragmented register instructions ground two people without leaking requester scope', () => {
  const result = recognize([
    { text: 'Họ, chữ đệm, tên người yêu cầu:', coords: [0.18, 0.1, 0.2, 0.42] },
    { text: 'Đề nghị cơ quan ghi vào Sổ hộ tịch việc(4)', coords: [0.24, 0.1, 0.26, 0.55] },
    { text: 'cho người dưới đây:', coords: [0.27, 0.1, 0.29, 0.3] },
    { text: 'Họ, chữ đệm, tên', coords: [0.30, 0.1, 0.32, 0.4] },
    { text: 'Là:(5)', coords: [0.37, 0.1, 0.39, 0.2] },
    { text: 'của người có tên dưới đây:', coords: [0.37, 0.5, 0.39, 0.8] },
    { text: 'Họ, chữ đệm, tên', coords: [0.40, 0.1, 0.42, 0.4] },
  ], [candidate('requester_name', [0.20, 0.24, 0.22, 0.52]), candidate('subject_name', [0.32, 0.22, 0.34, 0.52]),
    candidate('related_person_name', [0.42, 0.22, 0.44, 0.52])]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Họ, chữ đệm, tên người yêu cầu', 'Họ, chữ đệm, tên người dưới đây', 'Họ, chữ đệm, tên người có tên dưới đây',
  ]);
  assert.ok(result.manifest.boxes.slice(1).every(box => box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED')));
});

test('hyphen-prefixed repeated labels inherit actor scope from paired column headings', () => {
  const lines = [
    { text: 'Họ, chữ đệm, tên bên nữ', coords: [0.26, 0.1, 0.28, 0.33] as NormalizedBoundingBox },
    { text: 'Họ, chữ đệm, tên bên nam', coords: [0.26, 0.51, 0.28, 0.74] as NormalizedBoundingBox },
    { text: '- Quốc tịch:', coords: [0.43, 0.1, 0.45, 0.31] as NormalizedBoundingBox },
    { text: '- Quốc tịch:', coords: [0.43, 0.51, 0.45, 0.72] as NormalizedBoundingBox },
  ];
  const result = recognize(lines, [candidate('female_nationality', [0.43, 0.32, 0.45, 0.47]),
    candidate('male_nationality', [0.43, 0.73, 0.45, 0.9])]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Quốc tịch bên nữ', 'Quốc tịch bên nam']);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('COLUMN_ACTOR_SCOPE_GROUNDED')));
  assert.ok(result.manifest.boxes.every(box => !box.recognition?.reviewReasons.includes('REPEATED_LABEL_SCOPE_REVIEW')));
});

test('requester heading without OCR colon scopes later residence and identity fields', () => {
  const result = recognize([
    { text: 'Họ, chữ đệm, tên người yêu cầu', coords: [0.2, 0.1, 0.22, 0.42] },
    { text: 'Nơi cư trú:', coords: [0.26, 0.1, 0.28, 0.25] },
    { text: 'Giấy tờ tùy thân:', coords: [0.3, 0.1, 0.32, 0.31] },
  ], [
    candidate('requester_residence', [0.26, 0.25, 0.271, 0.85]),
    candidate('requester_document', [0.3, 0.31, 0.311, 0.85]),
  ]);
  assert.equal(result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('requester_residence'))?.rawText,
    'Nơi cư trú người yêu cầu');
  assert.equal(result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('requester_document'))?.rawText,
    'Giấy tờ tùy thân người yêu cầu');
});

test('the common OCR substitution dệm is normalized in the printed label chữ đệm', () => {
  const result = recognize(
    [{ text: 'Họ, chữ dệm, tên người yêu cầu:', coords: [0.2, 0.1, 0.22, 0.42] }],
    [candidate('requester_name', [0.2, 0.43, 0.211, 0.9])],
  );
  assert.equal(result.manifest.boxes[0].rawText, 'Họ, chữ đệm, tên người yêu cầu');
});

test('an OCR-corrupted footnote leaves a clean but reviewable field label', () => {
  const result = recognize([{ text: 'Giấy tờ tùy thân: C3)', coords: [0.2, 0.1, 0.225, 0.35] }],
    [candidate('document', [0.2, 0.36, 0.225, 0.9])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Giấy tờ tùy thân');
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
  assert.ok(result.manifest.boxes[0].recognition?.reviewReasons.includes('LABEL_POSITION_ESTIMATED'));
});

test('a shifted second writing line can retain one footnoted field with explicit review', () => {
  const result = recognize([
    { text: 'Đã đăng ký kết hôn tại(4)', coords: [0.2, 0.1, 0.225, 0.3] },
    { text: 'cấp ngày...', coords: [0.27, 0.1, 0.295, 0.19] },
  ], [
    candidate('first', [0.2, 0.31, 0.225, 0.9]),
    candidate('shifted_continuation', [0.235, 0.1, 0.26, 0.55]),
    candidate('separate_day', [0.27, 0.18, 0.295, 0.22]),
  ]);
  assert.equal(result.manifest.boxes.length, 2, JSON.stringify({ boxes: result.manifest.boxes, regions: result.regions }));
  assert.equal(result.manifest.boxes[0].rawText, 'Đã đăng ký kết hôn tại');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
  assert.equal(result.manifest.boxes[0].recognition?.status, 'needs_review');
  assert.ok(result.manifest.boxes[0].recognition?.reviewReasons.includes('SHIFTED_MULTILINE_CONTINUATION'));
  assert.equal(result.manifest.boxes[1].rawText, '');
  assert.ok(result.manifest.boxes[1].recognition?.reviewReasons.includes('INLINE_LABEL_UNPARSED'));
});

test('fused signing date OCR keeps three short blanks separate from the place', () => {
  const result = recognize([
    { text: 'Làm tại:', coords: [0.72, 0.44, 0.74, 0.53] },
    { text: '-, ngày..... tháng..... năm........', coords: [0.72, 0.62, 0.74, 0.9] },
  ], [
    candidate('place', [0.72, 0.54, 0.74, 0.63]),
    { ...candidate('day', [0.72, 0.69, 0.74, 0.72]), shortGuide: true },
    { ...candidate('month', [0.72, 0.78, 0.74, 0.81]), shortGuide: true },
    { ...candidate('year', [0.72, 0.86, 0.74, 0.89]), shortGuide: true },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Làm tại', 'Ngày ký', 'Tháng ký', 'Năm ký']);
  assert.ok(result.manifest.boxes.every(box => box.inputRegions?.length === 1));
  assert.ok(result.manifest.boxes.slice(1).every(box => box.recognition?.status === 'needs_review'
    && box.recognition.reviewReasons.includes('DATE_PART_SCOPE_INFERRED')));
});

test('an administrative number and four dotted date blanks require an aligned OCR caption and review', () => {
  const number = { text: 'Văn bản số:', coords: [0.114, 0.437, 0.134, 0.6] as NormalizedBoundingBox };
  const date = { text: 'ngày... tháng... năm..', coords: [0.136, 0.384, 0.156, 0.655] as NormalizedBoundingBox };
  const candidates = [
    candidate('number', [0.118, 0.568, 0.132, 0.589]),
    candidate('place', [0.139, 0.395, 0.152, 0.413]),
    candidate('day', [0.139, 0.481, 0.152, 0.498]),
    candidate('month', [0.139, 0.56, 0.152, 0.575]),
    candidate('year', [0.139, 0.626, 0.152, 0.645]),
  ].map(item => ({ ...item, guideStyle: 'dotted' as const, shortGuide: true }));
  const result = recognize([number, date], candidates);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText),
    ['Văn bản số', 'Nơi lập văn bản', 'Ngày lập', 'Tháng lập', 'Năm lập']);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'
    && box.recognition.reviewReasons.includes('SHORT_GUIDE_GEOMETRY_REVIEW')));
  const withoutHeader = recognize([date], candidates);
  assert.equal(withoutHeader.manifest.boxes.length, 0);
  assert.equal(withoutHeader.regions?.filter(region => region.reason === 'SHORT_GUIDE_WITHOUT_DATE_CONTEXT').length, 5);
});

test('a same-row Số caption groups split number dots and grounds four administrative date blanks', () => {
  const lines = [
    { text: 'Số:..1...', coords: [0.137, 0.228, 0.157, 0.335] as NormalizedBoundingBox },
    { text: 'ngày... tháng... năm..', coords: [0.14, 0.519, 0.16, 0.8] as NormalizedBoundingBox },
  ];
  const guides = [
    candidate('number_first', [0.142, 0.264, 0.156, 0.294]),
    candidate('number_second', [0.142, 0.304, 0.156, 0.322]),
    candidate('place', [0.142, 0.531, 0.156, 0.546]),
    candidate('day', [0.142, 0.617, 0.156, 0.633]),
    candidate('month', [0.142, 0.7, 0.155, 0.715]),
    candidate('year', [0.142, 0.772, 0.155, 0.788]),
  ].map(item => ({ ...item, guideStyle: 'dotted' as const, shortGuide: true }));
  const result = recognize(lines, guides);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText),
    ['Văn bản số', 'Nơi lập văn bản', 'Ngày lập', 'Tháng lập', 'Năm lập']);
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'));
  const body = recognize(lines.map(line => ({ ...line, coords: [line.coords[0] + 0.2, line.coords[1], line.coords[2] + 0.2, line.coords[3]] })),
    guides.map(guide => ({ ...guide, rect: { ...guide.rect, y: guide.rect.y + 200 } })));
  assert.equal(body.manifest.boxes.length, 0);
});

test('fused issued-date OCR does not append a short month blank to the previous multiline field', () => {
  const result = recognize([
    { text: 'Đã đăng ký kết hôn tại(4)', coords: [0.61, 0.08, 0.63, 0.3] },
    { text: 'cấp ngày...', coords: [0.66, 0.08, 0.68, 0.18] },
    { text: 'tháng - năm', coords: [0.66, 0.2, 0.68, 0.35] },
  ], [
    candidate('registered', [0.61, 0.31, 0.63, 0.88]),
    candidate('continuation', [0.64, 0.1, 0.66, 0.55]),
    candidate('day', [0.66, 0.17, 0.68, 0.21]),
    { ...candidate('month', [0.66, 0.26, 0.68, 0.29]), shortGuide: true },
    candidate('year', [0.66, 0.34, 0.68, 0.88]),
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText),
    ['Đã đăng ký kết hôn tại', 'Ngày cấp', 'Tháng cấp', 'Năm cấp']);
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
  assert.ok(result.manifest.boxes.slice(1).every(box => box.recognition?.status === 'needs_review'));
});

test('registration number guide is labeled only when grounded by its registration caption and OCR label', () => {
  const result = recognize([
    { text: 'Đã đăng ký kết hôn tại(4)', coords: [0.611, 0.083, 0.631, 0.306] },
    { text: 'số', coords: [0.632, 0.551, 0.650, 0.593] },
    { text: 'Số điện thoại:', coords: [0.2, 0.1, 0.22, 0.3] },
  ], [
    candidate('registered_at', [0.617, 0.297, 0.628, 0.878]),
    candidate('registration_number', [0.638, 0.592, 0.650, 0.878]),
    candidate('unrelated_number', [0.23, 0.31, 0.24, 0.5]),
  ]);
  const number = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('registration_number'));
  assert.equal(number?.rawText, 'Số đăng ký');
  assert.ok(number?.recognition?.sourceBlockIds.length === 2);
  const unrelated = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('unrelated_number'));
  assert.notEqual(unrelated?.rawText, 'Số đăng ký');
});

test('registration date guides split from a shifted multiline continuation and receive precise labels', () => {
  const result = recognize([
    { text: 'Đã đăng ký kết hôn tại(4)', coords: [0.611, 0.083, 0.631, 0.306] },
    { text: 'số', coords: [0.632, 0.551, 0.650, 0.593] },
    { text: 'cấp ngày...', coords: [0.654, 0.083, 0.674, 0.180] },
    { text: 'tháng - năm', coords: [0.657, 0.200, 0.674, 0.345] },
  ], [
    candidate('registered_at', [0.617, 0.304, 0.628, 0.876]),
    candidate('registered_continuation', [0.639, 0.100, 0.650, 0.556]),
    candidate('registration_day', [0.660, 0.169, 0.671, 0.207]),
    candidate('registration_month', [0.660, 0.264, 0.671, 0.292]),
    candidate('registration_year', [0.660, 0.339, 0.671, 0.876]),
  ]);
  const byCandidate = (id: string) => result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes(id));
  assert.equal(byCandidate('registered_at')?.rawText, 'Đã đăng ký kết hôn tại');
  assert.equal(byCandidate('registered_at')?.inputRegions?.length, 2);
  assert.equal(byCandidate('registration_day')?.rawText, 'Ngày cấp');
  assert.equal(byCandidate('registration_month')?.rawText, 'Tháng cấp');
  assert.equal(byCandidate('registration_year')?.rawText, 'Năm cấp');
  assert.equal(byCandidate('registration_month')?.recognition?.status, 'needs_review');
  assert.equal(byCandidate('registration_year')?.recognition?.status, 'needs_review');
});

test('marital-history declaration labels only its broad adjacent answer line', () => {
  const result = recognize([
    { text: 'Trước khi kết hôn lần này chưa từng kết hôn/đã từng kết hôn nhưng hôn nhân đã chấm dứt?)',
      coords: [0.675, 0.083, 0.696, 0.857] },
    { text: 'Tôi cam đoan những nội dung khai trên', coords: [0.723, 0.095, 0.741, 0.438] },
  ], [
    candidate('marital_history', [0.703, 0.097, 0.714, 0.876]),
    candidate('short_following_guide', [0.712, 0.103, 0.723, 0.437]),
  ]);
  const history = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('marital_history'));
  const following = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('short_following_guide'));
  assert.equal(history?.rawText, 'Tình trạng hôn nhân trước lần kết hôn này');
  assert.ok(history?.recognition?.sourceBlockIds.length === 1);
  assert.ok(history && history.normalizedCoords[0] >= 0.707);
  assert.equal(history?.recognition?.status, 'needs_review');
  assert.equal(following, undefined);
  assert.ok(result.regions?.some(region => region.candidateId === 'short_following_guide'
    && region.role === 'static_text' && region.reason === 'DECLARATION_ADJACENT_GUIDE'));
});

test('copy-count guide is grounded by OCR that loses the dots before bản', () => {
  const result = recognize([
    { text: 'Số lượng.', coords: [0.818, 0.095, 0.838, 0.197] },
    { text: 'bản', coords: [0.821, 0.224, 0.835, 0.278] },
    { text: 'Làm tại:', coords: [0.725, 0.52, 0.739, 0.64] },
  ], [
    candidate('copy_count', [0.825, 0.194, 0.837, 0.236]),
    candidate('unrelated_lower_guide', [0.837, 0.547, 0.849, 0.798]),
  ]);
  assert.equal(result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('copy_count'))?.rawText,
    'Số lượng bản sao');
  assert.notEqual(result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('unrelated_lower_guide'))?.rawText,
    'Số lượng bản sao');
});

test('short dotted pattern without an aligned date context cannot create an input field', () => {
  const result = recognize([{ text: 'Ghi chú: xem hướng dẫn', coords: [0.3, 0.1, 0.32, 0.45] }],
    [{ ...candidate('short_pattern', [0.3, 0.5, 0.32, 0.54]), shortGuide: true }]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'short_pattern'
    && region.reason === 'SHORT_GUIDE_WITHOUT_DATE_CONTEXT'));
});

test('fragmented short dotted guides with one same-row label stay grouped for admin review', () => {
  const result = recognize(
    [{ text: 'Họ và tên:', coords: [0.3, 0.1, 0.32, 0.27] }],
    [
      { ...candidate('name_fragment_1', [0.3, 0.28, 0.32, 0.31]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('name_fragment_2', [0.3, 0.38, 0.32, 0.41]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('name_fragment_3', [0.3, 0.48, 0.32, 0.51]), guideStyle: 'dotted', shortGuide: true },
    ],
  );
  assert.equal(result.manifest.boxes.length, 1);
  const box = result.manifest.boxes[0];
  assert.ok(box);
  assert.equal(box.rawText, 'Họ và tên');
  assert.equal(box.inputRegions?.length, 1);
  assert.deepEqual(box.inputRegions?.[0].normalizedCoords, [0.3, 0.28, 0.32, 0.51]);
  assert.equal(box.recognition?.status, 'needs_review');
  assert.ok(box.recognition?.reviewReasons.includes('SHORT_GUIDE_GEOMETRY_REVIEW'));
  assert.deepEqual(box.recognition?.sourceCandidateIds,
    ['name_fragment_1', 'name_fragment_2', 'name_fragment_3']);
});

test('OCR noise after a printed applicant label does not hide its fragmented answer guide', () => {
  const result = recognize(
    [
      { text: "Tôi là' (ghi họ tên bằng chữ in hoa);", coords: [0.3204, 0.1705, 0.3445, 0.5293] },
      { text: 'Ngày, tháng, năm sinh:...../................................ ngangang n n', coords: [0.3491, 0.1705, 0.3701, 0.5039] },
    ],
    [
      { ...candidate('name_1', [0.325, 0.525, 0.339, 0.542]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('name_2', [0.325, 0.622, 0.339, 0.656]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('name_3', [0.325, 0.713, 0.339, 0.751]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('name_4', [0.325, 0.814, 0.339, 0.847]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('birth_1', [0.351, 0.446, 0.365, 0.463]), guideStyle: 'dotted', shortGuide: true },
      { ...candidate('birth_2', [0.351, 0.514, 0.365, 0.547]), guideStyle: 'dotted', shortGuide: true },
    ], 0.95,
  );
  const name = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('name_1'));
  assert.equal(name?.rawText, 'Tôi là (ghi họ tên bằng chữ in hoa)');
  assert.equal(name?.inputRegions?.length, 1);
  assert.deepEqual(name?.recognition?.sourceCandidateIds, ['name_1', 'name_2', 'name_3', 'name_4']);
  assert.equal(name?.recognition?.status, 'needs_review');
  const birthDate = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('birth_1'));
  assert.equal(birthDate?.rawText, 'Ngày, tháng, năm sinh');
  assert.deepEqual(birthDate?.recognition?.sourceCandidateIds, ['birth_1', 'birth_2']);
});

test('inline dotted slots are grounded by a one-to-one OCR line and remain reviewable', () => {
  const lines = [
    { text: 'chọn thầu) để làm thầu chính (hoặc thầu phụ) thực hiện công việc.......thuộc Dự', coords: [0.46, 0.128, 0.486, 0.914] as NormalizedBoundingBox },
    { text: 'án...... tại...... trong thời gian từ...... đến............', coords: [0.48, 0.128, 0.504, 0.914] as NormalizedBoundingBox },
    { text: 'Chúng tôi đề nghị Sở Xây dựng.... cấp Giấy phép hoạt động xây dựng cho', coords: [0.506, 0.128, 0.532, 0.914] as NormalizedBoundingBox },
  ];
  const candidates = [
    { ...candidate('work', [0.466, 0.77, 0.48, 0.812]), guideStyle: 'dotted' as const, shortGuide: true },
    { ...candidate('project', [0.486, 0.165, 0.5, 0.232]), guideStyle: 'dotted' as const },
    { ...candidate('place', [0.486, 0.271, 0.5, 0.338]), guideStyle: 'dotted' as const },
    { ...candidate('from', [0.486, 0.506, 0.5, 0.554]), guideStyle: 'dotted' as const, shortGuide: true },
    { ...candidate('to', [0.486, 0.599, 0.5, 0.642]), guideStyle: 'dotted' as const, shortGuide: true },
    { ...candidate('department', [0.512, 0.501, 0.526, 0.528]), guideStyle: 'dotted' as const, shortGuide: true },
  ];
  const result = recognize(lines, candidates);
  for (const [id, label] of [['work', 'Công việc'], ['from', 'Thời gian từ'],
    ['to', 'Thời gian đến'], ['department', 'Sở Xây dựng']]) {
    const field = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes(id));
    assert.equal(field?.rawText, label);
    assert.equal(field?.recognition?.status, 'needs_review');
    assert.ok(field?.recognition?.reviewReasons.includes('INLINE_DOTTED_SLOT_INFERRED'));
  }
  const missingGuide = recognize(lines, candidates.filter(item => item.candidateId !== 'from'));
  assert.ok(!missingGuide.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('to')));
  assert.ok(missingGuide.regions?.some(region => region.candidateId === 'to'
    && region.reason === 'SHORT_GUIDE_WITHOUT_DATE_CONTEXT'));
  const punctuation = recognize([{ text: 'v.v...', coords: [0.4, 0.1, 0.42, 0.7] }],
    [{ ...candidate('ellipsis', [0.4, 0.55, 0.42, 0.59]), guideStyle: 'dotted', shortGuide: true }]);
  assert.equal(punctuation.manifest.boxes.length, 0);
  const recipientFooter = recognize([{ text: 'Lưu: VT, đơn vị...', coords: [0.53, 0.13, 0.55, 0.3] }],
    [{ ...candidate('footer_dots', [0.53, 0.275, 0.55, 0.291]), guideStyle: 'dotted', shortGuide: true }]);
  assert.equal(recipientFooter.manifest.boxes.length, 0);
});

test('a wrapped decision number and date cloze uses two-dot OCR only with matching guides', () => {
  const lines = [
    { text: 'Căn cứ Quyết định trúng thầu số ... ngày.. tháng...', coords: [0.248, 0.128, 0.275, 0.909] as NormalizedBoundingBox },
    { text: 'năm.... giữa Chủ đầu tư với Công ty ........', coords: [0.269, 0.128, 0.292, 0.909] as NormalizedBoundingBox },
  ];
  const guides = [
    candidate('number', [0.254, 0.728, 0.268, 0.744]),
    candidate('day', [0.253, 0.799, 0.267, 0.814]),
    candidate('month', [0.253, 0.881, 0.267, 0.897]),
    candidate('year', [0.274, 0.187, 0.288, 0.209]),
    candidate('company', [0.273, 0.701, 0.287, 0.752]),
  ].map(item => ({ ...item, guideStyle: 'dotted' as const, shortGuide: true }));
  const result = recognize(lines, guides);
  for (const [id, label] of [['number', 'Số quyết định'], ['day', 'Ngày quyết định'],
    ['month', 'Tháng quyết định'], ['year', 'Năm quyết định']]) {
    const field = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes(id));
    assert.equal(field?.rawText, label);
    assert.equal(field?.recognition?.status, 'needs_review');
  }
  const incomplete = recognize(lines, guides.filter(guide => guide.candidateId !== 'day'));
  assert.ok(!incomplete.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('month')));
});

test('scan border touching the page edge cannot become an input field', () => {
  const result = recognize([{ text: 'Nội dung:', coords: [0.3, 0.1, 0.32, 0.28] }], [
    candidate('top_contour', [0, 0, 0.007, 0.8], 'closed_contour'),
    candidate('top_row', [0, 0, 0.01, 0.82], 'field_row'),
    candidate('bottom_guide', [0.99, 0, 1, 0.4]),
    candidate('input', [0.3, 0.31, 0.324, 0.7]),
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Nội dung']);
  assert.equal(result.regions?.filter(region => region.reason === 'PAGE_EDGE_SCAN_ARTIFACT').length, 3);
});

test('a wide writing area near but not touching the page edge stays reviewable', () => {
  const result = recognize([{ text: 'Biểu mẫu thử', coords: [0.5, 0.3, 0.52, 0.6] }], [
    candidate('top_input', [0.02, 0, 0.045, 0.7]),
    candidate('bottom_input', [0.95, 0, 0.975, 0.4]),
  ]);
  assert.equal(result.manifest.boxes.length, 2);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'));
  assert.equal(result.regions?.filter(region => region.reason === 'PAGE_EDGE_SCAN_ARTIFACT').length, 0);
});

test('a centered underline just below a static motto is decoration, not a citizen input', () => {
  const result = recognize([
    { text: 'Độc lập - Tự do - Hạnh phúc', coords: [0.122, 0.367, 0.14, 0.639] },
    { text: 'Họ và tên:', coords: [0.3, 0.1, 0.324, 0.3] },
  ], [
    { ...candidate('motto_rule', [0.139, 0.388, 0.15, 0.616]), guideStyle: 'underline' },
    { ...candidate('name_input', [0.3, 0.31, 0.324, 0.8]), guideStyle: 'underline' },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Họ và tên']);
  assert.ok(result.regions?.some(region => region.candidateId === 'motto_rule'
    && region.reason === 'PRINTED_HEADING_UNDERLINE'));
});

test('a same-row birth-date caption grounds a corrupted words-caption without auto-confirming it', () => {
  const result = recognize([
    { text: 'Ngày, tháng, năm sinh:', coords: [0.4, 0.1, 0.424, 0.32] },
    { text: 'nghi bằng chữ:', coords: [0.4, 0.58, 0.424, 0.7] },
  ], [
    { ...candidate('birth_date', [0.4, 0.33, 0.424, 0.55]), guideStyle: 'dotted' },
    { ...candidate('birth_date_words', [0.4, 0.71, 0.424, 0.9]), guideStyle: 'dotted' },
  ]);
  const wordsField = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('birth_date_words'));
  assert.equal(wordsField?.rawText, 'Ngày sinh ghi bằng chữ');
  assert.equal(wordsField?.recognition?.status, 'needs_review');
  assert.ok(wordsField?.recognition?.reviewReasons.includes('OCR_LABEL_RECONSTRUCTED_FROM_SAME_ROW_DATE_CONTEXT'));

  const unrelated = recognize([{ text: 'nghi bằng chữ:', coords: [0.4, 0.1, 0.424, 0.22] }], [
    { ...candidate('unrelated_words', [0.4, 0.24, 0.424, 0.9]), guideStyle: 'dotted' },
  ]);
  assert.equal(unrelated.manifest.boxes[0].rawText, 'nghi bằng chữ');
});

test('a footer separator directly above a footnote is not a writable field', () => {
  const result = recognize([
    { text: 'Tỉnh/Thành phố trực thuộc trung ương:', coords: [0.795, 0.138, 0.818, 0.541] },
    { text: '? Trường hợp Tòa án hoặc Trọng tài chỉ định người thực hiện thủ tục đăng ký doanh nghiệp',
      coords: [0.869, 0.135, 0.889, 0.905] },
  ], [{ ...candidate('footnote_separator', [0.848, 0.107, 0.8615, 0.3505]), guideStyle: 'underline' }]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'footnote_separator'
    && region.reason === 'FOOTNOTE_SEPARATOR'));
});

test('a short underline centered directly beneath a dotted date caption is decoration, not an input', () => {
  const result = recognize([
    { text: 'ngày... tháng... năm..', coords: [0.136, 0.384, 0.156, 0.655] },
    { text: 'Địa chỉ:', coords: [0.3, 0.1, 0.32, 0.26] },
  ], [
    { ...candidate('date_rule', [0.154, 0.47, 0.168, 0.57]), guideStyle: 'underline' },
    { ...candidate('actual_input', [0.3, 0.28, 0.324, 0.75]), guideStyle: 'underline' },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Địa chỉ']);
  assert.ok(result.regions?.some(region => region.candidateId === 'date_rule'
    && region.reason === 'DECORATIVE_DATE_UNDERLINE'));
});

test('a short rule under an uppercase administrative heading is decoration', () => {
  const result = recognize([{ text: 'TỔ CHỨC.....', coords: [0.08, 0.206, 0.1, 0.36] }], [
    { ...candidate('heading_rule', [0.1, 0.242, 0.114, 0.322]), guideStyle: 'underline' },
  ]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'heading_rule'
    && region.reason === 'DECORATIVE_HEADING_UNDERLINE'));
});

test('an underline beneath a sentence-case form title is not a citizen input', () => {
  const result = recognize([{ text: 'Về việc người nộp thuế chuyển địa điểm', coords: [0.2277, 0.3149, 0.2516, 0.7443] }], [
    { ...candidate('form_title_underline', [0.2419, 0.3304, 0.2544, 0.7362]), guideStyle: 'underline' },
  ]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'form_title_underline'
    && region.reason === 'UNDERLINED_FORM_TITLE'));
});

test('a broad field-row candidate overlapping only printed legal text is excluded', () => {
  const result = recognize([
    { text: 'Căn cứ Nghị định số 126/2020/NĐ-CP ngày 19/10/2020 của Chính phủ', coords: [0.3572, 0.1282, 0.3822, 0.9245] },
    { text: 'quy định chi tiết một số điều của Luật Quản lý thuế;', coords: [0.3771, 0.1282, 0.3998, 0.9245] },
  ], [
    { ...candidate('legal_text_row', [0.3572, 0.1339, 0.3998, 0.6494]), source: 'field_row' },
  ]);
  assert.equal(result.manifest.boxes.length, 0);
  assert.ok(result.regions?.some(region => region.candidateId === 'legal_text_row'
    && region.reason === 'LEGAL_OR_STATIC_TEXT_ROW'));
});

test('a date-labeled writing line is not mistaken for a centered decorative underline', () => {
  const result = recognize([{ text: 'Ngày sinh:', coords: [0.2, 0.1, 0.22, 0.26] }],
    [{ ...candidate('date_input', [0.2, 0.28, 0.224, 0.75]), guideStyle: 'underline' }]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Ngày sinh');
  assert.equal(result.regions?.filter(region => region.reason === 'DECORATIVE_DATE_UNDERLINE').length, 0);
});

test('issue date and issuing place remain separate when OCR combines both dotted fields on one line', () => {
  const result = recognize([
    { text: 'Ngày cấp.../...... Nơi cấp........', coords: [0.6952, 0.1039, 0.7179, 0.3932] },
  ], [
    { ...candidate('issue_date', [0.7014, 0.2063, 0.7145, 0.2941]), guideStyle: 'dotted' },
    { ...candidate('issue_place', [0.7014, 0.3771, 0.7145, 0.8687]), guideStyle: 'dotted' },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Ngày cấp', 'Nơi cấp']);
  assert.deepEqual(result.manifest.boxes.map(box => box.recognition?.sourceCandidateIds), [['issue_date'], ['issue_place']]);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.status === 'needs_review'));
});

test('adjacent dotted segments on one row keep the same label despite a competing label above', () => {
  const result = recognize([
    { text: 'Chức vụ:......', coords: [0.239, 0.313, 0.259, 0.535] },
    { text: 'Đại diện cho:', coords: [0.293, 0.174, 0.312, 0.326] },
  ], [
    { ...candidate('first_segment', [0.295, 0.309, 0.309, 0.506]), guideStyle: 'dotted' },
    { ...candidate('second_segment', [0.295, 0.526, 0.309, 0.882]), guideStyle: 'dotted' },
  ]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Đại diện cho');
  assert.deepEqual(result.manifest.boxes[0].recognition?.sourceCandidateIds, ['first_segment', 'second_segment']);
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 2);
});

test('a tiny dotted bridge joins two same-row guides only without intervening printed text', () => {
  const guides = [
    { ...candidate('first', [0.45, 0.333, 0.467, 0.509]), guideStyle: 'dotted' as const },
    { ...candidate('bridge', [0.45, 0.52, 0.467, 0.54]), guideStyle: 'dotted' as const, shortGuide: true },
    { ...candidate('last', [0.45, 0.544, 0.467, 0.89]), guideStyle: 'dotted' as const },
  ];
  const merged = recognize([{ text: 'Nội dung:', coords: [0.45, 0.13, 0.47, 0.33] }], guides);
  assert.equal(merged.manifest.boxes.length, 1);
  assert.equal(merged.manifest.boxes[0].inputRegions?.length, 3);
  assert.deepEqual(merged.manifest.boxes[0].recognition?.sourceCandidateIds, ['first', 'bridge', 'last']);
  assert.equal(merged.manifest.boxes[0].recognition?.status, 'needs_review');
  assert.ok(merged.manifest.boxes[0].recognition?.reviewReasons.includes('FRAGMENTED_DOTTED_GUIDE_REVIEW'));
  const separated = recognize([
    { text: 'Nội dung:', coords: [0.45, 0.13, 0.47, 0.33] },
    { text: 'Fax:', coords: [0.45, 0.51, 0.47, 0.543] },
  ], guides);
  assert.equal(separated.manifest.boxes.some(box => box.inputRegions?.length === 3), false);
  const unlabeled = recognize([{ text: 'Biểu mẫu thử', coords: [0.1, 0.2, 0.12, 0.5] }], guides);
  assert.equal(unlabeled.manifest.boxes.some(box => box.recognition?.sourceCandidateIds.includes('bridge')), false);
});

test('printed text between neighboring dotted guides keeps them as separate fields', () => {
  const result = recognize([
    { text: 'Số điện thoại:', coords: [0.3, 0.1, 0.32, 0.24] },
    { text: 'Fax:', coords: [0.3, 0.48, 0.32, 0.53] },
  ], [
    { ...candidate('phone', [0.3, 0.25, 0.324, 0.47]), guideStyle: 'dotted' },
    { ...candidate('fax', [0.3, 0.54, 0.324, 0.8]), guideStyle: 'dotted' },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Số điện thoại', 'Fax']);
});

test('a two-column row beside a multiline field is not merged into that field', () => {
  const result = recognize([{ text: 'Họ và tên:', coords: [0.18, 0.1, 0.2, 0.33] }], [
    { ...candidate('first_line', [0.2, 0.3, 0.222, 0.48]), guideStyle: 'dotted' },
    { ...candidate('second_line', [0.25, 0.1, 0.272, 0.48]), guideStyle: 'dotted' },
    { ...candidate('neighbor_column', [0.25, 0.5, 0.272, 0.88]), guideStyle: 'dotted' },
  ]);
  const multiline = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('first_line'));
  assert.ok(multiline?.recognition?.sourceCandidateIds.includes('second_line'));
  assert.equal(multiline?.recognition?.sourceCandidateIds.includes('neighbor_column'), false);
});

test('overlapping solid double rules are static but a separated labeled writing guide remains', () => {
  const result = recognize([
    { text: 'Họ và tên:', coords: [0.55, 0.1, 0.575, 0.25] },
    { text: 'Địa chỉ:', coords: [0.65, 0.1, 0.675, 0.25] },
  ], [
    { ...candidate('header_rule_a', [0.08, 0.1, 0.09, 0.9]), guideStyle: 'underline' },
    { ...candidate('header_rule_b', [0.083, 0.1, 0.093, 0.9]), guideStyle: 'underline' },
    { ...candidate('actual_input', [0.55, 0.27, 0.575, 0.8]), guideStyle: 'dotted' },
    { ...candidate('actual_underline', [0.65, 0.27, 0.675, 0.8]), guideStyle: 'underline' },
    { ...candidate('first_rule', [0.8, 0.1, 0.82, 0.65]), guideStyle: 'underline' },
    { ...candidate('second_rule', [0.81, 0.1, 0.83, 0.65]), guideStyle: 'underline' },
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Họ và tên', 'Địa chỉ']);
  assert.equal(result.regions?.filter(region => region.reason === 'PAIRED_DECORATIVE_RULE').length, 4);
});

test('a thin row duplicated by paired decorative rules is excluded without suppressing a standalone row', () => {
  const result = recognize([{ text: 'Biểu mẫu thử', coords: [0.02, 0.3, 0.04, 0.7] }], [
    { ...candidate('paired_rule_a', [0.08, 0.1, 0.09, 0.9]), guideStyle: 'underline' },
    { ...candidate('paired_rule_b', [0.083, 0.1, 0.093, 0.9]), guideStyle: 'underline' },
    candidate('duplicate_header_row', [0.082, 0.09, 0.088, 0.91], 'field_row'),
    candidate('standalone_row', [0.2, 0.1, 0.208, 0.91], 'field_row'),
  ]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.deepEqual(result.regions?.filter(region => region.reason === 'REDUNDANT_ROW_OVER_PAIRED_RULE')
    .map(region => region.candidateId), ['duplicate_header_row']);
  assert.ok(result.manifest.boxes[0].recognition?.sourceCandidateIds.includes('standalone_row'));
});

test('one inline date field owns separated same-row guides without borrowing the next label', () => {
  const result = recognize([
    { text: 'Ngày sinh: .......................', coords: [0.2, 0.1, 0.22, 0.63] },
    { text: 'Giới tính: ........', coords: [0.2, 0.68, 0.22, 0.95] },
  ], [
    candidate('gender', [0.199, 0.81, 0.224, 0.93]),
    candidate('day', [0.2, 0.31, 0.225, 0.4]),
    candidate('month', [0.201, 0.44, 0.226, 0.53]),
    candidate('year', [0.202, 0.56, 0.227, 0.65]),
  ]);
  assert.equal(result.manifest.boxes.length, 2);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Ngày sinh', 'Giới tính']);
  assert.equal(result.manifest.boxes[0].inputKind, 'single_line_text');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 3);
});

test('a printed label alone is not a writing field, but a separate blank region is retained', () => {
  const label: NormalizedBoundingBox = [0.2, 0.1, 0.22, 0.3];
  const result = recognize([{ text: 'Họ và tên:', coords: label }], [candidate('printed', label, 'field_row'), candidate('blank', [0.2, 0.35, 0.225, 0.9])]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Họ và tên');
  assert.ok(result.regions?.some(region => region.reason === 'PRINTED_LABEL_WITHOUT_WRITING_AREA'));
});

test('new label, section, separate column and excessive gap stop multiline grouping', () => {
  const result = recognize([
    { text: 'Nội dung: ................', coords: [0.2, 0.1, 0.22, 0.5] },
    { text: 'Ngày sinh: ...............', coords: [0.25, 0.1, 0.27, 0.5] },
    { text: 'II. PHẦN MỚI', coords: [0.31, 0.1, 0.33, 0.9] },
  ], [candidate('content', [0.2, 0.3, 0.225, 0.5]), candidate('dob', [0.25, 0.3, 0.275, 0.5]),
    candidate('after_section', [0.34, 0.1, 0.365, 0.5]), candidate('other_column', [0.29, 0.65, 0.315, 0.95]), candidate('far', [0.65, 0.1, 0.675, 0.5])]);
  assert.equal(result.manifest.boxes.length, 5);
  assert.deepEqual(result.manifest.boxes.slice(0, 2).map(box => box.rawText), ['Nội dung', 'Ngày sinh']);
  assert.ok(result.manifest.boxes.every(box => box.inputRegions?.length === 1));
  assert.equal(result.manifest.boxes.at(-1)?.rawText, '');
});

test('a short next-row label touching the guide prevents a false multiline merge', () => {
  const lines = [
    { text: 'Số CMND/CCCD:', coords: [0.56, 0.0875, 0.5759, 0.245] as NormalizedBoundingBox },
    { text: 'Cấp ngày....', coords: [0.56, 0.4558, 0.5788, 0.5525] as NormalizedBoundingBox },
    { text: 'Tại', coords: [0.5888, 0.0875, 0.6041, 0.14] as NormalizedBoundingBox },
  ];
  const candidates = [
    { ...candidate('identity_number', [0.5647, 0.2292, 0.5753, 0.4642]), guideStyle: 'dotted' as const },
    { ...candidate('identity_issue_date', [0.5647, 0.5367, 0.5753, 0.7108]), guideStyle: 'dotted' as const },
    { ...candidate('identity_issue_place', [0.5912, 0.1242, 0.6018, 0.67]), guideStyle: 'dotted' as const },
  ];
  const result = recognize(lines, candidates);
  const number = result.manifest.boxes.find(box => box.rawText === 'Số CMND/CCCD');
  const issueDate = result.manifest.boxes.find(box => box.rawText === 'Cấp ngày');
  const issuePlace = result.manifest.boxes.find(box => box.rawText === 'Tại');
  assert.equal(number?.inputRegions?.length, 1);
  assert.equal(issueDate?.inputRegions?.length, 1);
  assert.equal(issuePlace?.inputRegions?.length, 1);
  assert.equal(issuePlace?.recognition?.status, 'needs_review');
  assert.ok(issuePlace?.recognition?.reviewReasons.includes('LABEL_POSITION_ESTIMATED'));
});

test('a long numbered inline label between writing guides prevents false continuation grouping', () => {
  const result = recognize([
    { text: 'Giới tính: .................', coords: [0.2, 0.1, 0.22, 0.9] },
    { text: '[06]. Nơi đăng ký giấy khai sinh: [06.1]. Xã (phường, thị trấn): .................',
      coords: [0.24, 0.1, 0.26, 0.95] },
  ], [candidate('gender', [0.2, 0.65, 0.225, 0.9]), candidate('birth_commune', [0.24, 0.65, 0.265, 0.95])]);
  const gender = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('gender'));
  const commune = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('birth_commune'));
  assert.equal(gender?.inputRegions?.length, 1, JSON.stringify(result.manifest.boxes));
  assert.equal(commune?.inputRegions?.length, 1, JSON.stringify(result.manifest.boxes));
});

test('a duplicate label collision keeps the first evidence-backed label visible for review', () => {
  const result = recognize([{ text: 'Mã số đơn vị: ................................', coords: [0.2, 0.1, 0.22, 0.55] }], [
    candidate('organization_code_primary', [0.2, 0.3, 0.225, 0.55]),
    candidate('organization_code_collision', [0.2, 0.4, 0.225, 0.7]),
  ]);
  const first = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('organization_code_primary'));
  const collision = result.manifest.boxes.find(box => box.recognition?.sourceCandidateIds.includes('organization_code_collision'));
  assert.equal(first?.rawText, 'Mã số đơn vị');
  assert.ok(first?.recognition?.reviewReasons.includes('DUPLICATE_LABEL_NOT_A_CONTINUATION'));
  assert.equal(first?.recognition?.status, 'needs_review');
  assert.equal(collision?.rawText, '');
});

test('two inline labels are assigned to distinct writing areas, with estimated-label evidence retained', () => {
  const result = recognize([{ text: 'Họ và tên: ............  Ngày sinh: ..........', coords: [0.2, 0.1, 0.22, 0.9] }],
    [candidate('name', [0.2, 0.27, 0.225, 0.47]), candidate('dob', [0.2, 0.74, 0.225, 0.9])]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Họ và tên', 'Ngày sinh']);
  assert.ok(result.manifest.boxes.every(box => box.recognition?.reviewReasons.includes('LABEL_POSITION_ESTIMATED')));
});

test('OCR-damaged numbered labels remain attached to their own adjacent writing guides', () => {
  const result = recognize([
    { text: '[04], Quốc tịch', coords: [0.3, 0.1, 0.32, 0.25] },
    { text: '05]. Dân tộc', coords: [0.3, 0.55, 0.32, 0.7] },
  ], [candidate('nationality', [0.3, 0.25, 0.325, 0.5]), candidate('ethnicity', [0.3, 0.7, 0.325, 0.95])]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Quốc tịch', 'Dân tộc']);
});

test('a leading OCR dot does not hide a numbered inline label from its writing guide', () => {
  const result = recognize([
    { text: '[01]. Thông tin chủ hộ gia đình:', coords: [0.232, 0.13, 0.255, 0.94] },
    { text: '.[01.2]. Họ và tên', coords: [0.258, 0.525, 0.277, 0.708] },
  ], [candidate('household_head_name', [0.259, 0.691, 0.274, 0.922])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Họ và tên');
});

test('the recognized citizen-identifier acronym restores its Vietnamese diacritic', () => {
  const result = recognize([{ text: '[01.1]. Số CCCD/DDCN', coords: [0.25, 0.1, 0.27, 0.4] }],
    [candidate('identity', [0.251, 0.4, 0.268, 0.9])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Số CCCD/ĐDCN');
});

test('an unpunctuated taxpayer label outranks a nearby printed notice suffix', () => {
  const result = recognize([
    { text: 'thông báo:', coords: [0.48, 0.774, 0.499, 0.9] },
    { text: 'Người nộp thuế', coords: [0.502, 0.188, 0.525, 0.369] },
  ], [candidate('taxpayer', [0.51, 0.353, 0.523, 0.91])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Người nộp thuế');
});

test('table header and row labels are excluded; two parties retain different fields despite shared row labels', () => {
  const rows = [[0.2, 0.24], [0.24, 0.3], [0.3, 0.38]];
  const columns = [[0.06, 0.25], [0.25, 0.57], [0.57, 0.94]];
  const texts = [['Thông tin', 'Bên nữ', 'Bên nam'], ['Họ và tên', '', ''], ['Nơi cư trú', '', '']];
  const candidates: FieldCandidate[] = [], lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  rows.forEach(([top, bottom], row) => columns.forEach(([left, right], column) => {
    candidates.push(candidate(`cell_${row}_${column}`, [top, left, bottom, right], 'closed_contour'));
    if (texts[row][column]) lines.push({ text: texts[row][column], coords: [top + 0.006, left + 0.008, top + 0.027, right - 0.008] });
  }));
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 4);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), ['Họ và tên — Bên nữ', 'Họ và tên — Bên nam', 'Nơi cư trú — Bên nữ', 'Nơi cư trú — Bên nam']);
  assert.ok(result.manifest.boxes.every(box => box.boxType === 'table_cell'));
  assert.equal(result.summary?.excludedRegions, 5);
});

test('identifier squares form one field with character slots, not repeated checkbox instructions', () => {
  const result = recognize([{ text: 'Số CCCD', coords: [0.2, 0.08, 0.23, 0.22] }],
    Array.from({ length: 12 }, (_, index) => candidate(`digit_${index}`, [0.2, 0.25 + index * 0.03, 0.228, 0.278 + index * 0.03], 'checkbox')));
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].inputKind, 'character_slots');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 12);
  assert.equal(result.manifest.boxes[0].boxType, 'text');
});

test('a numbered identifier without colon grounds slots while a square over its printed label is excluded', () => {
  const slots = Array.from({ length: 12 }, (_, index) => candidate(`slot_${index}`,
    [0.2, 0.3 + index * 0.04, 0.225, 0.33 + index * 0.04], 'checkbox'));
  const result = recognize([{ text: '4. Số ĐDCN/CMND(3)', coords: [0.2, 0.05, 0.225, 0.27] }],
    [candidate('printed_square', [0.202, 0.08, 0.22, 0.1], 'checkbox'), ...slots]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Số ĐDCN/CMND');
  assert.equal(result.manifest.boxes[0].inputKind, 'character_slots');
  assert.equal(result.manifest.boxes[0].inputRegions?.length, 12);
  assert.ok(result.regions?.some(region => region.candidateId === 'printed_square' && region.reason === 'PRINTED_LABEL_ARTIFACT'));
});

test('a later writing guide cannot erase the grounded label of character slots', () => {
  const slots = Array.from({ length: 8 }, (_, index) => candidate(`slot_${index}`,
    [0.2, 0.3 + index * 0.04, 0.225, 0.33 + index * 0.04], 'checkbox'));
  const result = recognize([{ text: 'Số CCCD', coords: [0.2, 0.05, 0.225, 0.25] }],
    [...slots, candidate('next_line', [0.245, 0.2, 0.27, 0.8])]);
  assert.equal(result.manifest.boxes[0].rawText, 'Số CCCD');
  assert.equal(result.manifest.boxes[0].inputKind, 'character_slots');
  assert.equal(result.manifest.boxes[1].rawText, '');
  assert.ok(result.manifest.boxes[1].recognition?.reviewReasons.includes('LABEL_ALREADY_ASSIGNED_TO_CHARACTER_SLOTS'));
});

test('split Vietnamese table headings label each repeated data cell without treating ordinal cells as checkboxes', () => {
  const columns = [[0.05, 0.1], [0.1, 0.4], [0.4, 0.6], [0.6, 0.9]];
  const candidates: FieldCandidate[] = [];
  const lines: { text: string; coords: NormalizedBoundingBox }[] = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < columns.length; column++) {
    const top = 0.2 + row * 0.06;
    candidates.push(candidate(`cell_${row}_${column}`, [top, columns[column][0], top + 0.06, columns[column][1]], 'closed_contour'));
  }
  candidates.push({ ...candidate('table_border', [0.2, 0.05, 0.44, 0.9], 'closed_contour'), isContainer: true });
  candidates.push(candidate('footer_left', [0.49, 0.1, 0.51, 0.4], 'checkbox'));
  candidates.push(candidate('footer_right', [0.49, 0.6, 0.51, 0.9], 'checkbox'));
  lines.push({ text: 'Họ, chữ đệm', coords: [0.205, 0.12, 0.222, 0.37] },
    { text: 'và tên', coords: [0.23, 0.2, 0.248, 0.3] },
    { text: 'Giới', coords: [0.205, 0.45, 0.222, 0.55] },
    { text: 'tính', coords: [0.23, 0.45, 0.248, 0.55] },
    { text: 'Mối quan hệ', coords: [0.205, 0.63, 0.222, 0.87] });
  const result = recognize(lines, candidates);
  const tableFields = result.manifest.boxes.filter(box => box.inputKind === 'table_cell');
  assert.equal(tableFields.length, 9);
  assert.deepEqual(tableFields.slice(0, 3).map(box => box.rawText),
    ['Họ, chữ đệm và tên — dòng 1', 'Giới tính — dòng 1', 'Mối quan hệ — dòng 1']);
  assert.ok(tableFields.every(box => box.normalizedCoords[0] < 0.44));
});

test('low-confidence QR-like graphic region does not create checkbox or writing fields', () => {
  const document = assembleJson({ provider: 'vietocr', fullText: '03800000095\nHọ và tên:',
    lines: [
      { id: 'qr', text: '03800000095', boundingBox: [0.08, 0.05, 0.25, 0.24] as NormalizedBoundingBox, confidence: 0.25, page: 1, tokenIds: [] },
      { id: 'label', text: 'Họ và tên:', boundingBox: [0.3, 0.05, 0.33, 0.25] as NormalizedBoundingBox, confidence: 0.95, page: 1, tokenIds: [] },
    ], tokens: [], pageCount: 1, warnings: [] },
  { documentId: 'qr-form', mimeType: 'image/png', imageDimensions: { width: 1000, height: 1000 } });
  const container = { ...candidate('qr_container', [0.08, 0.05, 0.25, 0.24], 'closed_contour'), isContainer: true };
  const result = assembleFormManifest({ formId: 'QR', formCode: 'QR', formTitle: 'QR', width: 1000, height: 1000,
    document, candidates: [container,
      candidate('finder_1', [0.09, 0.06, 0.12, 0.09], 'checkbox'),
      candidate('finder_2', [0.09, 0.19, 0.12, 0.22], 'checkbox'),
      candidate('finder_3', [0.17, 0.06, 0.2, 0.09], 'checkbox'),
      candidate('input', [0.3, 0.3, 0.325, 0.8]) ] });
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Họ và tên');
  assert.equal(result.regions?.filter(region => region.reason === 'QR_OR_GRAPHIC_REGION').length, 4);
});

test('checkbox labels can be read beside their actual geometric square without OCR inventing a checkbox symbol', () => {
  const result = recognize([{ text: 'Nhận qua tài khoản ngân hàng', coords: [0.3, 0.15, 0.325, 0.7] }],
    [candidate('option', [0.3, 0.1, 0.325, 0.125], 'checkbox')]);
  assert.equal(result.manifest.boxes[0].boxType, 'checkbox');
  assert.equal(result.manifest.boxes[0].rawText, 'Nhận qua tài khoản ngân hàng');
});

test('a checkbox after its printed option uses the left text instead of the next option', () => {
  const result = recognize([
    { text: '2. Giới tính: Nam', coords: [0.2, 0.7, 0.225, 0.905] },
    { text: '1 Nữ', coords: [0.2, 0.91, 0.225, 0.965] },
    { text: 'Cấp hộ chiếu có gắn chíp điện tử', coords: [0.4, 0.05, 0.425, 0.39] },
    { text: 'Cấp hộ chiếu không gắn chíp điện tử', coords: [0.4, 0.52, 0.425, 0.84] },
  ], [
    candidate('male', [0.2, 0.9, 0.225, 0.915], 'checkbox'),
    candidate('female', [0.2, 0.958, 0.225, 0.973], 'checkbox'),
    candidate('chip', [0.4, 0.34, 0.425, 0.378], 'checkbox'),
    candidate('no_chip', [0.4, 0.845, 0.425, 0.883], 'checkbox'),
  ]);
  assert.deepEqual(result.manifest.boxes.map(box => box.rawText), [
    'Giới tính — Nam', 'Giới tính — Nữ', 'Cấp hộ chiếu có gắn chíp điện tử', 'Cấp hộ chiếu không gắn chíp điện tử',
  ]);
  assert.ok(result.manifest.boxes.every(box => box.inputKind === 'checkbox'));
  assert.ok(result.manifest.boxes.slice(0, 2).every(box => box.recognition?.status === 'needs_review'));
});

test('generic unfamiliar label is grounded only with a colon and blank value, not an arbitrary explanatory paragraph', () => {
  const result = recognize([
    { text: 'Tên dự án: ....................', coords: [0.2, 0.1, 0.22, 0.9] },
    { text: 'Lưu ý: biểu mẫu này cần kiểm tra kỹ.', coords: [0.3, 0.1, 0.32, 0.9] },
  ], [candidate('project', [0.2, 0.3, 0.225, 0.9]), candidate('note', [0.3, 0.1, 0.32, 0.9], 'field_row')]);
  assert.equal(result.manifest.boxes.length, 1);
  assert.equal(result.manifest.boxes[0].rawText, 'Tên dự án');
});

test('a notes-only page cannot turn prose rows and letter-shaped contours into fields', () => {
  const lines = [{ text: 'Ghi chú:', coords: [0.05, 0.1, 0.075, 0.3] as NormalizedBoundingBox },
    ...Array.from({ length: 8 }, (_, index) => ({ text: 'Nội dung hướng dẫn chỉ để đọc, không phải trường cần kê khai.',
      coords: [0.1 + index * 0.06, 0.1, 0.125 + index * 0.06, 0.9] as NormalizedBoundingBox }))];
  const candidates = [
    ...lines.slice(1).map((line, index) => candidate(`paragraph_${index}`, line.coords, 'field_row')),
    { ...candidate('letter', [0.22, 0.4, 0.236, 0.418], 'checkbox'), rectangularity: 0.68 },
    { ...candidate('punctuation', [0.35, 0.56, 0.37, 0.58]), shortGuide: true, guideStyle: 'dotted' as const },
  ];
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 0);
  assert.equal(result.summary?.excludedRegions, candidates.length);
  assert.ok(result.regions?.every(region => region.reason === 'NOTES_ONLY_PAGE_REVIEW_REQUIRED'));
});

test('an actual writing guide on a page headed Ghi chú is not suppressed', () => {
  const lines = [{ text: 'Ghi chú:', coords: [0.05, 0.1, 0.075, 0.3] as NormalizedBoundingBox },
    ...Array.from({ length: 8 }, (_, index) => ({ text: 'Nội dung hướng dẫn chỉ để đọc, không phải trường cần kê khai.',
      coords: [0.1 + index * 0.05, 0.1, 0.125 + index * 0.05, 0.9] as NormalizedBoundingBox })),
    { text: 'Tên dự án: ....................', coords: [0.7, 0.1, 0.725, 0.9] as NormalizedBoundingBox }];
  const result = recognize(lines, [candidate('project', [0.7, 0.31, 0.725, 0.9])]);
  assert.ok(result.manifest.boxes.some(box => box.rawText === 'Tên dự án'));
});

test('five region roles are explicitly distinguished and boxes expose role correctly', () => {
  const lines = [
    { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', coords: [0.05, 0.2, 0.08, 0.8] as NormalizedBoundingBox },
    { text: 'Độc lập - Tự do - Hạnh phúc', coords: [0.08, 0.3, 0.1, 0.7] as NormalizedBoundingBox },
    { text: 'Họ và tên: .............................', coords: [0.2, 0.1, 0.23, 0.9] as NormalizedBoundingBox },
    { text: '(Ghi rõ họ và tên theo CCCD)', coords: [0.235, 0.1, 0.255, 0.6] as NormalizedBoundingBox },
    { text: 'Giới tính: [ ] Nam  [ ] Nữ', coords: [0.3, 0.1, 0.33, 0.6] as NormalizedBoundingBox },
  ];
  const candidates = [
    candidate('input_name', [0.2, 0.35, 0.23, 0.9], 'writing_guide'),
    candidate('desc_note', [0.235, 0.1, 0.255, 0.6], 'field_row'),
    candidate('chk_male', [0.305, 0.25, 0.325, 0.28], 'checkbox'),
    candidate('chk_female', [0.305, 0.45, 0.325, 0.48], 'checkbox'),
  ];
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 3); // 1 input name + 2 checkboxes
  const nameBox = result.manifest.boxes.find(box => box.rawText === 'Họ và tên');
  assert.ok(nameBox);
  assert.equal(nameBox.role, 'input');
  assert.equal(nameBox.inputKind, 'single_line_text');

  const checkboxes = result.manifest.boxes.filter(box => box.role === 'checkbox');
  assert.equal(checkboxes.length, 2);
  assert.ok(checkboxes.every(chk => chk.boxType === 'checkbox'));

  // Excluded regions contain description
  assert.ok(result.regions?.some(r => r.role === 'description'));
});

test('ambiguous labels and unconfirmed scopes strictly trigger needs_review status', () => {
  const lines = [
    { text: 'Số CMND: ....................', coords: [0.2, 0.1, 0.22, 0.5] as NormalizedBoundingBox },
    { text: 'Cấp ngày: ...................', coords: [0.2, 0.5, 0.22, 0.9] as NormalizedBoundingBox },
  ];
  // 1 candidate overlapping both anchors with similar scores -> ambiguous
  const candidates = [
    candidate('ambig_guide', [0.2, 0.4, 0.22, 0.6], 'writing_guide'),
  ];
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 1);
  const box = result.manifest.boxes[0];
  assert.equal(box.recognition?.status, 'needs_review');
});

test('uncalibrated low OCR confidence remains visible but does not alone prioritize a field as structurally risky', () => {
  const result = recognize(
    [{ text: 'Họ và tên: ....................', coords: [0.2, 0.1, 0.22, 0.55] }],
    [{ ...candidate('low_confidence_guide', [0.2, 0.35, 0.22, 0.8]), guideStyle: 'dotted' }],
    0.72,
  );
  assert.equal(result.manifest.boxes.length, 1);
  const box = result.manifest.boxes[0];
  assert.equal(box.recognition?.status, 'suggested');
  assert.ok(box.recognition?.reviewReasons.includes('OCR_LOW_CONFIDENCE'));
  assert.equal(result.manifest.boxes.filter(item => item.recognition?.status === 'needs_review').length, 0);
});

test('review priority excludes normal label matches and continuation evidence but keeps concrete scope risks', () => {
  assert.deepEqual(prioritizedReviewReasons(['LABEL_GEOMETRY_MATCH', 'OCR_LOW_CONFIDENCE', 'SAME_LINE_CONTINUATION',
    'MULTILINE_CONTINUATION', 'REPEATED_LABEL_SCOPE_REVIEW']), ['REPEATED_LABEL_SCOPE_REVIEW']);
});

test('next priority review navigation skips suggestions, advances, wraps, and returns no target when clear', () => {
  const boxes = [
    { rawText: 'Gợi ý', recognition: { status: 'suggested' as const } },
    { rawText: 'Cần xem', recognition: { status: 'needs_review' as const } },
    { rawText: '', recognition: { status: 'suggested' as const } },
    { rawText: 'Đã gợi ý', recognition: { status: 'suggested' as const } },
  ];
  assert.equal(nextPriorityReviewIndex(boxes, 0), 1);
  assert.equal(nextPriorityReviewIndex(boxes, 1), 2);
  assert.equal(nextPriorityReviewIndex(boxes, 3), 1);
  assert.equal(nextPriorityReviewIndex(boxes.slice(0, 1), 0), undefined);
});

test('inline multi-field row splits continuous candidate into discrete non-overlapping sub-boxes with IoU >= 0.6', () => {
  const lines = [
    { text: 'Đại diện bên A: .................... Chức vụ: .................... Quốc tịch: ....................', coords: [0.3, 0.05, 0.32, 0.95] as NormalizedBoundingBox }
  ];
  // One single continuous candidate spanning across all three fields on the row
  const candidates = [
    { ...candidate('long_row_guide', [0.3, 0.22, 0.32, 0.95]), guideStyle: 'dotted' as const }
  ];
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 3);
  const labels = result.manifest.boxes.map(b => b.rawText);
  assert.deepEqual(labels, ['Đại diện bên A', 'Chức vụ', 'Quốc tịch']);

  // Verify non-overlapping input regions and 0 collisions
  const boxes = result.manifest.boxes;
  assert.ok(boxes.every(b => !b.recognition?.reviewReasons.includes('AMBIGUOUS_LABEL')));
  for (let i = 0; i < boxes.length - 1; i++) {
    const current = boxes[i].normalizedCoords;
    const next = boxes[i + 1].normalizedCoords;
    assert.ok(current[3] <= next[1] + 0.01, `Expected box ${i} right ${current[3]} <= box ${i+1} left ${next[1]}`);
  }
  // Verify IoU >= 0.6 for segmented boxes relative to their expected spans
  assert.ok(boxes[0].estimatedWidthRatio >= 0.15);
  assert.ok(boxes[1].estimatedWidthRatio >= 0.15);
  assert.ok(boxes[2].estimatedWidthRatio >= 0.15);
});

test('multiline fields group continuation rows without swallowing subsequent row labels', () => {
  const lines = [
    { text: 'Nội dung công việc: .................................................', coords: [0.2, 0.1, 0.22, 0.9] as NormalizedBoundingBox },
    { text: 'Địa điểm làm việc: ..................................................', coords: [0.28, 0.1, 0.295, 0.9] as NormalizedBoundingBox }
  ];
  const candidates = [
    { ...candidate('work_r1', [0.2, 0.32, 0.22, 0.9]), guideStyle: 'dotted' as const },
    { ...candidate('work_r2', [0.23, 0.1, 0.25, 0.9]), guideStyle: 'dotted' as const },
    { ...candidate('location_guide', [0.28, 0.32, 0.295, 0.9]), guideStyle: 'dotted' as const }
  ];
  const result = recognize(lines, candidates);
  assert.equal(result.manifest.boxes.length, 2);
  const workBox = result.manifest.boxes.find(b => b.rawText === 'Nội dung công việc');
  const locBox = result.manifest.boxes.find(b => b.rawText === 'Địa điểm làm việc');
  assert.ok(workBox);
  assert.ok(locBox);
  assert.equal(workBox.inputKind, 'multiline_text');
  assert.equal(workBox.inputRegions?.length, 2);
  assert.equal(locBox.inputKind, 'single_line_text');
  assert.equal(locBox.inputRegions?.length, 1);
});

