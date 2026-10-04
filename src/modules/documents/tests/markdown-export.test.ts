import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownExportService } from '../services/markdown-export.service';
import { DocumentPipelineError } from '../errors';
import { validateMarkdown } from '../markdown-validator';
import { handleMarkdownConversion } from '../markdown-api';
import { readFileSync } from 'node:fs';
import type { DocumentOcrProvider, DocumentOcrResult } from '@/shared/document-extraction.types';

const input = { bytes: readFileSync('tests/fixtures/documents/clear.png'), mimeType: 'image/png' as const };
const rawText = 'THÔNG BÁO\nHọ tên: Nguyễn Văn A\nSố tiền: 100.000 đồng\nNgày: 01/02/2026\nDòng cuối';
const output: DocumentOcrResult = { fullText: rawText, provider: 'vietocr', tokens: [], lines: [{ id: 'l1', text: rawText, confidence: 0.99, boundingBox: [0, 0, 1, 1], page: 1, tokenIds: [] }], pageCount: 1, warnings: [] };
const ocr: DocumentOcrProvider = { extract: async () => output };

test('VietOCR plus deterministic assembly preserves names, dates and amounts; always needs review', async () => {
  const result = await new MarkdownExportService(ocr).convert(input);
  assert.equal(result.rawText, rawText);
  assert.ok(result.markdown.includes('# THÔNG BÁO'));
  for (const text of ['Nguyễn Văn A','100.000 đồng','01/02/2026','Dòng cuối']) assert.ok(result.markdown.includes(text));
  assert.equal(result.validation.valid, true);
  assert.equal(result.status, 'review_required');
});

test('invalid syntax returns an editable draft without silently repairing or dropping text', async () => {
  const broken = 'Chữ gốc\u0000';
  const result = await new MarkdownExportService({ extract: async () => ({ ...output, fullText: broken }) }).convert(input);
  assert.equal(result.rawText, broken);
  assert.ok(result.markdown.includes(broken));
  assert.equal(result.validation.valid, false);
  assert.equal(result.validation.issues[0].code, 'CONTROL_CHARACTERS');
});

test('empty, oversized and multipage responses cannot become downloads', async () => {
  const empty = await new MarkdownExportService({ extract: async () => ({ ...output, fullText: ' ' }) }).convert(input);
  assert.equal(empty.validation.valid, false); assert.equal(empty.markdown, '');
  assert.equal(empty.ocrReview?.regions[0].status, 'unreadable');
  for (const [change, code] of [[{ fullText: 'a'.repeat(120_001) }, 'OCR_LIMIT_EXCEEDED'], [{ pageCount: 2 }, 'OCR_LIMIT_EXCEEDED']] as const) {
    await assert.rejects(() => new MarkdownExportService({ extract: async () => ({ ...output, ...change }) }).convert(input),
      (error: unknown) => error instanceof DocumentPipelineError && error.code === code);
  }
});

test('validator detects active content, malformed tables, controls and code fences', () => {
  for (const [source, code] of [['[link](javascript:alert(1))', 'ACTIVE_CONTENT'], ['<script>alert(1)</script>', 'ACTIVE_CONTENT'],
    ['| A | B |\n| --- | --- |\n| 1 |', 'TABLE_COLUMNS'], ['a\u0000b', 'CONTROL_CHARACTERS'], ['~~~\ncode\n```', 'UNCLOSED_FENCE']]) {
    const result = validateMarkdown(source);
    assert.equal(result.valid, false, source);
    assert.ok(result.issues.some(issue => issue.code === code));
  }
  assert.equal(validateMarkdown('```md\n![example](img-0.jpeg)\n```\n\n| A | B |\n| --- | --- |\n| x\\|y | 2 |').valid, true);
  assert.equal(validateMarkdown('\uFEFFChữ  \r\nTiếng Việt').markdown, 'Chữ  \nTiếng Việt\n');
});

test('request abort propagates to OCR and rejects promptly', async () => {
  const controller = new AbortController();
  const service = new MarkdownExportService({ extract: async ({ signal }) => {
    controller.abort();
    assert.equal(signal?.aborted, true);
    return new Promise(() => {});
  } });
  await assert.rejects(service.convert({ ...input, signal: controller.signal }), /OCR_TIMEOUT/);
});

const request = () => new Request('http://localhost/api/documents/markdown', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64: 'data:image/png;base64,' + Buffer.from(input.bytes).toString('base64') }) });

test('API responds with no-store review JSON, never an attachment', async () => {
  const response = await handleMarkdownConversion(request(), () => new MarkdownExportService(ocr));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-disposition'), null);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const payload = await response.json();
  assert.equal(payload.data.status, 'review_required');
  assert.equal(payload.data.rawText, rawText);
  assert.equal(payload.data.provider, 'vietocr');
  assert.equal(payload.data.markdown, (await new MarkdownExportService(ocr).convert(input)).markdown);
});

test('Markdown pipeline rejects unsupported providers and needs no Gemini key or call', async () => {
  await assert.rejects(new MarkdownExportService({ extract: async () => ({ ...output, provider: 'other-provider' }) }).convert(input), /OCR_NOT_CONFIGURED/);
  let calls = 0;
  const result = await new MarkdownExportService({ extract: async value => { calls++; assert.deepEqual(value.bytes, input.bytes); return output; } }).convert(input);
  assert.equal(calls, 1);
  assert.equal(result.rawText, rawText);
});

test('API exposes safe actionable codes without credentials or provider exceptions', async () => {
  for (const [error, status] of [[new DocumentPipelineError('OCR_NOT_CONFIGURED'), 503], [new DocumentPipelineError('OCR_RATE_LIMITED'), 429],
    [new DocumentPipelineError('OCR_TIMEOUT'), 504], [new Error('secret-key provider-body'), 502]] as const) {
    const response = await handleMarkdownConversion(request(), () => { throw error; });
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /secret-key|provider-body/);
  }
});

test('invalid uploaded content is rejected before creating the provider', async () => {
  const req = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: 'data:image/png;base64,YQ==' }) });
  const response = await handleMarkdownConversion(req, () => { throw Error('must not call'); });
  assert.equal(response.status, 400);
});
test('failed OCR retains safe attempt provenance in the Markdown error response', async () => {
  const response = await handleMarkdownConversion(request(), () => new MarkdownExportService({ providerId: 'vietocr', extract: async () => { throw new DocumentPipelineError('OCR_NOT_CONFIGURED'); } }));
  const body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.error.ocrReview.attempts.length, 1);
  assert.equal(body.error.ocrReview.attempts[0].provider, 'vietocr'); assert.equal(body.error.ocrReview.attempts[0].raw, null);
  assert.equal(body.error.ocrReview.regions[0].status, 'unreadable');
});

test('VietOCR provider seamlessly converts document to markdown with review draft', async () => {
  const vietOcrOutput: DocumentOcrResult = {
    fullText: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\nBIÊN BẢN VI PHẠM\n- Lỗi: Quá tốc độ 15 km/h\nSố tiền: 5.000.000 đồng',
    provider: 'vietocr',
    tokens: [],
    lines: [
      { id: 'line_001', text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', confidence: 0.95, boundingBox: [0.05, 0.1, 0.08, 0.9], page: 1, tokenIds: [] },
      { id: 'line_002', text: 'Độc lập - Tự do - Hạnh phúc', confidence: 0.96, boundingBox: [0.09, 0.2, 0.12, 0.8], page: 1, tokenIds: [] },
      { id: 'line_003', text: 'BIÊN BẢN VI PHẠM', confidence: 0.98, boundingBox: [0.15, 0.2, 0.18, 0.8], page: 1, tokenIds: [] },
      { id: 'line_004', text: '- Lỗi: Quá tốc độ 15 km/h', confidence: 0.92, boundingBox: [0.22, 0.1, 0.25, 0.7], page: 1, tokenIds: [] },
      { id: 'line_005', text: 'Số tiền: 5.000.000 đồng', confidence: 0.94, boundingBox: [0.28, 0.1, 0.31, 0.6], page: 1, tokenIds: [] },
    ],
    pageCount: 1,
    warnings: [],
  };

  const result = await new MarkdownExportService({ extract: async () => vietOcrOutput }).convert(input);
  assert.equal(result.provider, 'vietocr');
  assert.equal(result.status, 'review_required');
  assert.ok(result.markdown.includes('# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'));
  assert.ok(result.markdown.includes('# BIÊN BẢN VI PHẠM'));
  assert.ok(result.markdown.includes('5.000.000 đồng'));
  assert.equal(result.validation.valid, true);
  assert.equal(result.confidence, 0.92);
});
