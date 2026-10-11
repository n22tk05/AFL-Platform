import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { handleDetailedExtraction } from '../detailed-api';
import { detailedTranscript, safeDetailedFilename, serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '../detailed-export';
import type { DetailedDocument, DetailedElement, DetailKind, DetailedBox } from '@/shared/detailed-document.types';

function fixture(): DetailedDocument {
  const elements: DetailedElement[] = [];
  function add(id: string, parentId: string | null, kind: DetailKind, bbox: DetailedBox, textRaw = '', extra: Partial<DetailedElement> = {}) {
    const [x1,y1,x2,y2] = bbox;
    elements.push({ id, parentId, page: 1, kind, order: elements.length, bbox, normalizedBox: [x1/100,y1/100,x2/100,y2/100],
      polygon: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]], processedBox: [...bbox], cropBox: [...bbox], textRaw,
      ocrConfidence: null, recognitionStatus: textRaw ? 'recognized' : 'not_applicable', geometryOrigin: 'pixel_detector', textOrigin: 'none', reviewReasons: [], ...extra });
  }
  add('page_001', null, 'page', [0,0,100,100]);
  add('region_001', 'page_001', 'region', [2,2,95,70]);
  add('line_001', 'region_001', 'line', [5,5,90,20], 'Nguyễn "An"\t0012', { readingOrder: 0, textOrigin: 'line_crop_ocr' });
  add('word_001', 'line_001', 'word', [5,5,30,20], 'Nguyễn', { readingOrder: 0, textOrigin: 'word_crop_ocr' });
  add('word_002', 'line_001', 'word', [35,5,50,20], '"An"', { readingOrder: 1, textOrigin: 'word_crop_ocr' });
  add('line_002', 'region_001', 'line', [5,30,90,40], '', { readingOrder: 1, recognitionStatus: 'unreadable', reviewReasons: ['OCR_NOT_COMPLETED'] });
  add('cell_001', 'region_001', 'cell', [5,50,60,65], '', { recognitionStatus: 'blank', rowIndex: 0, columnIndex: 0, rowSpan: 1, columnSpan: 1 });
  add('checkbox_001', 'page_001', 'checkbox', [80,80,90,90], '', { checkboxState: 'unknown', reviewReasons: ['CHECKBOX_PIXEL_HEURISTIC'] });
  add('unknown_001', 'page_001', 'unknown_region', [10,80,20,90], '', { recognitionStatus: 'unreadable', reviewReasons: ['UNASSIGNED_INK'] });
  return { schemaVersion: 'detailed-1.0', status: 'partial', requiresReview: true, coordinateSystem: 'source-oriented-pixels-xyxy', pixelBounds: 'half-open',
    source: { width: 100, height: 100 }, processed: { width: 100, height: 100 },
    transforms: { sourceToProcessed: [[1,0,0],[0,1,0],[0,0,1]], processedToSource: [[1,0,0],[0,1,0],[0,0,1]], skewDegrees: 0 },
    provider: { name: 'vietocr-local', model: 'test-predictor', wordRecognition: true }, elements, warnings: [],
    fullText: 'Nguyễn "An"\t0012\n[UNREADABLE:line_002]', coverage: { inkPixels: 10, unassignedInkPixels: 2, explainedInkRatio: 0.8, isCompletenessGuarantee: false },
    counts: { page: 1, region: 1, line: 2, word: 2, cell: 1, checkbox: 1, unknown_region: 1 }, timingMs: { detection: 1, recognition: 2, total: 3 } };
}

test('detailed TXT roundtrip preserves Unicode, tabs, blanks, unknown checkbox, all IDs and coordinates', () => {
  const document = fixture(), raw = serializeDetailedCoordinates(document), records = raw.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(records[0].exportedElementCount, document.elements.length);
  assert.equal(records[0].exportStatus, 'draft');
  assert.deepEqual(records.slice(1).map(({record,...e}) => e), document.elements);
  assert.equal(detailedTranscript(document), document.fullText);
  assert.match(serializeDetailedReview(document), /UNASSIGNED_INK/);
});

test('manual text edits preserve raw text and transcript does not repeat words/containers', () => {
  const document = fixture(); document.elements[2].textReviewed = 'Nguyễn An 0012';
  assert.equal(detailedTranscript(document, true), 'Nguyễn An 0012\n[UNREADABLE:line_002]');
  assert.equal(detailedTranscript(document), document.fullText);
  assert.equal(JSON.parse(serializeDetailedCoordinates(document, true).split('\n')[0]).exportStatus, 'reviewed');
});

test('linked checkbox state survives full-text TXT with the raw label once', () => {
  const document = fixture();
  document.elements[7].labelIds = ['line_001'];
  document.fullText = '[?] '+document.fullText;
  assert.equal(detailedTranscript(document), document.fullText);
  assert.equal(detailedTranscript(document).match(/Nguyễn/g)?.length, 1);
});

for (const [name, mutate] of Object.entries<(d: DetailedDocument) => void>({
  'missing parent': d => { d.elements[3].parentId = 'missing'; },
  'duplicate id': d => { d.elements[3].id = d.elements[2].id; },
  'cycle': d => { d.elements[1].parentId = d.elements[2].id; },
  'wrong counts': d => { d.counts.word = 5; },
  'wrong normalized axis': d => { d.elements[3].normalizedBox[0] = 0.1; },
  'invalid coordinate': d => { d.elements[3].bbox[0] = NaN; },
  'lost source line': d => { d.fullText = 'Nguyễn An'; },
  'false complete': d => { d.status = 'complete'; },
  'singular matrix': d => { d.transforms.sourceToProcessed[0] = [0,0,0]; },
  'wrong polygon': d => { d.elements[3].polygon[0][0] += 2; },
  'lost blank record': d => { d.elements.splice(6,1); },
  'outside parent': d => { d.elements[3].parentId = 'line_002'; },
})) test(`detailed export rejects ${name}`, () => { const document = fixture(); mutate(document); assert.throws(() => serializeDetailedCoordinates(document), /INVALID_DETAILED_DOCUMENT/); });

test('detailed filenames cannot escape a directory or inject headers', () => {
  assert.equal(safeDetailedFilename('../../Tên người\r\n.json'), '.._.._Tên_người__');
});

const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer();
function request(bytes: Uint8Array = png, entries: Record<string,string> = {}) {
  const body = new FormData(); body.set('file', new Blob([Buffer.from(bytes)], { type: 'image/png' }), 'sample.png');
  for (const [k,v] of Object.entries(entries)) body.set(k,v);
  return new Request('http://localhost/api/documents/detailed', { method:'POST', body });
}

test('detailed API validates image before OCR and returns no-store detailed tree', async () => {
  let calls = 0;
  const response = await handleDetailedExtraction(request(), async input => { calls++; assert.equal(input.recognizeWords, true); return fixture(); });
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal((await response.json()).data.elements.length, 9);
  const invalid = await handleDetailedExtraction(request(new Uint8Array([1,2,3])), async () => { calls++; return fixture(); });
  assert.equal(invalid.status, 400); assert.equal(calls, 1);
});

test('detailed API rejects missing records/frame mismatch/invalid options instead of outputting plausible TXT', async () => {
  const malformed = fixture(); malformed.counts.word = 0;
  assert.equal((await handleDetailedExtraction(request(), async () => malformed)).status, 502);
  const mismatch = fixture(); mismatch.source.width = 101;
  assert.equal((await handleDetailedExtraction(request(), async () => mismatch)).status, 502);
  let calls = 0;
  const invalidOptions: Record<string,string>[] = [{ quad: '[[0,0],[NaN,0]]' }, { quad: '[[0,0],[100,0],[99,99],[0,99]]' }, { recognizeWords: 'maybe' }, { photoMode: 'night' }];
  for (const options of invalidOptions) {
    assert.equal((await handleDetailedExtraction(request(png, options), async () => { calls++; return fixture(); })).status, 400);
  }
  assert.equal(calls, 0);
});

test('detailed API forwards capture modes and defaults to automatic preparation', async () => {
  for (const photoMode of ['auto', 'camera', 'scan'] as const) {
    const response = await handleDetailedExtraction(request(png, { photoMode }), async input => {
      assert.equal(input.photoMode, photoMode); return fixture();
    });
    assert.equal(response.status, 200);
  }
  await handleDetailedExtraction(request(), async input => { assert.equal(input.photoMode, 'auto'); return fixture(); });
});

test('camera metadata and larger measured deskew survive coordinate TXT; invalid source corners are rejected', () => {
  const document = fixture();
  document.transforms.skewDegrees = 18;
  document.preprocessing = { mode: 'camera', perspectiveOrigin: 'auto', sourceQuad: [[5,5],[95,5],[95,95],[5,95]],
    detectionScore: 0.85, detectionMethod: 'edges', illuminationNormalized: true,
    quality: { medianBrightness: 92, inkContrast: 60, edgeSharpness: 75, saturatedPixelRatio: 0.02 } };
  assert.doesNotThrow(() => validateDetailedDocument(document));
  assert.deepEqual(JSON.parse(serializeDetailedCoordinates(document).split('\n')[0]).preprocessing, document.preprocessing);
  document.preprocessing.sourceQuad![0][0] = -1;
  assert.throws(() => serializeDetailedCoordinates(document), /INVALID_DETAILED_DOCUMENT/);
});
