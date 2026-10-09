import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentExtractionService } from '../services/document-extraction.service';
import { DocumentPipelineError } from '../errors';
import { handleDocumentExtraction } from '../api';
import { DOCUMENT_LIMITS } from '../config';
import { readFileSync } from 'node:fs';
import type { DocumentOcrProvider, StructuredExtractionProvider } from '@/shared/document-extraction.types';

const input = { bytes:readFileSync('tests/fixtures/documents/clear.png'),mimeType:'image/png' as const };
const fake: DocumentOcrProvider = {extract:async()=>({provider:'fake',fullText:'Số TEST',tokens:[],lines:[{id:'l1',text:'Số TEST',confidence:1,boundingBox:[0,0,1,1],page:1,tokenIds:[]}],pageCount:1,warnings:[]})};
const structured: StructuredExtractionProvider = { classify:async()=> 'traffic_violation_record', extract:async()=>({fields:{recordNumber:{value:'TEST',rawText:'TEST',evidenceText:'Số TEST',sourceLineIds:['l1'],confidence:1}}}) };
function request(mime='image/png',bytes: Uint8Array=input.bytes) {
  const form=new FormData(); form.set('file',new Blob([Buffer.from(bytes)],{type:mime}),'test'); form.set('deskewApplied','true');
  return new Request('http://local/api/documents/extract',{method:'POST',body:form});
}
test('pipeline calls classification then schema extraction on OCR text only',async()=>{
  const events:string[]=[];
  const result=await new DocumentExtractionService({extract:async(v)=>{events.push('ocr');assert.deepEqual(v.bytes,input.bytes);return fake.extract(v);}},
    {classify:async(o)=>{events.push('classify');assert.equal(o.fullText,'Số TEST');return 'traffic_violation_record';},extract:async(o,t)=>{events.push(t);return structured.extract(o,t);}}).extractDocumentInformation(input);
  assert.deepEqual(events,['ocr','classify','traffic_violation_record']); assert.equal(result.fields.recordNumber.value,'TEST');
});
test('unknown schema never invokes extraction',async()=>{
  const r=await new DocumentExtractionService(fake,{classify:async()=> 'unknown',extract:async()=>{throw Error('must not call');}}).extractDocumentInformation(input);
  assert.equal(r.documentType,'unknown'); assert.deepEqual(r.fields,{});
});
test('provider timeout aborts work and returns empty manual review contract',async()=>{
  let signal:AbortSignal|undefined;
  const service=new DocumentExtractionService({extract:async i=>{signal=i.signal;return new Promise(()=>{});}},structured,0.95,5);
  const response=await handleDocumentExtraction(request(),()=>service); const json=await response.json();
  assert.equal(response.status,200); assert.equal(json.data.status,'manual_review_required'); assert.deepEqual(json.data.fields,{});
  assert.ok(json.data.warnings.includes('OCR_TIMEOUT')); assert.equal(signal?.aborted,true);
});
test('provider configuration/secret failures are sanitized and never synthesize sample values',async()=>{
  for(const error of [new DocumentPipelineError('OCR_NOT_CONFIGURED'),new Error('SECRET C:/private/key.json stack')]) {
    const response=await handleDocumentExtraction(request(),()=>new DocumentExtractionService({extract:async()=>{throw error;}},structured));
    const text=await response.text(); assert.ok(!text.includes('SECRET')); assert.ok(!text.includes('private')); assert.ok(!text.includes('stack'));
    const data=JSON.parse(text).data; assert.deepEqual(data.fields,{}); assert.equal(data.fullText,''); assert.equal(data.requiresReview,true);
  }
});
test('bad MIME/signature, oversized file/body rejected before providers',async()=>{
  let calls=0; const factory=()=>{calls++;return new DocumentExtractionService(fake,structured);};
  assert.equal((await handleDocumentExtraction(request('text/plain'),factory)).status,415);
  assert.equal((await handleDocumentExtraction(request('image/jpeg'),factory)).status,400);
  assert.equal((await handleDocumentExtraction(request('image/jpeg',new Uint8Array(DOCUMENT_LIMITS.fileBytes+1)),factory)).status,413);
  assert.equal((await handleDocumentExtraction(new Request('http://local',{method:'POST',headers:{'content-type':'application/json','content-length':String(DOCUMENT_LIMITS.requestBytes+1)},body:'{}'}),factory)).status,413);
  assert.equal(calls,0);
});
test('actual body cap applies without content-length',async()=>{
  const req=new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(DOCUMENT_LIMITS.requestBytes+1)});
  assert.equal((await handleDocumentExtraction(req,()=>{throw Error('must not call');})).status,413);
});
test('multipart and JSON return same stable v2 envelope with no-store',async()=>{
  const factory=()=>new DocumentExtractionService(fake,structured);
  const jsonReq=new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageBase64:'data:image/png;base64,'+Buffer.from(input.bytes).toString('base64'),deskewApplied:true})});
  for(const req of [request(),jsonReq]) {
    const response=await handleDocumentExtraction(req,factory); const body=await response.json();
    assert.equal(body.success,true); assert.equal(body.data.contractVersion,2); assert.equal(body.data.fields.recordNumber.status,'accepted');
    assert.equal(body.data.deskewApplied,true); assert.match(response.headers.get('cache-control')!,/no-store/);
  }
});
test('factory misconfiguration returns manual review with no credentials',async()=>{
  const r=await handleDocumentExtraction(request(),()=>{throw Error('SECRET');});const body=await r.json();
  assert.equal(body.data.status,'manual_review_required');assert.deepEqual(body.data.fields,{});assert.ok(!JSON.stringify(body).includes('SECRET'));
});
