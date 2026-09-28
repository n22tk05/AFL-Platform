import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentSession, reviewedFields, prerequisiteValue } from '../session';
import { parseStructuredResult } from '../validation';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';
const ocr:DocumentOcrResult={provider:'fake',fullText:'TEST',tokens:[],lines:[{id:'l1',text:'TEST',confidence:1,boundingBox:[0,0,1,1],page:1,tokenIds:[]}],pageCount:1,warnings:[]};
const result=()=>parseStructuredResult({fields:{recordNumber:{value:'TEST',rawText:'TEST',evidenceText:'TEST',confidence:0.4,sourceLineIds:['l1']}}},ocr);
test('needs_review blocks session save until explicitly confirmed',()=>{
  const session=new DocumentSession();assert.throws(()=>session.save(result(),{}));assert.equal(session.read(),null);
  session.save(result(),{recordNumber:'TEST'});assert.equal(session.read()?.recordNumber,'TEST');session.clear();
});
test('unreadable fields are omitted; confirmed correction may be saved',()=>{
  const values=reviewedFields(result(),{recordNumber:null,citizenName:'NGƯỜI THỬ NGHIỆM'});
  assert.equal((values as Record<string, string | undefined>).citizenId,undefined);assert.deepEqual(values,{citizenName:'NGƯỜI THỬ NGHIỆM'});
});
test('invalid human-confirmed critical values are blocked',()=>{
  assert.throws(()=>reviewedFields(result(),{recordNumber:'TEST',citizenId:'123'}));
  assert.throws(()=>reviewedFields(result(),{recordNumber:'TEST',fineAmount:-1}));
});
test('accepted fields require explicit session save; read returns a defensive copy',()=>{
  const r=result();r.fields.recordNumber.status='accepted';r.fields.recordNumber.confidence=1;r.fields.recordNumber.validationErrors=[];
  const session=new DocumentSession();assert.equal(session.read(),null);session.save(r,{});
  const copy=session.read()!;copy.recordNumber='changed';assert.equal(session.read()?.recordNumber,'TEST');session.clear();
});
test('image/type replacement clear and session expiry invalidate subscribers',()=>{
  let now=0,events=0;const session=new DocumentSession(()=>now,1000);const unsubscribe=session.subscribe(()=>events++);
  session.save(result(),{recordNumber:'TEST'});session.clear();assert.equal(session.read(),null);
  session.save(result(),{recordNumber:'TEST'});now=1000;assert.equal(session.read(),null);assert.ok(events>=4);unsubscribe();
});
test('expiry timer clears RAM without a read',async()=>{
  const session=new DocumentSession(Date.now,5);let cleared=false;session.save(result(),{recordNumber:'TEST'});
  session.subscribe(()=>{cleared=true;});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(cleared,true);assert.equal(session.read(),null);
});
test('guide uses explicit contract mapping and never guesses based on box or label',()=>{
  const fields={fineAmount:'900.000 đồng',recordNumber:'TEST'};
  assert.equal(prerequisiteValue(fields,'so_tien_phat'),'900.000 đồng');assert.equal(prerequisiteValue(fields,'so_do.thua_dat_so'),null);
  assert.equal(prerequisiteValue(fields),null);
});
