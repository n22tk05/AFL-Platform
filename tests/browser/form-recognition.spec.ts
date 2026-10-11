import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { assembleJson } from '../../src/modules/documents/json-assembler';
import type { FormGeometricManifest, FormWorkflow, NormalizedBoundingBox } from '../../src/shared/contracts';
import type { FormOcrContext } from '../../src/modules/forms/services/form-ocr-context';

interface TableGroundTruth {
  imageDimensions: { width: number; height: number };
  rowBoundariesPx: number[];
  columns: { leftPx: number; rightPx: number; label: string }[];
}
interface FieldGroundTruth {
  imageDimensions?: { width: number; height: number };
  fields: { id: string; label: string; verbatimLabel?: string; kind: 'text' | 'checkbox'; rect: NormalizedBoundingBox;
    continuationRects?: NormalizedBoundingBox[] }[];
}

function boxIou(first: NormalizedBoundingBox, second: NormalizedBoundingBox): number {
  const overlapHeight = Math.max(0, Math.min(first[2], second[2]) - Math.max(first[0], second[0]));
  const overlapWidth = Math.max(0, Math.min(first[3], second[3]) - Math.max(first[1], second[1]));
  const intersection = overlapHeight * overlapWidth;
  const firstArea = (first[2] - first[0]) * (first[3] - first[1]);
  const secondArea = (second[2] - second[0]) * (second[3] - second[1]);
  return intersection / (firstArea + secondArea - intersection);
}

function fieldRect(box: { normalizedCoords: NormalizedBoundingBox; inputRegions?: { normalizedCoords: NormalizedBoundingBox }[] }): NormalizedBoundingBox {
  const regions = box.inputRegions?.map(region => region.normalizedCoords) ?? [];
  if (regions.length < 2) return box.normalizedCoords;
  const ordered = [...regions].sort((first, second) => first[1] - second[1]);
  const sameRow = ordered.slice(1).every((rect, index) => {
    const previous = ordered[index];
    const centerDiff = Math.abs((rect[0] + rect[2] - previous[0] - previous[2]) / 2);
    return centerDiff <= Math.min(rect[2] - rect[0], previous[2] - previous[0]) * 0.5
      && rect[1] - previous[3] >= 0 && rect[1] - previous[3] <= 0.15;
  });
  if (!sameRow) return box.normalizedCoords;
  return [Math.min(...ordered.map(rect => rect[0])), ordered[0][1],
    Math.max(...ordered.map(rect => rect[2])), ordered.at(-1)![3]];
}

function measureAnnotatedTable(groundTruth: TableGroundTruth, boxes: { rawText: string; normalizedCoords: NormalizedBoundingBox }[]) {
  const available = [...boxes];
  const overlaps: number[] = [];
  let matchingLabels = 0;
  for (let row = 0; row < groundTruth.rowBoundariesPx.length - 1; row++) for (const column of groundTruth.columns) {
    const expected: NormalizedBoundingBox = [groundTruth.rowBoundariesPx[row] / groundTruth.imageDimensions.height,
      column.leftPx / groundTruth.imageDimensions.width, groundTruth.rowBoundariesPx[row + 1] / groundTruth.imageDimensions.height,
      column.rightPx / groundTruth.imageDimensions.width];
    const scores = available.map(box => boxIou(expected, box.normalizedCoords));
    const bestScore = Math.max(0, ...scores);
    if (bestScore < 0.5) continue;
    const [matched] = available.splice(scores.indexOf(bestScore), 1);
    overlaps.push(bestScore);
    if (matched.rawText.normalize('NFC') === `${column.label} — dòng ${row + 1}`) matchingLabels++;
  }
  return { expectedCells: (groundTruth.rowBoundariesPx.length - 1) * groundTruth.columns.length,
    matchedCells: overlaps.length, unmatchedPredictions: available.length, exactLabels: matchingLabels,
    meanIou: overlaps.reduce((total, value) => total + value, 0) / Math.max(overlaps.length, 1),
    minimumIou: overlaps.length ? Math.min(...overlaps) : 0 };
}

function geometryOnly(benchmark: ReturnType<typeof measureAnnotatedTable>) {
  return { expectedCells: benchmark.expectedCells, matchedCells: benchmark.matchedCells,
    unmatchedPredictions: benchmark.unmatchedPredictions, meanIou: benchmark.meanIou, minimumIou: benchmark.minimumIou };
}

function measureAnnotatedFields(groundTruth: FieldGroundTruth, boxes: {
  rawText: string; inputKind: string; normalizedCoords: NormalizedBoundingBox;
  inputRegions?: { normalizedCoords: NormalizedBoundingBox }[];
}[], wholePage = false, imageDimensions?: { width: number; height: number }) {
  const candidates = groundTruth.fields.flatMap((field, expectedIndex) => boxes.flatMap((box, predictedIndex) => {
    if ((box.inputKind === 'checkbox') !== (field.kind === 'checkbox')) return [];
    const iou = boxIou(field.rect, fieldRect(box));
    return iou >= 0.5 ? [{ expectedIndex, predictedIndex, iou }] : [];
  })).sort((first, second) => second.iou - first.iou);
  const matchedExpected = new Set<number>();
  const matchedPredicted = new Set<number>();
  const matches = [];
  for (const candidate of candidates) {
    if (matchedExpected.has(candidate.expectedIndex) || matchedPredicted.has(candidate.predictedIndex)) continue;
    matchedExpected.add(candidate.expectedIndex);
    matchedPredicted.add(candidate.predictedIndex);
    const expected = groundTruth.fields[candidate.expectedIndex];
    const predicted = boxes[candidate.predictedIndex];
    const predictedRect = fieldRect(predicted);
    const continuationRects = expected.continuationRects ?? [];
    const predictedContinuations = predicted.inputRegions?.slice(1).map(region => region.normalizedCoords) ?? [];
    matches.push({ id: expected.id, expectedLabel: expected.label, expectedVerbatimLabel: expected.verbatimLabel,
      predictedLabel: predicted.rawText, iou: candidate.iou,
      edgeErrorPx: imageDimensions ? {
        top: (predictedRect[0] - expected.rect[0]) * imageDimensions.height,
        left: (predictedRect[1] - expected.rect[1]) * imageDimensions.width,
        bottom: (predictedRect[2] - expected.rect[2]) * imageDimensions.height,
        right: (predictedRect[3] - expected.rect[3]) * imageDimensions.width,
      } : undefined,
      expectedContinuationCount: continuationRects.length, predictedContinuationCount: predictedContinuations.length,
      matchedContinuations: continuationRects.filter(rect => predictedContinuations.some(region => boxIou(rect, region) >= 0.5)).length });
  }
  const nearCandidates = groundTruth.fields.flatMap((field, expectedIndex) => boxes.flatMap((box, predictedIndex) => {
    if (matchedExpected.has(expectedIndex) || matchedPredicted.has(predictedIndex)
      || (box.inputKind === 'checkbox') !== (field.kind === 'checkbox')) return [];
    const iou = boxIou(field.rect, fieldRect(box));
    return iou >= 0.15 && iou < 0.5 ? [{ expectedIndex, predictedIndex, iou }] : [];
  })).sort((first, second) => second.iou - first.iou);
  const nearExpected = new Set<number>(), nearPredicted = new Set<number>();
  const nearMisses = nearCandidates.flatMap(candidate => {
    if (nearExpected.has(candidate.expectedIndex) || nearPredicted.has(candidate.predictedIndex)) return [];
    nearExpected.add(candidate.expectedIndex);
    nearPredicted.add(candidate.predictedIndex);
    return [{ id: groundTruth.fields[candidate.expectedIndex].id,
      predictedLabel: boxes[candidate.predictedIndex].rawText, iou: candidate.iou }];
  });
  const edgeErrorsPx = matches.flatMap(match => match.edgeErrorPx ? Object.values(match.edgeErrorPx) : []);
  const absoluteEdgeErrorsPx = edgeErrorsPx.map(Math.abs).sort((first, second) => first - second);
  const coordinateMetrics = imageDimensions ? {
    matchedFields: matches.length,
    meanAbsoluteEdgeErrorPx: absoluteEdgeErrorsPx.reduce((total, value) => total + value, 0) / Math.max(absoluteEdgeErrorsPx.length, 1),
    p90AbsoluteEdgeErrorPx: absoluteEdgeErrorsPx[Math.min(absoluteEdgeErrorsPx.length - 1, Math.floor(absoluteEdgeErrorsPx.length * 0.9))] ?? 0,
    edgesWithin2Px: absoluteEdgeErrorsPx.filter(value => value <= 2).length,
    totalEdges: absoluteEdgeErrorsPx.length,
    meanSignedEdgeErrorPx: edgeErrorsPx.reduce((total, value) => total + value, 0) / Math.max(edgeErrorsPx.length, 1),
  } : undefined;
  return { expectedFields: groundTruth.fields.length, truePositives: matches.length,
    falseNegatives: groundTruth.fields.filter((_, index) => !matchedExpected.has(index)).map(field => field.id),
    falsePositives: boxes.flatMap((box, index) => !matchedPredicted.has(index) && (wholePage || box.normalizedCoords[0] >= 0.2
      && box.normalizedCoords[0] <= 0.91) ? [{ inputKind: box.inputKind, rawText: box.rawText, rect: box.normalizedCoords }] : []),
    exactLabels: matches.filter(match => match.expectedLabel.normalize('NFC') === match.predictedLabel.normalize('NFC')).length,
    annotatedVerbatimLabels: matches.filter(match => match.expectedVerbatimLabel !== undefined).length,
    exactVerbatimLabels: matches.filter(match => match.expectedVerbatimLabel !== undefined
      && match.expectedVerbatimLabel.normalize('NFC') === match.predictedLabel.normalize('NFC')).length,
    nonemptyLabels: matches.filter(match => match.predictedLabel.trim()).length,
    expectedContinuations: groundTruth.fields.reduce((total, field) => total + (field.continuationRects?.length ?? 0), 0),
    matchedContinuations: matches.reduce((total, match) => total + match.matchedContinuations, 0),
    exactGroupingFields: matches.filter(match => match.expectedContinuationCount > 0
      && match.expectedContinuationCount === match.predictedContinuationCount
      && match.expectedContinuationCount === match.matchedContinuations).length,
    coordinateMetrics, nearMisses, matches };
}

async function analyzeBlankForm(page: import('@playwright/test').Page, code: string, title: string, imagePath: string) {
  await page.goto('/admin/upload');
  const formFields = page.locator('input[type="text"]');
  await expect(formFields).toHaveCount(3, { timeout: 10_000 });
  await formFields.nth(0).fill(code);
  await formFields.nth(1).fill(title);
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.getByRole('checkbox').check();
  const analyzeButton = page.getByRole('button', { name: /Phân tích OpenCV/ });
  await expect(analyzeButton).toBeEnabled({ timeout: 10_000 });
  await analyzeButton.click();
  const downloadButton = page.getByRole('button', { name: /Tải JSON nhận diện/ });
  const errorAlert = page.locator('[role="alert"].bg-red-50');
  await expect.poll(async () => (await downloadButton.isVisible()) || (await errorAlert.isVisible()), { timeout: 180_000 })
    .toBe(true);
  if (await errorAlert.isVisible()) throw new Error(`Form analysis failed: ${await errorAlert.innerText()}`);
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const draftPath = await (await downloadPromise).path();
  return JSON.parse(fs.readFileSync(draftPath, 'utf8'));
}

function measureRowIdentifiers(boxes: { rawText: string }[], expected: string[]) {
  const rows = boxes.filter(box => box.rawText.endsWith(' — Có')).map(box => box.rawText);
  expect(rows).toHaveLength(expected.length);
  const mismatches = expected.flatMap((identifier, index) => rows[index].startsWith(`${identifier} `)
    ? [] : [{ row: index + 1, expected: identifier, recognized: rows[index] }]);
  return { expectedRows: expected.length, exactIdentifiers: expected.length - mismatches.length, mismatches };
}

function editDistance(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      current.push(Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + Number(first[row - 1] !== second[column - 1])));
    }
    previous = current;
  }
  return previous[second.length];
}

function measureRowLabels(boxes: { rawText: string }[], expected: string[]) {
  const rows = boxes.filter(box => box.rawText.endsWith(' — Có'))
    .map(box => box.rawText.slice(0, -' — Có'.length).normalize('NFC').replace(/\s+/gu, ' ').trim());
  expect(rows).toHaveLength(expected.length);
  const distances = expected.map((label, index) => editDistance(label.normalize('NFC'), rows[index]));
  const expectedCharacters = expected.reduce((total, label) => total + label.length, 0);
  return { expectedRows: expected.length, exactLabels: distances.filter(distance => distance === 0).length,
    characterErrorRate: distances.reduce((total, distance) => total + distance, 0) / expectedCharacters,
    highErrorRows: distances.flatMap((distance, index) => distance / expected[index].length > 0.15
      ? [{ row: index + 1, expected: expected[index], recognized: rows[index], characterErrorRate: distance / expected[index].length }] : []) };
}

const regions = [
  { regionId: 'line_1', pageNumber: 1, normalizedCoords: [0.2, 0.3, 0.225, 0.9] as NormalizedBoundingBox },
  { regionId: 'line_2', pageNumber: 1, normalizedCoords: [0.25, 0.1, 0.275, 0.9] as NormalizedBoundingBox },
  { regionId: 'line_3', pageNumber: 1, normalizedCoords: [0.3, 0.1, 0.325, 0.9] as NormalizedBoundingBox },
];
function workflow(status: FormWorkflow['status'] = 'ACTIVE'): FormWorkflow {
  return { formId: 'FORM-REGIONS', formCode: 'FORM-REGIONS', formTitle: 'Thử nhiều dòng', status,
    pages: [{ pageNumber: 1, width: 800, height: 1000, imageUrl: `/api/forms/FORM-REGIONS/pages/1?asset=${'a'.repeat(64)}` }],
    steps: [{ stepIndex: 1, boxId: 'box_001', pageNumber: 1, sectionName: 'I', label: 'Nội dung',
      voiceGuidance: 'Viết nội dung trên ba dòng.', audioUrl: '', exampleRedText: 'VÍ DỤ', inputKind: 'multiline_text',
      highlightCoords: regions[0].normalizedCoords, highlightRegions: regions,
      faqs: [{ question: 'Viết ở đâu?', answer: 'Ba dòng của cùng một trường.' }] }] };
}
const imageBytes = () => sharp({ create: { width: 800, height: 1000, channels: 3, background: 'white' } }).png().toBuffer();

test('citizen highlights every region of one field and speaks only one instruction; checkbox copy is not a writing command', async ({ page }) => {
  const data = workflow();
  await page.addInitScript(() => {
    const state = window as unknown as { spoken: string[] };
    state.spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak: (utterance: SpeechSynthesisUtterance) => { state.spoken.push(utterance.text); }, cancel: () => {},
    } });
  });
  await page.route('**/api/forms/*/workflow', route => route.fulfill({ json: { success: true, data } }));
  const buffer = await imageBytes();
  await page.route('**/api/forms/*/pages/**', route => route.fulfill({ contentType: 'image/png', body: buffer }));
  await page.goto('/citizen/guide?formCode=FORM-REGIONS');
  await expect(page.getByTestId('field-highlight-region')).toHaveCount(3);
  await expect(page.getByText('VIẾT TRÊN CÁC DÒNG NÀY', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual(['Viết nội dung trên ba dòng.']);
  data.steps[0] = { ...data.steps[0], inputKind: 'checkbox', highlightRegions: [regions[0]], voiceGuidance: 'Tích lựa chọn phù hợp.' };
  await page.reload();
  await expect(page.getByTestId('field-highlight-region')).toHaveCount(1);
  await expect(page.getByText('TÍCH CHỌN TẠI ĐÂY', { exact: true })).toBeVisible();
});

if (process.env.RECOGNITION_LOCAL_EVIDENCE) test('local VietOCR evidence joins actual browser geometry without recognizing outer borders as fields', async ({ page }) => {
  test.setTimeout(120_000);
  const evidencePath = process.env.RECOGNITION_LOCAL_EVIDENCE!;
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as { predictions: { lineId: string; text: string; confidence: number; coordinates: NormalizedBoundingBox }[] };
  const buffer = fs.readFileSync(evidencePath.replace(/\.json$/, '.png'));
  const document = assembleJson({ provider: 'vietocr', fullText: evidence.predictions.map(item => item.text).join('\n'),
    lines: evidence.predictions.map(item => ({ id: item.lineId, text: item.text, boundingBox: item.coordinates, confidence: item.confidence, page: 1, tokenIds: [] })),
    tokens: [], pageCount: 1, warnings: [] }, { documentId: 'local-synthetic-ocr', mimeType: 'image/png', imageDimensions: { width: 1000, height: 800 } });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/documents/json', route => route.fulfill({ json: { success: true, data: document } }));
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('LOCAL-OCR');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Phôi tổng hợp không chứa dữ liệu cá nhân');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles({ name: 'local-ocr.png', mimeType: 'image/png', buffer });
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  const fields = dialog.getByRole('combobox', { name: 'Ô cần đối soát' });
  await expect(fields).toBeVisible({ timeout: 90_000 });
  await expect(fields.locator('option')).toHaveCount(3);
  await fields.selectOption('1');
  await expect(dialog.getByLabel('Loại trường')).toHaveValue('multiline_text');
  await expect(dialog.getByLabel('Vùng của trường').locator('option')).toHaveCount(3);
  await expect(dialog.getByText('OCR_LOW_CONFIDENCE', { exact: false }).first()).toBeVisible();
  await fields.selectOption('2');
  await expect(dialog.getByLabel('Loại trường')).toHaveValue('checkbox');
  await test.info().attach('local-ocr-recognition', { body: await dialog.screenshot(), contentType: 'image/png' });
});

if (process.env.RECOGNITION_RESEARCH_BLANKS) for (const name of ['F19-p5.png', 'F20-p1.png', 'F20-p2.png', 'F14-p5.png']) {
  test(`local blank form ${name} reaches review without saving data`, async ({ page }) => {
    test.setTimeout(180_000);
    const source = `private-documents/form-research-20/${name}`;
    const output = 'private-documents/recognition-evaluation';
    const writes: string[] = [];
    await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
    await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
    await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
    await page.goto('/admin/library');
    await page.getByLabel('Khóa quản trị', { exact: false }).fill('local-benchmark-only');
    await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill(name.startsWith('F19') ? 'LOCAL-TK01'
      : name.startsWith('F20-p2') ? 'LOCAL-CT01-NOTES' : name.startsWith('F14') ? 'LOCAL-TAX-NOTES' : 'LOCAL-CT01');
    await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Đo phôi trắng tại máy, không lưu');
    await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles(source);
    await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
    const ocrResponsePromise = page.waitForResponse(response => response.url().includes('/api/documents/json') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
    const ocrResponse = await ocrResponsePromise;
    const ocrEnvelope = await ocrResponse.json();
    expect(ocrResponse.ok()).toBe(true);
    expect(ocrEnvelope.success).toBe(true);
    const ocrLines = ocrEnvelope.data.blocks.filter((block: { kind: string }) => block.kind === 'line') as { text: string }[];
    const fields = dialog.getByRole('combobox', { name: 'Ô cần đối soát' });
    await expect(fields).toBeVisible({ timeout: 160_000 });
    const fieldCount = await fields.locator('option').count();
    if (!name.startsWith('F20-p2') && !name.startsWith('F14')) expect(fieldCount).toBeGreaterThan(0);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' }).click();
    const download = await downloadPromise;
    const draft = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(writes).toEqual([]);
    if (name.startsWith('F20-p2') || name.startsWith('F14')) {
      expect(ocrLines.some(line => /Chú thích|Ghi chú/iu.test(line.text))).toBe(true);
      expect(fieldCount).toBe(0);
      expect(draft.manifest.boxes).toHaveLength(0);
      expect(draft.regions.every((region: { reason: string }) => region.reason === 'NOTES_ONLY_PAGE_REVIEW_REQUIRED')).toBe(true);
      await expect(dialog.getByRole('alert')).toContainText('chỉ chứa chú thích hoặc hướng dẫn');
      await expect(dialog.getByRole('img', { name: 'Ảnh phôi để đối soát trang không có ô nhận diện' })).toBeVisible();
      await dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn, loại ô, vùng cần viết và thứ tự bước.' }).check();
      await expect(dialog.getByRole('button', { name: 'Lưu phôi và sinh kịch bản chờ duyệt' })).toBeDisabled();
    } else if (name.startsWith('F19')) {
      expect(ocrLines.some(line => line.text.includes('Số ĐDCN/CMND'))).toBe(true);
      await expect(dialog.getByRole('alert')).toContainText('Phần lớn vùng chưa ghép được nhãn');
      expect(draft.regions.filter((region: { reason: string }) => region.reason === 'QR_OR_GRAPHIC_REGION').length).toBeGreaterThanOrEqual(8);
      expect(draft.manifest.boxes.some((box: { rawText: string; inputKind: string; inputRegions: unknown[] }) =>
        box.rawText === 'Số ĐDCN/CMND' && box.inputKind === 'character_slots' && box.inputRegions.length === 12)).toBe(true);
      const checkboxLabels = draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'checkbox')
        .map((box: { rawText: string }) => box.rawText);
      expect(checkboxLabels).toEqual(expect.arrayContaining([
        'Giới tính — Nam', 'Giới tính — Nữ', 'Cấp hộ chiếu có gắn chíp điện tử', 'Cấp hộ chiếu không gắn chíp điện tử',
      ]));
      expect(draft.manifest.boxes.filter((box: { inputKind: string; normalizedCoords: number[] }) =>
        box.inputKind === 'checkbox' && box.normalizedCoords[0] > 0.56 && box.normalizedCoords[0] < 0.59)).toHaveLength(2);
    } else {
      expect(ocrLines.length).toBeGreaterThanOrEqual(35);
      expect(ocrLines.some(line => /HEARTH|TETTER|TELLIES|Trans|Horses|Contraction|Tones|Therm|TIT/iu.test(line.text))).toBe(false);
      expect(ocrLines.some(line => line.text.includes('Số định danh cá nhân của chủ hộ'))).toBe(true);
      const tableCells = draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'table_cell');
      expect(tableCells).toHaveLength(45);
      expect(draft.manifest.boxes).toHaveLength(64);
      expect(draft.manifest.boxes.filter((box: { rawText: string; inputRegions: unknown[] }) =>
        /Email/iu.test(box.rawText) && box.inputRegions.length === 2)).toHaveLength(1);
      expect(draft.manifest.boxes.filter((box: { inputKind: string; normalizedCoords: number[] }) =>
        box.inputKind === 'checkbox' && box.normalizedCoords[0] > 0.75)).toHaveLength(0);
      expect(draft.regions.some((region: { reason: string; normalizedCoords: number[] }) =>
        region.reason === 'PRINTED_STRUCTURE_ARTIFACT' && region.normalizedCoords[0] > 0.17 && region.normalizedCoords[0] < 0.2)).toBe(true);
      expect(tableCells.slice(0, 5).map((box: { rawText: string }) => box.rawText)).toEqual([
        'Họ, chữ đệm và tên — dòng 1', 'Ngày, tháng, năm sinh — dòng 1', 'Giới tính — dòng 1',
        'Số định danh cá nhân — dòng 1', 'Mối quan hệ với chủ hộ — dòng 1',
      ]);
      expect(tableCells.every((box: { normalizedCoords: number[] }) => box.normalizedCoords[0] < 0.75)).toBe(true);
      expect(draft.manifest.boxes.some((box: { rawText: string; inputKind: string }) =>
        box.rawText === 'NGÀY THÁNG NĂM' && box.inputKind === 'checkbox')).toBe(false);
      expect(draft.manifest.boxes.filter((box: { inputKind: string; rawText: string; inputRegions: unknown[] }) =>
        box.inputKind === 'character_slots' && box.rawText && box.inputRegions.length === 12)).toHaveLength(2);
      expect(draft.manifest.boxes.some((box: { rawText: string; inputKind: string; inputRegions: unknown[] }) =>
        box.rawText.includes('Ngày, tháng, năm sinh') && box.inputKind === 'single_line_text' && box.inputRegions.length === 4)).toBe(true);
      expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText.includes('Giới tính'))).toBe(true);
    }
    const recognized = [];
    for (let index = 0; index < fieldCount; index++) {
      await fields.selectOption(String(index));
      recognized.push({ label: await dialog.getByLabel('Nhãn thực trên phôi').inputValue(),
        kind: await dialog.getByLabel('Loại trường').inputValue(),
        regions: await dialog.getByLabel('Vùng của trường').locator('option').count() });
    }
    let tableBenchmark: ReturnType<typeof measureAnnotatedTable> | undefined;
    if (name.startsWith('F20-p1')) {
      const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-ct01-table-ground-truth.json', 'utf8')) as TableGroundTruth;
      expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
      tableBenchmark = measureAnnotatedTable(groundTruth, draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'table_cell'));
      expect(tableBenchmark.matchedCells).toBe(45);
      expect(tableBenchmark.unmatchedPredictions).toBe(0);
      expect(tableBenchmark.exactLabels).toBe(45);
    }
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(`${output}/${name}.browser.json`, JSON.stringify({ name, fieldCount, summary: draft.summary, tableBenchmark, recognized }, null, 2));
    fs.writeFileSync(`${output}/${name}.draft.json`, JSON.stringify(draft, null, 2));
    fs.writeFileSync(`${output}/${name}.ocr-browser.json`, JSON.stringify(ocrEnvelope, null, 2));
    await test.info().attach(`${name}-review`, { body: await dialog.screenshot(), contentType: 'image/png' });
  });
}

if (process.env.RECOGNITION_RESEARCH_BLANKS) test('local CT01 two-page form keeps notes page visible without adding fields', async ({ page }) => {
  test.setTimeout(240_000);
  const writes: string[] = [];
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('local-benchmark-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('LOCAL-CT01-TWO');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('CT01 hai trang không lưu');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles([
    'private-documents/form-research-20/F20-p1.png', 'private-documents/form-research-20/F20-p2.png',
  ]);
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Ô cần đối soát' })).toBeVisible({ timeout: 210_000 });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' }).click();
  const draft = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
  expect(draft.manifest.boxes).toHaveLength(64);
  expect(draft.manifest.boxes.map((box: { pageNumber: number }) => box.pageNumber).every((pageNumber: number) => pageNumber === 1)).toBe(true);
  expect(draft.pageReviews.map((item: { summary: { detectedFields: number } }) => item.summary.detectedFields)).toEqual([64, 0]);
  expect(draft.pageReviews[1].regions.every((region: { reason: string }) => region.reason === 'NOTES_ONLY_PAGE_REVIEW_REQUIRED')).toBe(true);
  await dialog.getByRole('combobox', { name: 'Trang phôi' }).selectOption('2');
  await expect(dialog.getByRole('img', { name: 'Ảnh phôi để đối soát trang không có ô nhận diện' })).toBeVisible();
  await expect(dialog.getByRole('alert').filter({ hasText: 'Trang 2 chưa có ô kê khai' })).toBeVisible();
  expect(writes).toEqual([]);
});

if (process.env.RECOGNITION_RESEARCH_BLANKS) test('local F05 two-page checkbox table records holdout evidence without saving data', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') {
      ocrResponses.push(response.json());
    }
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('local-benchmark-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('LOCAL-F05-HOLDOUT');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Bảng đánh giá hai trang, không lưu');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles([
    'private-documents/form-research-20/F05-p2.png', 'private-documents/form-research-20/F05-p3.png',
  ]);
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Trang phôi' })).toBeVisible({ timeout: 240_000 });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' }).click();
  const draft = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
  expect(writes).toEqual([]);
  expect(draft.pageReviews).toHaveLength(2);
  expect(draft.manifest.boxes.every((box: { pageNumber: number }) => [1, 2].includes(box.pageNumber))).toBe(true);
  const ocr = await Promise.all(ocrResponses) as { success: boolean; data: { blocks: { kind: string; text: string }[] } }[];
  expect(ocr).toHaveLength(2);
  expect(ocr.every(response => response.success && response.data.blocks.filter(block => block.kind === 'line').length >= 25)).toBe(true);
  expect(ocr[0].data.blocks.some(block => block.text === 'Contraction')).toBe(false);
  expect(draft.manifest.boxes.some((box: { rawText: string; inputKind: string }) =>
    box.rawText === '1 Khuyết tật vận động — Có' && box.inputKind === 'checkbox')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText.startsWith('1.5 Cong, vẹo'))).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText.startsWith('Các dạng khuyết tật —'))).toBe(false);
  const firstPage = draft.manifest.boxes.filter((box: { pageNumber: number }) => box.pageNumber === 1);
  expect(firstPage).toHaveLength(36);
  const firstGroundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-f05-p2-choice-ground-truth.json', 'utf8')) as TableGroundTruth;
  const firstTableBenchmark = measureAnnotatedTable(firstGroundTruth, firstPage.filter((box: { inputKind: string }) => box.inputKind === 'checkbox'));
  expect(firstTableBenchmark.expectedCells).toBe(36);
  expect(firstTableBenchmark.matchedCells).toBe(36);
  expect(firstTableBenchmark.unmatchedPredictions).toBe(0);
  const continued = draft.manifest.boxes.filter((box: { pageNumber: number }) => box.pageNumber === 2);
  expect(continued).toHaveLength(30);
  expect(continued.filter((box: { recognition?: { reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED'))).toHaveLength(30);
  expect(continued.filter((box: { recognition?: { reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('OPEN_TOP_ROW_INFERRED'))).toHaveLength(2);
  expect(draft.pageReviews[1].summary.needsReview).toBe(draft.pageReviews[1].summary.detectedFields);
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-f05-p3-choice-ground-truth.json', 'utf8')) as TableGroundTruth;
  const tableBenchmark = measureAnnotatedTable(groundTruth, continued.filter((box: { inputKind: string }) => box.inputKind === 'checkbox'));
  expect(tableBenchmark.expectedCells).toBe(30);
  expect(tableBenchmark.matchedCells).toBe(30);
  expect(tableBenchmark.unmatchedPredictions).toBe(0);
  const rowIdentifiers = JSON.parse(fs.readFileSync('tests/fixtures/recognition-f05-row-identifiers.json', 'utf8')) as { page1: string[]; page2: string[] };
  const firstLabelBenchmark = measureRowIdentifiers(firstPage, rowIdentifiers.page1);
  const continuedLabelBenchmark = measureRowIdentifiers(continued, rowIdentifiers.page2);
  expect(firstLabelBenchmark.exactIdentifiers + continuedLabelBenchmark.exactIdentifiers).toBe(33);
  const rowLabels = JSON.parse(fs.readFileSync('tests/fixtures/recognition-f05-row-labels.json', 'utf8')) as { page1: string[]; page2: string[] };
  const firstTextBenchmark = measureRowLabels(firstPage, rowLabels.page1);
  const continuedTextBenchmark = measureRowLabels(continued, rowLabels.page2);
  expect(firstTextBenchmark.exactLabels + continuedTextBenchmark.exactLabels).toBeGreaterThanOrEqual(30);
  expect(firstTextBenchmark.characterErrorRate).toBeLessThan(0.02);
  expect(continuedTextBenchmark.characterErrorRate).toBeLessThan(0.02);
  await dialog.getByRole('combobox', { name: 'Trang phôi' }).selectOption('2');
  await expect(dialog.getByRole('alert').filter({ hasText: 'tiêu đề cột kế thừa' })).toBeVisible();
  await expect(dialog.getByRole('alert').filter({ hasText: 'lưới chưa khép kín' })).toBeVisible();
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/F05-p2-p3.holdout.live.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/F05-p2-p3.holdout.live.ocr.json`, JSON.stringify(ocr, null, 2));
  fs.writeFileSync(`${output}/F05-p2-p3.holdout.live.summary.json`, JSON.stringify({
    firstTableBenchmark: geometryOnly(firstTableBenchmark), tableBenchmark: geometryOnly(tableBenchmark),
    rowIdentifierBenchmark: { page1: firstLabelBenchmark, page2: continuedLabelBenchmark },
    rowTextBenchmark: { page1: firstTextBenchmark, page2: continuedTextBenchmark },
    pageReviews: draft.pageReviews.map((review: { pageNumber: number; summary: unknown }) => ({ pageNumber: review.pageNumber, summary: review.summary })),
    boxes: draft.manifest.boxes.map((box: { pageNumber: number; inputKind: string; rawText: string }) =>
      ({ pageNumber: box.pageNumber, inputKind: box.inputKind, rawText: box.rawText })),
  }, null, 2));
});

if (process.env.RECOGNITION_RESEARCH_BLANKS) test('local F05 third page records untuned transition between two table layouts', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('local-benchmark-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('LOCAL-F05-THREE');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Ba trang, chuyển lưới, không lưu');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles([
    'private-documents/form-research-20/F05-p2.png', 'private-documents/form-research-20/F05-p3.png',
    'private-documents/form-research-20/F05-p4.png',
  ]);
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Trang phôi' })).toBeVisible({ timeout: 240_000 });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' }).click();
  const draft = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
  expect(writes).toEqual([]);
  expect(draft.pageReviews).toHaveLength(3);
  expect(draft.manifest.boxes.every((box: { pageNumber: number }) => [1, 2, 3].includes(box.pageNumber))).toBe(true);
  expect(draft.pageReviews[2].summary).toMatchObject({ detectedFields: 40, labeledFields: 40, needsReview: 40 });
  const page3Boxes = draft.manifest.boxes.filter((box: { pageNumber: number }) => box.pageNumber === 3);
  expect(page3Boxes.every((box: { inputKind: string; recognition?: { status: string } }) =>
    box.inputKind === 'checkbox' && box.recognition?.status === 'needs_review')).toBe(true);
  expect(page3Boxes.filter((box: { recognition?: { reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('TABLE_HEADER_CARRIED'))).toHaveLength(8);
  expect(page3Boxes.filter((box: { recognition?: { reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('OPEN_BOTTOM_ROW_INFERRED'))).toHaveLength(4);
  await dialog.getByRole('combobox', { name: 'Trang phôi' }).selectOption('3');
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/F05-p2-p4.blind.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/F05-p2-p4.blind.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/F05-p2-p4.blind.summary.json`, JSON.stringify({ pageReviews: draft.pageReviews.map((review: {
    pageNumber: number; summary: unknown }) => ({ pageNumber: review.pageNumber, summary: review.summary })),
    page3Boxes: draft.manifest.boxes.filter((box: { pageNumber: number }) => box.pageNumber === 3)
      .map((box: { rawText: string; inputKind: string; normalizedCoords: NormalizedBoundingBox; recognition?: { reviewReasons: string[] } }) =>
        ({ rawText: box.rawText, inputKind: box.inputKind, normalizedCoords: box.normalizedCoords,
          reviewReasons: box.recognition?.reviewReasons })),
  }, null, 2));
});

if (process.env.RECOGNITION_RESEARCH_BLANKS) test('local F05 third-page OpenCV candidate geometry is retained for debugging', async ({ page }) => {
  await page.goto('/opencv-test');
  await page.getByLabel('Chế độ xử lý').selectOption('clean-scan');
  await page.getByLabel('Chọn ảnh JPEG hoặc PNG').setInputFiles('private-documents/form-research-20/F05-p4.png');
  await page.getByRole('button', { name: 'Chạy pipeline phát hiện đường' }).click();
  await expect(page.getByRole('heading', { name: /^Field candidates \(/ })).toBeVisible({ timeout: 90_000 });
  const candidates = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find(item => item.textContent?.startsWith('Field candidates ('));
    return [...(heading?.closest('section')?.querySelectorAll('tbody tr') ?? [])].map(row => {
      const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent?.trim() ?? '');
      return { candidateId: cells[0], x: Number(cells[1]), y: Number(cells[2]), width: Number(cells[3]),
        height: Number(cells[4]), source: cells[5] };
    });
  });
  expect(candidates.length).toBeGreaterThan(40);
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/F05-p4.blind.candidates.json`, JSON.stringify(candidates, null, 2));
});

if (process.env.RECOGNITION_INDEPENDENT_BLANKS) for (const sample of [
  { code: 'QT-ANTT-01', image: 'quangtri-mau-01-anttcso-1.png', title: 'Đơn tham gia ANTT' },
  { code: 'QT-09-HSB', image: 'quangtri-mau-09-hsb-1.png', title: 'Tờ khai của thân nhân' },
]) test(`independent blank ${sample.code} records unmodified recognition output`, async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('local-benchmark-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill(sample.code);
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill(sample.title);
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles(`private-documents/recognition-evaluation/${sample.image}`);
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await expect(dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' })).toBeVisible({ timeout: 240_000 });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải JSON nhận diện để đối soát' }).click();
  const draft = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
  expect(writes).toEqual([]);
  expect(draft.manifest.boxes).toBeDefined();
  expect(draft.summary ?? draft.pageReviews?.[0]?.summary).toBeDefined();
  expect(draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'checkbox')).toHaveLength(0);
  if (sample.code === 'QT-ANTT-01') {
    expect(draft.summary).toMatchObject({ detectedFields: 5, labeledFields: 5, needsReview: 5 });
    expect(draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'multiline_text')).toHaveLength(1);
  }
  const tableBenchmark = sample.code === 'QT-09-HSB'
    ? measureAnnotatedTable(JSON.parse(fs.readFileSync('tests/fixtures/recognition-qt09-table-ground-truth.json', 'utf8')) as TableGroundTruth,
      draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'table_cell')) : undefined;
  if (tableBenchmark) {
    expect(tableBenchmark.matchedCells).toBe(24);
    expect(tableBenchmark.unmatchedPredictions).toBe(0);
    expect(draft.manifest.boxes.filter((box: { inputKind: string; recognition?: { status: string; reviewReasons: string[] } }) =>
      box.inputKind === 'table_cell').every((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
      box.recognition?.status === 'suggested' && box.recognition.reviewReasons.includes('TABLE_ROW_COLUMN_GROUNDED'))).toBe(true);
  }
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/${sample.code}.independent.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/${sample.code}.independent.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/${sample.code}.independent.summary.json`, JSON.stringify({
    summary: draft.summary ?? draft.pageReviews?.[0]?.summary,
    tableBenchmark,
    boxes: draft.manifest.boxes.map((box: { rawText: string; inputKind: string; normalizedCoords: NormalizedBoundingBox;
      recognition?: { status: string; reviewReasons: string[] } }) => ({ rawText: box.rawText, inputKind: box.inputKind,
        normalizedCoords: box.normalizedCoords, status: box.recognition?.status, reasons: box.recognition?.reviewReasons })),
  }, null, 2));
});

if (process.env.RECOGNITION_EMPLOYMENT_REGRESSION) test('blank employment-contract regression prevents field merging and records recognition metrics', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'EMPLOYMENT-CONTRACT-SAMPLE-P1', 'Hợp đồng lao động — mẫu công khai',
    'public/assets/forms/hop-dong-lao-dong/page-1.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-employment-contract-page1-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const reviewedSampleBoxes = draft.manifest.boxes.filter((box: { normalizedCoords: NormalizedBoundingBox }) =>
    box.normalizedCoords[0] >= 0.25 && box.normalizedCoords[0] < 0.62);
  const benchmark = measureAnnotatedFields(groundTruth, reviewedSampleBoxes, true, draft.manifest.imageDimensions);
  expect(benchmark).toMatchObject({ expectedFields: 14, truePositives: 14, falseNegatives: [], falsePositives: [], exactLabels: 14 });
  expect(benchmark.coordinateMetrics).toMatchObject({ matchedFields: 14 });
  expect(benchmark.coordinateMetrics?.meanAbsoluteEdgeErrorPx).toBeLessThanOrEqual(6);
  expect(benchmark.coordinateMetrics?.p90AbsoluteEdgeErrorPx).toBeLessThanOrEqual(14);
  expect(benchmark.coordinateMetrics?.edgesWithin2Px).toBeGreaterThanOrEqual(10);
  expect(draft.manifest.boxes.find((box: { rawText: string }) => box.rawText === 'Số CMND/CCCD')?.inputRegions).toHaveLength(1);
  expect(draft.manifest.boxes.find((box: { rawText: string }) => box.rawText === 'Tại')?.recognition)
    .toMatchObject({ status: 'needs_review' });
  expect(writes).toEqual([]);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/EMPLOYMENT-CONTRACT-SAMPLE-P1.regression.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/EMPLOYMENT-CONTRACT-SAMPLE-P1.regression.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/EMPLOYMENT-CONTRACT-SAMPLE-P1.regression.benchmark.json`, JSON.stringify({
    summary: draft.summary, benchmark,
  }, null, 2));
});

if (process.env.RECOGNITION_BHXH_TK3_HOLDOUT) test('blank BHXH TK3-TS page records independent upload geometry and review load without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'BHXH-TK3-TS-P16', 'Tờ khai đơn vị tham gia BHXH, BHYT — trang 16',
    'private-documents/recognition-evaluation/BHXH-TK3-TS-page16.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-bhxh-tk3-ts-page16-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, true, draft.manifest.imageDimensions);
  expect(writes).toEqual([]);
  expect(benchmark.expectedFields).toBe(groundTruth.fields.length);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(draft.manifest.boxes.filter((box: { rawText: string }) => box.rawText)
    .every((box: { rawText: string }) => !/^[.…_]+\s/u.test(box.rawText))).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/BHXH-TK3-TS-P16.independent.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/BHXH-TK3-TS-P16.independent.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/BHXH-TK3-TS-P16.independent.benchmark.json`, JSON.stringify({
    summary: draft.summary, benchmark,
  }, null, 2));
});

if (process.env.RECOGNITION_BHXH_TK1_HOLDOUT) test('blank BHXH TK1-TS page records upload geometry and review load without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'BHXH-TK1-TS-P1', 'Tờ khai tham gia, điều chỉnh thông tin BHXH, BHYT — trang 1',
    'private-documents/recognition-evaluation/BHXH-TK1-TS-page1.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-bhxh-tk1-ts-page1-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const sectionOneFields = draft.manifest.boxes.filter((box: { normalizedCoords: NormalizedBoundingBox }) =>
    box.normalizedCoords[0] >= 0.29 && box.normalizedCoords[0] <= 0.42);
  const benchmark = measureAnnotatedFields(groundTruth, sectionOneFields, true, draft.manifest.imageDimensions);
  expect(writes).toEqual([]);
  expect(benchmark.expectedFields).toBe(8);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/BHXH-TK1-TS-P1.holdout.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/BHXH-TK1-TS-P1.holdout.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/BHXH-TK1-TS-P1.holdout.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
});

if (process.env.RECOGNITION_BHXH_01TK_HOLDOUT) test('blank BHXH 01-TK page records inline fields and checkbox geometry without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'BHXH-01-TK-P58', 'Tờ khai đăng ký đóng, cấp thẻ BHYT — trang 58',
    'private-documents/recognition-evaluation/BHXH-01-TK-page58.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-bhxh-01-tk-page58-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const firstSection = draft.manifest.boxes.filter((box: { normalizedCoords: NormalizedBoundingBox }) =>
    box.normalizedCoords[0] >= 0.25 && box.normalizedCoords[0] <= 0.39);
  const benchmark = measureAnnotatedFields(groundTruth, firstSection, true, draft.manifest.imageDimensions);
  expect(writes).toEqual([]);
  expect(benchmark.expectedFields).toBe(7);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/BHXH-01-TK-P58.holdout.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/BHXH-01-TK-P58.holdout.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/BHXH-01-TK-P58.holdout.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
});

if (process.env.RECOGNITION_TAX_09MST_BLIND_HOLDOUT) test('independent blank tax 09-MST page meets field and coordinate acceptance without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'TAX-09-MST-P108', 'Thông báo người nộp thuế chuyển địa điểm — Mẫu 09-MST',
    'private-documents/recognition-evaluation/tax-09-mst-page108.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-tax-09-mst-page108-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const scopedBoxes = draft.manifest.boxes.filter((box: { normalizedCoords: NormalizedBoundingBox }) => {
    const top = box.normalizedCoords[0];
    return top >= 0.475 && top <= 0.55 || top >= 0.65 && top <= 0.69;
  });
  const benchmark = measureAnnotatedFields(groundTruth, scopedBoxes, true, draft.manifest.imageDimensions);
  if (!benchmark.coordinateMetrics) throw new Error('Expected coordinate metrics for the annotated image');
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/TAX-09-MST-P108.blind-holdout.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/TAX-09-MST-P108.blind-holdout.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/TAX-09-MST-P108.blind-holdout.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(writes).toEqual([]);
  expect(benchmark).toMatchObject({ expectedFields: 4, falsePositives: [] });
  expect(benchmark.truePositives).toBe(4);
  expect(benchmark.exactLabels).toBe(4);
  expect(benchmark.falseNegatives).toEqual([]);
  expect(benchmark.coordinateMetrics.meanAbsoluteEdgeErrorPx).toBeLessThanOrEqual(10);
  expect(benchmark.coordinateMetrics.p90AbsoluteEdgeErrorPx).toBeLessThanOrEqual(20);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
});

if (process.env.RECOGNITION_BUSINESS_FORM_BLIND_HOLDOUT) test('official 2025 private-enterprise application records blind OCR and geometry baseline without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'BUSINESS-01-PTNT', 'Giấy đề nghị đăng ký doanh nghiệp tư nhân — Mẫu số 1',
    'private-documents/recognition-evaluation/business-form-01-page11.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-business-form-01-page57-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, false, draft.manifest.imageDimensions);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/BUSINESS-01-PTNT.page57.blind-baseline.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/BUSINESS-01-PTNT.page57.blind-baseline.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/BUSINESS-01-PTNT.page57.blind-baseline.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(writes).toEqual([]);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
});

if (process.env.RECOGNITION_BUSINESS_FORM_02_BLIND_HOLDOUT || process.env.RECOGNITION_BUSINESS_FORM_02_DEVELOPMENT) test('official 2025 single-member LLC application validates an untouched form-level holdout without saving', async ({ page }) => {
  test.setTimeout(300_000);
  expect(process.env.RECOGNITION_BUSINESS_FORM_02_BLIND_HOLDOUT && process.env.RECOGNITION_BUSINESS_FORM_02_DEVELOPMENT).toBeFalsy();
  const suffix = process.env.RECOGNITION_BUSINESS_FORM_02_BLIND_HOLDOUT ? 'blind-baseline' : 'development';
  const code = 'BUSINESS-02-CTTNHH1TV';
  const output = 'private-documents/recognition-evaluation';
  const prefix = `${output}/BUSINESS-02-CTTNHH1TV.page1.${suffix}`;
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, code, 'Giấy đề nghị đăng ký doanh nghiệp công ty TNHH một thành viên — Mẫu số 2',
    'private-documents/recognition-evaluation/business-annex-check-014.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-business-form-02-page1-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, true, draft.manifest.imageDimensions);
  fs.writeFileSync(`${prefix}.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${prefix}.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${prefix}.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(writes).toEqual([]);
  expect(draft.manifest.imageDimensions).toEqual(groundTruth.imageDimensions);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  expect(await Promise.all(ocrResponses)).not.toHaveLength(0);
});

if (process.env.RECOGNITION_UPLOAD_HOLDOUTS) test('independent QT-09 blank form records upload geometry and review load without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'QT-09-HSB', 'Tờ khai của thân nhân',
    'private-documents/recognition-evaluation/quangtri-mau-09-hsb-1.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-qt09-table-ground-truth.json', 'utf8')) as TableGroundTruth;
  const tableBenchmark = measureAnnotatedTable(groundTruth,
    draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'table_cell'));
  expect(writes).toEqual([]);
  expect(tableBenchmark).toMatchObject({ expectedCells: 24, matchedCells: 24, unmatchedPredictions: 0, exactLabels: 24 });
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/QT-09-HSB.upload-holdout.draft.json`, JSON.stringify(draft, null, 2));
  expect(draft.summary.needsReview).toBe(4);
  expect(draft.manifest.boxes.filter((box: { inputKind: string; recognition?: { status: string; reviewReasons: string[] } }) =>
    box.inputKind === 'table_cell').every((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.status === 'suggested' && box.recognition.reviewReasons.includes('TABLE_ROW_COLUMN_GROUNDED'))).toBe(true);
  fs.writeFileSync(`${output}/QT-09-HSB.upload-holdout.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/QT-09-HSB.upload-holdout.summary.json`, JSON.stringify({
    summary: draft.summary, tableBenchmark,
    tableCellReviewRate: draft.manifest.boxes.filter((box: { inputKind: string; recognition?: { status: string } }) =>
      box.inputKind === 'table_cell' && box.recognition?.status === 'needs_review').length / tableBenchmark.expectedCells,
  }, null, 2));
});

if (process.env.RECOGNITION_UPLOAD_EXTRA_HOLDOUTS) test('independent CT01 blank form records upload table accuracy without saving', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'LOCAL-CT01-HOLDOUT', 'Tờ khai CT01 kiểm thử',
    'private-documents/form-research-20/F20-p1.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-ct01-table-ground-truth.json', 'utf8')) as TableGroundTruth;
  const tableBenchmark = measureAnnotatedTable(groundTruth,
    draft.manifest.boxes.filter((box: { inputKind: string }) => box.inputKind === 'table_cell'));
  expect(writes).toEqual([]);
  expect(tableBenchmark).toMatchObject({ expectedCells: 45, matchedCells: 45, unmatchedPredictions: 0, exactLabels: 45 });
  const output = 'private-documents/recognition-evaluation';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/CT01.upload-holdout.draft.json`, JSON.stringify(draft, null, 2));
  expect(draft.summary.needsReview).toBe(6);
  expect(draft.manifest.boxes.filter((box: { inputKind: string; recognition?: { status: string; reviewReasons: string[] } }) =>
    box.inputKind === 'table_cell').every((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.status === 'suggested' && box.recognition.reviewReasons.includes('TABLE_ROW_COLUMN_GROUNDED'))).toBe(true);
  fs.writeFileSync(`${output}/CT01.upload-holdout.summary.json`, JSON.stringify({
    summary: draft.summary, tableBenchmark,
    tableCellReviewRate: draft.manifest.boxes.filter((box: { inputKind: string; recognition?: { status: string } }) =>
      box.inputKind === 'table_cell' && box.recognition?.status === 'needs_review').length / tableBenchmark.expectedCells,
  }, null, 2));
});

if (process.env.RECOGNITION_INDEPENDENT_BLANKS) test('independent ANTT OpenCV candidate sources are retained for diagnosis', async ({ page }) => {
  await page.goto('/opencv-test');
  await page.getByLabel('Chế độ xử lý').selectOption('clean-scan');
  await page.getByLabel('Chọn ảnh JPEG hoặc PNG').setInputFiles('private-documents/recognition-evaluation/quangtri-mau-01-anttcso-1.png');
  await page.getByRole('button', { name: 'Chạy pipeline phát hiện đường' }).click();
  await expect(page.getByRole('heading', { name: /^Field candidates \(/ })).toBeVisible({ timeout: 90_000 });
  const candidates = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find(item => item.textContent?.startsWith('Field candidates ('));
    return [...(heading?.closest('section')?.querySelectorAll('tbody tr') ?? [])].map(row => {
      const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent?.trim() ?? '');
      return { candidateId: cells[0], x: Number(cells[1]), y: Number(cells[2]), width: Number(cells[3]),
        height: Number(cells[4]), source: cells[5] };
    });
  });
  expect(candidates.length).toBeGreaterThan(10);
  fs.writeFileSync('private-documents/recognition-evaluation/QT-ANTT-01.independent.candidates.json', JSON.stringify(candidates, null, 2));
});

if (process.env.RECOGNITION_MARRIAGE_DEVELOPMENT) test('two-column marriage form records a whole-page development regression', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  await page.goto('/admin/upload');
  await page.getByPlaceholder('VD: HDLD-2021, 01-LPTB...').fill('HCMC-MARRIAGE-P20');
  await page.getByPlaceholder('VD: Hợp đồng lao động xác định thời hạn...').fill('Tờ khai ghi chú kết hôn');
  await page.locator('input[type="file"]').setInputFiles('private-documents/recognition-evaluation/hcmc-holdout-p20.png');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Phân tích OpenCV/ }).click();
  await expect(page.getByRole('button', { name: /Tải JSON nhận diện/ })).toBeVisible({ timeout: 240_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải JSON nhận diện/ }).click();
  const draft = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
  expect(writes).toEqual([]);
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-hcmc-marriage-p20-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, true, draft.manifest.imageDimensions);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-MARRIAGE-P20.development.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-MARRIAGE-P20.development.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-MARRIAGE-P20.development.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  const groundedScopes = draft.manifest.boxes.filter((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('COLUMN_ACTOR_SCOPE_GROUNDED'));
  const inferredScopes = draft.manifest.boxes.filter((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('COLUMN_ACTOR_SCOPE_INFERRED'));
  expect(groundedScopes).toHaveLength(10);
  expect(groundedScopes.filter((box: { recognition?: { status: string } }) => box.recognition?.status === 'suggested')).toHaveLength(9);
  expect(groundedScopes.filter((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.status === 'needs_review' && box.recognition.reviewReasons.includes('LABEL_POSITION_ESTIMATED'))).toHaveLength(1);
  expect(inferredScopes.every((box: { recognition?: { status: string } }) => box.recognition?.status === 'needs_review')).toBe(true);
  const requesterFields = draft.manifest.boxes.filter((box: { rawText: string; recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED') && /người yêu cầu$/iu.test(box.rawText));
  expect(requesterFields).toHaveLength(2);
  expect(requesterFields.every((box: { recognition?: { status: string } }) => box.recognition?.status === 'suggested')).toBe(true);
  expect(draft.summary.needsReview).toBe(13);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => /Đề nghị cơ quan ghi vào.*sau đây/iu.test(box.rawText))).toBe(false);
  expect(benchmark.truePositives).toBeGreaterThanOrEqual(26);
  expect(benchmark.falsePositives.length).toBeLessThanOrEqual(5);
  expect(benchmark.exactLabels).toBeGreaterThanOrEqual(21);
  expect(benchmark.matchedContinuations).toBe(15);
  expect(benchmark.exactGroupingFields).toBe(9);
  expect(benchmark.matches.some(match => match.id === 'signing_day' && match.predictedLabel === 'Ngày ký')).toBe(true);
  expect(benchmark.expectedFields).toBe(29);
  expect(draft.regions.some((region: { reason: string }) => region.reason === 'SIGNATURE_GUIDE_NOT_CITIZEN_INPUT')).toBe(true);
});

if (process.env.RECOGNITION_CONSTRUCTION_BLIND || process.env.RECOGNITION_CONSTRUCTION_DEVELOPMENT) test('independent construction application records a first-pass or development benchmark', async ({ page }) => {
  test.setTimeout(300_000);
  const output = 'private-documents/recognition-evaluation';
  const prefix = `${output}/CENTRAL-CONSTRUCTION-P59`;
  const suffix = process.env.RECOGNITION_CONSTRUCTION_BLIND ? 'blind-baseline' : 'development';
  expect(process.env.RECOGNITION_CONSTRUCTION_BLIND && process.env.RECOGNITION_CONSTRUCTION_DEVELOPMENT).toBeFalsy();
  if (suffix === 'blind-baseline') expect(fs.existsSync(`${prefix}.benchmark.json`)).toBe(false);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'CENTRAL-CONSTRUCTION-P59', 'Đơn đề nghị cấp giấy phép hoạt động xây dựng',
    'private-documents/recognition-evaluation/central-construction-application-p59.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-construction-p59-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, true, draft.manifest.imageDimensions);
  const observedOcr = await Promise.all(ocrResponses) as { data?: { blocks?: { text: string; bbox?: number[] }[] } }[];
  fs.writeFileSync(`${prefix}.${suffix}.ocr.json`, JSON.stringify(observedOcr, null, 2));
  fs.writeFileSync(`${prefix}.${suffix}.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${prefix}.${suffix}.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(writes).toEqual([]);
  expect(benchmark.expectedFields).toBe(29);
  if (suffix === 'development') {
    expect(benchmark.truePositives).toBe(29);
    expect(benchmark.falsePositives.length).toBe(0);
    expect(benchmark.exactLabels).toBeGreaterThanOrEqual(9);
    const ocrBlocks = observedOcr.flatMap(response => response.data?.blocks ?? []);
    expect(ocrBlocks.some(block => /trong thời gian từ/u.test(block.text))).toBe(true);
    expect(ocrBlocks.some(block => /thực hiện công việc/u.test(block.text))).toBe(true);
    expect(ocrBlocks.filter(block => block.bbox && block.bbox[1] >= 0.4 && block.bbox[1] <= 0.55)
      .every(block => !block.bbox || block.bbox[3] - block.bbox[1] < 0.06)).toBe(true);
    for (const [id, label] of [
      ['document_number', 'Văn bản số'], ['document_place', 'Nơi lập văn bản'],
      ['document_day', 'Ngày lập'], ['document_month', 'Tháng lập'], ['document_year', 'Năm lập'],
    ]) {
      expect(benchmark.matches.some(match => match.id === id && match.predictedLabel === label)).toBe(true);
      expect(draft.manifest.boxes.some((box: { rawText: string; recognition?: { status: string; reviewReasons: string[] } }) =>
        box.rawText === label && box.recognition?.status === 'needs_review'
        && box.recognition.reviewReasons.includes('SHORT_GUIDE_GEOMETRY_REVIEW'))).toBe(true);
    }
    expect(benchmark.matches.some(match => match.id === 'principal' && match.predictedLabel === 'Đại diện cho')).toBe(true);
    for (const [id, label] of [
      ['work_description', 'Công việc'], ['term_from', 'Thời gian từ'],
      ['term_to', 'Thời gian đến'], ['request_department_suffix', 'Sở Xây dựng'],
    ]) {
      expect(benchmark.matches.some(match => match.id === id && match.predictedLabel === label)).toBe(true);
      expect(draft.manifest.boxes.some((box: { rawText: string; recognition?: { status: string; reviewReasons: string[] } }) =>
        box.rawText === label && box.recognition?.status === 'needs_review'
        && box.recognition.reviewReasons.includes('INLINE_DOTTED_SLOT_INFERRED'))).toBe(true);
    }
    expect(draft.regions.filter((region: { reason: string }) => region.reason === 'PAGE_EDGE_SCAN_ARTIFACT').length).toBeGreaterThanOrEqual(3);
  }
});

if (process.env.RECOGNITION_AUTHORIZATION_BLIND || process.env.RECOGNITION_AUTHORIZATION_DEVELOPMENT) test('authorization form records a frozen first-pass or development benchmark', async ({ page }) => {
  test.setTimeout(300_000);
  const suffix = process.env.RECOGNITION_AUTHORIZATION_BLIND ? 'blind-baseline' : 'development';
  const prefix = `private-documents/recognition-evaluation/CENTRAL-AUTHORIZATION-P61.${suffix}`;
  expect(process.env.RECOGNITION_AUTHORIZATION_BLIND && process.env.RECOGNITION_AUTHORIZATION_DEVELOPMENT).toBeFalsy();
  if (suffix === 'blind-baseline') expect(fs.existsSync(`${prefix}.benchmark.json`)).toBe(false);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'CENTRAL-AUTHORIZATION-P61', 'Giấy ủy quyền',
    'private-documents/recognition-evaluation/central-authorization-p61.png');
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-authorization-p61-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, true, draft.manifest.imageDimensions);
  fs.writeFileSync(`${prefix}.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${prefix}.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${prefix}.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(writes).toEqual([]);
  expect(benchmark.expectedFields).toBe(20);
  if (suffix === 'development') {
    expect(benchmark.truePositives).toBe(20);
    expect(benchmark.falsePositives).toHaveLength(0);
    expect(benchmark.exactLabels).toBeGreaterThanOrEqual(9);
    expect(benchmark.annotatedVerbatimLabels).toBe(2);
    expect(benchmark.exactVerbatimLabels).toBe(2);
    for (const [id, label] of [
      ['document_number', 'Văn bản số'], ['document_place', 'Nơi lập văn bản'],
      ['document_day', 'Ngày lập'], ['document_month', 'Tháng lập'], ['document_year', 'Năm lập'],
      ['tender_number', 'Số quyết định'], ['tender_day', 'Ngày quyết định'],
      ['tender_month', 'Tháng quyết định'], ['tender_year', 'Năm quyết định'],
    ]) expect(benchmark.matches.some(match => match.id === id && match.predictedLabel === label)).toBe(true);
    expect(draft.manifest.boxes.some((box: { rawText: string; inputRegions: unknown[]; recognition?: { status: string; reviewReasons: string[] } }) =>
      box.rawText === 'xây dựng công việc' && box.inputRegions.length === 3
      && box.recognition?.status === 'needs_review'
      && box.recognition.reviewReasons.includes('FRAGMENTED_DOTTED_GUIDE_REVIEW'))).toBe(true);
    const suggestedLabels = draft.manifest.boxes.filter((box: { recognition?: { status: string } }) => box.recognition?.status === 'suggested')
      .map((box: { rawText: string }) => box.rawText).sort();
    expect(suggestedLabels).toEqual(['Quốc tịch nước', 'Số hộ chiếu', 'Tôi tên là']);
    expect(draft.manifest.boxes.filter((box: { recognition?: { status: string } }) => box.recognition?.status === 'needs_review'))
      .toHaveLength(17);
  }
});

if (process.env.RECOGNITION_BIRTH_DEVELOPMENT) test('blank birth-registration form records reviewed field recognition', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'HCMC-BIRTH-P70', 'Tờ khai đăng ký khai sinh',
    'private-documents/recognition-evaluation/hcmc-khai-sinh-p70.png');
  expect(writes).toEqual([]);
  const groundTruth = JSON.parse(fs.readFileSync('tests/fixtures/recognition-hcmc-birth-p70-ground-truth.json', 'utf8')) as FieldGroundTruth;
  const benchmark = measureAnnotatedFields(groundTruth, draft.manifest.boxes, false, draft.manifest.imageDimensions);
  for (const [id, scope] of [['mother_birth_year', 'người mẹ'], ['father_birth_year', 'người cha']]) {
    expect(benchmark.matches.find(match => match.id === id)?.predictedLabel).toBe(`Năm sinh ${scope}`);
  }
  for (const [id, scope] of [['mother_ethnicity', 'người mẹ'], ['father_ethnicity', 'người cha']]) {
    expect(benchmark.matches.find(match => match.id === id)?.predictedLabel).toBe(`Dân tộc ${scope}`);
  }
  expect(benchmark.matches.find(match => match.id === 'child_name')?.predictedLabel).toBe('Họ, chữ đệm, tên người được khai sinh');
  expect(benchmark.matches.find(match => match.id === 'child_birth_date')?.predictedLabel).toBe('Ngày, tháng, năm sinh người được khai sinh');
  expect(benchmark.matches.find(match => match.id === 'child_birth_date_words')?.predictedLabel).toBe('Ngày sinh ghi bằng chữ');
  const reconstructedWordsLabel = draft.manifest.boxes.find((box: { rawText: string }) => box.rawText === 'Ngày sinh ghi bằng chữ');
  expect(reconstructedWordsLabel?.recognition?.status).toBe('needs_review');
  expect(reconstructedWordsLabel?.recognition?.reviewReasons).toContain('OCR_LABEL_RECONSTRUCTED_FROM_SAME_ROW_DATE_CONTEXT');
  expect(benchmark.matches.find(match => match.id === 'mother_nationality')?.predictedLabel).toBe('Quốc tịch người mẹ');
  for (const [id, label] of [['day_signed', 'Ngày ký'], ['month_signed', 'Tháng ký'], ['year_signed', 'Năm ký']]) {
    expect(benchmark.matches.find(match => match.id === id)?.predictedLabel).toBe(label);
  }
  expect(benchmark.matches.find(match => match.id === 'copy_yes')?.predictedLabel).toBe('Đề nghị cấp bản sao — Có');
  expect(benchmark.matches.find(match => match.id === 'copy_no')?.predictedLabel).toBe('Đề nghị cấp bản sao — Không');
  expect(draft.manifest.boxes.filter((box: { normalizedCoords: NormalizedBoundingBox }) =>
    box.normalizedCoords[0] < 0.2)).toHaveLength(0);
  expect(draft.manifest.boxes.filter((box: { inputKind: string; normalizedCoords: NormalizedBoundingBox }) =>
    box.inputKind !== 'checkbox' && box.normalizedCoords[0] >= 0.85 && box.normalizedCoords[0] < 0.89
    && box.normalizedCoords[1] < 0.52)).toHaveLength(0);
  const scoped = draft.manifest.boxes.filter((box: { recognition?: { reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
  expect(scoped).toHaveLength(17);
  expect(scoped.every((box: { recognition?: { status: string } }) => box.recognition?.status === 'suggested')).toBe(true);
  expect(draft.summary.needsReview).toBe(6);
  expect(draft.manifest.boxes.every((box: { recognition?: { status: string } }) => box.recognition?.status !== 'approved')).toBe(true);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-BIRTH-P70.development.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-BIRTH-P70.development.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-BIRTH-P70.development.benchmark.json`, JSON.stringify({ summary: draft.summary, benchmark }, null, 2));
  expect(benchmark.expectedFields).toBe(29);
  expect(benchmark.truePositives).toBe(29);
  expect(benchmark.falsePositives).toHaveLength(0);
  expect(benchmark.exactLabels).toBeGreaterThanOrEqual(25);
});

if (process.env.RECOGNITION_FUNERAL_SCOPE_REGRESSION) test('blank funeral-registration upload scopes deceased fields without approving them', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'HCMC-FUNERAL-P89', 'Tờ khai đăng ký lại khai tử',
    'private-documents/recognition-evaluation/hcmc-holdout-p89.png');
  expect(writes).toEqual([]);
  expect(draft.manifest.boxes.length).toBeGreaterThan(0);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người yêu cầu')).toBe(true);
  const deceasedFields = draft.manifest.boxes.filter((box: { rawText: string; recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
  expect(deceasedFields.length).toBeGreaterThanOrEqual(5);
  expect(deceasedFields.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người đã chết')).toBe(true);
  expect(deceasedFields.every((box: { recognition?: { status: string } }) => box.recognition?.status === 'suggested')).toBe(true);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P89.scope-grounded.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P89.scope-grounded.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P89.scope-grounded.summary.json`, JSON.stringify(draft.summary, null, 2));
});

if (process.env.RECOGNITION_FUNERAL_P43_BASELINE) test('blank funeral-form variant records a frozen first-pass scope baseline', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'HCMC-FUNERAL-P43', 'Tờ khai ghi vào sổ hộ tịch việc khai tử',
    'private-documents/recognition-evaluation/hcmc-holdout-p43.png');
  expect(writes).toEqual([]);
  expect(draft.manifest.boxes.length).toBeGreaterThan(0);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.blind-baseline.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.blind-baseline.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.blind-baseline.summary.json`, JSON.stringify(draft.summary, null, 2));
});

if (process.env.RECOGNITION_FUNERAL_P43_SCOPE_REGRESSION) test('funeral-form variant grounds the deceased person from the register-entry heading', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'HCMC-FUNERAL-P43', 'Tờ khai ghi vào sổ hộ tịch việc khai tử',
    'private-documents/recognition-evaluation/hcmc-holdout-p43.png');
  expect(writes).toEqual([]);
  expect(draft.summary.detectedFields).toBe(28);
  expect(draft.summary.needsReview).toBe(12);
  expect(draft.regions.some((region: { candidateId: string; reason: string }) =>
    region.candidateId === 'candidate_001' && region.reason === 'REDUNDANT_ROW_OVER_PAIRED_RULE')).toBe(true);
  expect(draft.regions.some((region: { candidateId: string; reason: string }) =>
    region.candidateId === 'candidate_011' && region.reason === 'PRINTED_HEADING_UNDERLINE')).toBe(true);
  const deceasedFields = draft.manifest.boxes.filter((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
  expect(deceasedFields.length).toBeGreaterThanOrEqual(6);
  expect(deceasedFields.every((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('LABEL_POSITION_ESTIMATED') ? box.recognition.status === 'needs_review'
      : box.recognition?.status === 'suggested')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người đã chết')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người yêu cầu')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Dân tộc người đã chết')).toBe(true);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.scope-grounded.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.scope-grounded.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-FUNERAL-P43.scope-grounded.summary.json`, JSON.stringify(draft.summary, null, 2));
});

if (process.env.RECOGNITION_GUARDIANSHIP_P49_SCOPE_REGRESSION) test('guardianship form grounds fragmented headings without merging two people', async ({ page }) => {
  test.setTimeout(300_000);
  const writes: string[] = [];
  const ocrResponses: Promise<unknown>[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/documents/json') && response.request().method() === 'POST') ocrResponses.push(response.json());
  });
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/admin/forms/assets', route => { writes.push(route.request().url()); return route.abort(); });
  await page.route('**/api/llm/prompt', route => { writes.push(route.request().url()); return route.abort(); });
  const draft = await analyzeBlankForm(page, 'HCMC-GUARDIANSHIP-P49', 'Tờ khai ghi vào sổ hộ tịch việc giám hộ, nhận cha, mẹ, con',
    'private-documents/recognition-evaluation/hcmc-holdout-p49.png');
  expect(writes).toEqual([]);
  const groundedFields = draft.manifest.boxes.filter((box: { recognition?: { status: string; reviewReasons: string[] } }) =>
    box.recognition?.reviewReasons.includes('ACTOR_SCOPE_GROUNDED'));
  expect(groundedFields.length).toBeGreaterThanOrEqual(12);
  expect(groundedFields.every((box: { recognition?: { status: string } }) =>
    box.recognition?.status === 'suggested' || box.recognition?.status === 'needs_review')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người yêu cầu')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người dưới đây')).toBe(true);
  expect(draft.manifest.boxes.some((box: { rawText: string }) => box.rawText === 'Họ, chữ đệm, tên người có tên dưới đây')).toBe(true);
  const output = 'private-documents/recognition-evaluation';
  fs.writeFileSync(`${output}/HCMC-GUARDIANSHIP-P49.scope-grounded.ocr.json`, JSON.stringify(await Promise.all(ocrResponses), null, 2));
  fs.writeFileSync(`${output}/HCMC-GUARDIANSHIP-P49.scope-grounded.draft.json`, JSON.stringify(draft, null, 2));
  fs.writeFileSync(`${output}/HCMC-GUARDIANSHIP-P49.scope-grounded.summary.json`, JSON.stringify(draft.summary, null, 2));
});

if (process.env.RECOGNITION_P43_CANDIDATE_DIAGNOSTIC) test('P43 top-page unresolved boxes retain their original OpenCV candidate types', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/opencv-test');
  await page.getByLabel('Chế độ xử lý').selectOption('clean-scan');
  await page.locator('input[type="file"]').setInputFiles('private-documents/recognition-evaluation/hcmc-holdout-p43.png');
  await page.getByRole('button', { name: 'Chạy pipeline phát hiện đường' }).click();
  await expect(page.getByText(/Field candidates \(/)).toBeVisible({ timeout: 150_000 });
  const candidates = await page.locator('tbody tr').evaluateAll(rows => rows
    .filter(row => /candidate_001|candidate_011/.test(row.textContent ?? ''))
    .map(row => Array.from(row.querySelectorAll('td'), cell => cell.textContent?.trim() ?? '')));
  expect(candidates).toHaveLength(2);
  fs.writeFileSync('private-documents/recognition-evaluation/HCMC-FUNERAL-P43.top-candidate-diagnostic.json',
    JSON.stringify(candidates, null, 2));
});

test('admin can move a continuation region, save and reload without changing the primary region', async ({ page }) => {
  let data = workflow('PENDING_REVIEW');
  const writes: FormWorkflow[] = [];
  const buffer = await imageBytes();
  await page.route('**/api/admin/forms/*/workflow', route => {
    if (route.request().method() === 'PUT') { data = route.request().postDataJSON(); writes.push(data); }
    return route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/api/admin/forms/*/pages/**', route => route.fulfill({ contentType: 'image/png', body: buffer }));
  await page.goto('/admin/review/FORM-REGIONS');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  await page.getByLabel('Vùng cần đối soát', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Chỉnh sửa' }).click();
  const target = page.locator('[title="Nhấn giữ và kéo để di chuyển ô"]');
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 15, bounds!.y + bounds!.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  const saveButton = page.getByRole('button', { name: 'Lưu thay đổi trên máy chủ' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].steps[0].highlightCoords).toEqual(regions[0].normalizedCoords);
  expect(writes[0].steps[0].highlightRegions![1].normalizedCoords).not.toEqual(regions[1].normalizedCoords);
  await page.reload();
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  await page.getByLabel('Vùng cần đối soát', { exact: true }).selectOption('1');
  await page.getByText('Kiểm tra JSON workflow', { exact: true }).click();
  expect(JSON.parse(await page.getByLabel('Workflow JSON').inputValue()).steps[0].highlightRegions).toEqual(writes[0].steps[0].highlightRegions);
});

test('actual browser OpenCV separates dotted input regions, groups three lines and sends grounded field metadata to generation', async ({ page }) => {
  test.setTimeout(120_000);
  const dots = [[250, 200], [80, 240], [80, 280]].flatMap(([left, baseline]) =>
    Array.from({ length: Math.floor((700 - left) / 8) }, (_, index) => `<rect x="${left + index * 8}" y="${baseline}" width="2" height="2"/>`)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="white"/><g fill="black" font-family="Arial" font-size="20"><text x="100" y="70">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text><text x="80" y="198">Nội dung:</text>${dots}</g></svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const lines = [
    { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', coords: [0.05, 0.125, 0.073, 0.85] as NormalizedBoundingBox },
    { text: 'Nội dung:', coords: [0.18, 0.1, 0.202, 0.215] as NormalizedBoundingBox },
  ];
  const document = assembleJson({ provider: 'vietocr', fullText: lines.map(line => line.text).join('\n'),
    lines: lines.map((line, index) => ({ id: `line_${index}`, text: line.text, boundingBox: line.coords, confidence: 0.95, page: 1, tokenIds: [] })),
    tokens: [], pageCount: 1, warnings: [] }, { documentId: 'synthetic', mimeType: 'image/png', imageDimensions: { width: 800, height: 1000 } });
  const requests: { manifest: FormGeometricManifest; ocrContext: FormOcrContext }[] = [];
  const uploadedPages: number[] = [];
  await page.route('**/api/documents/json', route => route.fulfill({ json: { success: true, data: document } }));
  await page.route('**/api/admin/forms/assets', route => {
    uploadedPages.push(route.request().postDataJSON().pageNumber as number);
    return route.fulfill({ json: { success: true, data: { pageNumber: 1, width: 800, height: 1000,
      imageUrl: `/api/forms/FORM-REGIONS/pages/1?asset=${'a'.repeat(64)}` } } });
  });
  await page.route('**/api/llm/prompt', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, data: { formCode: 'FORM-REGIONS', status: 'PENDING_REVIEW' }, meta: { persisted: true } } });
  });
  await page.goto('/admin/upload');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  const textFields = page.locator('input[type="text"]');
  await textFields.nth(0).fill('FORM-REGIONS');
  await textFields.nth(1).fill('Thử nhiều dòng');
  await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Phân tích OpenCV/ }).click();
  await expect(page.getByRole('button', { name: /Tải JSON nhận diện/ })).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải JSON nhận diện/ }).click();
  const draftPath = await (await downloadPromise).path();
  const draft = JSON.parse(fs.readFileSync(draftPath!, 'utf8')) as { manifest: FormGeometricManifest };
  expect(draft.manifest.boxes).toHaveLength(1);
  expect(draft.manifest.boxes[0].inputRegions).toHaveLength(3);
  expect(draft.manifest.boxes[0].normalizedCoords[1]).toBeCloseTo(250 / 800, 2);
  await test.info().attach('recognized-three-lines', { body: await page.screenshot(), contentType: 'image/png' });
  const generationButton = page.getByRole('button', { name: /Lưu phôi và Khởi tạo kịch bản/ });
  await expect(generationButton).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Nút đang khóa');
  await page.getByRole('checkbox', { name: /Tôi đã đối chiếu kỹ lưỡng/ }).check();
  await expect(generationButton).toBeEnabled();
  await generationButton.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(uploadedPages).toEqual([1]);
  expect(requests[0].manifest.boxes).toHaveLength(1);
  expect(requests[0].manifest.boxes[0].inputRegions).toHaveLength(3);
  expect(requests[0].manifest.boxes[0].normalizedCoords[1]).toBeCloseTo(250 / 800, 2);
  expect(requests[0].manifest.boxes[0].recognition?.status).toBe('confirmed');
  expect(requests[0].ocrContext.pages[0].rawText).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
  expect(requests[0].ocrContext.pages[0].coordinateSystem).toBe('normalized-xyxy');
  expect(requests[0].ocrContext.pages[0].blocks[0].bbox).not.toBeNull();
});

test('admin analyzes two pages, reviews a cross-page continuation and uploads ordered assets', async ({ page }) => {
  test.setTimeout(120_000);
  const dots = [[250, 200], [80, 240], [80, 280]].flatMap(([left, baseline]) =>
    Array.from({ length: Math.floor((700 - left) / 8) }, (_, index) => `<rect x="${left + index * 8}" y="${baseline}" width="2" height="2"/>`)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="white"/><g fill="black" font-family="Arial" font-size="20"><text x="80" y="198">Nội dung:</text>${dots}</g></svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const lines = [{ id: 'line_0', text: 'Nội dung:', boundingBox: [0.18, 0.1, 0.202, 0.215] as NormalizedBoundingBox,
    confidence: 0.95, page: 1, tokenIds: [] }];
  const document = assembleJson({ provider: 'vietocr', fullText: 'Nội dung:', lines, tokens: [], pageCount: 1, warnings: [] },
    { documentId: 'synthetic-two-page', mimeType: 'image/png', imageDimensions: { width: 800, height: 1000 } });
  let ocrCalls = 0;
  const uploaded: number[] = [];
  const requests: { manifest: FormGeometricManifest; ocrContext: FormOcrContext }[] = [];
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/documents/json', route => { ocrCalls++; return route.fulfill({ json: { success: true, data: document } }); });
  await page.route('**/api/admin/forms/assets', route => {
    const pageNumber = route.request().postDataJSON().pageNumber as number;
    uploaded.push(pageNumber);
    return route.fulfill({ json: { success: true, data: { pageNumber, width: 800, height: 1000,
      imageUrl: `/api/forms/FORM-TWO/pages/${pageNumber}?asset=${String(pageNumber).repeat(64)}` } } });
  });
  await page.route('**/api/llm/prompt', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { success: false, error: { code: 'AI_UNAVAILABLE' } } });
  });
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('FORM-TWO');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Thử hai trang');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer }, { name: 'second.png', mimeType: 'image/png', buffer },
  ]);
  await dialog.getByRole('button', { name: 'Đưa trang 2 lên' }).click();
  await expect(dialog.getByText('Ảnh đang chọn:', { exact: false })).toContainText('second.png, first.png');
  await dialog.getByRole('button', { name: 'Đưa trang 2 lên' }).click();
  await expect(dialog.getByText('Ảnh đang chọn:', { exact: false })).toContainText('first.png, second.png');
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  const fields = dialog.getByRole('combobox', { name: 'Ô cần đối soát' });
  await expect(fields.locator('option')).toHaveCount(2, { timeout: 90_000 });
  expect(ocrCalls).toBe(2);
  expect(uploaded).toEqual([]);
  await expect(fields.locator('option').nth(0)).toContainText('Trang 1');
  await expect(fields.locator('option').nth(1)).toContainText('Trang 2');
  await dialog.getByRole('combobox', { name: 'Trang phôi' }).selectOption('2');
  await expect(dialog.getByRole('img', { name: 'Ảnh phôi trang 2 để đối soát' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Thêm dòng — cần vẽ lại' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Vùng của trường' }).locator('option')).toHaveCount(4);
  await fields.selectOption('1');
  await expect(dialog.getByRole('combobox', { name: 'Trang phôi' })).toHaveValue('2');
  await fields.selectOption('0');
  await dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn' }).check();
  await dialog.getByRole('button', { name: 'Lưu phôi và sinh kịch bản chờ duyệt' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(uploaded).toEqual([1, 2]);
  expect(requests[0].manifest.pages?.map(item => item.pageNumber)).toEqual([1, 2]);
  expect(requests[0].manifest.boxes.map(item => item.boxId)).toEqual(['p1_box_001', 'p2_box_001']);
  expect(requests[0].manifest.boxes.map(item => item.pageNumber)).toEqual([1, 2]);
  expect(requests[0].manifest.boxes[0].inputRegions?.at(-1)?.pageNumber).toBe(2);
  expect(requests[0].ocrContext.pages.map(item => item.pageNumber)).toEqual([1, 2]);
  expect(requests[0].ocrContext.pages.map(item => item.rawText)).toEqual(['Nội dung:', 'Nội dung:']);
});
