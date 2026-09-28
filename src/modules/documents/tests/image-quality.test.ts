import test from 'node:test';
import assert from 'node:assert/strict';
import { imageQualityErrors } from '../image-quality';
function fixture() {
  const width=640,height=800,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;const shade=y%32<4 && x%40<20 ? 30 : 176;
    data[p]=data[p+1]=data[p+2]=shade;data[p+3]=255;
  }
  return {width,height,data};
}
test('sharp synthetic text passes; a flat blurred frame and low resolution fail',()=>{
  assert.deepEqual(imageQualityErrors(fixture()),[]);
  assert.ok(imageQualityErrors({width:640,height:800,data:new Uint8ClampedArray(640*800*4).fill(255)}).some(s=>s.includes('mờ')));
  assert.ok(imageQualityErrors({width:100,height:100,data:new Uint8ClampedArray(100*100*4)}).some(s=>s.includes('phân giải')));
});
test('off-grid clipped hotspot is detected without treating all white paper as glare',()=>{
  const f=fixture();for(let y=345;y<395;y++)for(let x=267;x<317;x++){const p=(y*f.width+x)*4;f.data[p]=f.data[p+1]=f.data[p+2]=255;}
  assert.ok(imageQualityErrors(f).some(s=>s.includes('lóa')));
  assert.ok(!imageQualityErrors({width:640,height:800,data:new Uint8ClampedArray(640*800*4).fill(255)}).some(s=>s.includes('lóa')));
});
