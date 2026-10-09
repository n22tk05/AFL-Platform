import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, evaluateFixedFixture, fixedOcrInput, auditSourceCoverage, ocrMetrics } from '../json-evaluation';
import { assembleJson } from '../json-assembler';
import { validateJsonExport } from '../json-validator';
for (const fixture of Object.values(fixtures)) test('independent fixed OCR -> JSON: ' + fixture.id, () => {
  assert.equal(evaluateFixedFixture(fixture).status,'PASS');
});
test('independent source audit catches lost, duplicated, changed and unreferenced content', () => {
  const input=fixedOcrInput(fixtures.TC09);
  for(const mutation of ['lost','duplicated','changed','unreferenced']) {
    const doc=assembleJson(input,{documentId:'audit',mimeType:'image/png'});
    if(mutation==='lost')doc.blocks.pop();
    if(mutation==='duplicated')doc.blocks.push({...doc.blocks[0],id:'duplicate'});
    if(mutation==='changed')doc.blocks[0].text='different';
    if(mutation==='unreferenced')doc.nodes[0].sourceBlockIds=[];
    assert.throws(()=>auditSourceCoverage(input,doc),mutation);
  }
});
test('TC04 text alone never pretends to recognize the image table; provider empty cells retain slot and ID',()=> {
  const input=fixedOcrInput(fixtures.TC04), doc=assembleJson(input,{documentId:'grid',mimeType:'image/png'});
  assert.equal(doc.structure.tables[0].rows[3][2].rawValue,'');
  assert.equal(doc.structure.tables[0].rows[3][3].rawValue,'650.000.000 đ');
  assert.ok(doc.structure.tables[0].rows[3][2].sourceBlockIds.length);
  const withoutLayout=assembleJson({...input,tables:[]},{documentId:'grid-text',mimeType:'image/png'});
  assert.deepEqual(withoutLayout.structure.tables,[]);
  assert.equal(validateJsonExport(doc,input).valid,true);
});
test('CER/WER only compare real transcripts; keep leading zeros and currency punctuation',()=>{
  assert.deepEqual(ocrMetrics('038092008765','038092008765'),{cer:0,wer:0});
  assert.ok(ocrMetrics('038092008765','38092008765').cer!>0);
  assert.ok(ocrMetrics('2.500.000 đồng','2,500,000 đồng').cer!>0);
  assert.deepEqual(ocrMetrics('',''),{cer:null,wer:null});
});
