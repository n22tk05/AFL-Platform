import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleCandidatesToMarkdown,
  type RecognizedCandidate,
} from '../candidate-markdown-assembler';

const imageSize = { width: 1200, height: 1600 };

test('assembleCandidatesToMarkdown formats national header and motto with Nghị định 30/2020/NĐ-CP styling', () => {
  const candidates: RecognizedCandidate[] = [
    {
      candidateId: 'row_0',
      rect: { x: 300, y: 50, width: 600, height: 30 },
      source: 'field_row',
      text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    },
    {
      candidateId: 'row_1',
      rect: { x: 400, y: 90, width: 400, height: 25 },
      source: 'field_row',
      text: 'Độc lập - Tự do - Hạnh phúc',
    },
    {
      candidateId: 'row_2',
      rect: { x: 350, y: 150, width: 500, height: 35 },
      source: 'field_row',
      text: 'TỜ KHAI ĐĂNG KÝ KHAI SINH',
    },
  ];

  const result = assembleCandidatesToMarkdown(candidates, imageSize);

  assert.ok(result.markdown.includes('# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'));
  assert.ok(result.markdown.includes('## Độc lập - Tự do - Hạnh phúc'));
  assert.ok(result.markdown.includes('---'));
  assert.ok(result.markdown.includes('# TỜ KHAI ĐĂNG KÝ KHAI SINH'));
});

test('assembleCandidatesToMarkdown aligns inline multi-fields and attaches checkboxes to labels', () => {
  const candidates: RecognizedCandidate[] = [
    // Line 1: Họ và tên
    {
      candidateId: 'row_0',
      rect: { x: 100, y: 200, width: 700, height: 28 },
      source: 'field_row',
      text: 'Họ và tên: NGUYỄN VĂN A',
    },
    // Line 2: Ngày sinh (left) + Giới tính label + Checkbox Nam + Checkbox Nữ
    {
      candidateId: 'phrase_1',
      rect: { x: 100, y: 250, width: 250, height: 24 },
      source: 'phrase_cluster',
      text: 'Ngày sinh: 15/08/1995',
    },
    {
      candidateId: 'phrase_2',
      rect: { x: 400, y: 250, width: 100, height: 24 },
      source: 'phrase_cluster',
      text: 'Giới tính:',
    },
    {
      candidateId: 'cb_1',
      rect: { x: 520, y: 252, width: 20, height: 20 },
      source: 'checkbox',
      text: '☑',
    },
    {
      candidateId: 'phrase_3',
      rect: { x: 546, y: 250, width: 40, height: 24 },
      source: 'phrase_cluster',
      text: 'Nam',
    },
    {
      candidateId: 'cb_2',
      rect: { x: 620, y: 252, width: 20, height: 20 },
      source: 'checkbox',
      text: '☐',
    },
    {
      candidateId: 'phrase_4',
      rect: { x: 646, y: 250, width: 40, height: 24 },
      source: 'phrase_cluster',
      text: 'Nữ',
    },
  ];

  const result = assembleCandidatesToMarkdown(candidates, imageSize);

  // Bold label for Họ và tên
  assert.ok(result.markdown.includes('**Họ và tên:** NGUYỄN VĂN A'));
  // Aligned multi-field line with checkboxes attached to labels
  assert.ok(result.markdown.includes('☑ Nam'));
  assert.ok(result.markdown.includes('☐ Nữ'));
});

test('assembleCandidatesToMarkdown assembles grid of closed_contour cells into a Markdown table', () => {
  const candidates: RecognizedCandidate[] = [
    // Header row
    { candidateId: 'cell_0_0', rect: { x: 100, y: 300, width: 200, height: 40 }, source: 'closed_contour', text: 'Họ và tên cha' },
    { candidateId: 'cell_0_1', rect: { x: 310, y: 300, width: 200, height: 40 }, source: 'closed_contour', text: 'Năm sinh' },
    { candidateId: 'cell_0_2', rect: { x: 520, y: 300, width: 200, height: 40 }, source: 'closed_contour', text: 'Dân tộc' },

    // Data row 1
    { candidateId: 'cell_1_0', rect: { x: 100, y: 345, width: 200, height: 40 }, source: 'closed_contour', text: 'Nguyễn Văn B' },
    { candidateId: 'cell_1_1', rect: { x: 310, y: 345, width: 200, height: 40 }, source: 'closed_contour', text: '1970' },
    { candidateId: 'cell_1_2', rect: { x: 520, y: 345, width: 200, height: 40 }, source: 'closed_contour', text: 'Kinh' },
  ];

  const result = assembleCandidatesToMarkdown(candidates, imageSize);

  assert.ok(result.markdown.includes('| Họ và tên cha | Năm sinh | Dân tộc |'));
  assert.ok(result.markdown.includes('| :--- | :--- | :--- |'));
  assert.ok(result.markdown.includes('| Nguyễn Văn B | 1970 | Kinh |'));
});

test('assembleCandidatesToMarkdown ignores outer container frames and preserves dotted lines', () => {
  const candidates: RecognizedCandidate[] = [
    // Outer table container
    {
      candidateId: 'container_0',
      rect: { x: 90, y: 290, width: 700, height: 300 },
      source: 'closed_contour',
      isContainer: true,
      text: 'Outer Frame Container',
    },
    // Real field row with dotted lines
    {
      candidateId: 'row_0',
      rect: { x: 100, y: 320, width: 680, height: 26 },
      source: 'field_row',
      text: 'Nơi thường trú: ....................................................',
    },
  ];

  const result = assembleCandidatesToMarkdown(candidates, imageSize);

  // Container text must not appear in markdown
  assert.equal(result.markdown.includes('Outer Frame Container'), false);
  // Dotted line must be preserved
  assert.ok(result.markdown.includes('....................................................'));
});
