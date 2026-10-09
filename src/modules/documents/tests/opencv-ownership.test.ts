import test from 'node:test';
import assert from 'node:assert/strict';
import { warpDocument } from '@/modules/opencv/perspective-transform';
import { detectDocument } from '@/modules/opencv/document-detector';
import type { CvRuntime } from '@/modules/opencv/types';

function runtime(fail: boolean, invalidTransform = false) {
  const live = new Set<Mat>();
  class Mat {
    cols=1000;rows=1400;data=new Uint8Array();
    constructor(){live.add(this);}
    channels(){return 4;} clone(){return new Mat();} copyTo(){}
    delete(){assert.ok(live.delete(this),'each owned Mat freed exactly once');}
  }
  let vectors=0;
  const cv={Mat,Size:class{constructor(public width:number,public height:number){}},
    matFromArray:()=>new Mat(),getPerspectiveTransform:()=>{
      const mat = new Mat() as Mat & { data64F?: Float64Array };
      if (invalidTransform) mat.data64F = new Float64Array(9).fill(NaN);
      return mat;
    },warpPerspective:()=>{if(fail)throw Error('warp failure');},
    resize:()=>{},cvtColor:()=>{},GaussianBlur:()=>{},Canny:()=>{},getStructuringElement:()=>new Mat(),morphologyEx:()=>{},
    MatVector:class{constructor(){vectors++;}size(){return 0;}delete(){vectors--;}},findContours:()=>{},
  } as unknown as CvRuntime;
  return {cv,live,source:new Mat(),vectors:()=>vectors};
}
const quad={topLeft:{x:100,y:100},topRight:{x:800,y:100},bottomRight:{x:800,y:1200},bottomLeft:{x:100,y:1200}};
test('warp frees temporary Mats on success; caller owns only source/output',()=>{
  const r=runtime(false);const {deskewed}=warpDocument(r.cv,r.source,quad);assert.equal(r.live.size,2);
  deskewed.delete();r.source.delete();assert.equal(r.live.size,0);
});
test('warp failure frees output and transform/point Mats, preserving source',()=>{
  const r=runtime(true);assert.throws(()=>warpDocument(r.cv,r.source,quad),/warp failure/);assert.equal(r.live.size,1);r.source.delete();
});
test('failed detection frees kernels, Mats and MatVector without freeing caller source',()=>{
  const r=runtime(false);assert.throws(()=>detectDocument(r.cv,r.source));assert.equal(r.live.size,1);assert.equal(r.vectors(),0);r.source.delete();
});
test('non-finite warp is rejected before processing and frees all transforms', () => {
  const r = runtime(false, true); assert.throws(() => warpDocument(r.cv, r.source, quad), /Non-finite/);
  assert.equal(r.live.size, 1); r.source.delete(); assert.equal(r.live.size, 0);
});
