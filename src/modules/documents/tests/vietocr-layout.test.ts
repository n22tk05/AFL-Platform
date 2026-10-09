import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VietOcrProvider } from '../providers/vietocr-provider';
import { assembleJson } from '../json-assembler';
import { auditSourceCoverage } from '../json-evaluation';
import { reconcileOcr, needsOcrRetry } from '../adaptive-ocr';
import type { OcrReview, DocumentOcrResult } from '@/shared/document-extraction.types';

const response = () => ({
  predictions: ['😀 Tài sản', '', '00120', '4.500.000.000 đ'].map((text, i) => ({
    lineId: `l${i}`, text, coordinates: [i < 2 ? 0.1 : 0.3, i%2 ? 0.5 : 0.1, i < 2 ? 0.2 : 0.4, i%2 ? 0.9 : 0.4], confidence: text ? 0.99 : null,
  })),
  tables: [{ id: 'grid', headerRowCount: 0, rows: [
    [{ lineIds: ['l0'], coordinates: [0.1,0.1,0.2,0.4] }, { lineIds: ['l1'], coordinates: [0.1,0.5,0.2,0.9] }],
    [{ lineIds: ['l2'], coordinates: [0.3,0.1,0.4,0.4] }, { lineIds: ['l3'], coordinates: [0.3,0.5,0.4,0.9] }],
  ] }], warnings: ['TABLE_HEADER_UNVERIFIED'], skewDegrees: 0,
});
const input = { bytes: readFileSync('tests/fixtures/documents/clear.png'), mimeType: 'image/png' as const };

test('native VietOCR grid survives provider and JSON export with blank slots, zeros and Unicode ranges', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(response()));
  const ocr = await new VietOcrProvider({ endpoint: 'http://fake/predict' }).extract(input);
  assert.equal(ocr.tables?.length, 1);
  assert.deepEqual(ocr.tables![0].rows.map(row => row.map(cell => cell.text)), [['😀 Tài sản', ''], ['00120', '4.500.000.000 đ']]);
  const document = assembleJson(ocr, { documentId: 'local-grid', mimeType: 'image/png' });
  auditSourceCoverage(ocr, document);
  assert.deepEqual(document.structure.tables[0].rows.map(row => row.map(cell => cell.rawValue)), [['😀 Tài sản', ''], ['00120', '4.500.000.000 đ']]);
  assert.ok(document.structure.tables[0].rows[0][1].sourceBlockIds.length);
  assert.equal(needsOcrRetry(ocr), false, 'blank table cells/unknown headers do not justify repeating inference');
});

test('VietOCR rejects unknown, duplicate and ragged table sources', async t => {
  let value = response();
  t.mock.method(globalThis, 'fetch', async () => Response.json(value));
  const provider = new VietOcrProvider({ endpoint: 'http://fake/predict' });
  value.tables[0].rows[0][0].lineIds = ['unknown'];
  await assert.rejects(() => provider.extract(input), /OCR_INVALID_RESPONSE/);
  value = response(); value.tables[0].rows[0][0].lineIds = ['l0', 'l0'];
  await assert.rejects(() => provider.extract(input), /OCR_INVALID_RESPONSE/);
  value = response(); value.tables[0].rows[1].pop();
  await assert.rejects(() => provider.extract(input), /OCR_INVALID_RESPONSE/);
});

test('enhanced-only footer is surfaced as a review region with its source', () => {
  const a: DocumentOcrResult = { provider: 'vietocr', pageCount: 1, fullText: 'Tiêu đề', tokens: [], warnings: [],
    lines: [{ id:'header', text:'Tiêu đề', confidence:0.99, page:1, tokenIds:[], boundingBox:[0.1,0.1,0.2,0.9] }] };
  const b: DocumentOcrResult = { ...a, fullText: 'Tiêu đề\nMã: 00120', lines: [...a.lines,
    { id:'footer', text:'Mã: 00120', confidence:0.99, page:1, tokenIds:[], boundingBox:[0.8,0.1,0.9,0.9] }] };
  const review: OcrReview = { attempts: [a,b].map((raw,i) => ({ attempt:i+1, variant:i ? 'contrast' : 'primary', provider:'vietocr', timingMs:1, scaleX:1, scaleY:1, raw })),
    selectedAttempt:0, selectionReason:'', regions:[], warnings:[], requiresReview:false, documentDetectionFailed:false };
  const selected = reconcileOcr(review);
  assert.equal(selected?.fullText, a.fullText);
  assert.ok(review.regions.some(r => r.reason === 'OCR_REGION_ONLY_IN_ENHANCED' && r.sources[0].text === 'Mã: 00120'));
  assert.equal(review.requiresReview, true);
});
