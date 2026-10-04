import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { handleCandidateOcr } from '../candidates-api';
import { mapCandidateRect } from '../candidate-frame';
import { DOCUMENT_LIMITS } from '../config';

const request = (body: unknown) => new Request('http://local/api/documents/candidates-ocr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function line(lineId = 'row_1') {
  const bytes = await sharp({ create: { width: 100, height: 32, channels: 3, background: '#fff' } }).png().toBuffer();
  return { lineId, image: `data:image/png;base64,${bytes.toString('base64')}`, coordinates: [0.1,0.1,0.2,0.9] };
}
test('candidate endpoint: one call, null confidence, authoritative input coordinates and provenance', async () => {
  let calls = 0; const input = await line();
  const response = await handleCandidateOcr(request({lines:[input]}), () => ({recognizeLines: async (lines, signal) => {
    calls++; assert.ok(signal); assert.equal(lines[0].originalWidth,100);
    return [{lineId:'row_1',rawText:'AFL 123',confidence:null,coordinates:[0,0,1,1]}];
  }}));
  assert.equal(response.status,200); const payload=await response.json(); assert.equal(calls,1);
  assert.equal(payload.predictions[0].confidence,null); assert.deepEqual(payload.predictions[0].coordinates,input.coordinates);
  assert.equal(payload.provenance.attempt,1); assert.equal(payload.requiresReview,true);
});
test('candidate endpoint: empty OCR keeps unreadable regions instead of simulated text', async () => {
  const response=await handleCandidateOcr(request({lines:[await line()]}),()=>({recognizeLines:async()=>[]}));
  const payload=await response.json(); assert.equal(payload.predictions[0].text,'');
  assert.equal(payload.predictions[0].confidence,null); assert.deepEqual(payload.warnings,['OCR_EMPTY_TEXT']);
});
test('candidate endpoint: service/auth errors never retry or use offline success fallback', async () => {
  for(const error of ['VietOCR service returned status 401','VietOCR service returned status 429','fetch failed']) {
    let calls=0;const response=await handleCandidateOcr(request({lines:[await line()]}),()=>({recognizeLines:async()=>{calls++;throw new Error(error);}}));
    assert.equal(calls,1); assert.equal((await response.json()).success,false); assert.equal(response.status,error.includes('429')?429:503);
  }
});
test('candidate endpoint validates corrupt images, IDs, geometry and count before constructing provider', async () => {
  const valid=await line();
  for(const lines of [[{...valid,image:'data:image/png;base64,YmFk'}],[valid,valid],[{...valid,coordinates:[0,0,0,1]}],Array.from({length:71},(_,i)=>({...valid,lineId:`row_${i}`}))]) {
    let calls=0;const response=await handleCandidateOcr(request({lines}),()=>{calls++;throw new Error('unexpected');});
    assert.ok([400,413].includes(response.status)); assert.equal(calls,0);
  }
});
test('candidate endpoint applies request cap and rejects malformed JSON', async () => {
  const large=new Request('http://local',{method:'POST',headers:{'content-type':'application/json','content-length':String(DOCUMENT_LIMITS.requestBytes+1)},body:'{}'});
  assert.equal((await handleCandidateOcr(large)).status,413);
  assert.equal((await handleCandidateOcr(new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).status,400);
});
test('candidate pixels map with rounded independent X/Y scales within native source', () => {
  assert.deepEqual(mapCandidateRect({x:10,y:10,width:20,height:15},{width:101,height:99},{width:303,height:200}),{x:30,y:20,width:60,height:31});
  assert.throws(()=>mapCandidateRect({x:200,y:0,width:1,height:10},{width:100,height:100},{width:300,height:300}));
});
