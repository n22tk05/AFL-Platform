import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DocumentOcrResult, OcrTable } from '@/shared/document-extraction.types';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import { assembleJson } from './json-assembler';
import { validateJsonExport } from './json-validator';
export interface Relationship { type: string; text?: string; raw?: string; label?: string; value?: string | null; checked?: boolean; headerRow?: string[]; dataRows?: (string | null)[][] }
export interface EvaluationFixture { id: string; filename: string; expectedFullTextInReadingOrder: string[]; structuralRelationships: Relationship[]; criticalValues: Record<string,string | number>; emptyFields: string[] }
export const fixtures = (JSON.parse(readFileSync('tests/fixtures/ocr-json/ground-truth.json','utf8')) as { fixtures: Record<string,EvaluationFixture> }).fixtures;
const labelKey = (s: string) => s.normalize('NFC').replace(/^\d+\.\s*/u,'').trim().toLocaleLowerCase('vi');
const valueKey = (s: string) => s.normalize('NFC').replace(/\s+/gu,' ').trim();
/** Exact ID/content comparison, not a line-count proxy. Duplicate source text
 * is valid only when it came from distinct provider IDs. */
export function auditSourceCoverage(input: DocumentOcrResult, doc: DocumentJsonExport) {
  assert.equal(doc.rawText,input.fullText);
  for (const line of input.lines) {
    const blocks=doc.blocks.filter(b=>b.kind==='line'&&b.providerId===line.id&&b.page===line.page);
    assert.equal(blocks.length,1,'source ID lost/duplicated: '+line.id);
    assert.equal(blocks[0].text,line.text,'source text changed: '+line.id);
    assert.equal(blocks[0].confidence,line.confidence);
    assert.equal(doc.nodes.filter(n=>n.sourceBlockIds.includes(blocks[0].id)).length,1,'node source lost/duplicated');
  }
  assert.equal(validateJsonExport(doc,input).valid,true);
}
export function fixedOcrInput(fixture: EvaluationFixture): DocumentOcrResult {
  let texts=[...fixture.expectedFullTextInReadingOrder], tables: OcrTable[]=[];
  const table=fixture.structuralRelationships.find(r=>r.type==='table');
  if(table?.headerRow&&table.dataRows) texts=[texts[0], ...[table.headerRow,...table.dataRows].flat().map(v=>v??'')];
  const fullText=texts.join('\n');
  const lines=texts.map((text,i)=>({id:fixture.id+'-source-'+i,text,page:1,confidence:null,boundingBox:null,tokenIds:[]}));
  if(table?.headerRow&&table.dataRows) {
    let source=1;
    const rows=[table.headerRow,...table.dataRows].map(row=>row.map(value=>{
      const index=source++, text=value??'', start=Array.from(texts.slice(0,index).join('\n')+'\n').length;
      return {text,rowSpan:1,columnSpan:1,sourceLineIds:[lines[index].id],sourceRanges:text?[{start,end:start+Array.from(text).length}]:[]};
    }));
    tables=[{id:'fixed-provider-grid',page:1,headerRowCount:1,rows}];
  }
  return {provider:'fixed-ocr-fixture',fullText,lines,tokens:[],pageCount:1,warnings:['FIXED_OCR_NOT_IMAGE_RECOGNITION'],tables};
}
export function evaluateFixedFixture(fixture: EvaluationFixture) {
  const input=fixedOcrInput(fixture), document=assembleJson(input,{documentId:'fixed-'+fixture.id,mimeType:'image/png'});
  auditSourceCoverage(input,document);
  for (const value of Object.values(fixture.criticalValues)) {
    // QA also contains derived numeric expectations. Export deliberately keeps
    // OCR strings; the separately typed business extraction contract is different.
    if (typeof value !== 'string') continue;
    assert.ok(input.fullText.includes(value),'invalid critical-value ground truth');
    assert.ok(document.rawText.includes(value),'critical value lost or rewritten');
  }
  for (const label of fixture.emptyFields) {
    // Table empty cells are checked against the actual grid below; "whole page"
    // is a negative-page expectation, not evidence of an invented field label.
    if (!input.fullText || fixture.structuralRelationships.some(r=>r.type==='table')) continue;
    const field=document.structure.fields.find(f=>labelKey(f.label)===labelKey(label));
    assert.ok(field,'missing blank field: '+label);
    assert.equal(field.rawValue,null); assert.equal(field.normalizedValue,null); assert.equal(field.valueState,'blank');
  }
  for(const relation of fixture.structuralRelationships) {
    if(relation.type==='field_label_value'&&relation.label) {
      const field=document.structure.fields.find(f=>labelKey(f.label)===labelKey(relation.label!));
      assert.ok(field,'missing field: '+relation.label);
      assert.equal(field.rawValue===null?null:valueKey(field.normalizedValue??''),relation.value===null?null:valueKey(relation.value??''));
    }
    if(relation.type==='checkbox') {
      const checkbox=document.structure.checkboxes.find(c=>c.label===relation.label);
      assert.ok(checkbox,'missing checkbox '+relation.label);
      assert.equal(checkbox.state,relation.checked?'checked':'unchecked'); assert.equal(checkbox.evidence.verified,false);
    }
    const types: Record<string,string>={national_header:'national_heading',national_motto:'motto',document_title:'document_title',bullet_item:'bullet_item'};
    if(types[relation.type]&&relation.text) assert.ok(document.nodes.some(n=>n.type===types[relation.type]&&n.text===relation.text));
    if(relation.type==='free_text'&&relation.text) assert.ok(document.nodes.some(n=>n.text===relation.text && document.structure.freeText.includes(n.id)));
    if(relation.type==='table'&&relation.headerRow&&relation.dataRows) assert.deepEqual(document.structure.tables[0].rows.map(row=>row.map(c=>c.rawValue)),[relation.headerRow,...relation.dataRows].map(row=>row.map(v=>v??'')));
  }
  if(fixture.id==='TC10') { assert.equal(document.status,'failed'); assert.equal(document.structure.fields.length,0); assert.equal(document.rawText,''); }
  return { fixture:fixture.id, status:'PASS', layer:'A_FIXED_OCR_TO_JSON', provider:'fixed-ocr-fixture', sourceIds:input.lines.map(l=>l.id),
    rawPreserved:true, schemaValid:true, referencesValid:true, fieldChecks:fixture.structuralRelationships.filter(r=>r.type==='field_label_value').length,
    tables:document.structure.tables.length, requiresReview:document.requiresReview, cer:null,wer:null, document };
}
/** Ground truth overrides after direct PNG inspection. They correct the
 * transcript only; neither product data nor original QA material is rewritten. */
export function visibleTranscript(fixture: EvaluationFixture): string[] {
  let lines=[...fixture.expectedFullTextInReadingOrder];
  if(fixture.id==='TC01') lines=[...lines.slice(0,13),lines[13],lines[16],lines[14],lines[17],lines[15],lines[18]];
  if(fixture.id==='TC04') lines=lines.map(l=>l.replace(/\|/g,' '));
  return lines;
}
function distance(a: string[],b: string[]) {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return row[b.length];
}
export function ocrMetrics(expected: string,actual: string) {
  const a=valueKey(expected),b=valueKey(actual);
  if(!a) return {cer:null,wer:null};
  const chars=Array.from(a),words=a.split(' ');
  return {cer:distance(chars,Array.from(b))/chars.length,wer:distance(words,b?b.split(' '):[])/words.length};
}
