import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownExportService } from '../services/markdown-export.service';
import { DocumentPipelineError } from '../errors';
import type { DocumentOcrProvider } from '@/shared/document-extraction.types';

const input = { bytes: new Uint8Array([255, 216, 255, 224]), mimeType: 'image/jpeg' as const };
const fullText = 'THÔNG BÁO\nHọ tên: Nguyễn Văn A\nSố tiền: 100.000 đồng\nDòng cuối';
const ocr: DocumentOcrProvider = { extract: async () => ({
  provider: 'test', fullText, tokens: [], lines: [], pageCount: 1, warnings: [],
}) };

test('Gemini heading choices format without dropping or rewriting OCR text', async () => {
  const calls: string[] = [];
  const result = await new MarkdownExportService({ extract: async value => { calls.push('ocr'); return ocr.extract(value); } },
    { headingLines: async text => { calls.push('gemini'); assert.equal(text, fullText); return [1]; } }).convert(input);
  assert.deepEqual(calls, ['ocr', 'gemini']);
  assert.equal(result, '# THÔNG BÁO\nHọ tên: Nguyễn Văn A\nSố tiền: 100.000 đồng\nDòng cuối\n');
  assert.equal(result.replace(/^# /m, '').trimEnd(), fullText);
});

test('invalid Gemini line references cannot alter or omit source content', async () => {
  await assert.rejects(() => new MarkdownExportService(ocr, { headingLines: async () => [999] }).convert(input),
    (error: unknown) => error instanceof DocumentPipelineError && error.code === 'INVALID_STRUCTURED_RESPONSE');
});

test('empty OCR text is rejected before calling Gemini', async () => {
  const empty: DocumentOcrProvider = { extract: async () => ({ provider: 'test', fullText: '', tokens: [], lines: [], pageCount: 1, warnings: [] }) };
  await assert.rejects(() => new MarkdownExportService(empty, { headingLines: async () => { throw Error('must not call'); } }).convert(input),
    (error: unknown) => error instanceof DocumentPipelineError && error.code === 'OCR_EMPTY_TEXT');
});
