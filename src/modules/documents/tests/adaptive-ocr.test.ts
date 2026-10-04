import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAdaptiveOcr } from '../adaptive-ocr';
import { DocumentPipelineError } from '../errors';
import { DocumentExtractionService } from '../services/document-extraction.service';
import { handleDocumentExtraction, parseDocumentImage } from '../api';
import { DocumentSession } from '../session';
import { VietOcrProvider } from '../providers/vietocr-provider';
import type { DocumentOcrInput, DocumentOcrResult, StructuredExtractionProvider } from '@/shared/document-extraction.types';
const bytes = readFileSync('tests/fixtures/documents/clear.png');
const input: DocumentOcrInput = { bytes, mimeType: 'image/png', enhancements: [
  { bytes, mimeType: 'image/png', variant: 'contrast', width: 640, height: 800, scaleX: 1, scaleY: 1 },
  { bytes, mimeType: 'image/png', variant: 'lighting', width: 640, height: 800, scaleX: 1, scaleY: 1 },
] };
function result(text = 'Số tiền: 900.000 đồng; CCCD: 000000000001', confidence: number | null = 0.5): DocumentOcrResult {
  return { provider: 'fake', fullText: text, pageCount: 1, tokens: [], warnings: [],
    lines: text ? [{ id: 'l1', text, confidence, boundingBox: [0.1, 0.1, 0.2, 0.9], page: 1, tokenIds: [] }] : [] };
}
test('retry is serial and bounded to two even when both candidates remain uncertain', async () => {
  let calls = 0, active = 0;
  const response = await runAdaptiveOcr({ extract: async value => {
    assert.equal(active++, 0); assert.equal(value.enhancements, undefined);
    await Promise.resolve(); active--; calls++; return result();
  } }, input);
  assert.equal(calls, 2); assert.equal(response.review.attempts.length, 2);
  assert.deepEqual(response.review.attempts.map(a => a.variant), ['primary', 'contrast']);
  assert.equal(response.ocr?.fullText, result().fullText);
});
test('primary succeeds without retry; shadows prefer lighting only when OCR is weak', async () => {
  const clear = await runAdaptiveOcr({ extract: async () => result('Nội dung rõ', 0.99) }, input);
  assert.equal(clear.review.attempts.length, 1);
  const shadow = await runAdaptiveOcr({ extract: async () => result() }, { ...input, imageWarnings: ['UNEVEN_LIGHTING'] });
  assert.deepEqual(shadow.review.attempts.map(a => a.variant), ['primary', 'lighting']);
});
for (const code of ['OCR_NOT_CONFIGURED', 'OCR_TIMEOUT', 'OCR_RATE_LIMITED', 'OCR_INVALID_RESPONSE', 'OCR_UNAVAILABLE'] as const)
  test(`never retries ${code}`, async () => {
    let calls = 0;
    const response = await runAdaptiveOcr({ providerId: 'fake', extract: async () => { calls++; throw new DocumentPipelineError(code); } }, input);
    assert.equal(calls, 1); assert.equal(response.ocr, null); assert.equal(response.review.attempts[0].provider, 'fake');
    assert.equal(response.errorCode, code);
  });
test('missing provider confidence stays null in every raw attempt and review is required', async () => {
  const response = await runAdaptiveOcr({ extract: async () => result('Nội dung thử', null) }, input);
  assert.equal(response.ocr?.lines[0].confidence, null);
  assert.ok(response.review.attempts.every(a => a.raw?.lines[0].confidence === null));
  assert.ok(response.review.regions.some(r => r.reason === 'OCR_CONFIDENCE_MISSING'));
});
for (const [first, second] of [['Ngày: 01/02/2026', 'Ngày: 02/02/2026'], ['Số: 001/BB', 'Số: 002/BB'], ['Biển số: 29A-123.45', 'Biển số: 29B-123.45']])
  test(`critical string disagreement retains source and requires review: ${first}`, async () => {
    let calls = 0;
    const response = await runAdaptiveOcr({ extract: async () => ++calls === 1 ? result(first) : result(second, 0.99) }, input);
    assert.equal(response.ocr?.fullText, first); assert.equal(response.review.requiresReview, true);
    assert.ok(response.review.regions.some(r => r.reason.includes('DISAGREEMENT')));
  });
test('invalid timeout configuration makes zero API calls', async () => {
  let calls = 0;
  await assert.rejects(() => runAdaptiveOcr({ extract: async () => { calls++; return result(); } }, input, NaN), /OCR_NOT_CONFIGURED/);
  assert.equal(calls, 0);
});
test('higher confidence, longer retry and conflicting amount/ID never silently replace primary', async () => {
  const a = result(), b = result('Số tiền: 800.000 đồng; CCCD: 000000000002; nội dung bổ sung', 0.99);
  let calls = 0;
  const response = await runAdaptiveOcr({ extract: async () => ++calls === 1 ? a : b }, input);
  assert.equal(response.ocr?.fullText, a.fullText); assert.equal(response.review.selectedAttempt, 1);
  assert.ok(response.review.warnings.includes('OCR_NUMERIC_DISAGREEMENT'));
  const aligned = response.review.regions.find(r => r.reason === 'OCR_NUMERIC_DISAGREEMENT' && r.boundingBox);
  assert.deepEqual(aligned?.sources.map(s => s.text), [a.fullText, b.fullText]);
  assert.deepEqual(response.review.attempts.map(a => a.raw?.fullText), [a.fullText, b.fullText]);
});
test('disagreement without reliable alignment stays page-level, never invented bounding boxes', async () => {
  let calls = 0; const b = result('Số: 002'); b.lines[0].boundingBox = [0.7, 0.1, 0.8, 0.9];
  const response = await runAdaptiveOcr({ extract: async () => ++calls === 1 ? result('Số: 001') : b }, input);
  assert.ok(response.review.regions.some(r => r.reason === 'OCR_NUMERIC_DISAGREEMENT' && r.boundingBox === null));
  assert.ok(!response.review.regions.some(r => r.sources.length === 2));
});
test('recover empty primary with whole enhanced result, no concatenation; blank stays unreadable', async () => {
  let calls = 0;
  const recovered = await runAdaptiveOcr({ extract: async () => ++calls === 1 ? result('') : result('Nội dung thử', 0.99) }, input);
  assert.equal(recovered.review.selectedAttempt, 2); assert.equal(recovered.ocr?.fullText, 'Nội dung thử'); assert.ok(recovered.review.requiresReview);
  const blank = await runAdaptiveOcr({ extract: async () => result('') }, input);
  assert.ok(blank.review.regions.some(r => r.status === 'unreadable')); assert.equal(blank.review.attempts.length, 2);
});
test('retry failure preserves primary and raw evidence with sanitized error provenance', async () => {
  let calls = 0;
  const response = await runAdaptiveOcr({ extract: async () => { if (++calls === 2) throw Error('SECRET full-image-value'); return result(); } }, input);
  assert.equal(response.ocr?.fullText, result().fullText); assert.equal(response.review.attempts[1].raw, null);
  assert.ok(!JSON.stringify(response).includes('SECRET')); assert.ok(response.review.warnings.includes('OCR_RETRY_FAILED_OCR_UNAVAILABLE'));
});
test('shared timeout aborts second call without a third call', async () => {
  let calls = 0, signal: AbortSignal | undefined;
  const response = await runAdaptiveOcr({ extract: async i => {
    calls++; if (calls === 1) return result(); signal = i.signal; return new Promise(() => {});
  } }, input, 25);
  assert.equal(calls, 2); assert.equal(signal?.aborted, true); assert.equal(response.ocr?.fullText, result().fullText);
});
const structured: StructuredExtractionProvider = { classify: async () => 'traffic_violation_record', extract: async ocr => ({ fields: {
  fineAmount: { value: '900.000 đồng', rawText: '900.000 đồng', evidenceText: ocr.lines[0].text, confidence: 1, sourceLineIds: ['l1'] },
} }) };
test('conflicting critical fields require review and cannot enter Session RAM or guide automatically', async () => {
  let calls = 0; const first = result(undefined, 0.99); first.warnings = ['OCR_IMAGE_QUALITY_DEFECT'];
  const extraction = await new DocumentExtractionService({ extract: async () => ++calls === 1 ? first : result('Số tiền: 800.000 đồng; CCCD: 000000000002', 0.99) }, structured).extractDocumentInformation(input);
  assert.equal(extraction.fields.fineAmount.value, 900000); assert.equal(extraction.fields.fineAmount.status, 'needs_review');
  const session = new DocumentSession(); assert.throws(() => session.save(extraction, {})); assert.equal(session.read(), null);
  session.save(extraction, { fineAmount: 850000 }); assert.deepEqual(session.read(), { fineAmount: '850.000 đồng' }); session.clear();
});
test('even provider text on a possible blank page cannot be extracted success', async () => {
  const extraction = await new DocumentExtractionService({ extract: async () => result() }, structured).extractDocumentInformation({ ...input, imageWarnings: ['POSSIBLE_BLANK'] });
  assert.equal(extraction.status, 'manual_review_required'); assert.deepEqual(extraction.fields, {}); assert.ok(extraction.fullText);
});
function request(data: Uint8Array, metadata: Record<string, string> = {}, variant?: Uint8Array) {
  const form = new FormData(); form.set('file', new Blob([Buffer.from(data)], { type: 'image/png' }), 'synthetic.png');
  for (const [key, value] of Object.entries(metadata)) form.set(key, value);
  if (variant) form.set('contrast', new Blob([Buffer.from(variant)], { type: 'image/png' }), 'contrast.png');
  return new Request('http://local/api/documents/extract', { method: 'POST', body: form });
}
test('API validates full decoding, not just signature, before any OCR', async () => {
  let calls = 0;
  const response = await handleDocumentExtraction(request(bytes.subarray(0, 80)), () => { calls++; throw Error('must not call'); });
  assert.equal(response.status, 400); assert.equal(calls, 0);
});
test('API detects a blank image and carries whole-image fallback metadata conservatively', async () => {
  const image = await parseDocumentImage(request(readFileSync('tests/fixtures/documents/blank.png'), { documentDetectionFailed: 'true' }));
  assert.ok(image.imageWarnings?.includes('POSSIBLE_BLANK')); assert.equal(image.deskewApplied, false); assert.equal(image.documentDetectionFailed, true);
  await assert.rejects(() => parseDocumentImage(request(bytes, { documentDetectionFailed: 'true', deskewApplied: 'true' })), /INVALID_GEOMETRY_METADATA/);
});
test('API refuses mismatched enhanced coordinate frame', async () => {
  await assert.rejects(() => parseDocumentImage(request(bytes, {}, readFileSync('tests/fixtures/documents/small.png'))), /INVALID_VARIANT_GEOMETRY/);
});
test('unexpected weak OCR creates fallback only then, while keeping primary provenance', async () => {
  let calls = 0;
  const response = await runAdaptiveOcr({ extract: async i => { calls++; if (calls === 2) assert.ok(i.bytes.byteLength > 8); return result(); } }, { bytes, mimeType: 'image/png' });
  assert.equal(calls, 2); assert.deepEqual(response.review.attempts.map(a => a.variant), ['primary', 'contrast']);
});
test('existing VietOCR document provider has no offline synthesized content and missing confidence remains null', async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ predictions: [{ text: 'Nội dung thử', coordinates: [0.1, 0.1, 0.2, 0.9] }] });
    const provider = new VietOcrProvider({ endpoint: 'http://fake/predict', allowOfflineFallback: true });
    assert.equal((await provider.extract(input)).lines[0].confidence, null);
    globalThis.fetch = async () => { throw Error('offline'); };
    await assert.rejects(() => provider.extract(input), /OCR_UNAVAILABLE/);
  } finally { globalThis.fetch = fetchOriginal; }
});
