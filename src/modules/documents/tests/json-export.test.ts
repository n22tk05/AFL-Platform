import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyLine, extractFieldPairs } from '../json-content-classifier';
import { assembleJson } from '../json-assembler';
import { validateJsonExport, parseJsonExport, documentExportSchema } from '../json-validator';
import { handleJsonConversion, handleJsonSchema, safeJsonFilename } from '../json-api';
import { JsonExportService } from '../services/json-export.service';
import { DocumentPipelineError } from '../errors';
import { assembleCandidatesToJson } from '../candidate-json-assembler';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';

const options = { documentId: 'synthetic-session-1', mimeType: 'image/png' as const };
const ocr = (fullText: string): DocumentOcrResult => ({ provider: 'vietocr', fullText, lines: [], tokens: [], pageCount: 1, warnings: [] });
const example = () => {
  const raw = 'Họ và tên:  Người Thử\r\nSố CCCD: 000000000007\n\nSố tiền: 001.000 đồng\rChưa phân loại 🧪\n';
  const input = ocr(raw);
  input.lines = [{ id: 'original-7', text: 'Họ và tên:  Người Thử', page: 1, confidence: null, boundingBox: [0.1,0.2,0.3,0.8], tokenIds: [] }];
  return { input, doc: assembleJson(input, options) };
};
const cases = [
  ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM','national_heading'],
  ['CỘNG HOA XÃ HỘI CHỦ NGHĨA VIỆT NAM','national_heading'],
  ['Độc lập – Tự do – Hạnh phúc','motto'],
  ['TỜ KHAI LỆ PHÍ TRƯỚC BẠ','document_title'],
  ['Mẫu số: 01/LPTB','document_code'],
  ['Huế, ngày .. tháng .. năm ....','date_line'],
  ['I. THÔNG TIN CHUNG','section_heading'],
  ['A. THÔNG TIN CHUNG','section_heading'],
  ['1. THÔNG TIN CHUNG','section_heading'],
  ['Họ và tên: Người Thử','field_label_value'],
  ['Số CCCD','field_label'],
  ['............','blank_input'],
  ['[?] Lựa chọn chưa rõ','checkbox_item'],
  ['NGƯỜI NỘP THUẾ','signature_title'],
  ['(Ký, ghi rõ họ và tên)','signature_instruction'],
  ['- nội dung gốc','bullet_item'],
  ['Căn cứ Thông tư 01/TEST','legal_reference'],
  ['Quốc huy','unknown'],
  ['Một câu kết thúc.','unknown'],
  ['Không biết thuộc loại nào','unknown'],
  ['| A | B |','unknown'],
  ['(Dùng cho tài sản...)','unknown'],
  ['','blank_line'],
] as const;
for(const [text,type] of cases) test('classifier evidence and precedence: ' + text, () => {
  assert.equal(classifyLine(text).type,type); assert.equal(classifyLine(text).evidence.verified,false);
  assert.equal(classifyLine(text.normalize('NFD')).type,type);
});
test('label values retain whitespace, numbers and decomposed Vietnamese; repeated fill regions stay separate', () => {
  const text = 'Họ và tên:  Người Thử  Ngày sinh: 01/02/2026';
  assert.deepEqual(extractFieldPairs(text).map(f => f.rawValue), ['  Người Thử  ',' 01/02/2026']);
  assert.equal(extractFieldPairs('Nội dung: Một dấu chấm.')[0].rawValue,' Một dấu chấm.');
  assert.equal(extractFieldPairs('Họ và tên: .....')[0].rawValue,null);
  const nfd = 'Họ và tên:  Người Thử'.normalize('NFD');
  assert.equal(extractFieldPairs(nfd)[0].rawValue,'  Người Thử'.normalize('NFD'));
});
test('assembler preserves exact raw OCR and every provider block independently of classification', () => {
  const { input,doc } = example(), before = JSON.stringify(input);
  assert.equal(doc.rawText,input.fullText);
  assert.equal(doc.lines.map(l => l.text + l.newline).join(''),input.fullText);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(doc.blocks.map(b => [b.providerId,b.text,b.confidence,b.bbox]), [['original-7','Họ và tên:  Người Thử',null,[0.2,0.1,0.8,0.3]]]);
  assert.equal(doc.structure.fields.find(f => f.label === 'Số CCCD')?.rawValue,' 000000000007');
  assert.equal(doc.structure.fields.find(f => f.label === 'Số tiền')?.rawValue,' 001.000 đồng');
  assert.ok(doc.nodes.some(n => n.text === 'Chưa phân loại 🧪' && doc.structure.unclassified.includes(n.id)));
  assert.ok(doc.lines.some(l => l.text === '' && l.newline === '\n'));
  assert.equal(validateJsonExport(doc,input).valid,true);
  assert.deepEqual(assembleJson(input,options),doc);
  assert.deepEqual(parseJsonExport(JSON.parse(JSON.stringify(doc))),doc);
});
test('field blank differs from unreadable, checkbox unknown does not become unchecked, no fabricated layout', () => {
  const doc = assembleJson(ocr('Họ và tên: ....\nSố CCCD: �\n□ chưa rõ\n☐ trống\n[x] có dấu\nTên bên ngoài mục'),options);
  assert.deepEqual(doc.structure.fields.map(f => [f.rawValue,f.valueState]),[[null,'blank'],[' �','unreadable']]);
  assert.deepEqual(doc.structure.checkboxes.map(c => c.state),['unknown','unchecked','checked']);
  assert.deepEqual(doc.structure.tables,[]); assert.deepEqual(doc.structure.signatures,[]);
  assert.equal(doc.provider.model,null); assert.equal(doc.blocks.length,0);
  assert.ok(doc.warnings.includes('SOURCE_IS_TEXT_SPLITTING_NO_GEOMETRY'));
  assert.equal(validateJsonExport(doc).valid,true);
});
test('multiple pages retain provider order, failed page stays visible as partial, section never crosses pages', () => {
  const input = ocr('I. MỤC\nNội dung trang một\nNội dung trang ba');
  input.pageCount = 3; input.pages = [{ page:1,status:'success',error:null,width:600,height:800 },{ page:2,status:'failed',error:'OCR_TIMEOUT',width:null,height:null },{ page:3,status:'success',error:null,width:600,height:800 }];
  input.lines = ['I. MỤC','Nội dung trang một','Nội dung trang ba'].map((text,i) => ({ id:'p-'+i,text,page:i===2?3:1,confidence:null,boundingBox:null,tokenIds:[] }));
  const doc = assembleJson(input,options);
  assert.equal(doc.status,'partial'); assert.equal(doc.pages[1].error,'OCR_TIMEOUT');
  assert.deepEqual(doc.nodes.map(n => n.page),[1,1,3]);
  assert.equal(doc.structure.sections[0].nodeIds.length,1);
  assert.equal(validateJsonExport(doc).valid,true);
});
test('provider table cells preserve merged spans and traceable code-point ranges after an emoji', () => {
  const input = ocr('🧪\nA B\nC');
  input.tables = [{ id:'provider-table',page:1,headerRowCount:0,rows:[
    [{text:'A',sourceRanges:[{start:2,end:3}],rowSpan:2,columnSpan:1},{text:'B',sourceRanges:[{start:4,end:5}],rowSpan:1,columnSpan:2}],
    [{text:'C',sourceRanges:[{start:6,end:7}],rowSpan:1,columnSpan:2}],
  ] }];
  const doc=assembleJson(input,options), table=doc.structure.tables[0];
  assert.deepEqual(table.rows.map(row => row.map(c => [c.rowIndex,c.columnIndex,c.rowSpan,c.columnSpan,c.rawValue])),[[[0,0,2,1,'A'],[0,1,1,2,'B']],[[1,1,1,2,'C']]]);
  assert.deepEqual(table.rows[0][0].sourceRanges,[{start:3,end:4}]);
  assert.ok(table.rows.every(row => row.every(cell => cell.sourceLineIds.length)));
  assert.equal(validateJsonExport(doc).valid,true);
});
test('candidate path retains empty/unreadable crops and pixel checkbox evidence, without claiming a table', () => {
  const doc = assembleCandidatesToJson([
    {candidateId:'a',rect:{x:20,y:10,width:30,height:10},source:'closed_contour',text:'đã đọc',confidence:null},
    {candidateId:'b',rect:{x:20,y:30,width:10,height:10},source:'checkbox',text:'',checkboxState:'unknown'},
    {candidateId:'c',rect:{x:40,y:30,width:30,height:10},source:'field_row',text:'',confidence:null},
  ],{width:100,height:100});
  assert.equal(doc.blocks.length,3); assert.equal(doc.structure.checkboxes[0].state,'unknown');
  assert.equal(doc.structure.checkboxes[0].evidence.method,'pixel_heuristic');
  assert.deepEqual(doc.structure.tables,[]); assert.equal(validateJsonExport(doc).valid,true);
});
const corruptions: [string,(d: ReturnType<typeof example>['doc']) => void][] = [
  ['schema',d => { d.schemaVersion='2.0.0' as never; }],
  ['duplicate ID',d => { d.lines[1].id=d.lines[0].id; }],
  ['invalid reference',d => { d.nodes[0].sourceLineIds=['missing']; }],
  ['bbox order',d => { d.blocks[0].bbox=[0.7,0.1,0.2,0.3]; }],
  ['bbox range',d => { d.blocks[0].bbox=[0,0,2,1]; }],
  ['confidence',d => { d.blocks[0].confidence=1.1; }],
  ['lost unknown',d => { d.structure.unclassified=[]; }],
  ['lost raw newline',d => { d.lines[0].newline='\n'; }],
  ['source text changed',d => { d.nodes[0].text='invented'; }],
  ['raw value overwritten',d => { d.structure.fields[0].rawValue='invented'; }],
  ['normalized without review',d => { d.structure.fields[0].normalizedValue='invented'; }],
  ['false success',d => { d.pages[0].status='failed'; d.pages[0].error='OCR_TIMEOUT'; }],
];
for(const [name,change] of corruptions) test('runtime validator rejects ' + name, () => { const {doc}=example(); change(doc); assert.equal(validateJsonExport(doc).valid,false); });
for(const value of [NaN,Infinity,undefined,BigInt(1),new Uint8Array(1)]) test('serialization rejects ' + String(value),() => {
  const {doc}=example(); Reflect.set(doc,'bad',value); assert.equal(validateJsonExport(doc).valid,false);
});
test('circular/sparse data and mutated provider blocks are rejected', () => {
  const {doc,input}=example(); Reflect.set(doc,'bad',doc); assert.equal(validateJsonExport(doc).valid,false); Reflect.deleteProperty(doc,'bad');
  Reflect.set(doc,'bad',new Array(1)); assert.equal(validateJsonExport(doc).valid,false); Reflect.deleteProperty(doc,'bad');
  doc.blocks[0].text='mutated'; assert.equal(validateJsonExport(doc,input).valid,false);
});
test('manual interpretation edit keeps raw sources and requires explicit evidence', () => {
  const {doc,input}=example(), raw=doc.rawText;
  doc.structure.fields[0].normalizedValue='Đã sửa thủ công'; doc.structure.fields[0].reviewReasons.push('USER_EDIT');
  assert.equal(validateJsonExport(doc,input).valid,true); assert.equal(doc.rawText,raw); assert.equal(doc.requiresReview,true);
});
const image = readFileSync('tests/fixtures/documents/small.png');
const request = (download=false) => new Request('http://localhost/api/documents/json' + (download?'?download=1':''), { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64:'data:image/png;base64,'+image.toString('base64')}) });
const ready: DocumentOcrResult = { ...ocr('Số tiền: 001.000 đồng'),lines:[{ id:'service-line',text:'Số tiền: 001.000 đồng',page:1,tokenIds:[],boundingBox:[0.1,0.2,0.3,0.8],confidence:0.99 }] };
test('JSON API success and download parse against published schema with UTF-8 headers', async () => {
  const factory = () => new JsonExportService({ providerId:'vietocr',extract:async () => ready });
  const response=await handleJsonConversion(request(),factory), body=await response.json();
  assert.equal(response.status,200); assert.equal(body.success,true); assert.equal(body.data.schemaVersion,'1.0.0');
  assert.equal(body.data.requiresReview,true); assert.equal(validateJsonExport(body.data,ready).valid,true);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  const file=await handleJsonConversion(request(true),factory);
  assert.match(file.headers.get('content-type')!,/application\/json; charset=utf-8/);
  assert.match(file.headers.get('content-disposition')!,/^attachment; filename="[A-Za-z0-9_-]+\.json"$/);
  assert.equal(validateJsonExport(JSON.parse(await file.text())).valid,true);
  assert.deepEqual(await handleJsonSchema().json(),documentExportSchema);
  assert.equal(safeJsonFilename('../bad\r\n"file.png').includes('\n'),false);
});
for(const [code,status] of [['OCR_NOT_CONFIGURED',503],['OCR_TIMEOUT',504],['OCR_RATE_LIMITED',429],['OCR_UNAVAILABLE',503]] as const) test('API provider failure: ' + code, async () => {
  let calls=0; const response=await handleJsonConversion(request(),() => new JsonExportService({providerId:'vietocr',extract:async()=>{calls++;throw new DocumentPipelineError(code);} }));
  const body=await response.json(); assert.equal(response.status,status); assert.equal(calls,1);
  assert.equal(body.success,false); assert.equal(body.data.status,'failed'); assert.equal(body.data.rawText,'');
  assert.equal(body.data.review.attempts[0].errorCode,code); assert.equal(validateJsonExport(body.data).valid,true);
  if(code==='OCR_TIMEOUT') assert.doesNotMatch(body.error.message_vi,/ảnh|tương phản/iu);
});
test('API partial retry preserves primary and failed retry, empty OCR never fake success',async()=> {
  let calls=0; const weak={...ready,lines:ready.lines.map(l=>({...l,confidence:null}))};
  const response=await handleJsonConversion(request(),()=>new JsonExportService({providerId:'vietocr',extract:async()=>{calls++;if(calls===2)throw new DocumentPipelineError('OCR_TIMEOUT');return weak;}}));
  const body=await response.json(); assert.equal(body.data.status,'partial'); assert.equal(body.data.rawText,weak.fullText);
  assert.equal(body.data.review.attempts[1].rawText,null); assert.equal(body.data.review.attempts[1].errorCode,'OCR_TIMEOUT');
  const empty=await handleJsonConversion(request(),()=>new JsonExportService({providerId:'vietocr',extract:async()=>ocr('')}));
  assert.equal(empty.status,422); assert.equal((await empty.json()).success,false);
});
test('API rejects corrupt image and declared oversize body before constructing provider',async()=> {
  let calls=0; const factory=()=>{calls++;return new JsonExportService({extract:async()=>ready});};
  const corrupt=new Request('http://localhost/api/documents/json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64:'data:image/png;base64,YmFk'})});
  assert.equal((await handleJsonConversion(corrupt,factory)).status,400);
  const large=new Request('http://localhost/api/documents/json',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'999999999'},body:'{}'});
  assert.equal((await handleJsonConversion(large,factory)).status,413); assert.equal(calls,0);
});

test('mixed Unicode normalization preserves source labels and values', () => {
  const text = 'Họ'.normalize('NFD') + ' và tên: Người Thử  Ngày sinh: 01/02/2026';
  const pairs = extractFieldPairs(text);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].label, 'Họ'.normalize('NFD') + ' và tên');
  assert.equal(pairs[0].rawValue, ' Người Thử  ');
});
test('serialization rejects symbol, accessor and hidden array properties without reading getters', () => {
  for (const kind of ['symbol', 'getter', 'array-property']) {
    const {doc} = example();
    if (kind === 'symbol') Reflect.set(doc, Symbol('lost'), 'value');
    if (kind === 'getter') Object.defineProperty(doc, 'getter', { enumerable: true, get() { throw new Error('must not read'); } });
    if (kind === 'array-property') Reflect.set(doc.warnings, 'hidden', 'lost');
    assert.equal(validateJsonExport(doc).valid, false);
  }
});
test('table semantic validation rejects overlaps, unsupported normalization and oversize spans', () => {
  const input = ocr('A B');
  input.tables = [{ id:'t',page:1,headerRowCount:0,rows:[[
    {text:'A',sourceRanges:[{start:0,end:1}],rowSpan:1,columnSpan:1},
    {text:'B',sourceRanges:[{start:2,end:3}],rowSpan:1,columnSpan:1},
  ]] }];
  for (const mutation of ['overlap','span','value','source']) {
    const doc = assembleJson(input,options), cell = doc.structure.tables[0].rows[0][1];
    if (mutation === 'overlap') cell.columnIndex = 0;
    if (mutation === 'span') cell.rowSpan = 1000000;
    if (mutation === 'value') cell.normalizedValue = 'invented';
    if (mutation === 'source') cell.sourceLineIds = [];
    assert.equal(validateJsonExport(doc).valid,false);
  }
});
