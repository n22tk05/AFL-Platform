import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assembleMarkdown } from '../markdown-assembler';
import { rehypeTableLineBreaks } from '../markdown-preview';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';

const ocr = (fullText: string): DocumentOcrResult => ({ fullText, provider: 'vietocr', lines: [], tokens: [], warnings: [], pageCount: 1 });
const render = (markdown: string) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeTableLineBreaks] }, markdown));

test('heading suffixes, strikethrough markers and spaced bullet punctuation retain their source characters', () => {
  const source = 'THÔNG BÁO #\nMã ~~001~~ và ~02~\n- - -';
  const html = render(assembleMarkdown(ocr(source)).markdown);
  assert.match(html, /<h1>THÔNG BÁO #<\/h1>/);
  assert.ok(html.includes('Mã ~~001~~ và ~02~'));
  assert.ok(html.includes('<li>- -'));
  assert.doesNotMatch(html, /<del>|<hr/);
});

test('table preview renders line breaks but never activates arbitrary HTML', () => {
  const markdown = '| Tên | Địa chỉ |\n| --- | --- |\n| Nguyễn A | Dòng 1<br>Dòng 2 |\n\n<script>alert(1)</script>\n<br onclick="alert(1)">';
  const html = render(markdown);
  assert.ok(html.includes('Dòng 1<br/>Dòng 2'));
  assert.doesNotMatch(html, /<script>|<br onclick=/);
  const literal = render(assembleMarkdown(ocr('Chữ <br> gốc')).markdown);
  assert.ok(literal.includes('Chữ &lt;br&gt; gốc'));
});

test('source punctuation, HTML, links, IDs and skipped list numbers remain literal', () => {
  const source = 'THÔNG BÁO\nNGUYỄN VĂN A\n1. Số 001234\n3. Ngày 01/02/2026\n- Số tiền: 1.234.567 đồng\n<script>alert(1)</script>\n![ảnh](https://example.org/x)\nA_B * C | D & E\n```';
  const first = assembleMarkdown(ocr(source));
  assert.deepEqual(assembleMarkdown(ocr(source)), first);
  const html = render(first.markdown);
  assert.match(html, /<h1>THÔNG BÁO<\/h1>/);
  assert.ok(html.includes('1. Số 001234'));
  assert.ok(html.includes('3. Ngày 01/02/2026'));
  assert.ok(html.includes('1.234.567 đồng'));
  assert.ok(html.includes('A_B * C | D &amp; E'));
  assert.ok(!html.includes('<script>') && !html.includes('<img') && !html.includes('<ol'));
  assert.ok(!html.includes('<h1>NGUYỄN'));
});

function tableFixture() {
  const fullText = '😀 THÔNG TIN\nTên\nTiền\nNguyễn A\n001.000 đồng\nCuối trang';
  const chars = Array.from(fullText);
  const cell = (text: string) => {
    const start = chars.join('').indexOf(text);
    const cpStart = Array.from(fullText.slice(0, start)).length;
    return { text, sourceRanges: [{ start: cpStart, end: cpStart + Array.from(text).length }], rowSpan: 1, columnSpan: 1 };
  };
  return { ...ocr(fullText), tables: [{ id: 'table-1', page: 1, headerRowCount: 1,
    rows: [['Tên\n','Tiền\n'].map(cell), ['Nguyễn A\n','001.000 đồng\n'].map(cell)],
  }] };
}

test('verified table anchors produce a GFM table without omitting surrounding text or changing numbers', () => {
  const fixture = tableFixture();
  const original = structuredClone(fixture);
  const result = assembleMarkdown(fixture);
  assert.ok(result.markdown.includes('| Tên | Tiền |\n| --- | --- |\n| Nguyễn A | 001.000 đồng |'));
  const html = render(result.markdown);
  assert.match(html, /<table>/);
  assert.ok(html.indexOf('😀 THÔNG TIN') < html.indexOf('<table>'));
  assert.ok(html.indexOf('Cuối trang') > html.indexOf('</table>'));
  assert.deepEqual(fixture, original);
});

test('merged cells, ungrounded cells and overlapping tables fall back to source order with no loss', () => {
  for (const change of ['merged', 'invented', 'overlap', 'missing-word'] as const) {
    const fixture = tableFixture();
    if (change === 'merged') fixture.tables![0].rows[1][0].columnSpan = 2;
    if (change === 'invented') fixture.tables![0].rows[1][0].text = 'INVENTED';
    if (change === 'overlap') fixture.tables!.push(structuredClone(fixture.tables![0]));
    if (change === 'missing-word') fixture.tables![0].rows[1][0].sourceRanges[0].start++;
    const result = assembleMarkdown(fixture);
    assert.ok(result.warnings.length);
    assert.ok(!render(result.markdown).includes('<table>'));
    for (const line of fixture.fullText.split('\n')) assert.ok(result.markdown.includes(line));
    assert.ok(!result.markdown.includes('INVENTED'));
  }
});

test('no table metadata does not invent rows from spaced numbers or multi-column prose', () => {
  const source = 'Họ tên    Nguyễn A\nĐịa chỉ    Số 001\nNgày 1/2/2026\n900.000 đồng';
  const result = assembleMarkdown(ocr(source));
  assert.ok(!render(result.markdown).includes('<table>'));
  for (const line of source.split('\n')) assert.ok(result.markdown.includes(line));
});

test('indented source is not interpreted as a code block with literal escaping artifacts', () => {
  const result = assembleMarkdown(ocr('    A_B * 001.000 đồng\n\t<script>x</script>'));
  const html = render(result.markdown);
  assert.ok(!html.includes('<pre>') && !html.includes('<script>'));
  assert.ok(html.includes('A_B * 001.000 đồng'));
});
