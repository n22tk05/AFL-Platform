import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOcrText, normalizePrintedText, scoreOcrText } from '../ocr-text-evaluation';

test('OCR text scoring ignores dotted writing guides but keeps printed words and order', () => {
  assert.equal(normalizePrintedText('Họ tên: .......... Địa chỉ: ……'), 'họ tên địa chỉ');
  const perfect = scoreOcrText(['Họ tên:', 'Địa chỉ:'], 'Họ tên........\nĐịa chỉ:');
  assert.equal(perfect.characterErrorRate, 0);
  assert.equal(perfect.wordErrorRate, 0);
  const missing = scoreOcrText(['Họ tên:', 'Địa chỉ:'], 'Họ tên:');
  assert.ok(missing.characterErrorRate > 0);
  assert.ok(missing.wordErrorRate > 0);
  const invented = scoreOcrText(['Họ tên:'], 'Họ tên: 036000000099');
  assert.ok(invented.wordErrorRate > 0);
});

test('OCR response extraction accepts ordered multipage envelopes and rejects partial failures', () => {
  assert.equal(extractOcrText([
    { data: { status: 'success', rawText: 'Trang một' } },
    { data: { status: 'success', rawText: 'Trang hai' } },
  ]), 'Trang một\nTrang hai');
  assert.equal(extractOcrText({ data: { status: 'success', rawText: 'Một trang' } }), 'Một trang');
  assert.equal(extractOcrText([{ data: { status: 'success', rawText: 'Trang một' } }, { data: { status: 'error', rawText: '' } }]), undefined);
});
