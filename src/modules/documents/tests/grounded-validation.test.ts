import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStructuredResult, parseDate, parseMoney, clampConfidence, valueErrors, validBox } from '../validation';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';
import { evaluateExtractions } from '../evaluation';

export const ocr: DocumentOcrResult = { provider:'fake', fullText:'Số: TEST-01/BB\nNgày: 29/02/2024\nPhạt: 900.000 đồng',tokens:[],pageCount:1,warnings:[],lines:[
  {id:'l1',text:'Số: TEST-01/BB',confidence:0.99,boundingBox:[0.1,0.1,0.2,0.9],page:1,tokenIds:[]},
  {id:'l2',text:'Ngày: 29/02/2024',confidence:0.99,boundingBox:[0.2,0.1,0.3,0.9],page:1,tokenIds:[]},
  {id:'l3',text:'Phạt: 900.000 đồng',confidence:0.99,boundingBox:[0.3,0.1,0.4,0.9],page:1,tokenIds:[]},
] };
export const candidate = { value:'TEST-01/BB', rawText:'TEST-01/BB', confidence:0.99,evidenceText:'Số: TEST-01/BB',sourceLineIds:['l1'] };
test('grounded JSON is accepted and missing fields remain null',()=>{
  const r=parseStructuredResult(JSON.stringify({fields:{recordNumber:candidate}}),ocr);
  assert.equal(r.fields.recordNumber.status,'accepted'); assert.equal(r.fields.citizenName.value,null); assert.equal(r.fields.citizenName.status,'unreadable');
});
test('wrong JSON/schema is rejected at runtime',()=>{
  for(const value of ['{',[],{fields:[]},{fields:{fake:candidate}},{fields:{recordNumber:{...candidate,confidence:'1'}}},{fields:{recordNumber:{...candidate,sourceLineIds:[1]}}}]) assert.throws(()=>parseStructuredResult(value,ocr));
});
test('missing evidence, nonexistent source and invented values cannot pass',()=>{
  for(const patch of [{evidenceText:null},{sourceLineIds:['invented']},{value:'INVENTED'},{rawText:'INVENTED',value:'INVENTED'}]) {
    const r=parseStructuredResult({fields:{recordNumber:{...candidate,...patch}}},ocr).fields.recordNumber;
    assert.equal(r.status,'needs_review'); assert.equal(r.value,null);
  }
});
test('critical fields require review for low/missing OCR confidence and warnings',()=>{
  for(const confidence of [null,0.4]) {
    const input=structuredClone(ocr); input.lines[0].confidence=confidence;
    assert.equal(parseStructuredResult({fields:{recordNumber:candidate}},input).fields.recordNumber.status,'needs_review');
  }
  assert.equal(parseStructuredResult({fields:{recordNumber:candidate}},{...ocr,warnings:['OCR_CLIPPED_GEOMETRY']}).fields.recordNumber.status,'needs_review');
});
test('low-confidence tokens cannot be hidden by a high-confidence line',()=>{
  const input=structuredClone(ocr);input.lines[0].tokenIds=['t1'];
  input.tokens=[{id:'t1',text:'TEST-01/BB',confidence:0.2,boundingBox:[0.1,0.1,0.2,0.9],page:1}];
  const field=parseStructuredResult({fields:{recordNumber:candidate}},input).fields.recordNumber;
  assert.equal(field.confidence,0.2);assert.equal(field.status,'needs_review');
});
test('rawText is a verbatim excerpt, not a rewritten version',()=>{
  const field=parseStructuredResult({fields:{recordNumber:{...candidate,rawText:'TEST-01/BB ',value:'TEST-01/BB'}}},ocr).fields.recordNumber;
  assert.equal(field.value,null);assert.equal(field.status,'needs_review');
});
test('invalid boxes and out-of-range confidence require review',()=>{
  const input=structuredClone(ocr); input.lines[0].boundingBox=[0,0,2,1];
  assert.equal(parseStructuredResult({fields:{recordNumber:candidate}},input).fields.recordNumber.status,'needs_review');
  for(const confidence of [-1,2]) {
    const f=parseStructuredResult({fields:{recordNumber:{...candidate,confidence}}},ocr).fields.recordNumber;
    assert.equal(f.status,'needs_review'); assert.ok(f.confidence>=0 && f.confidence<=1);
  }
  for(const box of [[-1,0,1,1],[0,0,Infinity,1],[0.8,0,0.2,1],[0,0,0,0]]) assert.equal(validBox(box),false);
  assert.equal(clampConfidence(NaN),0);
});
test('CCCD has exactly twelve digits; leading zero stays intact',()=>{
  assert.deepEqual(valueErrors('citizenId','000000000000'),[]);
  for(const value of ['123456789','12345678901x',123456789012]) assert.ok(valueErrors('citizenId',value).length);
});
test('dates must exist in calendar',()=>{
  assert.equal(parseDate('29/02/2024'),'2024-02-29'); assert.equal(parseDate('ngày 1 tháng 2 năm 2026'),'2026-02-01');
  for(const value of ['29/02/2023','31/04/2026','2026-13-01']) assert.equal(parseDate(value),null);
});
test('money supports safe grouping and VND symbols',()=>{
  for(const value of ['900.000 đồng','900,000 ₫','900 000 VND','900000đ']) assert.equal(parseMoney(value),900000);
  for(const value of ['-1','1.234,56','1,2','9007199254740992','900 nghìn']) assert.equal(parseMoney(value),null);
  assert.equal(parseMoney('0'),0);
});
test('normalized date and money preserve raw evidence',()=>{
  const r=parseStructuredResult({fields:{fineAmount:{value:900000,rawText:'900.000 đồng',confidence:1,evidenceText:'Phạt: 900.000 đồng',sourceLineIds:['l3']},recordDate:{value:'2024-02-29',rawText:'29/02/2024',confidence:1,evidenceText:'Ngày: 29/02/2024',sourceLineIds:['l2']}}},ocr);
  assert.equal(r.fields.fineAmount.status,'accepted'); assert.equal(r.fields.fineAmount.rawText,'900.000 đồng'); assert.equal(r.fields.recordDate.status,'accepted');
});
test('benchmark counts false accepted values and missing fields',()=>{
  const r=parseStructuredResult({fields:{recordNumber:candidate}},ocr);
  const stats=evaluateExtractions([{truth:{imagePath:'unused',documentType:'traffic_violation_record',expectedFields:{recordNumber:'OTHER',fineAmount:100}},actual:r}]);
  assert.equal(stats.totalImages,1); assert.equal(stats.wrongAutomaticallyAccepted,1); assert.equal(stats.missingFieldRate,0.5); assert.equal(stats.falseValueRate,1);
  assert.equal(evaluateExtractions([]).fieldExactMatch,null);
});
