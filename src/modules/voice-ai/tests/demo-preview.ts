import assert from 'node:assert/strict';
import type { FormWorkflow } from '@/shared/contracts';

export interface DemoAudio { region: 'NORTH' | 'SOUTH'; stepIndex: number; dataUrl: string }

export function renderDemoPreview(workflow: FormWorkflow, imageDataUrl: string, audio: DemoAudio[]): string {
  assert.match(imageDataUrl, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  assert.ok(workflow.steps.length > 0 && workflow.steps.length <= 200);
  assert.ok(workflow.steps.every(step => step.highlightCoords.length === 4 && step.highlightCoords.every(value => Number.isFinite(value) && value >= 0 && value <= 1)));
  assert.ok(audio.every(item => ['NORTH', 'SOUTH'].includes(item.region) && Number.isSafeInteger(item.stepIndex)
    && /^data:audio\/mpeg;base64,[A-Za-z0-9+/]+=*$/.test(item.dataUrl)));
  const data = JSON.stringify({ workflow, imageDataUrl, audio }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AFL Voice AI — QA Demo</title><style>
body{margin:0;background:#f1f5f9;color:#172554;font:20px/1.6 Arial,sans-serif}main{max-width:1200px;margin:auto;padding:24px}
h1{font-size:30px}.notice{background:#fff7ed;border:2px solid #9a3412;padding:16px;color:#7c2d12}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
section{background:white;border-radius:12px;padding:20px}button,select{font:inherit;padding:12px;border:2px solid #166534;border-radius:8px;background:white;color:#14532d;margin:5px;min-height:48px}button:disabled{opacity:.4}
button:focus-visible,select:focus-visible{outline:4px solid #1d4ed8}#paper{position:relative}img{width:100%;display:block}#highlight{position:absolute;border:3px solid #b91c1c;background:#b91c1c22;box-sizing:border-box;pointer-events:none}
#example{color:#b91c1c;font-weight:bold}audio{width:100%}details{margin-top:24px}pre{font:15px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere}.status{font-size:16px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
</style></head><body><main><h1>AFL Voice AI — bản QA demo</h1>
<p class="notice"><strong>Chưa lưu hoặc phê duyệt trên database.</strong> Đây là phôi thử nghiệm hai ô, không dùng làm thủ tục. Audio Google TTS thật; nhãn/vùng viết đã đối soát cho phôi này. Không nhập dữ liệu cá nhân thật. Bản này không thay thế luồng citizen ACTIVE.</p>
<p id="identity"></p><div class="grid"><section><div id="paper"><img id="image" alt="Phôi demo trống — hai ô cần điền"><div id="highlight" aria-hidden="true"></div></div></section>
<section><p id="step" class="status" aria-live="polite"></p><h2 id="label"></h2><p id="guidance"></p><p>Chữ mẫu chỉ để minh họa:</p><p id="example"></p>
<label for="region">Cấu hình giọng</label><select id="region"><option value="NORTH">NORTH — vi-VN-Neural2-A</option><option value="SOUTH">SOUTH — vi-VN-Neural2-D</option></select>
<audio id="audio" controls preload="metadata"></audio><p class="status">Nhấn Play để nghe. Trình duyệt có thể chặn tự phát âm thanh; không có dữ liệu mẫu dùng thay thế.</p>
<button id="previous">Dòng trước</button><button id="next">Dòng kế tiếp</button><div id="faqs"></div><p id="answer" role="status"></p></section></div>
<details><summary>Hợp đồng workflow QA đã đối soát</summary><pre id="contract"></pre></details></main>
<script id="data" type="application/json">${data}</script><script>
const data=JSON.parse(document.getElementById('data').textContent);const player=document.getElementById('audio');let index=0;
document.getElementById('image').src=data.imageDataUrl;document.getElementById('identity').textContent=data.workflow.formCode;
document.getElementById('contract').textContent=JSON.stringify(data.workflow,null,2);
function render(){player.pause();player.currentTime=0;const step=data.workflow.steps[index];const region=document.getElementById('region').value;
document.getElementById('step').textContent='Bước '+(index+1)+' / '+data.workflow.steps.length;
document.getElementById('label').textContent=step.label;document.getElementById('guidance').textContent=step.voiceGuidance;document.getElementById('example').textContent=step.exampleRedText;
document.getElementById('answer').textContent='';const coords=step.highlightCoords;const highlight=document.getElementById('highlight');highlight.style.top=coords[0]*100+'%';highlight.style.left=coords[1]*100+'%';highlight.style.height=(coords[2]-coords[0])*100+'%';highlight.style.width=(coords[3]-coords[1])*100+'%';
const clip=data.audio.find(item=>item.stepIndex===step.stepIndex&&item.region===region);player.src=clip?clip.dataUrl:'';player.load();
document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===data.workflow.steps.length-1;
const faqs=document.getElementById('faqs');faqs.replaceChildren();for(const faq of step.faqs||[]){const button=document.createElement('button');button.textContent=faq.question;button.addEventListener('click',()=>{document.getElementById('answer').textContent=faq.answer;});faqs.append(button);}}
document.getElementById('previous').addEventListener('click',()=>{if(index>0){index--;render();}});
document.getElementById('next').addEventListener('click',()=>{if(index+1<data.workflow.steps.length){index++;render();}});
document.getElementById('region').addEventListener('change',render);render();
</script></body></html>`;
}
