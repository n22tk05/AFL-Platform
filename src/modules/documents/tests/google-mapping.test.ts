import test from 'node:test';
import assert from 'node:assert/strict';
import { mapGoogleDocument, GoogleDocumentAiProvider } from '../providers/google-document-ai';

test('Google text anchors map Vietnamese text, tokens, line membership and normalized boxes',()=>{
  const layout={textAnchor:{textSegments:[{startIndex:0,endIndex:7}]},confidence:0.98,boundingPoly:{normalizedVertices:[{x:0.1,y:0.2},{x:0.9,y:0.4}]}};
  const r=mapGoogleDocument({text:'Tiếng Việt',pages:[{dimension:{width:1000,height:2000},tokens:[{layout}],lines:[{layout}]}]});
  assert.equal(r.fullText,'Tiếng Việt'); assert.equal(r.tokens[0].text,'Tiếng V');
  assert.deepEqual(r.lines[0].boundingBox,[0.2,0.1,0.4,0.9]); assert.deepEqual(r.lines[0].tokenIds,['p1_t1']);
});
test('pixel polygons use page dimensions, missing confidence is null',()=>{
  const r=mapGoogleDocument({text:'X',pages:[{dimension:{width:100,height:200},lines:[{layout:{textAnchor:{textSegments:[{endIndex:1}]},boundingPoly:{vertices:[{x:10,y:40},{x:90,y:80}]}}}]}]});
  assert.deepEqual(r.lines[0].boundingBox,[0.2,0.1,0.4,0.9]); assert.equal(r.lines[0].confidence,null);
});
test('missing anchors/geometry and out-of-range coordinates do not crash',()=>{
  const r=mapGoogleDocument({pages:[{tokens:[{}],lines:[{layout:{boundingPoly:{normalizedVertices:[{x:-1,y:0},{x:2,y:1}]}}}]}]});
  assert.equal(r.tokens[0].text,''); assert.equal(r.tokens[0].confidence,null); assert.ok(r.warnings.includes('OCR_MISSING_TEXT_ANCHOR'));
  assert.deepEqual(r.lines[0].boundingBox,[0,0,0,0]); assert.ok(r.warnings.includes('OCR_CLIPPED_GEOMETRY'));
});
test('unconfigured Google provider fails without contacting Google',async()=>{
  await assert.rejects(new GoogleDocumentAiProvider({} as NodeJS.ProcessEnv).extract({bytes:new Uint8Array(),mimeType:'image/png'}),/OCR_NOT_CONFIGURED/);
});
